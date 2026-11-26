import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileText,
  FileUp,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import { CircularUploadModal } from './CircularUploadModal'
import { getDocumentLabels } from './documentLabels'
import { parseAddendumFiles } from './parsers/addendumBatchParser'
import { parseCompleteLeadDocuments } from './parsers/fullDocumentParser'
import { starterCirculars, starterDocumentNodes, starterNotices } from './parsers/starterCirculars'
import { createRedline, findBestExcerpt, replaceBestExcerpt } from './circulars/reconcilerEngine'
import {
  createAuditCsv,
  createReconciledDocx,
  getCompleteDocumentText,
  reconciledFileName,
} from './fullDocExporter'
import type { AmendmentNotice, CircularFramework, DocumentNode, ReconcilerWorkspaceData } from './types'
import { isWorkspaceData } from './validation'
import './DocumentReconcilerWorkbench.css'

const STORAGE_KEY = 'document-reconciler-full-document-v3'

interface LeadFiles {
  primary: File | null
  secondary: File | null
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function downloadText(name: string, contents: string, type: string): void {
  downloadBlob(name, new Blob([contents], { type }))
}

function statusLabel(status: AmendmentNotice['status']): string {
  return status[0].toUpperCase() + status.slice(1)
}

function currentTimestamp(): string {
  return new Date().toISOString()
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function sameSection(first: DocumentNode, second: DocumentNode): boolean {
  if (first.id === second.id) return true
  if (first.sectionCode && second.sectionCode && normalize(first.sectionCode) === normalize(second.sectionCode)) return true
  return Boolean(first.title && second.title && normalize(first.title) === normalize(second.title))
}

function noticeAppliesToNode(notice: AmendmentNotice, node: DocumentNode, nodes: DocumentNode[]): boolean {
  if (notice.targetNodeId === node.id) return true
  const target = nodes.find((item) => item.id === notice.targetNodeId)
  return target ? sameSection(target, node) : false
}

function renderHighlightedText(content: string, highlights: string[]): ReactNode {
  const ranges = highlights.flatMap((highlight) => {
    if (!highlight) return []
    const index = content.indexOf(highlight)
    return index < 0 ? [] : [{ start: index, end: index + highlight.length }]
  }).sort((first, second) => first.start - second.start)
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [index, range] of ranges.entries()) {
    if (range.start < cursor) continue
    if (range.start > cursor) parts.push(content.slice(cursor, range.start))
    parts.push(<mark key={`highlight-${index}`}>{content.slice(range.start, range.end)}</mark>)
    cursor = range.end
  }
  if (cursor < content.length) parts.push(content.slice(cursor))
  return parts.length > 0 ? parts : content
}

function hasContent(nodes: DocumentNode[]): boolean {
  return nodes.some((node) => node.fullContent.length > 0 || Boolean(node.pairedDocContent?.length))
}

function isEmptyWorkspace(workspace: ReconcilerWorkspaceData): boolean {
  return !hasContent(workspace.documentNodes) && workspace.notices.length === 0
}

function loadStoredWorkspace(): { workspace: ReconcilerWorkspaceData; writable: boolean; error: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return { workspace: { frameworks: [], documentNodes: [], notices: [] }, writable: true, error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!isWorkspaceData(parsed)) throw new Error('Stored workspace data has an invalid format.')
    return { workspace: parsed, writable: true, error: '' }
  } catch (reason) {
    return {
      workspace: { frameworks: [], documentNodes: [], notices: [] },
      writable: false,
      error: reason instanceof Error ? reason.message : 'Local browser storage could not be read.',
    }
  }
}

