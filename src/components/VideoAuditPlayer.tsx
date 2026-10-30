import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Flag } from 'lucide-react'
import { formatTimestamp } from '../utils/videoScanner'

export interface VideoAuditMarker {
  id: string
  timestamp: number
  type: 'disclaimer' | 'violation'
  label: string
  note: string
  detail?: string
}

interface VideoAuditPlayerProps {
  src: string
  markers: VideoAuditMarker[]
  fileName: string
}

function markerPosition(timestamp: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, (timestamp / duration) * 100)) : 0
}

function markerTime(timestamp: number): string {
  return `${formatTimestamp(timestamp)} (${timestamp.toFixed(2)}s)`
}

export function VideoAuditPlayer({ src, markers, fileName }: VideoAuditPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [activeMarker, setActiveMarker] = useState<string | null>(null)

  useEffect(() => {
    setDuration(0)
    setActiveMarker(null)
  }, [src])

  function seekTo(timestamp: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = timestamp
    video.focus()
  }

  function handleTrackClick(event: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current
    if (!video || duration <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    seekTo(((event.clientX - bounds.left) / bounds.width) * duration)
  }

  return (
    <div className="video-audit-player">
      <video
        ref={videoRef}
        controls
        src={src}
        aria-label={`Preview of ${fileName}`}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
      <div className="audit-timeline" aria-label="Interactive video audit timeline">
        <div
          className="audit-timeline-track"
          role="slider"
          tabIndex={0}
          aria-label="Seek video timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={videoRef.current?.currentTime ?? 0}
          onClick={handleTrackClick}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') seekTo(Math.max(0, (videoRef.current?.currentTime ?? 0) - 1))
            if (event.key === 'ArrowRight') seekTo(Math.min(duration, (videoRef.current?.currentTime ?? 0) + 1))
          }}
        >
          <span className="audit-timeline-base" />
          {markers.map((marker) => (
            <button
              type="button"
              className={`audit-marker ${marker.type}`}
              key={marker.id}
              style={{ left: `${markerPosition(marker.timestamp, duration)}%` }}
              aria-label={`${marker.label} at ${formatTimestamp(marker.timestamp)}`}
              onMouseEnter={() => setActiveMarker(marker.id)}
              onMouseLeave={() => setActiveMarker(null)}
              onFocus={() => setActiveMarker(marker.id)}
              onBlur={() => setActiveMarker(null)}
              onClick={(event) => {
                event.stopPropagation()
                seekTo(marker.timestamp)
              }}
            >
              <span className="audit-marker-icon">
                {marker.type === 'disclaimer' ? <CheckCircle2 size={12} /> : <Flag size={12} />}
              </span>
              {activeMarker === marker.id && (
                <span className="audit-marker-popover" role="tooltip">
                  <strong>{marker.label}</strong>
                  <span>{markerTime(marker.timestamp)}</span>
                  <small>{marker.note}</small>
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="audit-timeline-legend">
          <span><i className="legend-dot disclaimer" /> Mandatory disclaimer</span>
          <span><i className="legend-dot violation" /> Prohibited or unverified claim</span>
          <span className="audit-duration">{formatTimestamp(duration)}</span>
        </div>
      </div>
      <div className="audit-events" aria-label="Video audit events">
        <div className="preview-heading">
          <AlertCircle size={14} />
          <span>Detected timeline events</span>
        </div>
        {markers.length === 0 ? (
          <p className="empty-findings">No disclaimer or prohibited-claim events detected.</p>
        ) : (
          <ul>
            {markers.map((marker) => (
              <li key={marker.id}>
                <button type="button" onClick={() => seekTo(marker.timestamp)}>
                  <span className={`event-icon ${marker.type}`}>
                    {marker.type === 'disclaimer' ? <CheckCircle2 size={13} /> : <Flag size={13} />}
                  </span>
                  <span>
                    <strong>{marker.label}</strong>
                    <small>{markerTime(marker.timestamp)} · {marker.note}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
