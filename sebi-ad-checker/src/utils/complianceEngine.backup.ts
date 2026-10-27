export type IssueCategory = 'high-risk' | 'missing-disclaimer' | 'best-practice'
export type IssueSeverity = 'critical' | 'warning' | 'info'

export interface ComplianceIssue {
  id: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  detail: string
  recommendation: string
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

interface RuleMatch {
  phrase: string
  start: number
  end: number
}

const DISCLAIMER =
  'Mutual Fund investments are subject to market risks, read all scheme related documents carefully.'

const certaintyPhrases = [
  'assured returns',
  'capital protection',
  'zero risk',
  'zero-risk',
  'risk-free',
  'risk free',
  'fixed returns',
  'guaranteed',
  'beat FD',
]

const superlativePhrases = ['best fund', 'No. 1 scheme', 'top performer']

function findPhrases(text: string, phrases: string[]): RuleMatch[] {
  const matches: RuleMatch[] = []

  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`\\b${escaped}\\b`, 'gi')
    for (const match of text.matchAll(expression)) {
      const start = match.index
      if (start !== undefined) {
        matches.push({ phrase: match[0], start, end: start + match[0].length })
      }
    }
  }

  return matches.sort((first, second) => first.start - second.start)
}

function issueForMatch(
  id: string,
  category: IssueCategory,
  severity: IssueSeverity,
  title: string,
  detail: string,
  recommendation: string,
  match: RuleMatch,
): ComplianceIssue {
  return { id, category, severity, title, detail, recommendation, ...match }
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

function buildRewrite(source: string, issues: ComplianceIssue[]): string {
  let rewrite = replacePhrases(
    source,
    [
      ['assured returns', 'market-linked returns'],
      ['capital protection', 'capital value may fluctuate'],
      ['zero risk', 'subject to market risk'],
      ['zero-risk', 'subject to market risk'],
      ['risk-free', 'subject to market risk'],
      ['risk free', 'subject to market risk'],
      ['fixed returns', 'market-linked returns'],
      ['guaranteed', 'market-linked'],
      ['beat FD', 'consider alongside other investment options'],
    ],
  )
  rewrite = replacePhrases(
    rewrite,
    superlativePhrases.map(
      (phrase): [string, string] => [phrase, 'a scheme to evaluate'],
    ),
  )
  rewrite = rewrite.replace(
    /\b(?:better than|like|similar to)\s+(?:a\s+)?(?:fixed deposit|FD)\b/gi,
    'not equivalent to a fixed deposit',
  )
  rewrite = rewrite.replace(
    /\b(?:riskless|risk-less|zero[- ]risk)\b/gi,
    'subject to market risk',
  )
  rewrite = rewrite.replace(
    /\b(?:SIP|systematic investment plan)s?\b[^.!?\n]*(?:fixed deposit|FD|risk[- ]?less|zero[- ]risk)[^.!?\n]*/gi,
    'A SIP is a way to invest periodically in a mutual fund; it does not assure returns or remove market risk',
  )
  rewrite = rewrite.trim()

  const hasReturnsClaim = /\b(?:returns?|CAGR)\b|\b\d+(?:\.\d+)?\s*%/i.test(source)
  const hasPeriod = /\b(?:1|3|5)\s*(?:Y|years?|yrs?)\b/i.test(source)
  const hasBenchmark = /\bbenchmark\b/i.test(source)

  const disclosures = [
    DISCLAIMER,
    'AMFI-registered Mutual Fund Distributor | ARN: [add your ARN] | EUIN: [add your EUIN].',
    'We act as a Mutual Fund Distributor and do not provide SEBI-registered Investment Advisory (RIA) services.',
  ]

  if (hasReturnsClaim && (!hasPeriod || !hasBenchmark)) {
    disclosures.push(
      'Before sharing any performance data, state the applicable period (1Y, 3Y or 5Y) and include the relevant benchmark comparison notice. Verify the figures and source before use.',
    )
  }

  if (
    issues.some((issue) => issue.id.startsWith('sip-')) &&
    !/SIP is a way to invest periodically/i.test(rewrite)
  ) {
    disclosures.push(
      'A SIP is a way to invest periodically in a mutual fund; it does not assure returns or remove market risk.',
    )
  }

  return [rewrite, ...disclosures].filter(Boolean).join('\n\n')
}

export function scanCompliance(text: string): ComplianceResult {
  const issues: ComplianceIssue[] = []
  let totalChecks = 0
  let failedChecks = 0

  const certaintyMatches = findPhrases(text, certaintyPhrases)
  totalChecks += 1
  if (certaintyMatches.length > 0) failedChecks += 1
  for (const match of certaintyMatches) {
    issues.push(
      issueForMatch(
        `certainty-${match.start}`,
        'high-risk',
        'critical',
        'Implied certainty or risk-free claim',
        `“${match.phrase}” can imply assured outcomes or downplay market risk.`,
        'Remove the claim. Describe the product factually and state that returns are market-linked.',
        match,
      ),
    )
  }

  const superlativeMatches = findPhrases(text, superlativePhrases)
  totalChecks += 1
  if (superlativeMatches.length > 0) failedChecks += 1
  for (const match of superlativeMatches) {
    issues.push(
      issueForMatch(
        `superlative-${match.start}`,
        'high-risk',
        'critical',
        'Unsubstantiated performance superlative',
        `“${match.phrase}” needs verifiable substantiation, context and an appropriate time period.`,
        'Remove the ranking or provide substantiated, dated context and required disclosures.',
        match,
      ),
    )
  }

  const sipRisk = findPhrases(text, ['SIP'])
    .map((match) => {
      const context = text.slice(Math.max(0, match.start - 90), match.end + 150)
      const riskMatch = findPhrases(context, [
        'fixed deposit',
        'FD',
        'riskless',
        'risk-less',
        'zero-risk',
        'zero risk',
        'risk-free',
        'risk free',
      ])[0]
      return riskMatch ? match : undefined
    })
    .filter((match): match is RuleMatch => match !== undefined)

  totalChecks += 1
  if (sipRisk.length > 0) failedChecks += 1
  for (const match of sipRisk) {
    issues.push(
      issueForMatch(
        `sip-${match.start}`,
        'high-risk',
        'critical',
        'SIP presented as riskless or like a deposit',
        'A SIP is an investment method, not a fixed deposit or a guarantee against market risk.',
        'Explain that mutual fund investments remain subject to market risks.',
        match,
      ),
    )
  }

  const hasReturnsClaim =
    /\b(?:returns?|CAGR)\b|\b\d+(?:\.\d+)?\s*%/i.test(text)
  if (hasReturnsClaim) {
    const hasPeriod = /\b(?:1|3|5)\s*(?:Y|years?|yrs?)\b/i.test(text)
    totalChecks += 1
    if (!hasPeriod) {
      failedChecks += 1
      issues.push({
        id: 'performance-period',
        category: 'missing-disclaimer',
        severity: 'warning',
        title: 'Performance period not stated',
        detail: 'A return or CAGR claim appears without a clear 1Y, 3Y or 5Y period.',
        recommendation: 'State the applicable period and verify the performance figures before publishing.',
      })
    }

    const hasBenchmark = /\bbenchmark\b/i.test(text)
    totalChecks += 1
    if (!hasBenchmark) {
      failedChecks += 1
      issues.push({
        id: 'performance-benchmark',
        category: 'missing-disclaimer',
        severity: 'warning',
        title: 'Benchmark comparison notice missing',
        detail: 'Performance claims should provide the relevant benchmark comparison context.',
        recommendation: 'Add a clear benchmark comparison notice with the relevant benchmark and period.',
      })
    }
  }

  const hasDisclaimer = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .includes(DISCLAIMER.toLowerCase())
  totalChecks += 1
  if (!hasDisclaimer) {
    failedChecks += 1
    issues.push({
      id: 'standard-disclaimer',
      category: 'missing-disclaimer',
      severity: 'warning',
      title: 'Standard mutual fund disclaimer missing',
      detail: 'The standard market-risk disclaimer was not found in the copy.',
      recommendation: `Include: “${DISCLAIMER}”`,
    })
  }

  const hasArn = /\bARN\s*[-:#]?\s*[A-Z0-9-]{3,}\b/i.test(text)
  totalChecks += 1
  if (!hasArn) {
    failedChecks += 1
    issues.push({
      id: 'arn-disclosure',
      category: 'missing-disclaimer',
      severity: 'warning',
      title: 'ARN disclosure missing',
      detail: 'No ARN identifier (for example, ARN-12345) was detected.',
      recommendation: 'Add your valid AMFI Registration Number (ARN).',
    })
  }

  const hasEuin = /\bEUIN\b/i.test(text)
  totalChecks += 1
  if (!hasEuin) {
    failedChecks += 1
    issues.push({
      id: 'euin-disclosure',
      category: 'missing-disclaimer',
      severity: 'warning',
      title: 'EUIN disclosure missing',
      detail: 'No EUIN disclosure was detected.',
      recommendation: 'Add the applicable EUIN disclosure.',
    })
  }

  const isDistributor = /\bAMFI[-\s]?registered\s+(?:Mutual Fund\s+)?Distributor\b/i.test(text)
  totalChecks += 1
  if (!isDistributor) {
    failedChecks += 1
    issues.push({
      id: 'distributor-status',
      category: 'missing-disclaimer',
      severity: 'warning',
      title: 'Distributor status not clearly stated',
      detail: 'The copy does not clearly identify the person or firm as an AMFI-registered Mutual Fund Distributor.',
      recommendation: 'State that you are an AMFI-registered Mutual Fund Distributor.',
    })
  }

  const hasRiaDistinction =
    /\b(?:do not|not)\s+(?:provide|providing|an?)\b.{0,60}\b(?:SEBI[-\s]?registered\s+)?(?:investment\s+)?advis(?:ory|er|er)\b/i.test(
      text,
    ) ||
    /\bnot\s+(?:a\s+)?SEBI[-\s]?registered\s+(?:investment\s+)?advis(?:er|ory)\b/i.test(
      text,
    )
  totalChecks += 1
  if (!hasRiaDistinction) {
    failedChecks += 1
    issues.push({
      id: 'ria-distinction',
      category: 'missing-disclaimer',
      severity: 'warning',
      title: 'Distributor and advisory roles not distinguished',
      detail: 'The copy does not clarify that distribution is not SEBI-registered fee-only investment advisory.',
      recommendation: 'Clarify your distributor capacity and that you do not provide SEBI-registered Investment Advisory (RIA) services.',
    })
  }

  totalChecks += 1
  if (issues.length === 0) {
    issues.push({
      id: 'clear-copy',
      category: 'best-practice',
      severity: 'info',
      title: 'No rule-based red flags detected',
      detail: 'The copy passed the checks available in this local rule set.',
      recommendation: 'Review the complete communication and applicable scheme documents before publishing.',
    })
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        issues.reduce((deduction, issue) => {
          if (issue.severity === 'critical') return deduction + 22
          if (issue.severity === 'warning') return deduction + 8
          return deduction
        }, 0),
    ),
  )

  const enrichedIssues = issues.map((issue) =>
    issue.id === 'clear-copy'
      ? {
          ...issue,
          detail: `${totalChecks - failedChecks} of ${totalChecks} applicable checks passed. This automated check is not a legal review or approval.`,
        }
      : issue,
  )

  return {
    score,
    issues: enrichedIssues,
    passedChecks: totalChecks - failedChecks,
    totalChecks,
    compliantRewrite: buildRewrite(text, enrichedIssues),
  }
}
