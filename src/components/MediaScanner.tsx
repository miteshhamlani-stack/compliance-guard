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
  scanImageCanvas,
  SUPPORTED_DOCUMENT_EXTENSIONS,
} from '../utils/documentScanner'
import { hasMultilingualDisclaimer, scanCompliance, type ComplianceIssue } from '../utils/complianceEngine'
import { extractVideoFrames, formatTimestamp, type VideoFrameScan } from '../utils/videoScanner'

interface MediaScannerProps {
  mode: 'document' | 'video'
  issues: ComplianceIssue[]
  onTextExtracted: (text: string) => void
  onVideoScanComplete: (text: string, issues: ComplianceIssue[]) => void
}

function isImage(file: File | null): boolean {
  return file?.type.startsWith('image/') ?? false
}

function isVideo(file: File | null): boolean {
  return (
    file?.type.startsWith('video/') ||
    /\.(mp4|webm|mov)$/i.test(file?.name ?? '')
  )
}

export function MediaScanner({
  mode,
  issues,
  onTextExtracted,
  onVideoScanComplete,
}: MediaScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<{ percentage: number; status: string } | null>(null)
  const [error, setError] = useState('')
  const [videoFrames, setVideoFrames] = useState<VideoFrameScan[]>([])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function processFile(nextFile: File) {
    if (mode === 'video' && !isVideo(nextFile)) {
      setError('Video scan accepts only MP4, WEBM, or MOV files.')
      return
    }
    if (mode === 'document' && isVideo(nextFile)) {
      setError('PDF / image scan accepts PDF, PNG, JPG, JPEG, or WEBP files.')
      return
    }
    setFile(nextFile)
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      return URL.createObjectURL(nextFile)
    })
    setError('')
    setVideoFrames([])
    setProgress({ percentage: 0, status: 'Reading file...' })

    try {
      if (isVideo(nextFile)) {
        const extracted = await extractVideoFrames(nextFile, (percentage, status) => {
          setProgress({ percentage, status })
        })
        const frameScans: VideoFrameScan[] = []
        for (const [index, frame] of extracted.frames.entries()) {
          const result = await scanImageCanvas(frame.canvas, (percentage, status) => {
            const overall = 45 + ((index + percentage / 100) / extracted.frames.length) * 50
            setProgress({
              percentage: Math.round(overall),
              status: `${status} Frame ${index + 1} of ${extracted.frames.length}`,
            })
          })
          frameScans.push({ timestamp: frame.timestamp, text: result.text })
        }

        const aggregateText = frameScans
          .filter((frame) => frame.text)
          .map((frame) => `[${formatTimestamp(frame.timestamp)}]\n${frame.text}`)
          .join('\n\n')
        const disclaimerFrames = frameScans.filter((frame) =>
          hasMultilingualDisclaimer(frame.text),
        )
        const videoIssues: ComplianceIssue[] = []
        const frameIssues = frameScans.flatMap((frame) =>
          scanCompliance(frame.text).issues.filter((issue) => issue.severity !== 'info').map((issue) => ({
            ...issue,
            id: `video-${formatTimestamp(frame.timestamp)}-${issue.id}`,
            title: `${issue.title} · ${formatTimestamp(frame.timestamp)}`,
          })),
        )
        videoIssues.push(...frameIssues)
        const disclaimerDuration = disclaimerFrames.length > 1
          ? Math.max(...disclaimerFrames.map((frame) => frame.timestamp)) -
            Math.min(...disclaimerFrames.map((frame) => frame.timestamp))
          : 0
        if (disclaimerFrames.length > 0 && disclaimerDuration < 3) {
          videoIssues.push({
            id: 'video-disclaimer-duration',
            category: 'missing-disclaimer',
            severity: 'warning',
            regulatoryClass: 'disclosure-best-practice',
            title: 'Video risk disclaimer shown for under 3 seconds',
            detail: `The disclaimer was detected around ${disclaimerFrames.map((frame) => formatTimestamp(frame.timestamp)).join(', ')}.`,
            recommendation: 'Keep the statutory risk warning visible and legible for the required duration in the final video.',
            citation: 'SEBI Master Circular for Mutual Funds, Clause 13.1 and Sixth Schedule.',
          })
        }
        setVideoFrames(frameScans)
        onVideoScanComplete(aggregateText, videoIssues)
        setProgress({ percentage: 100, status: 'Video scan complete' })
        return
      }

      const result = await scanDocument(nextFile, (percentage, status) => {
        setProgress({ percentage, status })
      })
      if (!result.text.trim()) {
        throw new Error('No readable text was detected in this document.')
      }
      onTextExtracted(result.text)
      setProgress({
        percentage: 100,
        status: result.usedOcr
          ? `OCR complete · ${result.detectedScript}`
          : 'PDF reading complete',
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
        aria-label="Upload a PDF, image, or video for local text extraction"
      >
        <input
          ref={inputRef}
          type="file"
          accept={mode === 'video'
            ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'
            : SUPPORTED_DOCUMENT_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          hidden
        />
        <span className="dropzone-icon"><UploadCloud size={18} /></span>
        <span className="dropzone-copy">
          <strong>{mode === 'video' ? 'Drop a video to scan' : 'Drop a PDF or image to scan'}</strong>
          <small>{mode === 'video'
            ? 'or click to browse · MP4, WEBM, MOV'
            : 'or click to browse · PDF, PNG, JPG, WEBP'}</small>
        </span>
        <span className="local-badge"><CheckCircle2 size={12} /> On-device</span>
      </div>
      {isVideo(file) && videoFrames.length > 0 && (
        <div className="video-timeline" aria-label="Video scan timeline">
          <div className="preview-heading"><FileText size={14} /><span>Scan timeline</span></div>
          <div className="timeline-badges">
            {videoFrames.map((frame) => {
              const frameHasDisclaimer = hasMultilingualDisclaimer(frame.text)
              const frameHasIssue = scanCompliance(frame.text).issues.some(
                (issue) => issue.severity !== 'info',
              )
              return (
                <span
                  className={`timeline-badge ${frameHasIssue ? 'failed' : frameHasDisclaimer ? 'passed' : 'neutral'}`}
                  key={frame.timestamp}
                  title={frame.text || 'No text detected'}
                >
                  {formatTimestamp(frame.timestamp)}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {progress && (
        <div className="scan-progress" aria-live="polite">
          {progress.percentage < 100
            ? <LoaderCircle className="spin" size={15} />
            : <CheckCircle2 size={15} />}
          <span>{progress.status}</span>
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
            ) : isVideo(file) ? (
              <video controls src={previewUrl} aria-label={`Preview of ${file.name}`} />
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
