import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Ban,
  Calendar,
  Check,
  CircleAlert,
  Clipboard,
  ClipboardCheck,
  ExternalLink,
  FileCheck,
  FileCheck2,
  Info,
  Printer,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import {
  loadRules,
  REGULATORY_RULESET,
  scanCompliance,
  type ComplianceIssue,
  type IssueCategory,
  type RegulatoryRuleset,
} from './utils/complianceEngine'
import { MediaScanner, type ScanMetadata } from './components/MediaScanner'
import { generateComplianceCertificate } from './utils/pdfReportGenerator'
import { useAuth } from './context/AuthContext'
import { NavbarUser } from './components/NavbarUser'
import { OnboardingModal } from './components/OnboardingModal'
import { AuthModal } from './components/AuthModal'
import './App.css'

type ScanMode = 'text' | 'document' | 'video'

const samples = {
  risky: `WhatsApp exclusive! Get guaranteed returns with our SIP and beat FD rates. This is risk-free and doubles your money. Invest today!`,
  performance: `Our strategy delivered 28% CAGR over 3Y. Invest now to benefit from these impressive returns.`,
  title: `Your independent wealth advisor is here. Our investment consultant will create a portfolio plan just for you.`,
  compliant: `Explore a disciplined approach to mutual fund investing. Over the 3Y period ending 30 September 2026, the scheme returned 18% versus 12% for the NIFTY 50 benchmark.\n\nMutual Fund investments are subject to market risks, read all scheme related documents carefully.\n\nAMFI-registered Mutual Fund Distributor | ARN: ARN-12345 | EUIN: E123456.`,
}

const sampleButtons: { label: string; key: keyof typeof samples }[] = [
  { label: 'High-Risk WhatsApp Pitch', key: 'risky' },
  { label: 'Performance Ad without Benchmark', key: 'performance' },
  { label: 'Improper Title / Finfluencer Copy', key: 'title' },
  { label: 'Fully Compliant AMFI Campaign', key: 'compliant' },
]

const categoryDetails: {
  id: IssueCategory
  title: string
  description: string
}[] = [
  {
    id: 'high-risk',
    title: 'High risk',
    description: 'Potential SEBI Sixth Schedule / AMFI concerns',
  },
  {
    id: 'missing-disclaimer',
    title: 'Missing disclosures',
    description: 'Required information to review or add',
  },
  {
    id: 'best-practice',
    title: 'Best practice',
    description: 'Additional checks before publishing',
  },
]

function HighlightedCopy({
  text,
  issues,
}: {
  text: string
  issues: ComplianceIssue[]
}) {
  const ranges = issues
    .filter((issue) => issue.start !== undefined && issue.end !== undefined)
    .map((issue) => ({ start: issue.start!, end: issue.end! }))
    .sort((first, second) => first.start - second.start)

  const pieces: React.ReactNode[] = []
  let cursor = 0

  for (const [index, range] of ranges.entries()) {
    if (range.start < cursor) continue
    if (cursor < range.start) {
      pieces.push(
        <span key={`text-${index}`}>{text.slice(cursor, range.start)}</span>,
      )
    }
    pieces.push(
      <mark key={`mark-${index}`}>{text.slice(range.start, range.end)}</mark>,
    )
    cursor = range.end
  }

  if (cursor < text.length) pieces.push(<span key="text-end">{text.slice(cursor)}</span>)

  return <div className="highlighted-copy">{pieces}</div>
}

