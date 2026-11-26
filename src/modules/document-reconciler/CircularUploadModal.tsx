import { useState } from 'react'
import { FileUp, Save, X } from 'lucide-react'
import { getDocumentLabels } from './documentLabels'
import { parseMasterCircularFile } from './parsers/circularParser'
import type { CircularFramework } from './types'

interface CircularUploadModalProps {
  onClose: () => void
  onSave: (framework: CircularFramework) => void
}

export function CircularUploadModal({ onClose, onSave }: CircularUploadModalProps) {
  const [framework, setFramework] = useState<CircularFramework | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function parseFile(file?: File): Promise<void> {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const parsed = await parseMasterCircularFile(file)
      if (parsed.expectedSections.length === 0) throw new Error('No supported section headings were found in this circular.')
      setFramework(parsed)
    } catch (reason) {
      setFramework(null)
      setError(reason instanceof Error ? reason.message : 'The circular could not be parsed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="reconciler-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="reconciler-modal reconciler-circular-modal" role="dialog" aria-modal="true" aria-labelledby="circular-modal-title">
        <div className="reconciler-modal-heading">
          <div><p className="reconciler-eyebrow">CUSTOM MASTER CIRCULAR</p><h2 id="circular-modal-title">Upload Master Circular</h2></div>
          <button type="button" className="reconciler-icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="reconciler-muted">The file is parsed locally and the rule pack is saved only in this browser.</p>
        <label className="reconciler-upload-field">
          <FileUp size={18} />
          <span>{busy ? 'Parsing circular…' : 'Choose PDF, DOCX, TXT, or Markdown'}</span>
          <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(event) => void parseFile(event.target.files?.[0])} />
        </label>
        {framework && (
          <div className="reconciler-framework-summary">
            <strong>{framework.name}</strong>
            <span>{framework.authority} · {framework.circularRef}</span>
            <span>{getDocumentLabels(framework).join(' & ')} · {framework.expectedSections.length} expected sections · {framework.complianceChecklist.length} checks</span>
          </div>
        )}
        {error && <p className="reconciler-error" role="alert">{error}</p>}
        <div className="reconciler-modal-actions">
          <button type="button" className="reconciler-button reconciler-button-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="reconciler-button reconciler-button-primary" disabled={busy || !framework} onClick={() => {
            if (!framework) return
            onSave(framework)
            onClose()
          }}><Save size={15} /> Save circular</button>
        </div>
      </section>
    </div>
  )
}
