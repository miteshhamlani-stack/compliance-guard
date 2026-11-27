import type { ReactNode } from 'react'
import logoSrc from '../../assets/sbisif-logo.png'
import './ToolShellLayout.css'

interface ToolShellLayoutProps {
  title: string
  children: ReactNode
}

export function ToolShellLayout({
  title,
  children,
}: ToolShellLayoutProps) {
  return (
    <div className="tool-shell">
      <div className="tool-shell-accent" aria-hidden="true" />
      <header className="tool-shell-header">
        <div className="tool-shell-container tool-shell-header-inner">
          <div className="tool-shell-header-brand">
            <a className="tool-shell-logo" href="/" aria-label="Applications home">
              <img src={logoSrc} alt="" width="40" height="40" />
            </a>
            <span className="tool-shell-divider" aria-hidden="true" />
            <span className="tool-shell-title">{title}</span>
          </div>
          <span className="tool-shell-privacy" title="Documents are processed locally in your browser.">
            <span aria-hidden="true" />
            100% Browser-Private · Zero Server
          </span>
        </div>
      </header>
      <main className="tool-shell-main">
        <div className="tool-shell-container">{children}</div>
      </main>
      <footer className="tool-shell-footer">
        <div className="tool-shell-container">
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
