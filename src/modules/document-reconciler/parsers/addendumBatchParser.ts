import { extractTextFromFile } from './fileTextExtractor'
import type { AmendmentNotice, CircularFramework, DocumentNode } from '../types'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function words(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/).filter((word) => word.length > 3))]
}

function findTargetNode(text: string, framework: CircularFramework, nodes: DocumentNode[]): DocumentNode | null {
  const searchableText = normalize(text)
  let best: { node: DocumentNode; score: number; index: number } | null = null

  for (const [index, node] of nodes.entries()) {
    const nodeText = node.fullContent || node.pairedDocContent || ''
    if (!nodeText.trim() && !node.circularComplianceNote) continue
    const expected = framework.expectedSections.find((section) =>
      normalize(section.code) === normalize(node.sectionCode)
        || normalize(section.title) === normalize(node.title))
    const code = normalize(node.sectionCode)
    const title = normalize(node.title)
    let score = code && searchableText.includes(code) ? 100 : 0
    if (title && searchableText.includes(title)) score += 60
    for (const keyword of expected?.keywords ?? []) {
      const normalizedKeyword = normalize(keyword)
      if (normalizedKeyword && searchableText.includes(normalizedKeyword)) {
        score += Math.max(3, normalizedKeyword.split(' ').length * 5)
      }
    }
    const paragraphWords = words(nodeText)
    score += words(text).filter((word) => paragraphWords.includes(word)).length
    if (score > 0 && (!best || score > best.score || (score === best.score && index < best.index))) {
      best = { node, score, index }
    }
  }
  return best?.node ?? null
}

function extractDate(text: string, expression: RegExp): string | null {
  const match = text.match(expression)?.[1]
  if (!match) return null
  const iso = match.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const numeric = match.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  const parsed = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : numeric
      ? new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]))
      : new Date(match)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear().toString().padStart(4, '0')}-${(parsed.getMonth() + 1).toString().padStart(2, '0')}-${parsed.getDate().toString().padStart(2, '0')}`
}

function targetExcerpt(text: string, addendum: string): string {
  const addendumWords = new Set(words(addendum))
  const paragraphs = text.split(/\r?\n\s*\r?\n/)
  const candidates = paragraphs.flatMap((paragraph) => paragraph.split(/\r?\n/))
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate && !/^(?:part|chapter|section|clause|format|annex(?:ure)?|annexure)\b/i.test(candidate))
  let best = ''
  let bestScore = -1
  for (const candidate of candidates) {
    const score = words(candidate).filter((word) => addendumWords.has(word)).length
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best || candidates[0] || text.trim()
}

function proposedText(text: string, target: DocumentNode): string {
  const marked = text.match(/(?:proposed|amended|revised|replacement)\s+(?:clause|text|wording)\s*[:-]\s*([\s\S]+)/i)?.[1]?.trim()
  if (marked) return marked

  const lines = text.split(/\r?\n/)
  const targetHeadingIndex = lines.findIndex((line) => {
    const normalizedLine = normalize(line)
    return (target.sectionCode && normalizedLine.includes(normalize(target.sectionCode)))
      || (target.title && normalizedLine.includes(normalize(target.title)))
  })
  if (targetHeadingIndex >= 0) {
    const body = lines.slice(targetHeadingIndex + 1)
    const nextHeading = body.findIndex((line) =>
      /^\s*(?:part|chapter|section|clause|annex(?:ure)?|format)\s+[\w.-]+/i.test(line))
    const value = (nextHeading < 0 ? body : body.slice(0, nextHeading)).join('\n').trim()
    if (value) return value
  }
  const paragraphs = text.split(/\r?\n\s*\r?\n/)
  const proposal = paragraphs.filter((paragraph) =>
    !/\b(?:notice|circular|addendum)\s*(?:no\.?|number|#)\s*[:#-]/i.test(paragraph)
      && !/\b(?:effective date|notice date|issued on)\s*:/i.test(paragraph))
  return (proposal.at(-1) ?? text).trim()
}

async function parseOne(
  file: File,
  framework: CircularFramework,
  fullDocNodes: DocumentNode[],
): Promise<AmendmentNotice> {
  let text: string
  try {
    text = await extractTextFromFile(file)
  } catch (reason) {
    throw new Error(`${file.name}: ${reason instanceof Error ? reason.message : 'Could not extract text.'}`)
  }
  if (!text.trim()) throw new Error(`${file.name}: no readable text was found.`)
  const target = findTargetNode(text, framework, fullDocNodes)
  if (!target) throw new Error(`${file.name}: no document section matched. Include a section code, title, or relevant terms.`)

  const noticeNumber = text.match(/\b(?:notice|circular|addendum)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]*)/i)?.[1]
    ?? file.name.replace(/\.[^.]+$/, '')
  const noticeDate = extractDate(text, /\b(?:notice date|issued on|dated)\s*:?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
    ?? new Date(file.lastModified).toISOString().slice(0, 10)
  const effectiveDate = extractDate(text, /\b(?:effective(?:\s+date|\s+from)?|with effect from)\s*:?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
    ?? noticeDate
  const targetContent = target.fullContent || target.pairedDocContent || ''

  return {
    id: `notice-${crypto.randomUUID()}`,
    fileName: file.name,
    noticeNumber,
    noticeDate,
    effectiveDate,
    impactedScope: `${target.sectionCode ? `${target.sectionCode}: ` : ''}${target.title}`,
    targetNodeId: target.id,
    targetHeading: target.headingPath || target.title,
    originalExcerpt: targetExcerpt(targetContent, text),
    proposedText: proposedText(text, target),
    status: 'pending',
  }
}

export async function parseAddendumFiles(
  files: File[],
  framework: CircularFramework,
  fullDocNodes: DocumentNode[],
): Promise<AmendmentNotice[]> {
  return Promise.all(files.map((file) => parseOne(file, framework, fullDocNodes)))
}
