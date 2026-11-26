import type { ReactNode } from 'react'
import logoSrc from '../../assets/sbisif-logo.png'
import './SbisifSuiteLayout.css'

export type SbisifSuiteApp = 'all-apps' | 'compliance-guard' | 'document-reconciler'

interface SbisifSuiteLayoutProps {
  activeApp: SbisifSuiteApp
  children: ReactNode
  headerActions?: ReactNode
}

const navigation: { id: SbisifSuiteApp; label: string; href: string }[] = [
  { id: 'all-apps', label: 'All Apps', href: '/' },
  { id: 'compliance-guard', label: 'Compliance Guard', href: '/compliance-guard/' },
  { id: 'document-reconciler', label: 'Document Reconciler', href: '/document-reconciler/' },
]

export function SbisifSuiteLayout({
  activeApp,
  children,
  headerActions,
}: SbisifSuiteLayoutProps) {
  return (
    <div className="sbisif-suite">
      <header className="sbisif-suite-header">
        <div className="sbisif-suite-container sbisif-suite-header-inner">
          <a className="sbisif-suite-brand" href="/" aria-label="SBISIF Apps home">
            <img src={logoSrc} alt="" width="40" height="40" />
            <span>SBISIF Apps</span>
          </a>
          <nav className="sbisif-suite-nav" aria-label="SBISIF Apps">
            {navigation.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={`sbisif-suite-nav-link${activeApp === item.id ? ' active' : ''}`}
                aria-current={activeApp === item.id ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {headerActions && <div className="sbisif-suite-actions">{headerActions}</div>}
          <span
            className="sbisif-suite-privacy"
            title="Document processing is client-side; account features may use secure services."
          >
            <span aria-hidden="true" />
            Zero-Server · 100% Browser Private
          </span>
        </div>
      </header>
      <main className="sbisif-suite-main">
        <div className="sbisif-suite-container">{children}</div>
      </main>
      <footer className="sbisif-suite-footer">
        <div className="sbisif-suite-container">
          <span>© {new Date().getFullYear()} SBISIF Apps</span>
          <a href="https://sbisif.com/">Part of the SBISIF digital suite · sbisif.com</a>
        </div>
      </footer>
    </div>
  )
}
