import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ComplianceIssue } from './complianceEngine'
import type { EntityType } from './complianceEngine'

export type AuditMediaType = 'Text' | 'Image' | 'PDF' | 'Video'
export type AuditStatus = 'COMPLIANT' | 'CONDITIONAL_PASS' | 'NON_COMPLIANT'

export interface AuditReportData {
  documentName: string
  mediaType: AuditMediaType
  detectedLanguages: string
  score: number
  status: AuditStatus
  auditedAt: Date
  textExcerpt: string
  findings: ComplianceIssue[]
  passedChecks: number
  totalChecks: number
  rulesetVersion?: string
  entityType: EntityType
}

const legalClauses = [
  'Advisory Nature: This audit report is an algorithmically generated, automated heuristic pre-screening assessment designed solely to assist intermediaries (MFDs/RIAs) and marketing professionals in reviewing collaterals against regulatory frameworks. This document does not constitute formal legal counsel, statutory validation, or official clearance from any governing entity.',
  'No Technical Guarantee of Completeness: Computer-assisted OCR, speech recognition, and visual text detection are inherently dependent on input media resolution, compression artifacts, and layout nuances. Consequently, this system offers no express or implied warranty regarding 100% detection of regulatory deviations or omissions.',
  'Sole Responsibility of Publisher: The registered Intermediary, Asset Management Company (AMC), or content publisher remains solely and exclusively liable for ensuring that all published, broadcast, or distributed materials strictly comply with all applicable statutes, advertising codes, and regulatory mandates prior to public dissemination.',
  'Absolute Hold Harmless & Limitation of Liability: Under no circumstances shall the platform creators, software developers, operators, hosting providers, or affiliated entities be held responsible or legally liable for any regulatory citations, show-cause notices, monetary fines, administrative sanctions, civil liabilities, or legal proceedings initiated by SEBI, AMFI, ASCI, or any other regulatory body, statutory authority, judicial forum, or government department arising from the use of or reliance upon this automated assessment.',
]

const colors = {
  ink: [27, 48, 65] as [number, number, number],
  muted: [91, 105, 124] as [number, number, number],
  navy: [29, 49, 80] as [number, number, number],
  green: [39, 125, 78] as [number, number, number],
  amber: [178, 113, 12] as [number, number, number],
  red: [177, 54, 54] as [number, number, number],
  pale: [244, 247, 251] as [number, number, number],
  border: [215, 223, 234] as [number, number, number],
}

function statusColor(status: AuditStatus): [number, number, number] {
  if (status === 'COMPLIANT') return colors.green
  if (status === 'CONDITIONAL_PASS') return colors.amber
  return colors.red
}

function verdict(issue: ComplianceIssue): string {
  if (issue.severity === 'critical') return 'FAILED'
  if (issue.severity === 'warning') return 'WARNING'
  return 'PASSED'
}

function findingText(issue: ComplianceIssue): string {
  return `${issue.detail}\nCitation: ${issue.citation}`
}

function formatIstTimestamp(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' IST'
}

function drawFooter(doc: jsPDF, pageNumber: number, totalPages: string): void {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...colors.border)
  doc.line(14, height - 15, width - 14, height - 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...colors.muted)
  doc.text('Compliance Guard · Automated first-pass assessment · Verify current rules before publication', 14, height - 9)
  doc.text(`Page ${pageNumber} of ${totalPages}`, width - 14, height - 9, { align: 'right' })
}

function drawLegalNotice(doc: jsPDF, startY: number): number {
  const margin = 14
  const width = doc.internal.pageSize.getWidth() - margin * 2
  const padding = 7
  const textWidth = width - padding * 2
  const lineHeight = 3.8
  const clauseGap = 2.5
  const titleHeight = 7
  const wrappedClauses = legalClauses.map((clause) =>
    doc.splitTextToSize(clause, textWidth) as string[],
  )
  const contentHeight = wrappedClauses.reduce(
    (height, lines) => height + lines.length * lineHeight + clauseGap,
    titleHeight,
  )
  const boxHeight = contentHeight + padding * 2
  const pageHeight = doc.internal.pageSize.getHeight()

  if (startY + boxHeight > pageHeight - 22) {
    doc.addPage()
    startY = 18
  }

  doc.setFillColor(255, 250, 240)
  doc.setDrawColor(224, 185, 112)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, startY, width, boxHeight, 2.5, 2.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(116, 75, 12)
  doc.text('LEGAL NOTICE · IMPORTANT LIMITATIONS', margin + padding, startY + padding + 3)

  let cursorY = startY + padding + titleHeight
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.3)
  doc.setTextColor(...colors.ink)
  wrappedClauses.forEach((lines, index) => {
    doc.setFont('helvetica', 'bold')
    doc.text(`${index + 1}.`, margin + padding, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.text(lines, margin + padding + 5, cursorY, { lineHeightFactor: 1.35 })
    cursorY += lines.length * lineHeight + clauseGap
  })
  return startY + boxHeight
}

