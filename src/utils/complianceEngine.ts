export type IssueCategory = 'high-risk' | 'missing-disclaimer' | 'best-practice'
export type IssueSeverity = 'critical' | 'warning' | 'info'
export type RegulatoryClass =
  | 'sebi-violation'
  | 'amfi-advisory'
  | 'disclosure-best-practice'

export interface ComplianceIssue {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  regulatoryClass: RegulatoryClass
  title: string
  detail: string
  recommendation: string
  citation: string
  start?: number
  end?: number
}

export interface ComplianceResult {
  score: number
  issues: ComplianceIssue[]
  passedChecks: number
  totalChecks: number
  compliantRewrite: string
}

export interface RegulatoryCitation {
  authority: string
  reference: string
  description: string
}

export interface RulesetMetadataSource {
  authority: string
  url: string
}

export interface RegulatoryRuleset {
  version: string
  lastUpdated: string
  circulars: string[]
  prohibitedTerms: string[]
  superlatives: string[]
  mandatoryDisclaimers: string[]
  citations: RegulatoryCitation[]
  metadataSources: RulesetMetadataSource[]
  sourceSnapshots?: RulesetSourceSnapshot[]
}

export interface RulesetSourceSnapshot {
  authority: string
  url: string
  etag: string | null
  lastModified: string | null
}

export const REGULATORY_RULESET: RegulatoryRuleset = {
  version: 'v2026.10',
  lastUpdated: 'October 2026',
  circulars: [
    'SEBI Master Circular for Mutual Funds — Chapter 13',
    'AMFI Circular CIR/ARN-32',
    'SEBI (Mutual Funds) Regulations, 1996 — Sixth Schedule',
  ],
  prohibitedTerms: [
    'guaranteed',
    'assured return',
    'assured returns',
    'zero risk',
    'risk-free',
    'risk free',
    '100% safe',
    'capital protection',
    'fixed return',
    'fixed returns',
    'beat fd',
    'indicative yield',
    'promised returns',
  ],
  superlatives: [
    'best fund',
    'no. 1 scheme',
    'top rated fund',
    'unbeatable fund',
    'greatest returns',
  ],
  mandatoryDisclaimers: [
    'Mutual Fund investments are subject to market risks, read all scheme related documents carefully.',
  ],
  citations: [
    {
      authority: 'SEBI',
      reference: 'Master Circular for Mutual Funds, Chapter 13',
      description: 'Advertisement code and mutual fund promotional communication.',
    },
    {
      authority: 'AMFI',
      reference: 'CIR/ARN-32',
      description:
        'Distributor conduct and nomenclature reference; confirm current applicability.',
    },
    {
      authority: 'SEBI',
      reference: 'SEBI (Mutual Funds) Regulations, 1996, Sixth Schedule',
      description:
        'Advertising code and standard mutual fund risk-warning requirements.',
    },
  ],
  metadataSources: [
    { authority: 'SEBI', url: 'https://www.sebi.gov.in/legal/circulars.html' },
    { authority: 'AMFI', url: 'https://www.amfiindia.com/' },
  ],
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  )
}

function isRuleset(value: unknown): value is RegulatoryRuleset {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.lastUpdated === 'string' &&
    isStringArray(candidate.circulars) &&
    isStringArray(candidate.prohibitedTerms) &&
    isStringArray(candidate.superlatives) &&
    isStringArray(candidate.mandatoryDisclaimers) &&
    Array.isArray(candidate.citations) &&
    candidate.citations.every(
      (citation) =>
        typeof citation === 'object' &&
        citation !== null &&
        typeof (citation as Record<string, unknown>).authority === 'string' &&
        typeof (citation as Record<string, unknown>).reference === 'string' &&
        typeof (citation as Record<string, unknown>).description === 'string',
    ) &&
    Array.isArray(candidate.metadataSources) &&
    candidate.metadataSources.every(
      (source) =>
        typeof source === 'object' &&
        source !== null &&
        typeof (source as Record<string, unknown>).authority === 'string' &&
        typeof (source as Record<string, unknown>).url === 'string',
    )
  )
}

