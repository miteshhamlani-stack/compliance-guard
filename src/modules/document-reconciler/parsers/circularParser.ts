import { extractTextFromFile } from './fileTextExtractor'
import type { CircularFramework, ExpectedSection } from '../types'

const headingPattern =
  /^\s*(?:#{1,6}\s*)?((?:part\s+[IVXLCDM\d]+|chapter\s+[IVXLCDM\d]+|section\s+\d+(?:\.\d+)*|clause\s+\d+(?:\.\d+)*|format\s+[A-Z\d]+|annex(?:ure)?\s+[A-Z\d]+)(?:\s*[:.–-]\s*|\s+)?)(.*?)\s*$/i
const checklistTerms =
  /\b(shall be updated|within|half[- ]year(?:ly)?|mandatory|risk[- ]o[- ]meter|fundamental attribute|shall|must|required|monthly|quarterly|annually|days?|business days?)\b/i

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function extractExpectedSections(text: string): ExpectedSection[] {
  const sections: ExpectedSection[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(headingPattern)
    if (!match) continue
    const code = match[1].trim().replace(/[:.–-]+$/, '')
    const title = match[2].trim().replace(/[:.–-]+$/, '') || code
    const key = `${code}\n${title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    sections.push({
      code,
      title,
      keywords: [...new Set(`${code} ${title}`.toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 2))],
    })
  }
  return sections
}

function guessDocumentTypes(text: string, authority: CircularFramework['authority']): [string, string] {
  if (/\b(mutual fund|scheme information document|key information memorandum)\b/i.test(text)) {
    return ['Primary Lead Document', 'Paired Summary Document']
  }
  const explicitLabels = text.match(/(?:paired documents?|document types?|applicable documents?)\s*[:-]\s*([^.;\n]{3,100})/i)?.[1]
    ?? text.match(/(?:applies? to|applicable to|for)\s+([^.;\n]{3,100})/i)?.[1]
  if (explicitLabels) {
    const labels = explicitLabels.split(/\s+(?:and|&|\/)\s+/i).map((label) => label.trim())
    if (labels.length >= 2 && labels[0] && labels[1]) return [labels[0], labels[1]]
  }
  if (authority === 'RBI' || /\b(master direction|master policy|MITC|bank|lending|borrower)\b/i.test(text)) {
    return ['Master Policy', 'Customer MITC']
  }
  return ['Document A', 'Document B']
}

function detectAuthority(text: string): CircularFramework['authority'] {
  if (/\bReserve Bank of India\b|\bRBI\b/i.test(text)) return 'RBI'
  if (/\bSecurities and Exchange Board of India\b|\bSEBI\b/i.test(text)) return 'SEBI'
  return 'Other'
}

function extractChecklist(text: string): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? []
  return [...new Set(sentences
    .map((sentence) => sentence.trim().replace(/\s+/g, ' '))
    .filter((sentence) => sentence.length >= 20 && checklistTerms.test(sentence)))]
}

function dateOnly(date: string): string {
  const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let year: number
  let month: number
  let day: number
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const numeric = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    const parsed = numeric
      ? new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]))
      : new Date(date)
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10)
    year = parsed.getFullYear()
    month = parsed.getMonth() + 1
    day = parsed.getDate()
  }
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return new Date().toISOString().slice(0, 10)
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function parseText(text: string, sourceName: string): CircularFramework {
  if (!text.trim()) throw new Error('No readable text was found in the selected file.')
  const authority = detectAuthority(text)
  const name = text.match(/^\s*(?:master circular|master direction|circular)\s*[:–-]?\s*(.{5,120})/im)?.[1]?.trim()
    ?? sourceName.replace(/\.[^.]+$/, '')
  const reference = text.match(/\b(?:circular|master direction)\s*(?:no\.?|number|ref\.?)\s*[:#-]?\s*([A-Z0-9./-]{4,})/i)?.[1]
    ?? sourceName.replace(/\.[^.]+$/, '')
  const effective = text.match(/\b(?:effective(?:\s+from)?|with effect from)\s*:?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1]

  return {
    id: `custom-${slug(`${reference}-${name}`) || Date.now().toString()}`,
    name,
    authority,
    circularRef: reference,
    effectiveDate: effective ? dateOnly(effective) : new Date().toISOString().slice(0, 10),
    documentTypes: guessDocumentTypes(text, authority),
    expectedSections: extractExpectedSections(text),
    complianceChecklist: extractChecklist(text),
    isCustom: true,
  }
}

export async function parseMasterCircularFile(file: File): Promise<CircularFramework> {
  return parseText(await extractTextFromFile(file), file.name)
}
