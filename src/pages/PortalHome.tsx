import { ArrowRight, ArrowUpRight, FileDiff, ShieldCheck } from 'lucide-react'
import { SbisifSuiteLayout } from '../components/layout/SbisifSuiteLayout'
import './PortalHome.css'

const applications = [
  {
    name: 'Compliance Guard',
    description: 'Review financial advertising and investor communications before publication.',
    detail: 'On-device first-pass checks for campaign copy, PDFs, images, and video.',
    href: '/compliance-guard/',
    icon: ShieldCheck,
    status: 'Available',
  },
  {
    name: 'Document Reconciler',
    description: 'Compare complete lead documents against amendment notices and updates.',
    detail: 'Private, browser-based reconciliation with reviewed changes and export.',
    href: '/document-reconciler/',
    icon: FileDiff,
    status: 'Available',
  },
]

const plannedApplications = ['Factsheet Validator', 'Distributor Portal']

export function PortalHome() {
  return (
    <SbisifSuiteLayout activeApp="all-apps">
      <div className="portal-home">
        <section className="portal-hero">
          <p className="portal-eyebrow">SBISIF DIGITAL WORKSPACE</p>
          <h1>One suite for <span>smarter fund operations.</span></h1>
          <p>
            Purpose-built tools for compliant, efficient investor communication
            across the mutual fund ecosystem.
          </p>
        </section>

        <section className="portal-applications" aria-labelledby="portal-applications-heading">
          <div className="portal-section-heading">
            <div>
              <p className="portal-eyebrow">YOUR WORKSPACE</p>
              <h2 id="portal-applications-heading">Applications</h2>
            </div>
            <span>2 available · {plannedApplications.length} planned</span>
          </div>
          <div className="portal-app-grid">
            {applications.map(({ name, description, detail, href, icon: Icon, status }) => (
              <article className="portal-app-card" key={name}>
                <div className="portal-app-card-top">
                  <span className="portal-app-icon"><Icon size={22} /></span>
                  <span className="portal-app-status"><i />{status}</span>
                </div>
                <h3>{name}</h3>
                <p>{description}</p>
                <small>{detail}</small>
                <a className="portal-app-action" href={href}>
                  Open application <ArrowUpRight size={15} />
                </a>
              </article>
            ))}
            {plannedApplications.map((name) => (
              <article className="portal-app-card portal-app-card-planned" aria-disabled="true" key={name}>
                <div className="portal-app-card-top">
                  <span className="portal-app-icon"><FileDiff size={22} /></span>
                  <span className="portal-app-status planned"><i />Coming soon</span>
                </div>
                <h3>{name}</h3>
                <p>Planned tools for fund operations and distributor workflows.</p>
                <small>Availability will be announced when the workspace is ready.</small>
                <span className="portal-app-action planned-action">Coming soon <ArrowRight size={15} /></span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </SbisifSuiteLayout>
  )
}