export async function loadRules(): Promise<RegulatoryRuleset> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}rules.json`, {
      cache: 'no-cache',
    })
    if (!response.ok) {
      throw new Error(`Rules request failed with HTTP ${response.status}`)
    }

    const payload: unknown = await response.json()
    if (!isRuleset(payload)) {
      throw new Error('The rules file does not match the expected schema')
    }
    return payload
  } catch (error) {
    console.warn(
      'Using bundled regulatory rules because /rules.json is unavailable.',
      error,
    )
    return REGULATORY_RULESET
  }
}

interface RuleMatch {
  phrase: string
  start: number
  end: number
}

const citations = {
  yield:
    'SEBI (Mutual Funds) Regulations, 1996, Sixth Schedule, Clause 1; SEBI Master Circular for Mutual Funds, Clause 13.6 (indicative yields). ASCI Code, Chapter I (truthful and honest representation).',
  advisory:
    'AMFI Code of Conduct for Mutual Fund Distributors; AMFI Circular CIR/ARN-32 (distributor nomenclature reference; confirm current applicability).',
  superlative:
    'SEBI Master Circular for Mutual Funds, Clause 13.3 (advertising claims and rankings). ASCI Code, Chapter I (truthful and substantiated claims).',
  benchmark:
    'SEBI Master Circular for Mutual Funds, Clause 13.3.1 (scheme performance and benchmark comparison).',
  disclaimer:
    'SEBI Master Circular for Mutual Funds, Clause 13.1 and Sixth Schedule (standard risk warning and presentation).',
  entity:
    'AMFI Circular on Mandatory Identification in Promotional Content; AMFI Code of Conduct for Mutual Fund Distributors; SEBI Master Circular for Mutual Funds, Advertisement Code.',
  practice:
    'ASCI Code for Self-Regulation of Advertising Content in India, Chapter I (truthful and honest representation).',
} as const

const multilingualDisclaimerPatterns: RegExp[] = [
  /Mutual\s*Fund\s*investments\s*are\s*subject\s*to\s*market\s*risks/i,
  /(म्यूचुअल|म्युच्युअल)\s*फंड\s*निवेश.*जोखिम|बाजार\s*जोखिम/i,
  /મ્યુચ્યુઅલ\s*ફંડ\s*રોકાણ.*જોખમો/i,
  /মিউচুয়াল\s*ফান্ড\s*বিনিয়োগ.*ঝুঁকি/i,
  /மியூச்சுவல்\s*ஃபண்ட்\s*முதலீடுகள்.*சந்தை\s*அபாயங்களுக்கு/i,
]

function hasMultilingualDisclaimer(text: string): boolean {
  return multilingualDisclaimerPatterns.some((pattern) => pattern.test(text))
}

const advisoryTitlePhrases = [
  'financial advisor',
  'financial adviser',
  'wealth advisor',
  'wealth adviser',
  'wealth manager',
  'investment consultant',
  'portfolio planner',
  'financial planner',
]

const BENCHMARK_PATTERN =
  /\b(?:NIFTY\s?(?:50|500)|S&P\s?BSE\s?SENSEX|BSE\s?SENSEX|CRISIL\s+(?:Composite|[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3})|benchmark)\b/i

function findPhrases(text: string, phrases: string[]): RuleMatch[] {
  const matches: RuleMatch[] = []

  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`\\b${escaped}\\b`, 'gi')
    for (const match of text.matchAll(expression)) {
      if (match.index !== undefined) {
        matches.push({
          phrase: match[0],
          start: match.index,
          end: match.index + match[0].length,
        })
      }
    }
  }

  return matches.sort((first, second) => first.start - second.start)
}

function addPhraseIssues(
  issues: ComplianceIssue[],
  matches: RuleMatch[],
  rule: Omit<ComplianceIssue, 'id' | 'start' | 'end'>,
  idPrefix: string,
): void {
  for (const match of matches) {
    issues.push({
      ...rule,
      id: `${idPrefix}-${match.start}`,
      start: match.start,
      end: match.end,
    })
  }
}

function replacePhrases(
  text: string,
  replacements: [phrase: string, replacement: string][],
): string {
  let result = text
  for (const [phrase, replacement] of replacements) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), replacement)
  }
  return result
}

function hasArnIdentifier(text: string): boolean {
  return /\bARN\s*[-:#]?\s*[A-Z0-9-]{3,}\b/i.test(text)
}

function hasRegisteredEntity(text: string): boolean {
  return (
    /\b[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,5}\s+(?:AMC|Asset Management Company)\b.{0,80}\b(?:SEBI[-\s]?registered|registered (?:with|by) SEBI|SEBI registration)\b/i.test(
      text,
    ) ||
    /\b(?:SEBI[-\s]?registered|registered (?:with|by) SEBI)\s+(?:AMC|asset management company)\b/i.test(
      text,
    ) ||
    /\b(?:legal entity|registered entity|company name)\s*:\s*[A-Z][A-Za-z0-9&.' -]{2,}/i.test(
      text,
    )
  )
}

function hasDistributorTagline(text: string): boolean {
  return /\bAMFI[-\s]?registered\s+(?:Mutual Fund\s+)?Distributor\b/i.test(text)
}

function hasRiaIdentification(text: string): boolean {
  return /\bSEBI[-\s]?registered\s+(?:Investment\s+Adviser|RIA)\b|\bSEBI\s+registration\s+(?:no\.?|number)\s*[:#-]?\s*[A-Z0-9/-]+.{0,50}\bRIA\b/i.test(
    text,
  )
}

function hasPerformanceClaim(text: string): boolean {
  return /\b(?:CAGR|XIRR)\b|\b\d+(?:\.\d+)?\s*%/i.test(text)
}

function hasStandardHorizon(text: string): boolean {
  return /\b(?:1|3|5)\s*[- ]?(?:Y|year|years|yr|yrs)\b|\bsince[- ]inception\b|\binception-to-date\b|\bSI\b/i.test(
    text,
  )
}

function hasBenchmarkParity(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .some((sentence, index, sentences) => {
      const statement = [sentence, sentences[index + 1]].filter(Boolean).join(' ')
      const percentageFigures = statement.match(/\b\d+(?:\.\d+)?\s*%/g) ?? []
      return BENCHMARK_PATTERN.test(statement) && percentageFigures.length >= 2
    })
}

function hasRatingAttribution(text: string): boolean {
  const hasAgency =
    /\b(?:CRISIL|Morningstar|Value Research|CARE Ratings|ICRA|ET Money|Moneycontrol)\b/i.test(
      text,
    ) || /\brated\s+by\s+[A-Z][A-Za-z&.-]+/i.test(text)
  const hasMethodology = /\b(?:methodology|rating model|star rating)\b/i.test(text)
  const hasAsOfDate =
    /\b(?:as of|as at|dated)\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i.test(text) ||
    /\b(?:as of|as at|dated)\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i.test(
      text,
    ) ||
    /\b(?:as of|as at|dated)\s+(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i.test(
      text,
    )
  return hasAgency && hasMethodology && hasAsOfDate
}

function paragraphAt(text: string, position: number): string {
  const paragraphStart = text.lastIndexOf('\n', position) + 1
  const nextBreak = text.indexOf('\n', position)
  return text.slice(paragraphStart, nextBreak === -1 ? text.length : nextBreak)
}

function buildRewrite(
  source: string,
  issues: ComplianceIssue[],
  rules: RegulatoryRuleset,
): string {
  const replacementByTerm: Record<string, string> = {
    'assured returns': 'market-linked returns',
    'assured return': 'market-linked return',
    'capital protection': 'capital value may fluctuate',
    'zero risk': 'subject to market risk',
    'zero-risk': 'subject to market risk',
    'risk-free': 'subject to market risk',
    'risk free': 'subject to market risk',
    '100% safe': 'subject to market risk',
    'fixed returns': 'market-linked returns',
    'fixed return': 'market-linked return',
    'beat fd': 'consider alongside other investment options',
    'indicative yield': 'market-linked performance',
    'promised returns': 'market-linked returns',
    'promised return': 'market-linked return',
    'double money': 'invest in line with your goals and risk profile',
    guaranteed: 'market-linked',
  }
  let rewrite = replacePhrases(
    source,
    rules.prohibitedTerms.map(
      (term): [string, string] => [
        term,
        replacementByTerm[term.toLowerCase()] ?? 'subject to market risk',
      ],
    ),
  )
  rewrite = replacePhrases(
    rewrite,
    rules.superlatives.map(
      (phrase): [string, string] => [phrase, 'a scheme to explore'],
    ),
  )
  rewrite = replacePhrases(
    rewrite,
    advisoryTitlePhrases.map(
      (phrase): [string, string] => [phrase, 'mutual fund marketing professional'],
    ),
  )
  rewrite = rewrite.replace(
    /\bindependent\s+wealth\s+advisor\b/gi,
    'mutual fund marketing professional',
  )
  rewrite = rewrite.replace(
    /\b(?:better than|like|similar to)\s+(?:a\s+)?(?:fixed deposit|FD)\b/gi,
    'not equivalent to a fixed deposit',
  )

  const hasClaim = hasPerformanceClaim(source)
  const hasStandardPeriod = hasStandardHorizon(source)
  const hasParity = hasBenchmarkParity(source)
  const hasEntity =
    hasArnIdentifier(source) ||
    hasRegisteredEntity(source) ||
    hasDistributorTagline(source)
  const disclosures: string[] = []

  if (hasClaim && (!hasStandardPeriod || !hasParity)) {
    const performanceRequirements: string[] = []
    if (!hasStandardPeriod) {
      performanceRequirements.push(
        'the applicable standardized horizon (1Y, 3Y, 5Y or since inception)',
      )
    }
    if (!hasParity) {
      performanceRequirements.push(
        'the designated benchmark name and its comparable return for that same period',
      )
    }
    disclosures.push(
      `Performance disclosure to complete before use: add ${performanceRequirements.join(' and ')}. Do not publish until the figures and source are verified.`,
    )
  }
  if (!hasMultilingualDisclaimer(source)) {
    disclosures.push(...rules.mandatoryDisclaimers)
  }
  if (!hasEntity) {
    disclosures.push(
      'Entity disclosure to complete: [add valid ARN, registered entity name, or AMFI-registered Mutual Fund Distributor tagline].',
    )
  }
  if (issues.some((issue) => issue.id.startsWith('advisory-title-'))) {
    disclosures.push(
      'Use advisory titles only where the individual or entity is accurately identified as a SEBI-registered Investment Adviser (RIA).',
    )
  }

  const cleanedRewrite = rewrite.trim()
  return [cleanedRewrite, ...disclosures]
    .filter(Boolean)
    .join('\n\n')
}

export function scanCompliance(
  text: string,
  rules: RegulatoryRuleset = REGULATORY_RULESET,
): ComplianceResult {
  const issues: ComplianceIssue[] = []
  let totalChecks = 0
  let failedChecks = 0

  const yieldMatches = findPhrases(text, rules.prohibitedTerms)
  totalChecks += 1
  if (yieldMatches.length > 0) failedChecks += 1
  addPhraseIssues(
    issues,
    yieldMatches,
    {
      category: 'high-risk',
      severity: 'critical',
      regulatoryClass: 'sebi-violation',
      title: 'Prohibited yield or return guarantee wording',
      detail: 'This wording may imply a certain, guaranteed, or indicative mutual fund outcome.',
      recommendation: 'Remove the claim. Use balanced, supportable language and preserve the market-risk context.',
      citation: citations.yield,
    },
    'yield',
  )

  const titleMatches = findPhrases(text, advisoryTitlePhrases)
  const hasRia = hasRiaIdentification(text)
  totalChecks += 1
  if (titleMatches.length > 0 && !hasRia) failedChecks += 1
  if (!hasRia) {
    addPhraseIssues(
      issues,
      titleMatches,
      {
        category: 'high-risk',
        severity: 'warning',
        regulatoryClass: 'amfi-advisory',
        title: 'Potentially restricted advisory title',
        detail: 'The copy uses an advisory or planning title without identifying the person as a SEBI-registered Investment Adviser.',
        recommendation: 'Use only a title supported by the person’s registration status, or identify the SEBI-registered RIA accurately.',
        citation: citations.advisory,
      },
      'advisory-title',
    )
  }

  const sipMatches = findPhrases(text, ['SIP', 'systematic investment plan'])
  const sipRiskMatches = sipMatches.filter((match) => {
    const context = text.slice(Math.max(0, match.start - 90), match.end + 150)
    return /\b(?:fixed deposit|FD|riskless|risk[- ]free|zero[- ]risk|guaranteed|capital protection)\b/i.test(
      context,
    )
  })
  totalChecks += 1
  if (sipRiskMatches.length > 0) failedChecks += 1
  addPhraseIssues(
    issues,
    sipRiskMatches,
    {
      category: 'high-risk',
      severity: 'critical',
      regulatoryClass: 'sebi-violation',
      title: 'SIP represented as riskless or deposit-like',
      detail: 'A Systematic Investment Plan is an investment method and does not remove mutual fund market risk.',
      recommendation: 'Remove the deposit or risk-free comparison and explain the market-linked nature of the investment.',
      citation: citations.yield,
    },
    'sip-risk',
  )

  const superlativeMatches = findPhrases(text, rules.superlatives)
  const unsupportedSuperlatives = superlativeMatches.filter(
    (match) => !hasRatingAttribution(paragraphAt(text, match.start)),
  )
  totalChecks += 1
  if (unsupportedSuperlatives.length > 0) failedChecks += 1
  if (unsupportedSuperlatives.length > 0) {
    addPhraseIssues(
      issues,
      unsupportedSuperlatives,
      {
        category: 'high-risk',
        severity: 'critical',
        regulatoryClass: 'sebi-violation',
        title: 'Unsubstantiated superlative or ranking',
        detail: 'No named rating agency, rating methodology, and exact as-of date were all detected in the copy.',
        recommendation: 'Attribute the claim to its source, explain the methodology, and provide the exact as-of date—or remove the ranking.',
        citation: citations.superlative,
      },
      'superlative',
    )
  }

  const isPerformanceClaim = hasPerformanceClaim(text)
  if (isPerformanceClaim) {
    const hasPeriod = hasStandardHorizon(text)
    totalChecks += 1
    if (!hasPeriod) {
      failedChecks += 1
      issues.push({
        id: 'performance-horizon',
        category: 'missing-disclaimer',
        severity: 'warning',
        regulatoryClass: 'disclosure-best-practice',
        title: 'Standardized performance horizon missing',
        detail: 'A return, CAGR, XIRR, or percentage figure appears without a 1Y, 3Y, 5Y, or since-inception horizon.',
        recommendation: 'State the standardized horizon and the relevant as-of date for the quoted performance.',
        citation: citations.benchmark,
      })
    }

    const hasParity = hasBenchmarkParity(text)
    totalChecks += 1
    if (!hasParity) {
      failedChecks += 1
      issues.push({
        id: 'benchmark-parity',
        category: 'missing-disclaimer',
        severity: 'warning',
        regulatoryClass: 'disclosure-best-practice',
        title: 'Designated benchmark parity missing',
        detail: 'A recognized benchmark and comparable scheme/benchmark return figures for the same period were not detected.',
        recommendation: 'Name the applicable benchmark (for example NIFTY 50, S&P BSE SENSEX, or the scheme’s designated benchmark) and give comparable returns for the same horizon.',
        citation: citations.benchmark,
      })
    }
  }

  totalChecks += 1
  const hasDisclaimer = hasMultilingualDisclaimer(text)
  if (!hasDisclaimer) {
    failedChecks += 1
    issues.push({
      id: 'standard-disclaimer',
      category: 'missing-disclaimer',
      severity: 'warning',
      regulatoryClass: 'disclosure-best-practice',
      title: 'Exact statutory risk warning missing',
      detail: 'No supported English, Hindi, Marathi, Gujarati, Bengali, or Tamil statutory risk warning was detected.',
      recommendation: `Insert the applicable statutory warning, for example: “${rules.mandatoryDisclaimers[0]}”`,
      citation: citations.disclaimer,
    })
  } else {
    issues.push({
      id: 'disclaimer-legibility',
      category: 'best-practice',
      severity: 'info',
      regulatoryClass: 'disclosure-best-practice',
      title: 'Verify warning legibility in the final creative',
      detail: 'The statutory warning is present in text; this checker cannot assess font size, contrast, duration, placement, or audio intelligibility.',
      recommendation: 'Check the final visual/audio execution against the applicable presentation and legibility requirements.',
      citation: citations.disclaimer,
    })
  }

  const hasEntity =
    hasArnIdentifier(text) ||
    hasRegisteredEntity(text) ||
    hasDistributorTagline(text)
  totalChecks += 1
  if (!hasEntity) {
    failedChecks += 1
    issues.push({
      id: 'entity-disclosure',
      category: 'missing-disclaimer',
      severity: 'warning',
      regulatoryClass: 'disclosure-best-practice',
      title: 'Entity or distributor identification missing',
      detail: 'No ARN, registered entity details, or AMFI-registered distributor tagline was detected.',
      recommendation: 'Add the applicable ARN, registered entity name, or AMFI-registered Mutual Fund Distributor identification.',
      citation: citations.entity,
    })
  }

  if (issues.length === 0) {
    issues.push({
      id: 'clear-copy',
      category: 'best-practice',
      severity: 'info',
      regulatoryClass: 'disclosure-best-practice',
      title: 'No rule-based red flags detected',
      detail: `${totalChecks} configured checks passed. This automated result is not regulatory approval.`,
      recommendation: 'Review the complete campaign, current regulations, substantiation, and final media execution before release.',
      citation: citations.practice,
    })
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        issues.reduce((deduction, issue) => {
          if (issue.severity === 'critical') return deduction + 25
          if (issue.severity === 'warning') return deduction + 12
          return deduction
        }, 0),
    ),
  )

  return {
    score,
    issues,
    passedChecks: Math.max(0, totalChecks - failedChecks),
    totalChecks,
    compliantRewrite: buildRewrite(text, issues, rules),
  }
}