export function DocumentReconcilerWorkbench() {
  const [initialStorage] = useState(loadStoredWorkspace)
  const [workspace, setWorkspace] = useState(initialStorage.workspace)
  const workspaceRef = useRef(workspace)
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(starterCirculars[0].id)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedNoticeId, setSelectedNoticeId] = useState('')
  const [activeDocument, setActiveDocument] = useState<0 | 1>(0)
  const [outlineMode, setOutlineMode] = useState<'impacted' | 'complete'>('complete')
  const [showCircularModal, setShowCircularModal] = useState(false)
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null)
  const [editingFullNode, setEditingFullNode] = useState(false)
  const [editText, setEditText] = useState('')
  const [uploadsCollapsed, setUploadsCollapsed] = useState(false)
  const [checklistExpanded, setChecklistExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [storageError, setStorageError] = useState(initialStorage.error)
  const [leadFiles, setLeadFiles] = useState<LeadFiles>({ primary: null, secondary: null })

  const frameworks = [...starterCirculars, ...workspace.frameworks]
  const framework = frameworks.find((item) => item.id === selectedFrameworkId) ?? starterCirculars[0]
  const nodes = workspace.documentNodes
  const notices = workspace.notices
  const impactedNodeIds = useMemo(() => new Set(nodes
    .filter((node) => node.isImpacted || notices.some((notice) => noticeAppliesToNode(notice, node, nodes)))
    .map((node) => node.id)), [nodes, notices])
  const outlineNodes = outlineMode === 'impacted'
    ? nodes.filter((node) => impactedNodeIds.has(node.id))
    : nodes.filter((node) => node.fullContent.length > 0 || Boolean(node.pairedDocContent?.length) || Boolean(node.circularComplianceNote))
  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
    ?? outlineNodes[0]
    ?? nodes[0]
  const selectedNotice = notices.find((notice) => notice.id === selectedNoticeId)
    ?? (selectedNode ? notices.find((notice) => noticeAppliesToNode(notice, selectedNode, nodes)) : undefined)
  const activeText = selectedNode
    ? activeDocument === 0 ? selectedNode.fullContent : selectedNode.pairedDocContent ?? ''
    : ''
  const comparisonText = selectedNotice
    ? activeDocument === 0
      ? selectedNotice.originalExcerpt
      : findBestExcerpt(activeText, selectedNotice.originalExcerpt)
    : ''
  const redline = selectedNotice ? createRedline(comparisonText, selectedNotice.proposedText) : []
  const expectedSectionCount = new Set(nodes
    .filter((node) => node.fullContent || node.pairedDocContent)
    .map((node) => node.sectionCode || node.headingPath || node.title)).size
  const pairedLabels = getDocumentLabels(framework)
  const showPairedDocument = Boolean(framework.documentTypes[1].trim()
    || workspace.secondaryFileName
    || leadFiles.secondary
    || nodes.some((node) => node.pairedDocContent?.length))
  const documentTabs = [
    { index: 0 as const, title: 'Primary Lead Document', type: pairedLabels[0], examples: '(e.g., SID, Master Policy, PPM)' },
    ...(showPairedDocument
      ? [{ index: 1 as const, title: 'Paired Summary Document', type: pairedLabels[1], examples: '(e.g., KIM, Key Facts Statement / MITC)' }]
      : []),
  ]
  const previewLabels = showPairedDocument ? pairedLabels : [pairedLabels[0]]
  const hasLeadDocument = Boolean(workspace.primaryFileName || leadFiles.primary)

  function commitWorkspace(update: (current: ReconcilerWorkspaceData) => ReconcilerWorkspaceData): void {
    const next = update(workspaceRef.current)
    workspaceRef.current = next
    setWorkspace(next)
    if (!initialStorage.writable) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageError('')
    } catch (reason) {
      setStorageError(reason instanceof Error ? reason.message : 'Changes could not be saved to local browser storage.')
    }
  }

  function updateNotice(id: string, updates: Partial<AmendmentNotice>): void {
    commitWorkspace((current) => ({
      ...current,
      notices: current.notices.map((notice) => notice.id === id ? { ...notice, ...updates } : notice),
    }))
  }

  async function loadLeadFiles(nextFiles: LeadFiles): Promise<void> {
    if (!nextFiles.primary) {
      setUploadError('Select the primary lead document first.')
      return
    }
    setBusy(true)
    setUploadError('')
    try {
      const parsedNodes = await parseCompleteLeadDocuments(nextFiles.primary, nextFiles.secondary, framework)
      setLeadFiles(nextFiles)
      commitWorkspace((current) => ({
        ...current,
        documentNodes: parsedNodes,
        notices: [],
        primaryFileName: nextFiles.primary?.name,
        secondaryFileName: nextFiles.secondary?.name,
        isSampleMode: false,
      }))
      setSelectedNoticeId('')
      setSelectedNodeId(parsedNodes.find((node) => node.fullContent)?.id ?? '')
      setActiveDocument(0)
      setEditingFullNode(false)
      setUploadsCollapsed(true)
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'Lead documents could not be parsed.')
    } finally {
      setBusy(false)
    }
  }

  function clearLeadDocuments(): void {
    setLeadFiles({ primary: null, secondary: null })
    commitWorkspace((current) => ({
      ...current,
      documentNodes: [],
      notices: [],
      primaryFileName: undefined,
      secondaryFileName: undefined,
      isSampleMode: false,
    }))
    setSelectedNoticeId('')
    setSelectedNodeId('')
    setUploadError('')
  }

  function removeSecondaryDocument(): void {
    setActiveDocument(0)
    if (leadFiles.primary) {
      void loadLeadFiles({ primary: leadFiles.primary, secondary: null })
      return
    }
    commitWorkspace((current) => ({
      ...current,
      documentNodes: current.documentNodes
        .filter((node) => node.fullContent || !node.pairedDocContent)
        .map((node) => ({ ...node, pairedDocContent: undefined })),
      secondaryFileName: undefined,
    }))
    setLeadFiles((current) => ({ ...current, secondary: null }))
  }

  async function loadAddendums(files: File[]): Promise<void> {
    if (files.length === 0) return
    if (!hasContent(nodes)) {
      setUploadError('Load a complete lead document before adding notices.')
      return
    }
    setBusy(true)
    setUploadError('')
    try {
      const parsed = await parseAddendumFiles(files, framework, nodes)
      const updatedNodes = nodes.map((node) => (
        parsed.some((notice) => noticeAppliesToNode(notice, node, nodes))
          ? { ...node, isImpacted: true }
          : node
      ))
      commitWorkspace((current) => ({
        ...current,
        documentNodes: updatedNodes,
        notices: [...current.notices, ...parsed],
      }))
      setSelectedNoticeId(parsed[0]?.id ?? '')
      setSelectedNodeId(parsed[0]?.targetNodeId ?? selectedNodeId)
      setOutlineMode('impacted')
      setUploadsCollapsed(true)
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'The addendum batch could not be parsed.')
    } finally {
      setBusy(false)
    }
  }

  function removeNotice(noticeId: string): void {
    const remaining = notices.filter((notice) => notice.id !== noticeId)
    commitWorkspace((current) => ({
      ...current,
      notices: remaining,
      documentNodes: current.documentNodes.map((node) => ({
        ...node,
        isImpacted: Boolean(node.circularComplianceNote?.startsWith('Missing mandatory section: '))
          || remaining.some((notice) => noticeAppliesToNode(notice, node, current.documentNodes)),
      })),
    }))
    if (selectedNoticeId === noticeId) setSelectedNoticeId('')
  }

  function reviewNotice(notice: AmendmentNotice, status: 'approved' | 'rejected'): void {
    const reviewedAt = currentTimestamp()
    commitWorkspace((current) => ({
      ...current,
      documentNodes: status === 'approved'
        ? current.documentNodes.map((node) => {
          if (!noticeAppliesToNode(notice, node, current.documentNodes)) return node
          return {
            ...node,
            ...(node.fullContent
              ? { fullContent: replaceBestExcerpt(node.fullContent, notice.originalExcerpt, notice.proposedText) }
              : {}),
            ...(node.pairedDocContent
              ? { pairedDocContent: replaceBestExcerpt(node.pairedDocContent, notice.originalExcerpt, notice.proposedText) }
              : {}),
          }
        })
        : current.documentNodes,
      notices: current.notices.map((item) => item.id === notice.id ? { ...item, status, reviewedAt } : item),
    }))
    setEditingNoticeId(null)
  }

  function saveInlineEdit(notice: AmendmentNotice): void {
    if (!editText.trim()) {
      setUploadError('Proposed replacement text cannot be empty.')
      return
    }
    updateNotice(notice.id, { proposedText: editText })
    setEditingNoticeId(null)
    setUploadError('')
  }

  function updateNodeContent(node: DocumentNode, content: string): void {
    commitWorkspace((current) => ({
      ...current,
      documentNodes: current.documentNodes.map((item) => {
        if (item.id !== node.id) return item
        return activeDocument === 0
          ? { ...item, fullContent: content }
          : { ...item, pairedDocContent: content }
      }),
    }))
  }

  function saveFramework(next: CircularFramework): void {
    commitWorkspace((current) => ({
      ...current,
      frameworks: [...current.frameworks.filter((item) => item.id !== next.id), next],
      documentNodes: [],
      notices: [],
      primaryFileName: undefined,
      secondaryFileName: undefined,
      isSampleMode: false,
    }))
    setLeadFiles({ primary: null, secondary: null })
    setSelectedFrameworkId(next.id)
    setSelectedNodeId('')
    setSelectedNoticeId('')
    setUploadsCollapsed(false)
  }

  function changeFramework(id: string): void {
    if (id === selectedFrameworkId) return
    setSelectedFrameworkId(id)
    setSelectedNodeId('')
    setSelectedNoticeId('')
    setActiveDocument(0)
    setLeadFiles({ primary: null, secondary: null })
    commitWorkspace((current) => ({
      ...current,
      documentNodes: [],
      notices: [],
      primaryFileName: undefined,
      secondaryFileName: undefined,
      isSampleMode: false,
    }))
    setUploadsCollapsed(false)
    setUploadError('')
  }

  function previewSampleWorkspace(): void {
    setSelectedFrameworkId(starterCirculars[0].id)
    setSelectedNodeId(starterDocumentNodes[0].id)
    setSelectedNoticeId(starterNotices[0].id)
    setLeadFiles({ primary: null, secondary: null })
    commitWorkspace((current) => ({
      ...current,
      documentNodes: starterDocumentNodes,
      notices: starterNotices,
      primaryFileName: 'Sample Primary Lead Document.txt',
      secondaryFileName: 'Sample Paired Summary Document.txt',
      isSampleMode: true,
    }))
    setOutlineMode('complete')
    setUploadsCollapsed(true)
    setUploadError('')
  }

  function clearSession(): void {
    setLeadFiles({ primary: null, secondary: null })
    commitWorkspace((current) => ({
      ...current,
      documentNodes: [],
      notices: [],
      primaryFileName: undefined,
      secondaryFileName: undefined,
      isSampleMode: false,
    }))
    setSelectedNoticeId('')
    setSelectedNodeId('')
    setUploadsCollapsed(false)
    setUploadError('')
  }

  async function exportCompleteDocuments(): Promise<void> {
    try {
      const primaryText = getCompleteDocumentText(nodes, 0)
      if (!primaryText) throw new Error('Load a primary lead document before exporting.')
      const primary = await createReconciledDocx(nodes, 0, pairedLabels[0], framework.name)
      downloadBlob(reconciledFileName(workspace.primaryFileName ?? leadFiles.primary?.name, 0), primary)
      if (getCompleteDocumentText(nodes, 1)) {
        const secondary = await createReconciledDocx(nodes, 1, pairedLabels[1], framework.name)
        downloadBlob(reconciledFileName(workspace.secondaryFileName ?? leadFiles.secondary?.name, 1), secondary)
      }
      downloadText('document-reconciler-audit.csv', createAuditCsv(notices), 'text/csv;charset=utf-8')
      setUploadError('')
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'Complete document export failed.')
    }
  }

  function handleLeadDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const files = [...event.dataTransfer.files]
    if (files.length === 0) return
    if (files.length > 2) {
      setUploadError('Drop at most two lead documents: a primary document and its paired document.')
      return
    }
    void loadLeadFiles({ primary: files[0], secondary: files[1] ?? leadFiles.secondary })
  }

  function handleAddendumDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    void loadAddendums([...event.dataTransfer.files])
  }

  return (
    <main className="reconciler-app">
      <header className="reconciler-topbar">
        <a href="/" className="reconciler-back-link"><ArrowLeft size={17} /> Apps Portal</a>
        <div className="reconciler-brand"><span className="reconciler-brand-icon"><ShieldCheck size={18} /></span><span>Document Reconciler</span></div>
        <span className="reconciler-privacy"><span /> 100% browser-private</span>
      </header>

      <section className="reconciler-control-panel">
        <div className="reconciler-title-row">
          <div><p className="reconciler-eyebrow">REGULATORY DOCUMENT WORKSPACE</p><h1>Document Reconciler</h1></div>
          <div className="reconciler-controls">
            <label className="reconciler-select-wrap" aria-label="Select master circular">
              <select value={framework.id} onChange={(event) => changeFramework(event.target.value)}>
                <optgroup label="Built-in circulars">{starterCirculars.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
                {workspace.frameworks.length > 0 && <optgroup label="Your rule packs">{workspace.frameworks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}
              </select>
              <ChevronDown size={16} />
            </label>
            <button type="button" className="reconciler-button reconciler-button-secondary" onClick={() => setShowCircularModal(true)}><Plus size={16} /> Upload Master Circular</button>
            <button
              type="button"
              className="reconciler-button reconciler-button-secondary"
              title="Loads sample baseline documents and amendment notices to test redlining and export without uploading files."
              onClick={previewSampleWorkspace}
            >Preview Sample Workspace</button>
            <button type="button" className="reconciler-button reconciler-button-secondary" disabled={!hasContent(nodes)} onClick={() => void exportCompleteDocuments()}><Download size={15} /> Export Reconciled Documents &amp; Audit Log</button>
            <button type="button" className="reconciler-button reconciler-button-danger" disabled={isEmptyWorkspace(workspace)} onClick={clearSession}>Clear Session</button>
          </div>
        </div>
        <button type="button" className="reconciler-checklist-toggle" aria-expanded={checklistExpanded} onClick={() => setChecklistExpanded(!checklistExpanded)}>
          <ShieldCheck size={16} /><span>Circular Compliance Checklist</span><span className="reconciler-checklist-count">{framework.complianceChecklist.length} checks</span><ChevronDown size={15} />
        </button>
        {checklistExpanded && <ul className="reconciler-checklist">{framework.complianceChecklist.map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul>}
      </section>

      {(uploadError || storageError) && <div className="reconciler-storage-warning" role="status">{uploadError || storageError}</div>}

      <section className={`reconciler-upload-strip${uploadsCollapsed ? ' collapsed' : ''}`}>
        <div className="reconciler-upload-strip-heading">
          <div><p className="reconciler-eyebrow">LOCAL DOCUMENT INPUT</p><h2>Lead Document &amp; Amendment Inputs</h2></div>
          {(hasLeadDocument || notices.length > 0) && (
            <button type="button" className="reconciler-button reconciler-button-secondary" onClick={() => setUploadsCollapsed(!uploadsCollapsed)}>
              {uploadsCollapsed ? 'Change uploads' : 'Collapse uploads'}
            </button>
          )}
        </div>
        {uploadsCollapsed ? (
          <div className="reconciler-upload-summary">
            <span><strong>Primary lead:</strong> {workspace.primaryFileName ?? leadFiles.primary?.name ?? 'Not loaded'}{workspace.secondaryFileName ? ` + ${workspace.secondaryFileName}` : ''} · {expectedSectionCount} sections/blocks parsed · complete text retained</span>
            <span><strong>Amendment notices:</strong> {notices.length} loaded</span>
          </div>
        ) : (
          <div className="reconciler-upload-boxes">
            <section className="reconciler-upload-box">
              <div className="reconciler-upload-box-heading"><div><span className="reconciler-step">1</span><div><h3>Primary Lead Document</h3><p>Selected document type: {pairedLabels[0]} (e.g., SID, Master Policy, PPM).</p></div></div></div>
              <div className="reconciler-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleLeadDrop}>
                <FileUp size={21} />
                <strong>Drop primary and paired documents here</strong>
                <span>PDF, DOCX, TXT, or Markdown · all extracted text is retained</span>
                <div className="reconciler-document-pickers">
                  <label className="reconciler-button reconciler-button-secondary">
                    Choose primary document
                    <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void loadLeadFiles({ primary: file, secondary: leadFiles.secondary })
                      event.currentTarget.value = ''
                    }} />
                  </label>
                  <div className="reconciler-paired-document-slot">
                    <strong>Paired Summary Document — Optional</strong>
                    <span>Selected paired document type: {pairedLabels[1]} (e.g., KIM, Key Facts Statement / MITC).</span>
                    <label className="reconciler-button reconciler-button-secondary">
                      Choose paired document
                      <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void loadLeadFiles({ primary: leadFiles.primary, secondary: file })
                        event.currentTarget.value = ''
                      }} />
                    </label>
                  </div>
                </div>
              </div>
              <div className="reconciler-file-pills">
                {(workspace.primaryFileName || leadFiles.primary) && <span className="reconciler-file-pill">Primary · {workspace.primaryFileName ?? leadFiles.primary?.name}<button type="button" aria-label="Remove primary document" onClick={clearLeadDocuments}><X size={13} /></button></span>}
                {(workspace.secondaryFileName || leadFiles.secondary) && <span className="reconciler-file-pill">Paired · {workspace.secondaryFileName ?? leadFiles.secondary?.name}<button type="button" aria-label="Remove paired document" onClick={removeSecondaryDocument}><X size={13} /></button></span>}
                {expectedSectionCount > 0 && <span className="reconciler-section-count">{expectedSectionCount} sections/blocks parsed · 100% text retained</span>}
              </div>
            </section>

            <section className="reconciler-upload-box">
              <div className="reconciler-upload-box-heading"><div><span className="reconciler-step">2</span><div><h3>Amendment Notices / Addendums</h3><p>(e.g., Notice-cum-Addendums, Circular Updates, Corrigenda)</p></div></div></div>
              <div className="reconciler-dropzone reconciler-addendum-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleAddendumDrop}>
                <FileUp size={21} />
                <strong>Drop multiple amendment or addendum files here (.docx, .pdf, .txt, .md)</strong>
                <span>Files are searched against every document block.</span>
                <label className="reconciler-button reconciler-button-secondary">
                  {busy ? 'Parsing files…' : 'Choose amendment files'}
                  <input type="file" accept=".pdf,.docx,.txt,.md" multiple disabled={busy} onChange={(event) => {
                    void loadAddendums([...event.target.files ?? []])
                    event.currentTarget.value = ''
                  }} />
                </label>
              </div>
              <div className="reconciler-file-pills reconciler-addendum-pills">
                {notices.map((notice) => (
                  <span className="reconciler-file-pill" key={notice.id}>
                    {notice.fileName}<span className={`reconciler-section-tag ${notice.status}`}>{notice.targetHeading}</span>
                    <button type="button" aria-label={`Remove ${notice.fileName}`} onClick={() => removeNotice(notice.id)}><X size={13} /></button>
                  </span>
                ))}
                {notices.length === 0 && <span className="reconciler-muted">No amendment notices loaded.</span>}
              </div>
            </section>
          </div>
        )}
      </section>

      {workspace.isSampleMode && (
        <div className="reconciler-sample-banner" role="status">
          <span>Sample Mode Active: Showing pre-loaded demonstration files. Upload your own Lead Document and Amendment Notices above to start a live reconciliation.</span>
          <button type="button" className="reconciler-button reconciler-button-secondary" onClick={clearSession}>Clear Sample</button>
        </div>
      )}

      <section className="reconciler-workspace reconciler-full-workspace">
        <aside className="reconciler-sidebar">
          <div className="reconciler-panel-heading"><h2>Document outline</h2><span>{outlineNodes.length}</span></div>
          <div className="reconciler-outline-toggle" role="group" aria-label="Document outline filter">
            <button type="button" className={outlineMode === 'impacted' ? 'active' : ''} onClick={() => setOutlineMode('impacted')}>Impacted Changes Only</button>
            <button type="button" className={outlineMode === 'complete' ? 'active' : ''} onClick={() => setOutlineMode('complete')}>Complete Outline (100%)</button>
          </div>
          <div className="reconciler-section-tree">
            {outlineNodes.map((node) => (
              <button type="button" key={node.id} className={`reconciler-section-item${selectedNode?.id === node.id ? ' active' : ''}${impactedNodeIds.has(node.id) ? ' impacted' : ''}`} onClick={() => {
                setSelectedNodeId(node.id)
                setSelectedNoticeId(notices.find((notice) => noticeAppliesToNode(notice, node, nodes))?.id ?? '')
                setEditingFullNode(false)
              }}>
                <span className="reconciler-section-code">{node.sectionCode || `Block ${node.orderIndex + 1}`}</span><span>{node.title}</span>
              </button>
            ))}
            {outlineNodes.length === 0 && <p className="reconciler-empty">{outlineMode === 'impacted' ? 'No impacted sections yet.' : 'Upload a lead document or preview the sample workspace.'}</p>}
          </div>
          <div className="reconciler-panel-heading reconciler-queue-heading"><h2>Amendment Notices</h2><span>{notices.length}</span></div>
          <div className="reconciler-notice-list">
            {notices.length === 0 && <p className="reconciler-empty">Load amendment notices to begin review.</p>}
            {notices.map((notice) => (
              <div className={`reconciler-notice-item${selectedNotice?.id === notice.id ? ' active' : ''}`} key={notice.id}>
                <button type="button" className="reconciler-notice-select" onClick={() => {
                  setSelectedNoticeId(notice.id)
                  setSelectedNodeId(notice.targetNodeId)
                  setEditingFullNode(false)
                }}>
                  <span className={`reconciler-status-badge ${notice.status}`}>{statusLabel(notice.status)}</span>
                  <strong>{notice.noticeNumber}</strong>
                  <small>{notice.fileName} · {notice.impactedScope}</small>
                </button>
                <button type="button" className="reconciler-icon-button" aria-label={`Remove ${notice.fileName}`} onClick={() => removeNotice(notice.id)}><X size={14} /></button>
              </div>
            ))}
          </div>
        </aside>

        <section className="reconciler-review-panel">
          <div className="reconciler-panel-heading reconciler-review-heading">
            <div><p className="reconciler-eyebrow">{selectedNotice ? 'AMENDMENT REVIEW' : 'COMPLETE DOCUMENT BLOCK'}</p><h2>{selectedNotice?.noticeNumber ?? selectedNode?.title ?? 'No document selected'}</h2></div>
            {selectedNotice && <span className={`reconciler-status-badge ${selectedNotice.status}`}>{statusLabel(selectedNotice.status)}</span>}
          </div>
          {selectedNode ? (
            <>
              {selectedNotice && <div className="reconciler-notice-meta"><span>{selectedNotice.fileName}</span><span>{selectedNotice.noticeDate}</span><span>Effective {selectedNotice.effectiveDate}</span><span>{selectedNotice.impactedScope}</span></div>}
              <div className="reconciler-document-tabs" role="tablist" aria-label="Document to review">
                {documentTabs.map((tab) => (
                  <button type="button" role="tab" aria-selected={activeDocument === tab.index} key={tab.title} onClick={() => setActiveDocument(tab.index)}>
                    <span>{tab.title}</span><small>{tab.type} {tab.examples}</small>
                  </button>
                ))}
              </div>
              {selectedNotice && !editingFullNode && (
                <div className="reconciler-redline" aria-label="Word-level document diff">
                  {redline.map((part, index) => part.added
                    ? <ins key={index}>{part.value}</ins>
                    : part.removed ? <del key={index}>{part.value}</del> : <span key={index}>{part.value}</span>)}
                </div>
              )}
              {selectedNode.circularComplianceNote && <p className="reconciler-compliance-note">{selectedNode.circularComplianceNote}</p>}
              {editingFullNode || !selectedNotice ? (
                <div className="reconciler-full-editor">
                  <label htmlFor="complete-section-editor">Full block text · edits are saved locally</label>
                  <textarea id="complete-section-editor" value={activeText} onChange={(event) => updateNodeContent(selectedNode, event.target.value)} />
                </div>
              ) : null}
              {editingNoticeId === selectedNotice?.id ? (
                <div className="reconciler-inline-editor">
                  <label htmlFor="inline-clause">Edit proposed replacement text</label>
                  <textarea id="inline-clause" rows={8} value={editText} onChange={(event) => setEditText(event.target.value)} />
                  <div><button type="button" className="reconciler-button reconciler-button-secondary" onClick={() => setEditingNoticeId(null)}>Cancel</button><button type="button" className="reconciler-button reconciler-button-primary" onClick={() => selectedNotice && saveInlineEdit(selectedNotice)}>Save edit</button></div>
                </div>
              ) : (
                <div className="reconciler-review-actions">
                  {selectedNotice?.reviewedAt && <span className="reconciler-review-time">Reviewed {new Date(selectedNotice.reviewedAt).toLocaleString()}</span>}
                  {selectedNotice && <button type="button" className="reconciler-button reconciler-button-secondary" onClick={() => setEditingFullNode(!editingFullNode)}><Pencil size={15} /> {editingFullNode ? 'Close full editor' : 'Edit full section'}</button>}
                  {selectedNotice?.status === 'pending' && <>
                    <button type="button" className="reconciler-button reconciler-button-secondary" onClick={() => { setEditText(selectedNotice.proposedText); setEditingNoticeId(selectedNotice.id) }}><Pencil size={15} /> Inline Edit</button>
                    <button type="button" className="reconciler-button reconciler-button-danger" onClick={() => reviewNotice(selectedNotice, 'rejected')}><X size={15} /> Reject</button>
                    <button type="button" className="reconciler-button reconciler-button-primary" onClick={() => reviewNotice(selectedNotice, 'approved')}><Check size={15} /> Approve</button>
                  </>}
                </div>
              )}
            </>
          ) : <div className="reconciler-empty-state"><FileText size={28} /><p>No document loaded.</p><span>Upload a primary lead document or choose Preview Sample Workspace.</span></div>}
        </section>

        <aside className="reconciler-preview-panel reconciler-full-preview-panel">
          <div className="reconciler-panel-heading"><div><p className="reconciler-eyebrow">LIVE COMPLETE-DOCUMENT PREVIEW</p><h2>Reconciled documents</h2></div></div>
          <div className="reconciler-preview-columns reconciler-complete-preview-columns">
            {previewLabels.map((name, index) => {
              const documentIndex = index as 0 | 1
              const completeText = getCompleteDocumentText(nodes, documentIndex)
              const documentRole = documentIndex === 0 ? 'Primary Lead Document' : 'Paired Summary Document'
              const uploadedFileName = documentIndex === 0 ? workspace.primaryFileName : workspace.secondaryFileName
              const visibleNodes = [...nodes].sort((first, second) => first.orderIndex - second.orderIndex)
                .filter((node) => documentIndex === 0 ? node.fullContent.length > 0 : Boolean(node.pairedDocContent?.length))
              return <div className="reconciler-preview-document" key={name}>
                <h3>{documentRole}<span>{uploadedFileName ? `${uploadedFileName} · ` : ''}{completeText.length.toLocaleString()} characters</span></h3>
                <div className="reconciler-continuous-reader">
                  {visibleNodes.map((node) => {
                    const content = documentIndex === 0 ? node.fullContent : node.pairedDocContent ?? ''
                    const approved = notices.filter((notice) => notice.status === 'approved' && noticeAppliesToNode(notice, node, nodes))
                    return <article key={node.id} className={`${selectedNode?.id === node.id ? 'focused' : ''}${approved.length > 0 ? ' approved-change' : ''}`} onClick={() => {
                      setSelectedNodeId(node.id)
                      setSelectedNoticeId(notices.find((notice) => noticeAppliesToNode(notice, node, nodes))?.id ?? '')
                    }}>
                      <h4>{node.sectionCode ? `${node.sectionCode} · ` : ''}{node.title}</h4>
                      <pre>{renderHighlightedText(content, approved.map((notice) => notice.proposedText))}</pre>
                    </article>
                  })}
                  {!completeText && <p className="reconciler-empty">{documentIndex === 0 ? 'No primary document loaded.' : 'No paired document loaded.'}</p>}
                </div>
              </div>
            })}
          </div>
          <button type="button" className="reconciler-button reconciler-button-primary reconciler-export-button" disabled={!hasContent(nodes)} onClick={() => void exportCompleteDocuments()}><Download size={16} /> Export Reconciled Documents &amp; Audit Log</button>
        </aside>
      </section>

      <footer className="reconciler-footer"><span><ShieldCheck size={15} /> Documents stay in this browser.</span><a href="/"><ArrowLeft size={14} /> Return to Apps Portal</a></footer>

      {showCircularModal && <CircularUploadModal onClose={() => setShowCircularModal(false)} onSave={saveFramework} />}
    </main>
  )
}
