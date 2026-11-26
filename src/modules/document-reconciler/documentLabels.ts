import type { CircularFramework } from './types'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function getDocumentLabels(framework: CircularFramework): [string, string] {
  const [primary, paired] = framework.documentTypes.map((label) => label.trim())
  const primaryFallback = ['', 'document a', 'primary document', 'primary lead document'].includes(normalize(primary))
  const pairedFallback = ['', 'document b', 'paired document', 'paired summary document'].includes(normalize(paired))
  return [
    primaryFallback ? 'Primary Lead Document' : primary,
    pairedFallback ? 'Paired Summary Document' : paired,
  ]
}
