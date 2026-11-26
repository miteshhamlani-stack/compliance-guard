import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (extension === '.txt' || extension === '.md') return file.text()
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  }
  if (extension === '.pdf') {
    const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    try {
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const rows = new Map<number, string[]>()
        for (const item of content.items) {
          if (!('str' in item)) continue
          const y = Math.round((item.transform[5] ?? 0) / 2) * 2
          rows.set(y, [...(rows.get(y) ?? []), item.str])
        }
        pages.push([...rows.entries()]
          .sort(([firstY], [secondY]) => secondY - firstY)
          .map(([, row]) => row.join(' '))
          .join('\n'))
      }
      return pages.join('\n\n')
    } finally {
      await document.loadingTask.destroy()
    }
  }
  throw new Error('Choose a .pdf, .docx, .txt, or .md file.')
}
