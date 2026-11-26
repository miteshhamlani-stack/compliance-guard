import './PortalHome.css'

const tools = [
  {
    name: 'Compliance Guard',
    description: 'SEBI & AMFI advertisement compliance auditing platform for MFDs and AMCs.',
    expanded: 'Automated pre-release audit for creatives, PDFs, and video reels. Verifies mandatory disclaimers, fonts, performance disclosures, and generates audit certificates.',
    href: '/compliance-guard/',
    live: true,
  },
  {
    name: 'Factsheet Validator',
    description: 'Review scheme factsheets and disclosures with confidence.',
    expanded: 'Planned workspace for validating factsheet data, disclosures, and presentation against current fund-house standards.',
    href: '#',
    live: false,
  },
  {
    name: 'Distributor Portal',
    description: 'A central workspace for distributor communications and approvals.',
    expanded: 'Planned tools for campaign collaboration, review workflows, and compliance-ready publishing.',
    href: '#',
    live: false,
  },
]

export function PortalHome() {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <a className="portal-brand" href="/" aria-label="SBISIF Apps Portal home">
          <span className="portal-brand-mark">S</span>
          <span>SBISIF Apps Portal</span>
        </a>
        <span className="portal-header-label">Financial technology suite</span>
      </header>

      <main className="portal-main">
        <section className="portal-hero">
          <p className="portal-eyebrow">SBISIF DIGITAL WORKSPACE</p>
          <h1>One secure home for<br /><span>smarter fund operations.</span></h1>
          <p className="portal-intro">Purpose-built applications for compliant, efficient investor communication across the mutual fund ecosystem.</p>
        </section>

        <section className="portal-tools" aria-labelledby="portal-tools-heading">
          <div className="portal-section-heading">
            <div>
              <p className="portal-eyebrow">YOUR WORKSPACE</p>
              <h2 id="portal-tools-heading">Applications</h2>
            </div>
            <span className="portal-count">01 live · 02 planned</span>
          </div>
          <div className="portal-grid">
            {tools.map((tool) => (
              <a
                className={`portal-tool-card${tool.live ? ' is-live' : ' is-planned'}`}
                href={tool.live ? tool.href : undefined}
                aria-disabled={!tool.live}
                key={tool.name}
              >
                <div className="portal-card-topline">
                  <span className={`portal-status${tool.live ? ' live' : ''}`}>
                    <span className="portal-status-dot" />
                    {tool.live ? 'Live' : 'Coming soon'}
                  </span>
                  {tool.live && <span className="portal-arrow" aria-hidden="true">↗</span>}
                </div>
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
                <div className="portal-card-detail">{tool.expanded}</div>
                {tool.live && <span className="portal-open-link">Open application <span>→</span></span>}
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="portal-footer">
        <span>© {new Date().getFullYear()} SBISIF Apps</span>
        <span>Internal enterprise workspace · Access subject to applicable permissions and policies.</span>
      </footer>
    </div>
  )
}
