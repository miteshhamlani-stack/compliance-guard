import { diffWords } from 'diff'

export interface RedlinePart {
  value: string
  added?: boolean
  removed?: boolean
}

export function createRedline(baseline: string, proposed: string): RedlinePart[] {
  return diffWords(baseline, proposed).map((part) => ({
    value: part.value,
    ...(part.added ? { added: true } : {}),
    ...(part.removed ? { removed: true } : {}),
  }))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function overlapScore(candidate: string, reference: string): number {
  const expected = new Set(normalize(reference).split(/\s+/).filter((word) => word.length > 3))
  return normalize(candidate).split(/\s+/).filter((word) => expected.has(word)).length
}

export function findBestExcerpt(content: string, reference: string): string {
  if (!content) return ''
  if (reference && content.includes(reference)) return reference
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const candidates = lines.filter((line) =>
    !/^(?:#{1,6}\s*)?(?:part|chapter|section|clause|format|annex(?:ure)?|annexure)\b/i.test(line))
  let best = ''
  let bestScore = -1
  for (const candidate of candidates) {
    const score = overlapScore(candidate, reference)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best || candidates[0] || content
}

export function replaceBestExcerpt(content: string, reference: string, replacement: string): string {
  if (!content) return replacement
  if (reference) {
    const exactIndex = content.indexOf(reference)
    if (exactIndex >= 0) {
      return `${content.slice(0, exactIndex)}${replacement}${content.slice(exactIndex + reference.length)}`
    }
  }

  const linePattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
  const lines = [...content.matchAll(linePattern)].filter((match) => match[0].length > 0)
  let best: RegExpMatchArray | undefined
  let bestScore = -1
  for (const line of lines) {
    const value = line[0].replace(/(?:\r\n|\n|\r)$/, '').trim()
    if (!value || /^(?:#{1,6}\s*)?(?:part|chapter|section|clause|format|annex(?:ure)?|annexure)\b/i.test(value)) continue
    const score = overlapScore(value, reference)
    if (score > bestScore) {
      best = line
      bestScore = score
    }
  }
  if (!best) return `${content}${content.endsWith('\n') ? '' : '\n'}${replacement}`
  return `${content.slice(0, best.index)}${replacement}${content.slice((best.index ?? 0) + best[0].length)}`
}
