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
} from '../utils/documentScanner'
import { hasMultilingualDisclaimer, scanCompliance, type ComplianceIssue } from '../utils/complianceEngine'
import { formatTimestamp, scanVideo } from '../utils/videoScanner'
import {
  validateVideoCompliance,
  type VideoAudioTranscript,
  type VideoVisualOccurrence,
} from '../utils/videoComplianceValidator'

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
  const [videoFrames, setVideoFrames] = useState<VideoVisualOccurrence[]>([])
  const [audioTranscript, setAudioTranscript] = useState<VideoAudioTranscript | null>(null)
  const [transcriptTab, setTranscriptTab] = useState<'visual' | 'audio'>('visual')

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
    setAudioTranscript(null)
    setProgress({ percentage: 0, status: 'Reading file...' })

    try {
      if (isVideo(nextFile)) {
        const scan = await scanVideo(nextFile, (percentage, status) => {
          setProgress({ percentage, status })
        })
        const report = validateVideoCompliance(scan)
        const aggregateText = scan.visualOccurrences
          .filter((frame) => frame.text)
          .map((frame) => `[${formatTimestamp(frame.startTime)}]\n${frame.text}`)
          .join('\n\n')
        const audioText = scan.audioTranscript?.text
          ? `\n\n[AUDIO VOICEOVER]\n${scan.audioTranscript.text}`
          : ''
        setVideoFrames(scan.visualOccurrences)
        setAudioTranscript(scan.audioTranscript)
        onVideoScanComplete(`${aggregateText}${audioText}`, report.issues)
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
                  key={frame.startTime}
                  title={frame.text || 'No text detected'}
                >
                  {formatTimestamp(frame.startTime)}
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
          {isVideo(file) && (
            <div className="transcript-panel">
              <div className="transcript-tabs" role="tablist" aria-label="Video transcripts">
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptTab === 'visual'}
                  className={transcriptTab === 'visual' ? 'active' : ''}
                  onClick={() => setTranscriptTab('visual')}
                >
                  Visual Frame Transcript
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={transcriptTab === 'audio'}
                  className={transcriptTab === 'audio' ? 'active' : ''}
                  onClick={() => setTranscriptTab('audio')}
                >
                  Audio Voiceover Transcript
                </button>
              </div>
              <pre className="transcript-text">
                {transcriptTab === 'visual'
                  ? videoFrames
                    .filter((frame) => frame.text)
                    .map((frame) => `[${formatTimestamp(frame.startTime)}-${formatTimestamp(frame.endTime)}]\n${frame.text}`)
                    .join('\n\n') || 'No visual text detected.'
                  : audioTranscript?.segments?.map((segment) =>
                    `[${formatTimestamp(segment.startTime)}-${formatTimestamp(segment.endTime)}] ${segment.text}`,
                  ).join('\n') || audioTranscript?.text || 'No audio voiceover detected.'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