function App() {
  const {
    incrementScanCount,
    activeEntityType,
    user,
  } = useAuth()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const entityType = activeEntityType
  const [scanMode, setScanMode] = useState<ScanMode>('text')
  const [copy, setCopy] = useState('')
  const [ruleset, setRuleset] = useState(REGULATORY_RULESET)
  const [result, setResult] = useState<ReturnType<typeof scanCompliance> | null>(
    null,
  )
  const [auditedRuleset, setAuditedRuleset] = useState<RegulatoryRuleset | null>(
    null,
  )
  const [auditedAt, setAuditedAt] = useState<Date | null>(null)
  const [scanMetadata, setScanMetadata] = useState<ScanMetadata>({
    documentName: 'Pasted ad copy',
    mediaType: 'Text',
    detectedLanguages: 'User-provided text',
  })
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const wordCount = useMemo(
    () => copy.trim().split(/\s+/).filter(Boolean).length,
    [copy],
  )
  const criticalCount =
    result?.issues.filter((issue) => issue.severity === 'critical').length ?? 0
  const warningCount =
    result?.issues.filter((issue) => issue.severity === 'warning').length ?? 0
  const scoreTone =
    result === null
      ? 'green'
      : result.score >= 85
        ? 'green'
        : result.score >= 50
          ? 'amber'
          : 'red'

  useEffect(() => {
    let active = true
    void loadRules().then((loadedRules) => {
      if (active) setRuleset(loadedRules)
    })
    return () => {
      active = false
    }
  }, [])

  function runCheck() {
    if (!user) {
      setIsAuthOpen(true)
      return
    }
    if (!copy.trim()) return
    setResult(scanCompliance(copy, ruleset, entityType))
    void incrementScanCount()
    setScanMetadata({
      documentName: 'Pasted ad copy',
      mediaType: 'Text',
      detectedLanguages: 'User-provided text',
    })
    setAuditedRuleset(ruleset)
    setAuditedAt(new Date())
    setCopied(false)
    setCopyError('')
  }

  function handleScannedText(text: string, metadata: ScanMetadata) {
    setCopy(text)
    void incrementScanCount()
    setScanMetadata(metadata)
    setResult(scanCompliance(text, ruleset, entityType))
    setAuditedRuleset(ruleset)
    setAuditedAt(new Date())
    setCopied(false)
    setCopyError('')
  }

  function handleVideoScan(
    text: string,
    detectedIssues: ComplianceIssue[],
    metadata: ScanMetadata,
  ) {
    const scanned = scanCompliance(text, ruleset, entityType)
    setCopy(text)
    void incrementScanCount()
    setScanMetadata(metadata)
    setResult({
      ...scanned,
      issues: [...scanned.issues, ...detectedIssues],
    })
    setAuditedRuleset(ruleset)
    setAuditedAt(new Date())
    setCopied(false)
    setCopyError('')
  }

  function selectSample(key: keyof typeof samples) {
    setCopy(samples[key])
    setResult(null)
    setAuditedRuleset(null)
    setAuditedAt(null)
    setCopied(false)
    setCopyError('')
  }

  async function copyRewrite() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.compliantRewrite)
      setCopied(true)
      setCopyError('')
    } catch (error) {
      setCopied(false)
      setCopyError(
        error instanceof Error
          ? `Could not access the clipboard: ${error.message}`
          : 'Could not access the clipboard. Check your browser permissions.',
      )
    }

  }

  function printAudit() {
    if (!result || !auditedAt) return
    const status = result.score >= 85
      ? 'COMPLIANT'
      : result.score >= 50
        ? 'CONDITIONAL_PASS'
        : 'NON_COMPLIANT'
    generateComplianceCertificate({
      ...scanMetadata,
      score: result.score,
      status,
      auditedAt,
      textExcerpt: copy,
      findings: result.issues,
      passedChecks: result.passedChecks,
      totalChecks: result.totalChecks,
      rulesetVersion: (auditedRuleset ?? ruleset).version,
      entityType,
    })
  }

  function statusLabel(score: number): string {
    if (score >= 85) return 'Compliant'
    if (score >= 50) return 'Conditional approval'
    return 'Regulatory breach'
  }

  function classificationLabel(issue: ComplianceIssue): string {
    switch (issue.regulatoryClass) {
      case 'sebi-violation':
        return 'SEBI Violation (High Fine/Suspension Risk)'
      case 'amfi-advisory':
        return 'AMFI Advisory Breach'
      case 'disclosure-best-practice':
        return 'Disclosure Best Practice'
    }
  }

  function quickStatus(
    kind: 'warning' | 'mfd' | 'prohibited' | 'duration',
  ): 'passed' | 'warning' | 'failed' {
    if (!result) return 'passed'
    const titles: Record<Exclude<typeof kind, 'prohibited'>, string[]> = {
      warning: ['standard-disclaimer', 'video-disclaimer-duration', 'audio-disclaimer-missing'],
      mfd: ['entity-disclosure', 'video-mfd-tagline'],
      duration: ['video-disclaimer-duration'],
    }
    if (kind === 'prohibited') {
      return criticalCount > 0 ? 'failed' : warningCount > 0 ? 'warning' : 'passed'
    }
    const matching = result.issues.filter((issue) => titles[kind].includes(issue.id))
    return matching.some((issue) => issue.severity === 'critical')
      ? 'failed'
      : matching.length > 0
        ? 'warning'
        : 'passed'
  }

  return (
    <div className="app-shell">
      <OnboardingModal />
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        message="Sign in or create a free 30-day trial account to audit advertisements."
      />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Compliance Guard home">
          <span className="brand-mark">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </span>
          <span className="brand-name">Compliance Guard</span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#checker">
            Ad checker
          </a>
          <a className="nav-link" href="#how-it-works">
            How it works
          </a>
        </nav>
        <div className="header-ruleset">
          <details className="ruleset-details">
            <summary
              className="alignment-badge ruleset-badge"
              aria-label={`Ruleset ${ruleset.version}. Updated ${ruleset.lastUpdated}. Show active regulatory references`}
            >
              <span className="alignment-dot live-dot" />
              Ruleset: {ruleset.version}
              <Info size={13} />
            </summary>
            <section className="ruleset-popover" aria-label="Regulatory ruleset details">
              <div className="popover-heading">
                <span className="popover-icon"><FileCheck size={16} /></span>
                <div>
                  <strong>Active regulatory ruleset</strong>
                  <span>{ruleset.version} · Updated {ruleset.lastUpdated}</span>
                </div>
              </div>
              <div className="popover-circulars">
                {ruleset.circulars.map((circular) => (
                  <div className="popover-circular" key={circular}>
                    <Check size={13} />
                    <span>{circular}</span>
                  </div>
                ))}
              </div>
              <div className="popover-citations">
                <strong>Configured citations</strong>
                {ruleset.citations.map((citation) => (
                  <p key={`${citation.authority}-${citation.reference}`}>
                    <b>{citation.authority}</b> · {citation.reference}
                    <span>{citation.description}</span>
                  </p>
                ))}
              </div>
              <div className="popover-links">
                {ruleset.metadataSources.map((source) => (
                  <a
                    key={`${source.authority}-${source.url}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.authority} references <ExternalLink size={12} />
                  </a>
                ))}
              </div>
              <p className="popover-note">
                Ruleset references are configured for {ruleset.lastUpdated}. Independently
                verify active Gazette notifications and circular applicability
                before relying on an audit.
              </p>
            </section>
          </details>
          <span className="ruleset-updated">
            <Calendar size={12} />
            Updated: {ruleset.lastUpdated}
          </span>
          <NavbarUser />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow">
            <span className="eyebrow-icon"><Shield size={14} /></span>
            MUTUAL FUND MARKETING &amp; COMPLIANCE
          </div>
          <h1>
            Compliance Guard
            <br />
            <span>market-ready audits.</span>
          </h1>
          <p>
            Automated Multilingual Compliance Audit for Financial Creatives &amp;
            Video Reels.
          </p>
          <div className="hero-note">
            <span className="privacy-dot" />
            Private by design <span className="note-divider">·</span> An instant,
            on-device first-pass check
          </div>
        </section>

        <section className="workspace" id="checker">
          <div className="section-heading">
            <div className="section-icon"><FileCheck2 size={18} /></div>
            <div>
              <h2>Review your ad-copy</h2>
              <p>Audit financial creatives, campaign copy, PDFs, images, and video reels.</p>
            </div>
            {!user && (
              <button type="button" className="guest-scan-lock" onClick={() => setIsAuthOpen(true)}>
                🔒 Sign in or register to scan creatives against SEBI &amp; AMFI compliance standards.
              </button>
            )}
            {copy && (
              <button
                type="button"
                className="clear-button"
                onClick={() => {
                  setCopy('')
                  setResult(null)
                  setAuditedRuleset(null)
                  setAuditedAt(null)
                  setScanMetadata({
                    documentName: 'Pasted ad copy',
                    mediaType: 'Text',
                    detectedLanguages: 'User-provided text',
                  })
                  setCopied(false)
                  setCopyError('')
                }}
              >
                <RotateCcw size={14} />
                Clear
              </button>
            )}
          </div>

          <fieldset className="scan-mode-selector">
            <legend>SCAN METHOD</legend>
            <label className={`scan-mode-option${scanMode === 'text' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="scan-mode"
                value="text"
                checked={scanMode === 'text'}
                onChange={() => setScanMode('text')}
              />
              <span>
                <strong>Text scan</strong>
                <small>Paste ad copy directly</small>
              </span>
            </label>
            <label className={`scan-mode-option${scanMode === 'document' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="scan-mode"
                value="document"
                checked={scanMode === 'document'}
                onChange={() => setScanMode('document')}
              />
              <span>
                <strong>PDF / image scan</strong>
                <small>Extract text locally with OCR</small>
              </span>
            </label>
            <label className={`scan-mode-option${scanMode === 'video' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="scan-mode"
                value="video"
                checked={scanMode === 'video'}
                onChange={() => setScanMode('video')}
              />
              <span>
                <strong>Video scan</strong>
                <small>Scan frames and end-slate disclaimers</small>
              </span>
            </label>
          </fieldset>

          {scanMode === 'text' && (
            <div className="sample-row" aria-label="Enterprise test presets">
              <span className="sample-label">ENTERPRISE PRESETS</span>
              {sampleButtons.map((sample) => (
                <button
                  key={sample.key}
                  type="button"
                  className="sample-button"
                  onClick={() => selectSample(sample.key)}
                >
                  {sample.label}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
          )}

          {(scanMode === 'document' || scanMode === 'video') && (
            <MediaScanner
              key={scanMode}
              mode={scanMode}
              issues={result?.issues ?? []}
              onTextExtracted={handleScannedText}
              onVideoScanComplete={handleVideoScan}
              entityType={entityType}
              isAuthenticated={Boolean(user)}
              onAuthRequired={() => setIsAuthOpen(true)}
            />
          )}

          <label className="sr-only" htmlFor="ad-copy">
            {scanMode !== 'text' ? 'Extracted scan text' : 'Ad-copy to check'}
          </label>
          <textarea
            id="ad-copy"
            className={`copy-input${scanMode !== 'text' ? ' extracted-copy' : ''}`}
            value={copy}
            onChange={(event) => {
              setCopy(event.target.value)
              setResult(null)
              setAuditedRuleset(null)
              setAuditedAt(null)
              setScanMetadata({
                documentName: 'Pasted ad copy',
                mediaType: 'Text',
                detectedLanguages: 'User-provided text',
              })
              setCopied(false)
              setCopyError('')
            }}
            placeholder={scanMode !== 'text'
              ? 'Extracted text will appear here after scanning...'
              : `Paste your ad-copy here...\n\nExample: “Start your investment journey with a disciplined approach. Explore mutual fund options that may suit your goals.”`}
            maxLength={10000}
            readOnly={scanMode !== 'text'}
          />
          <div className="input-footer">
            <span>{wordCount} words <span className="count-divider">·</span> {copy.length} / 10,000 characters</span>
            <span className="local-note"><ShieldCheck size={13} /> Your copy stays in this browser</span>
          </div>
          {scanMode === 'text' && (
            <button
              type="button"
              className="check-button"
              onClick={runCheck}
              disabled={!copy.trim()}
            >
              <Sparkles size={17} />
              Check compliance
              <ArrowRight size={16} />
            </button>
          )}
        </section>

        {result && (
          <section className="results" aria-live="polite">
            <div className="print-report-heading">
              <span>COMPLIANCE GUARD · MUTUAL FUND MARKETING &amp; COMPLIANCE</span>
              <span>Automated first-pass audit · {auditedAt?.toLocaleString()}</span>
            </div>
            <div className="results-heading">
              <div>
                <div className="eyebrow result-eyebrow">
                  <span className="result-pulse" />
                  EXECUTIVE SUMMARY
                </div>
                <h2>Regulatory audit summary</h2>
                <p>First-pass rule scan · {result.passedChecks} of {result.totalChecks} configured checks passed</p>
              </div>
              <div className="audit-actions">
                <div className={`executive-status status-${scoreTone}`}>
                  <span className="status-dot" />
                  {statusLabel(result.score)}
                  <strong>{result.score}/100</strong>
                </div>
                <button className="scan-again screen-only" type="button" onClick={runCheck}>
                  <RotateCcw size={14} />
                  Scan again
                </button>
                <button className="scan-again print-button screen-only" type="button" onClick={printAudit}>
                  <Printer size={14} />
                  Export Audit Certificate (PDF)
                </button>
              </div>
            </div>

            <section className="executive-scorecard" aria-label="Executive compliance scorecard">
              <div className={`score-badge score-badge-${scoreTone}`}>
                <span>COMPLIANCE SCORE</span>
                <strong>{result.score}<small>/100</small></strong>
                <b>{statusLabel(result.score)}</b>
              </div>
              <div className="quick-status-grid">
                {[
                  { key: 'warning' as const, label: 'Mandatory risk warning', icon: ShieldCheck },
                  { key: 'mfd' as const, label: entityType === 'mfd' ? 'MFD identification' : 'AMC identification', icon: UserRound },
                  { key: 'prohibited' as const, label: 'Prohibited terms', icon: Ban },
                  { key: 'duration' as const, label: 'Font / duration compliance', icon: Timer },
                ].map(({ key, label, icon: Icon }) => {
                  const state = quickStatus(key)
                  return (
                    <div className={`quick-status quick-status-${state}`} key={key}>
                      <Icon size={15} />
                      <span>{label}</span>
                      <strong>{state === 'passed' ? 'Passed' : state === 'warning' ? 'Review' : 'Failed'}</strong>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="summary-grid">
              <div className={`score-card tone-${scoreTone}`}>
                <div className="score-topline">
                  <span>EXECUTIVE STATUS</span>
                  <Info size={15} aria-label="Indicative score only" />
                </div>
                <div className="score-row">
                  <strong>{result.score}</strong>
                  <span className="score-out-of">/ 100</span>
                </div>
                <div
                  className="score-track"
                  role="meter"
                  aria-label="Compliance score"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={result.score}
                >
                  <span style={{ width: `${result.score}%` }} />
                </div>
                <span className="score-caption">
                  {statusLabel(result.score)}
                </span>
              </div>
              <div className="status-card">
                <span className="status-label">CHECK SUMMARY</span>
                <div className="status-list">
                  <div className="status-item">
                    <span className="status-icon passed"><Check size={14} /></span>
                    <span>Checks passed</span>
                    <strong>{result.passedChecks}</strong>
                  </div>
                  <div className="status-item">
                    <span className="status-icon warning"><TriangleAlert size={14} /></span>
                    <span>Warnings</span>
                    <strong>{warningCount}</strong>
                  </div>
                  <div className="status-item">
                    <span className="status-icon critical"><CircleAlert size={14} /></span>
                    <span>Critical violations</span>
                    <strong>{criticalCount}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="analysis-grid">
              <section className="panel issues-panel">
                <div className="panel-heading">
                  <div>
                    <h3>What we found</h3>
                    <p>{result.issues.length} item{result.issues.length === 1 ? '' : 's'} to review</p>
                  </div>
                  <span className="findings-count">{result.issues.length}</span>
                </div>
                <div className="issue-groups">
                  {categoryDetails.map((category) => {
                    const categoryIssues = result.issues.filter(
                      (issue) => issue.category === category.id,
                    )
                    if (categoryIssues.length === 0) return null

                    return (
                      <div className="issue-group" key={category.id}>
                        <div className={`group-title group-${category.id}`}>
                          <span className="group-indicator" />
                          <span>{category.title}</span>
                          <span className="group-count">{categoryIssues.length}</span>
                        </div>
                        <p className="group-description">{category.description}</p>
                        <div className="issue-list">
                          {categoryIssues.map((issue) => (
                            <article className="issue-item" key={issue.id}>
                              <div className={`issue-symbol severity-${issue.severity}`}>
                                {issue.severity === 'critical' ? (
                                  <CircleAlert size={16} />
                                ) : issue.severity === 'warning' ? (
                                  <TriangleAlert size={16} />
                                ) : (
                                  <BadgeCheck size={16} />
                                )}
                              </div>
                              <div className="issue-content">
                                <span className={`classification-badge class-${issue.regulatoryClass}`}>
                                  {classificationLabel(issue)}
                                </span>
                                <h4>{issue.title}</h4>
                                <p>{issue.detail}</p>
                                <div className="issue-recommendation">
                                  <ArrowRight size={13} />
                                  {issue.recommendation}
                                </div>
                                <div className="regulatory-citation">
                                  <strong>Regulatory citation</strong>
                                  <span>{issue.citation}</span>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="right-column">
                <section className="panel highlighted-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Copy highlights</h3>
                      <p>Flagged phrases are marked below</p>
                    </div>
                    <span className="legend"><i /> Flagged</span>
                  </div>
                  <HighlightedCopy text={copy} issues={result.issues} />
                </section>

                <section className="rewrite-card">
                  <div className="rewrite-topline">
                    <span className="rewrite-icon"><Sparkles size={16} /></span>
                    <span>COMPLIANT REWRITE DRAFT</span>
                    <span className="draft-badge">LOCAL DRAFT</span>
                  </div>
                  <h3>A clearer way to say it.</h3>
                  <p className="rewrite-description">
                    A rule-based draft that removes flagged wording and adds
                    disclosure placeholders. Verify all numbers and references
                    before use.
                  </p>
                  <div className="rewrite-text">{result.compliantRewrite}</div>
                  <button
                    type="button"
                    className={`copy-button${copied ? ' copied' : ''}`}
                    onClick={copyRewrite}
                  >
                    {copied ? <ClipboardCheck size={15} /> : <Clipboard size={15} />}
                    {copied ? 'Copied to clipboard' : 'Copy Compliant Draft'}
                  </button>
                  {copyError && <p className="copy-error" role="alert">{copyError}</p>}
                  <p className="citation-caveat">
                        References are rule-mapping aids, not legal advice. Confirm
                        clause numbering and applicability against current
                        SEBI/AMFI circulars and ASCI guidance; the ASCI Code is a
                        voluntary self-regulatory code. Review the final campaign
                        format before publication.
                      </p>
                      <div className="audit-stamp">
                        <FileCheck size={13} />
                        <span>
                          Audited under SEBI/AMFI Ruleset {(auditedRuleset ?? ruleset).version}
                          {' • '}Stamped on: {auditedAt?.toLocaleString()}
                        </span>
                      </div>
                </section>
              </div>
            </div>
          </section>
        )}

        <section className="trust-note" id="how-it-works">
          <div className="trust-icon"><Info size={17} /></div>
          <div>
            <strong>A helpful first pass, not a compliance certificate.</strong>
            <p>
              This universal checker uses local rules to flag common wording and
              disclosure gaps for fund houses and distributors. It does not
              interpret every SEBI / AMFI requirement or replace review by your
              compliance officer or legal adviser. Always verify current rules
              and scheme documents before publishing.
            </p>
          </div>
          <a href="#checker" aria-label="Back to checker"><ArrowDown size={16} /></a>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span className="brand-name">Compliance Guard</span>
        </a>
        <span>Built for thoughtful investor communication.</span>
        <span className="footer-privacy"><span className="privacy-dot" /> Nothing uploaded</span>
      </footer>
    </div>
  )
}

export default App
