import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Clipboard,
  ClipboardCheck,
  FileCheck2,
  Info,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import {
  scanCompliance,
  type ComplianceIssue,
  type IssueCategory,
} from './utils/complianceEngine'
import './App.css'

const samples = {
  risky: `Get guaranteed returns with our SIP plan! This is better than a fixed deposit and completely risk-free. Invest today for assured returns. Don't miss out!`,
  compliant: `Start your investment journey with a disciplined approach. Explore mutual fund options that may suit your goals and risk profile.\n\nMutual Fund investments are subject to market risks, read all scheme related documents carefully.\n\nAMFI-registered Mutual Fund Distributor | ARN: ARN-12345 | EUIN: E123456.\nWe do not provide SEBI-registered Investment Advisory (RIA) services.`,
  performance: `Our recommended fund delivered 18% CAGR and is a top performer. Invest now to benefit from its returns.`,
}

const sampleButtons: { label: string; key: keyof typeof samples }[] = [
  { label: 'Test risky ad-copy', key: 'risky' },
  { label: 'Test fully compliant post', key: 'compliant' },
  { label: 'Test performance claim', key: 'performance' },
]

const categoryDetails: {
  id: IssueCategory
  title: string
  description: string
}[] = [
  {
    id: 'high-risk',
    title: 'High risk',
    description: 'Potential SEBI / AMFI code concerns',
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
  const [copy, setCopy] = useState('')
  const [result, setResult] = useState<ReturnType<typeof scanCompliance> | null>(
    null,
  )
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
      : result.score >= 80
        ? 'green'
        : result.score >= 50
          ? 'amber'
          : 'red'

  function runCheck() {
    if (!copy.trim()) return
    setResult(scanCompliance(copy))
    setCopied(false)
    setCopyError('')
  }

  function selectSample(key: keyof typeof samples) {
    setCopy(samples[key])
    setResult(null)
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Clearvest home">
          <span className="brand-mark">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </span>
          <span className="brand-name">clearvest</span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#checker">
            Ad checker
          </a>
          <a className="nav-link" href="#how-it-works">
            How it works
          </a>
        </nav>
        <div className="alignment-badge">
          <span className="alignment-dot" />
          AMFI &amp; SEBI code alignment
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow">
            <span className="eyebrow-icon"><Shield size={14} /></span>
            SEBI AD-COPY &amp; COMPLIANCE CHECKER FOR MFDs
          </div>
          <h1>
            Make every message
            <br />
            <span>market-ready.</span>
          </h1>
          <p>
            Review your mutual fund ad-copy for common regulatory red flags
            before it reaches your investors.
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
              <p>Paste a WhatsApp broadcast, social post or email newsletter.</p>
            </div>
            {copy && (
              <button
                type="button"
                className="clear-button"
                onClick={() => {
                  setCopy('')
                  setResult(null)
                  setCopied(false)
                  setCopyError('')
                }}
              >
                <RotateCcw size={14} />
                Clear
              </button>
            )}
          </div>

          <div className="sample-row" aria-label="Sample copy">
            <span className="sample-label">TRY A SAMPLE</span>
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

          <label className="sr-only" htmlFor="ad-copy">
            Ad-copy to check
          </label>
          <textarea
            id="ad-copy"
            className="copy-input"
            value={copy}
            onChange={(event) => {
              setCopy(event.target.value)
              setResult(null)
              setCopied(false)
              setCopyError('')
            }}
            placeholder={`Paste your ad-copy here...\n\nExample: “Start your investment journey with a disciplined approach. Explore mutual fund options that may suit your goals.”`}
            maxLength={10000}
          />
          <div className="input-footer">
            <span>{wordCount} words <span className="count-divider">·</span> {copy.length} / 10,000 characters</span>
            <span className="local-note"><ShieldCheck size={13} /> Your copy stays in this browser</span>
          </div>
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
        </section>

        {result && (
          <section className="results" aria-live="polite">
            <div className="results-heading">
              <div>
                <div className="eyebrow result-eyebrow">
                  <span className="result-pulse" />
                  REVIEW COMPLETE
                </div>
                <h2>Compliance snapshot</h2>
                <p>A first-pass rules check of your submitted copy.</p>
              </div>
              <button
                className="scan-again"
                type="button"
                onClick={runCheck}
              >
                <RotateCcw size={14} />
                Scan again
              </button>
            </div>

            <div className="summary-grid">
              <div className={`score-card tone-${scoreTone}`}>
                <div className="score-topline">
                  <span>COMPLIANCE SCORE</span>
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
                  {result.score >= 80
                    ? 'Looking good'
                    : result.score >= 50
                      ? 'Needs attention'
                      : 'Significant issues found'}
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
                                <h4>{issue.title}</h4>
                                <p>{issue.detail}</p>
                                <div className="issue-recommendation">
                                  <ArrowRight size={13} />
                                  {issue.recommendation}
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
                    <span>AI COMPLIANT REWRITE</span>
                    <span className="draft-badge">LOCAL DRAFT</span>
                  </div>
                  <h3>A clearer way to say it.</h3>
                  <p className="rewrite-description">
                    A rule-based starting point with standard disclosures added.
                    Review placeholders and claims before sharing.
                  </p>
                  <div className="rewrite-text">{result.compliantRewrite}</div>
                  <button
                    type="button"
                    className={`copy-button${copied ? ' copied' : ''}`}
                    onClick={copyRewrite}
                  >
                    {copied ? <ClipboardCheck size={15} /> : <Clipboard size={15} />}
                    {copied ? 'Copied to clipboard' : 'Copy rewrite'}
                  </button>
                  {copyError && <p className="copy-error" role="alert">{copyError}</p>}
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
              This tool uses local rules to flag common wording and disclosure
              gaps. It does not interpret every SEBI / AMFI requirement or replace
              review by your compliance officer or legal adviser. Always verify
              current rules and scheme documents before publishing.
            </p>
          </div>
          <a href="#checker" aria-label="Back to checker"><ArrowDown size={16} /></a>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark"><ShieldCheck size={16} /></span>
          <span className="brand-name">clearvest</span>
        </a>
        <span>Built for thoughtful investor communication.</span>
        <span className="footer-privacy"><span className="privacy-dot" /> Nothing uploaded</span>
      </footer>
    </div>
  )
}

export default App
