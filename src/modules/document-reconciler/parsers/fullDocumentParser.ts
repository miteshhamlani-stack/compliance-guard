import { extractTextFromFile } from './fileTextExtractor'
import type { CircularFramework, DocumentNode, ExpectedSection } from '../types'

interface BlockMetadata {
  start: number
  code: string
  title: string
  headingPath: string
}

const structuralHeading =
  /^\s*(?:#{1,6}\s*)?((?:part\s+[IVXLCDM\d]+|chapter\s+[IVXLCDM\d]+|section\s+\d+(?:\.\d+)*|clause\s+\d+(?:\.\d+)*|format\s+[A-Z\d]+|annex(?:ure)?\s+[A-Z\d]+|\d+(?:\.\d+)*(?:[.)])?))\s*[:.–-]?\s*(.*?)\s*$/i

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document-block'
}

function matchingExpectedSection(line: string, expectedSections: ExpectedSection[]): ExpectedSection | undefined {
  const normalizedLine = normalize(line.replace(/^#{1,6}\s*/, ''))
  return expectedSections.find((section) => {
    const title = normalize(section.title)
    const code = normalize(section.code)
    return normalizedLine === title
      || (title.length > 2 && normalizedLine.startsWith(`${title} `))
      || (code.length > 2 && (normalizedLine === code || normalizedLine.startsWith(`${code} `)))
  })
}

function headingDepth(code: string): number {
  if (/^part\b/i.test(code)) return 0
  if (/^chapter\b/i.test(code)) return 1
  if (/^section\b/i.test(code)) return 2
  if (/^clause\b/i.test(code)) return 3
  if (/^(?:format|annex(?:ure)?|annexure)\b/i.test(code)) return 2
  return Math.max(2, code.split('.').length + 1)
}

function parseHeading(line: string, expectedSections: ExpectedSection[]): Omit<BlockMetadata, 'start'> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const structural = trimmed.match(structuralHeading)
  const isMarkdownHeading = /^#{1,6}\s+\S/.test(trimmed)
  const expected = matchingExpectedSection(trimmed, expectedSections)
  if (!structural && !isMarkdownHeading && !expected) return null

  const rawCode = structural?.[1]?.replace(/[:.–-]+$/, '').trim() ?? ''
  const rawTitle = structural?.[2]?.trim().replace(/[:.–-]+$/, '') ?? trimmed.replace(/^#{1,6}\s*/, '')
  const code = expected?.code ?? rawCode
  const title = expected?.title ?? (rawTitle || code || 'Untitled section')
  return { code, title, headingPath: '' }
}

function splitDocument(text: string, framework: CircularFramework, prefix: string): DocumentNode[] {
  const headings: BlockMetadata[] = []
  const hierarchy: { depth: number; title: string }[] = []
  const linePattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g

  for (const match of text.matchAll(linePattern)) {
    const rawLine = match[0]
    if (!rawLine) continue
    const line = rawLine.replace(/(?:\r\n|\n|\r)$/, '')
    const heading = parseHeading(line, framework.expectedSections)
    if (!heading) continue
    const depth = headingDepth(heading.code)
    while (hierarchy.length > 0 && hierarchy[hierarchy.length - 1].depth >= depth) hierarchy.pop()
    hierarchy.push({ depth, title: heading.title })
    headings.push({
      start: match.index ?? 0,
      ...heading,
      headingPath: hierarchy.map((part) => part.title).join(' > '),
    })
  }

  const starts = headings.filter((heading, index) => index === 0 || heading.start !== headings[index - 1].start)
  const blocks: BlockMetadata[] = []
  if (starts.length === 0 || starts[0].start > 0) {
    blocks.push({ start: 0, code: '', title: 'Document opening', headingPath: '' })
  }
  blocks.push(...starts)
  if (blocks.length === 0) blocks.push({ start: 0, code: '', title: 'Document', headingPath: '' })

  const nodes = blocks.map((block, index) => {
    const end = blocks[index + 1]?.start ?? text.length
    const fullContent = text.slice(block.start, end)
    return {
      id: `${prefix}-${index}-${slug(block.code || block.title)}`,
      orderIndex: index,
      headingPath: block.headingPath,
      sectionCode: block.code,
      title: block.title,
      fullContent,
      isImpacted: false,
    } satisfies DocumentNode
  })

  if (nodes.map((node) => node.fullContent).join('') !== text) {
    throw new Error('Document parsing did not preserve the complete extracted text.')
  }
  return nodes
}

function headingsAlign(primary: DocumentNode[], secondary: DocumentNode[]): boolean {
  return primary.length === secondary.length && primary.every((node, index) =>
    normalize(node.sectionCode) === normalize(secondary[index].sectionCode)
      && normalize(node.title) === normalize(secondary[index].title))
}

function markMissingMandatorySections(nodes: DocumentNode[], framework: CircularFramework): DocumentNode[] {
  const present = new Set(nodes.map((node) => `${normalize(node.sectionCode)}|${normalize(node.title)}`))
  const missing = framework.expectedSections.filter((section) => section.mandatoryRule
    && !present.has(`${normalize(section.code)}|${normalize(section.title)}`))

  let nextOrder = Math.max(-1, ...nodes.map((node) => node.orderIndex)) + 1
  return [
    ...nodes,
    ...missing.map((section) => ({
      id: `missing-${slug(section.code || section.title)}`,
      orderIndex: nextOrder++,
      headingPath: section.title,
      sectionCode: section.code,
      title: section.title,
      fullContent: '',
      isImpacted: true,
      circularComplianceNote: `Missing mandatory section: ${section.mandatoryRule}`,
    })),
  ]
}

export async function parseCompleteLeadDocuments(
  primaryFile: File,
  secondaryFile: File | null,
  framework: CircularFramework,
): Promise<DocumentNode[]> {
  const primaryText = await extractTextFromFile(primaryFile)
  if (!primaryText.trim()) throw new Error(`${primaryFile.name}: no readable text was found.`)
  const primaryNodes = splitDocument(primaryText, framework, 'primary')

  let nodes = primaryNodes
  if (secondaryFile) {
    const secondaryText = await extractTextFromFile(secondaryFile)
    if (!secondaryText.trim()) throw new Error(`${secondaryFile.name}: no readable text was found.`)
    const secondaryNodes = splitDocument(secondaryText, framework, 'secondary')
    if (headingsAlign(primaryNodes, secondaryNodes)) {
      nodes = primaryNodes.map((node, index) => ({
        ...node,
        pairedDocContent: secondaryNodes[index].fullContent,
      }))
    } else {
      nodes = [
        ...primaryNodes,
        ...secondaryNodes.map((node, index) => ({
          ...node,
          id: `paired-${index}-${slug(node.sectionCode || node.title)}`,
          orderIndex: primaryNodes.length + index,
          fullContent: '',
          pairedDocContent: node.fullContent,
        })),
      ]
    }

    if (nodes.map((node) => node.pairedDocContent ?? '').join('') !== secondaryText) {
      throw new Error('Paired document parsing did not preserve the complete extracted text.')
    }
  }

  return markMissingMandatorySections(nodes, framework).map((node, orderIndex) => ({ ...node, orderIndex }))
}
