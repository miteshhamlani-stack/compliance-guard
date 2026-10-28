import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  FileText,
  LoaderCircle,
  UploadCloud,
} from 'lucide-react'
import {
  scanDocument,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  type DocumentScanProgress,
} from '../utils/documentScanner'
import type { ComplianceIssue } from '../utils/complianceEngine'

interface MediaScannerProps {
  issues: ComplianceIssue[]
  onTextExtracted: (text: string) => void
}

function isImage(file: File | null): boolean {
  return file?.type.startsWith('image/') ?? false
}

export function MediaScanner({
  issues,
  onTextExtracted,
}: MediaScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<DocumentScanProgress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function processFile(nextFile: File) {
    setFile(nextFile)
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return URL.createObjectURL(nextFile)
    })
    setError('')
    setProgress({ stage: 'reading-pdf', percentage: 0, message: 'Preparing file...' })

    try {
      const result = await scanDocument(nextFile, setProgress)
      if (!result.text.trim()) {
        throw new Error('No readable text was detected in this document.')
      }
      onTextExtracted(result.text)
      setProgress({
        stage: result.usedOcr ? 'ocr' : 'reading-pdf',
        percentage: 100,
        message: result.usedOcr ? 'OCR complete' : 'PDF reading complete',
      })
    } catch (scanError) {
      setProgress(null)
      setError(
        scanError instanceof Error
          ? scanError.message
          : 'The document could not be scanned.',
      )
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    if (nextFile) void processFile(nextFile)
    event.target.value = ''
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    const nextFile = event.dataTransfer.files[0]
    if (nextFile) void processFile(nextFile)
  }

  return (
    <div className="media-scanner">
      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF or image for local text extraction"
      >
        <input
          ref={inputRef}
          type="file"
          accept={SUPPORTED_DOCUMENT_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          hidden
        />
        <span className="dropzone-icon"><UploadCloud size={18} /></span>
        <span className="dropzone-copy">
          <strong>Drop a PDF or image to scan</strong>
          <small>or click to browse · PDF, PNG, JPG, WEBP</small>
        </span>
        <span className="local-badge"><CheckCircle2 size={12} /> On-device</span>
      </div>

      {progress && (
        <div className="scan-progress" aria-live="polite">
          {progress.percentage < 100
            ? <LoaderCircle className="spin" size={15} />
            : <CheckCircle2 size={15} />}
          <span>{progress.message}</span>
          <div className="progress-track" role="progressbar" aria-valuenow={progress.percentage} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress.percentage}%` }} />
          </div>
          <strong>{progress.percentage}%</strong>
        </div>
      )}

      {error && (
        <div className="scanner-error" role="alert">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {file && previewUrl && (
        <div className="scanner-review">
          <div className="document-preview">
            <div className="preview-heading">
              {isImage(file) ? <FileImage size={14} /> : <FileText size={14} />}
              <span title={file.name}>{file.name}</span>
            </div>
            {isImage(file) ? (
              <img src={previewUrl} alt={`Preview of ${file.name}`} />
            ) : (
              <iframe title={`Preview of ${file.name}`} src={previewUrl} />
            )}
          </div>
          <div className="scanner-findings">
            <div className="preview-heading">
              <AlertCircle size={14} />
              <span>Detected audit findings</span>
            </div>
            {issues.length === 0 ? (
              <p className="empty-findings">Run the audit to review detected findings.</p>
            ) : (
              <ul>
                {issues.slice(0, 5).map((issue) => (
                  <li key={issue.id}>
                    <span className={`finding-dot finding-${issue.severity}`} />
                    <span>{issue.title}</span>
                  </li>
                ))}
                {issues.length > 5 && <li className="more-findings">+ {issues.length - 5} more findings</li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
