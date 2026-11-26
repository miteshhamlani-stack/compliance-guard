import { Document, Packer, Paragraph, TextRun } from 'docx'
import type { AmendmentNotice, DocumentNode } from './types'

export function getCompleteDocumentText(nodes: DocumentNode[], documentIndex: 0 | 1): string {
  return [...nodes]
    .sort((first, second) => first.orderIndex - second.orderIndex)
    .map((node) => documentIndex === 0 ? node.fullContent : node.pairedDocContent ?? '')
    .join('')
}

export async function createReconciledDocx(
  nodes: DocumentNode[],
  documentIndex: 0 | 1,
  documentLabel: string,
  frameworkName: string,
): Promise<Blob> {
  const text = getCompleteDocumentText(nodes, documentIndex)
  if (!text) throw new Error(`No complete text is available for ${documentLabel}.`)
  const paragraphs = text.split(/\r\n|\n|\r/).map((line) => new Paragraph({
    children: [new TextRun(line)],
  }))
  const document = new Document({
    creator: 'Document Reconciler',
    title: `${documentLabel} — ${frameworkName}`,
    sections: [{ children: paragraphs }],
  })
  return Packer.toBlob(document)
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value.trim()) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function createAuditCsv(notices: AmendmentNotice[]): string {
  const rows = [
    ['File Name', 'Notice Number', 'Notice Date', 'Effective Date', 'Impacted Scope', 'Target Heading', 'Original Excerpt', 'Proposed Text', 'Status', 'Reviewed At'],
    ...notices.map((notice) => [
      notice.fileName,
      notice.noticeNumber,
      notice.noticeDate,
      notice.effectiveDate,
      notice.impactedScope,
      notice.targetHeading,
      notice.originalExcerpt,
      notice.proposedText,
      notice.status,
      notice.reviewedAt ?? '',
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function reconciledFileName(originalFileName: string | undefined, documentIndex: 0 | 1): string {
  const originalStem = originalFileName?.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, '').trim()
  if (originalStem) {
    const safeStem = originalStem.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
    return `${safeStem}_Reconciled.docx`
  }
  return documentIndex === 0
    ? 'Reconciled_Primary_Lead_Document.docx'
    : 'Reconciled_Paired_Summary_Document.docx'
}