export function generateComplianceCertificate(data: AuditReportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const referenceId = `CG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  const statusRgb = statusColor(data.status)
  const category = data.entityType === 'mfd'
    ? 'Mutual Fund Distributor'
    : 'Asset Management Company'

  doc.setFillColor(...colors.navy)
  doc.rect(0, 0, pageWidth, 42, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('COMPLIANCE GUARD', margin, 17)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('MUTUAL FUND MARKETING & COMPLIANCE', margin, 24)
  doc.text(`Audit Reference: ${referenceId}`, pageWidth - margin, 15, { align: 'right' })
  doc.text(formatIstTimestamp(data.auditedAt), pageWidth - margin, 21, { align: 'right' })
  doc.text(
    `Ruleset ${data.rulesetVersion ?? 'bundled'} · SEBI (Mutual Funds) Regulations · Sixth Schedule · AMFI Code of Conduct`,
    pageWidth - margin,
    29,
    { align: 'right' },
  )

  let cursorY = 53
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...colors.navy)
  doc.text('Automated Compliance Audit Certificate', margin, cursorY)
  cursorY += 7

  doc.setFillColor(...colors.pale)
  doc.setDrawColor(...colors.border)
  doc.roundedRect(margin, cursorY, contentWidth, 42, 2, 2, 'FD')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...colors.muted)
  doc.text('DOCUMENT NAME', margin + 6, cursorY + 9)
  doc.text('MEDIA TYPE', margin + 6, cursorY + 21)
  doc.text('DETECTED LANGUAGES', margin + 82, cursorY + 9)
  doc.text('AUDIT SCORE', margin + 82, cursorY + 21)
  doc.text('CATEGORY', margin + 82, cursorY + 33)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...colors.ink)
  doc.text(doc.splitTextToSize(data.documentName, 65) as string[], margin + 6, cursorY + 14)
  doc.text(data.mediaType, margin + 6, cursorY + 26)
  doc.text(doc.splitTextToSize(data.detectedLanguages || 'Not detected', 62) as string[], margin + 82, cursorY + 14)
  doc.text(`${data.score}/100`, margin + 82, cursorY + 26)
  doc.setFont('helvetica', 'normal')
  doc.text(category, margin + 82, cursorY + 38)
  doc.setFillColor(...statusRgb)
  doc.roundedRect(pageWidth - margin - 48, cursorY + 9, 42, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(data.status, pageWidth - margin - 27, cursorY + 19, { align: 'center' })
  cursorY += 52

  doc.setFontSize(11)
  doc.setTextColor(...colors.navy)
  doc.text(`${category} Evaluation Matrix`, margin, cursorY)
  cursorY += 3
  const rows = data.findings.map((issue) => [
    `${issue.id}\n${issue.regulatoryClass}`,
    issue.recommendation,
    verdict(issue),
    findingText(issue),
  ])
  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 22 },
    head: [['Rule ID / Category', 'Mandatory Requirement', 'Verdict', 'Exact Findings with Statutory Citation']],
    body: rows.length > 0 ? rows : [['—', 'No failed requirements detected.', 'PASSED', 'No rule-based red flags detected.']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.3, cellPadding: 3, textColor: colors.ink, lineColor: colors.border, lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: colors.navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2 },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 45 }, 2: { cellWidth: 23, halign: 'center' }, 3: { cellWidth: 66 } },
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 2) {
        const color = hook.cell.raw === 'FAILED' ? colors.red : hook.cell.raw === 'WARNING' ? colors.amber : colors.green
        hook.cell.styles.textColor = color
        hook.cell.styles.fontStyle = 'bold'
      }
    },
  })

  cursorY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY + 20
  cursorY += 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...colors.muted)
  doc.text(
    data.entityType === 'mfd'
      ? 'Evaluation includes AMFI distributor identification, unauthorized advisory terminology, and statutory scheme-risk disclosures.'
      : 'Evaluation includes Scheme Risk-o-meter, AMC entity identification, and standard scheme-risk disclosures.',
    margin,
    cursorY,
  )
  cursorY += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...colors.navy)
  doc.text('Transcript / Text Excerpt', margin, cursorY)
  cursorY += 4
  const excerpt = data.textExcerpt.trim() || 'No transcript or text excerpt was available.'
  const excerptLines = doc.splitTextToSize(excerpt.slice(0, 1800), contentWidth - 10) as string[]
  const excerptHeight = Math.min(42, Math.max(15, excerptLines.length * 3.5 + 8))
  doc.setFillColor(249, 250, 252)
  doc.setDrawColor(...colors.border)
  doc.roundedRect(margin, cursorY, contentWidth, excerptHeight, 2, 2, 'FD')
  doc.setFont('courier', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...colors.ink)
  doc.text(excerptLines.slice(0, 10), margin + 5, cursorY + 7, { lineHeightFactor: 1.35 })
  cursorY += excerptHeight + 8
  cursorY = drawLegalNotice(doc, cursorY)

  const totalPagesPlaceholder = '{total_pages_count_string}'
  doc.putTotalPages(totalPagesPlaceholder)
  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    drawFooter(doc, page, totalPagesPlaceholder)
  }
  doc.save(`compliance-audit-${referenceId}.pdf`)
}
