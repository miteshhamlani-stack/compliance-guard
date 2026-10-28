import * as pdfjsLib from 'pdfjs-dist'
import { createWorker, type Worker } from 'tesseract.js'

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const

export type SupportedDocumentExtension =
  (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]

export interface DocumentScanResult {
  text: string
  usedOcr: boolean
  pageCount: number
  detectedScript: string
  languages: string
}

type ProgressCallback = (percentage: number, status: string) => void

const minimumPdfTextLength = 50
export const TESSDATA_FAST_PATH =
  'https://tessdata.projectnaptha.com/4.0.0_fast'
export const SANSKRIT_TRAINEDDATA_URL =
  `${TESSDATA_FAST_PATH}/san.traineddata.gz`
const tessdataCachePath = 'compliance-guard-tessdata'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

function report(
  onProgress: ProgressCallback | undefined,
  percentage: number,
  status: string,
): void {
  onProgress?.(Math.max(0, Math.min(100, Math.round(percentage))), status)
}

function getExtension(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
}

function isSupportedExtension(
  extension: string,
): extension is SupportedDocumentExtension {
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(
    extension as SupportedDocumentExtension,
  )
}

function createTesseractWorker(
  languages: string,
  onProgress: ProgressCallback | undefined,
): Promise<Worker> {
  return createWorker(languages, 1, {
    langPath: TESSDATA_FAST_PATH,
    cachePath: tessdataCachePath,
    cacheMethod: 'write',
    logger: (message) => {
      if (message.status === 'recognizing text') {
        report(
          onProgress,
          message.progress * 100,
          'Detecting script & running OCR...',
        )
      }
    },
  })
}

function languagesForScript(script: string | null): {
  detectedScript: string
  languages: string
} {
  switch (script?.toLowerCase()) {
    case 'devanagari':
      return { detectedScript: 'Devanagari', languages: 'eng+hin+mar+san' }
    case 'gujarati':
      return { detectedScript: 'Gujarati', languages: 'eng+guj' }
    case 'bengali':
      return { detectedScript: 'Bengali', languages: 'eng+ben' }
    case 'tamil':
      return { detectedScript: 'Tamil', languages: 'eng+tam' }
    case 'latin':
      return { detectedScript: 'Latin', languages: 'eng' }
    default:
      return { detectedScript: 'Mixed/unknown', languages: 'eng+hin+guj' }
  }
}

export function getOcrLanguagesForScript(script: string | null): string {
  return languagesForScript(script).languages
}

export function normalizeOcrText(text: string): string {
  return text.normalize('NFC').trim()
}

async function preprocessForOcr(
  image: File | HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap | null = null
  let source: ImageBitmap | HTMLCanvasElement
  if (image instanceof File) {
    bitmap = await createImageBitmap(image)
    source = bitmap
  } else {
    source = image
  }
  const scale = 1.75
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = Math.ceil(source.width * scale)
  canvas.height = Math.ceil(source.height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    bitmap?.close()
    throw new Error('Could not create an image canvas for OCR preprocessing.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = 'grayscale(1) contrast(1.25)'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  context.filter = 'none'

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = pixels.data[index]
    const enhanced = Math.max(0, Math.min(255, (value - 128) * 1.18 + 128))
    pixels.data[index] = enhanced
    pixels.data[index + 1] = enhanced
    pixels.data[index + 2] = enhanced
  }
  context.putImageData(pixels, 0, 0)

  bitmap?.close()
  return canvas
}

async function detectScript(
  image: File | HTMLCanvasElement,
  onProgress: ProgressCallback | undefined,
): Promise<{ detectedScript: string; languages: string }> {
  report(onProgress, 8, 'Detecting script...')
  const worker = await createWorker('osd', 0, {
    langPath: TESSDATA_FAST_PATH,
    cachePath: tessdataCachePath,
    cacheMethod: 'write',
  })

  try {
    try {
      const detection = await worker.detect(image)
      return languagesForScript(detection.data.script)
    } catch (error) {
      console.warn('Automatic script detection failed; using the mixed-language OCR fallback.', error)
      return languagesForScript(null)
    }
  } finally {
    await worker.terminate()
  }
}

async function recognize(
  image: File | HTMLCanvasElement,
  languages: string,
  onProgress: ProgressCallback | undefined,
): Promise<string> {
  const worker = await createTesseractWorker(languages, onProgress)
  try {
    const result = await worker.recognize(image)
    return normalizeOcrText(result.data.text)
  } finally {
    await worker.terminate()
  }
}

export async function scanImageCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: ProgressCallback,
): Promise<DocumentScanResult> {
  const preprocessedCanvas = await preprocessForOcr(canvas)
  const selection = await detectScript(preprocessedCanvas, onProgress)
  return {
    text: await recognize(preprocessedCanvas, selection.languages, onProgress),
    usedOcr: true,
    pageCount: 1,
    ...selection,
  }
}

async function extractPdfText(
  file: File,
  onProgress: ProgressCallback | undefined,
): Promise<{ text: string; pageCount: number }> {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .trim()
          .normalize('NFC'),
      )
      report(
        onProgress,
        (pageNumber / document.numPages) * 35,
        `Reading file... page ${pageNumber} of ${document.numPages}`,
      )
    }

    return { text: pageTexts.join('\n\n').trim(), pageCount: document.numPages }
  } finally {
    await document.cleanup()
  }
}

async function renderPdfPage(
  document: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')

  if (!context) throw new Error('Could not create a canvas for PDF OCR.')
  await page.render({ canvas, canvasContext: context, viewport }).promise
  return canvas
}

async function recognizePdfPages(
  file: File,
  pageCount: number,
  onProgress: ProgressCallback | undefined,
): Promise<{ text: string; detectedScript: string; languages: string }> {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise

  try {
    const sampleCanvas = await preprocessForOcr(
      await renderPdfPage(document, 1),
    )
    const selection = await detectScript(sampleCanvas, onProgress)
    const worker = await createTesseractWorker(selection.languages, onProgress)
    const pageTexts: string[] = []

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const renderedCanvas = pageNumber === 1
          ? sampleCanvas
          : await renderPdfPage(document, pageNumber)
        const canvas = pageNumber === 1
          ? renderedCanvas
          : await preprocessForOcr(renderedCanvas)
        const result = await worker.recognize(canvas)
        pageTexts.push(normalizeOcrText(result.data.text))
        report(
          onProgress,
          10 + (pageNumber / pageCount) * 90,
          `Detecting script & running OCR... ${pageNumber} of ${pageCount}`,
        )
      }
    } finally {
      await worker.terminate()
    }

    return { text: pageTexts.join('\n\n').trim(), ...selection }
  } finally {
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
    const preprocessedImage = await preprocessForOcr(file)
    const selection = await detectScript(preprocessedImage, onProgress)
    return {
      text: await recognize(preprocessedImage, selection.languages, onProgress),
      usedOcr: true,
      pageCount: 1,
      ...selection,
    }
  }

  const extracted = await extractPdfText(file, onProgress)
  if (extracted.text.length >= minimumPdfTextLength) {
    return {
      ...extracted,
      usedOcr: false,
      detectedScript: 'Native PDF text',
      languages: 'native',
    }
  }

  report(onProgress, 5, 'Reading file... scanned PDF detected')
  const ocrResult = await recognizePdfPages(file, extracted.pageCount, onProgress)
  return { ...extracted, ...ocrResult, usedOcr: true }
}
