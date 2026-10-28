import * as pdfjsLib from 'pdfjs-dist'
import { createWorker } from 'tesseract.js'

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const

export type SupportedDocumentExtension =
  (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]

export interface DocumentScanProgress {
  stage: 'reading-pdf' | 'ocr'
  percentage: number
  message: string
}

export interface DocumentScanResult {
  text: string
  usedOcr: boolean
  pageCount: number
}

type ProgressCallback = (progress: DocumentScanProgress) => void

const minimumPdfTextLength = 50

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

function getExtension(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return extension
}

function isSupportedExtension(
  extension: string,
): extension is SupportedDocumentExtension {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(
    extension as SupportedDocumentExtension,
  )
}

function report(
  onProgress: ProgressCallback | undefined,
  stage: DocumentScanProgress['stage'],
  percentage: number,
  message: string,
): void {
  onProgress?.({
    stage,
    percentage: Math.max(0, Math.min(100, Math.round(percentage))),
    message,
  })
}

async function recognizeImage(
  image: File | HTMLCanvasElement,
  onProgress: ProgressCallback | undefined,
): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        report(onProgress, 'ocr', message.progress * 100, 'Running OCR...')
      }
    },
  })

  try {
    const result = await worker.recognize(image)
    return result.data.text.trim()
  } finally {
    await worker.terminate()
  }
}

async function extractPdfText(
  file: File,
  onProgress: ProgressCallback | undefined,
): Promise<{ text: string; pageCount: number }> {
  const data = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data }).promise
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim(),
      )
      report(
        onProgress,
        'reading-pdf',
        (pageNumber / document.numPages) * 100,
        `Reading PDF... page ${pageNumber} of ${document.numPages}`,
      )
    }

    return { text: pageTexts.join('\n\n').trim(), pageCount: document.numPages }
  } finally {
    await document.cleanup()
  }
}

async function recognizePdfPages(
  file: File,
  pageCount: number,
  onProgress: ProgressCallback | undefined,
): Promise<string> {
  const data = await file.arrayBuffer()
  const document = await pdfjsLib.getDocument({ data }).promise
  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        report(onProgress, 'ocr', message.progress * 100, 'Running OCR...')
      }
    },
  })
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Could not create a canvas for PDF OCR.')
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise
      const result = await worker.recognize(canvas)
      pageTexts.push(result.data.text.trim())
      report(
        onProgress,
        'ocr',
        (pageNumber / pageCount) * 100,
        `Running OCR... page ${pageNumber} of ${pageCount}`,
      )
    }

    return pageTexts.join('\n\n').trim()
  } finally {
    await worker.terminate()
    await document.cleanup()
  }
}

export async function scanDocument(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DocumentScanResult> {
  const extension = getExtension(file.name)
  if (!isSupportedExtension(extension)) {
    throw new Error(
      `Unsupported file type. Use ${SUPPORTED_DOCUMENT_EXTENSIONS.join(', ')}.`,
    )
  }

  if (extension !== '.pdf') {
    report(onProgress, 'ocr', 0, 'Running OCR...')
    return {
      text: await recognizeImage(file, onProgress),
      usedOcr: true,
      pageCount: 1,
    }
  }

  const extracted = await extractPdfText(file, onProgress)
  if (extracted.text.length >= minimumPdfTextLength) {
    return { ...extracted, usedOcr: false }
  }

  report(onProgress, 'ocr', 0, 'Running OCR...')
  return {
    text: await recognizePdfPages(file, extracted.pageCount, onProgress),
    usedOcr: true,
    pageCount: extracted.pageCount,
  }
}
