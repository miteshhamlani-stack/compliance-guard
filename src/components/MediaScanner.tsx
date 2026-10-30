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
import { VideoAuditPlayer, type VideoAuditMarker } from './VideoAuditPlayer'
import type { EntityType } from '../utils/complianceEngine'
import {
  validateVideoCompliance,
  type VideoAudioTranscript,
  type VideoVisualOccurrence,
} from '../utils/videoComplianceValidator'

interface MediaScannerProps {
  mode: 'document' | 'video'
  issues: ComplianceIssue[]
  onTextExtracted: (text: string, metadata: ScanMetadata) => void
  onVideoScanComplete: (text: string, issues: ComplianceIssue[], metadata: ScanMetadata) => void
  entityType: EntityType
  isAuthenticated: boolean
  onAuthRequired: () => void
}

export interface ScanMetadata {
  documentName: string
  mediaType: 'Text' | 'Image' | 'PDF' | 'Video'
  detectedLanguages: string
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
  entityType,
  isAuthenticated,
  onAuthRequired,
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
  const [videoMarkers, setVideoMarkers] = useState<VideoAuditMarker[]>([])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function processFile(nextFile: File) {
    if (!isAuthenticated) {
      onAuthRequired()
      return
    }
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
    setVideoMarkers([])
    setProgress({ percentage: 0, status: 'Reading file...' })

    try {
      if (isVideo(nextFile)) {
        const scan = await scanVideo(nextFile, (percentage, status) => {
          setProgress({ percentage, status })
        })
        const report = validateVideoCompliance(scan, entityType)
        const aggregateText = scan.visualOccurrences
          .filter((frame) => frame.text)
          .map((frame) => `[${formatTimestamp(frame.startTime)}]\n${frame.text}`)
          .join('\n\n')
        const audioText = scan.audioTranscript?.text
          ? `\n\n[AUDIO VOICEOVER]\n${scan.audioTranscript.text}`
          : ''
        setVideoFrames(scan.visualOccurrences)
        setAudioTranscript(scan.audioTranscript)
        setVideoMarkers(scan.visualOccurrences.flatMap((frame) => {
          const markers: VideoAuditMarker[] = []
          if (hasMultilingualDisclaimer(frame.text)) {
            markers.push({
              id: `disclaimer-${frame.startTime}`,
              timestamp: frame.startTime,
              type: 'disclaimer',
              label: 'Mandatory SEBI disclaimer detected',
              note: 'Statutory market-risk warning detected in this sampled frame.',
              detail: frame.text,
            })
          }
          const isTimelineViolation = (id: string): boolean => (
            id.startsWith('yield-') ||
            id.startsWith('sip-risk-') ||
            (id === 'performance-horizon' || id === 'benchmark-parity') &&
              /\b(?:CAGR|XIRR|return|returns|yield)\b|%/i.test(frame.text)
          )
          for (const finding of scanCompliance(frame.text, undefined, entityType).issues.filter((issue) =>
            issue.severity !== 'info' && isTimelineViolation(issue.id),
          )) {
            markers.push({
              id: `violation-${frame.startTime}-${finding.id}`,
              timestamp: frame.startTime,
              type: 'violation',
              label: finding.title,
              note: finding.citation,
              detail: finding.detail,
            })
          }
          return markers
        }))
        onVideoScanComplete(`${aggregateText}${audioText}`, report.issues, {
          documentName: nextFile.name,
          mediaType: 'Video',
          detectedLanguages: audioTranscript ? 'Multilingual OCR + audio transcript' : 'Multilingual OCR',
        })
        setProgress({ percentage: 100, status: 'Video scan complete' })
        return
      }

      const result = await scanDocument(nextFile, (percentage, status) => {
        setProgress({ percentage, status })
      })
      if (!result.text.trim()) {
        throw new Error('No readable text was detected in this document.')
      }
      onTextExtracted(result.text, {
        documentName: nextFile.name,
        mediaType: nextFile.type === 'application/pdf' || /\.pdf$/i.test(nextFile.name) ? 'PDF' : 'Image',
        detectedLanguages: result.detectedScript,
      })
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
            ? 'MP4 · MOV · WEBM · visual disclaimers ≥ 5s + audio voiceover'
            : 'PDF · PNG · JPG · JPEG · WEBP · local OCR'}</small>
        </span>
        <span className="local-badge"><CheckCircle2 size={12} /> On-device</span>
      </div>
      {(mode === 'video' || mode === 'document') && (
        <div className="language-badges" aria-label="Automatic OCR languages">
          {['English', 'हिन्दी', 'मराठी', 'ગુજરાતી', 'বাংলা', 'தமிழ்', 'संस्कृत'].map((language) => (
            <span key={language}>{language}</span>
          ))}
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
              <VideoAuditPlayer src={previewUrl} markers={videoMarkers} fileName={file.name} />
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
