import { scanImageCanvas } from './documentScanner'
import type {
  VideoAudioTranscript,
  VideoVisualOccurrence,
} from './videoComplianceValidator'

export interface VideoFrame {
  timestamp: number
  startTime: number
  endTime: number
  durationOnScreen: number
  canvas: HTMLCanvasElement
}

async function extractAudio(
  file: File,
  onProgress?: ProgressCallback,
): Promise<Float32Array | null> {
  onProgress?.(50, 'Extracting audio...')
  const AudioContextConstructor = globalThis.AudioContext
  const OfflineAudioContextConstructor = globalThis.OfflineAudioContext
  if (!AudioContextConstructor || !OfflineAudioContextConstructor) return null

  try {
    const context = new AudioContextConstructor()
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    await context.close()
    const frameCount = Math.ceil(decoded.duration * 16_000)
    const offline = new OfflineAudioContextConstructor(1, frameCount, 16_000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    const audio = rendered.getChannelData(0)
    onProgress?.(58, 'Audio extracted at 16 kHz mono.')
    return audio
  } catch {
    return null
  }
}

interface WhisperChunk {
  timestamp?: [number, number]
  text: string
}

interface WhisperResult {
  text: string
  chunks?: WhisperChunk[]
}

async function transcribeAudio(
  audio: Float32Array | null,
  onProgress?: ProgressCallback,
): Promise<VideoAudioTranscript | null> {
  if (!audio || audio.length === 0) return null
  onProgress?.(60, 'Transcribing voiceover...')
  const { pipeline } = await import('@xenova/transformers')
  const recognizer = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-tiny',
    {
      quantized: true,
      progress_callback: (progress: { progress?: number }) => {
        if (typeof progress.progress === 'number') {
          onProgress?.(60 + Math.round(progress.progress * 0.2), 'Transcribing voiceover...')
        }
      },
    },
  )
  const result = await recognizer(audio, {
    return_timestamps: true,
  }) as WhisperResult
  const chunks = result.chunks ?? []
  return {
    text: result.text.trim(),
    startTime: chunks[0]?.timestamp?.[0],
    endTime: chunks.at(-1)?.timestamp?.[1],
    segments: chunks.flatMap((chunk) => (
      chunk.timestamp
        ? [{ startTime: chunk.timestamp[0], endTime: chunk.timestamp[1], text: chunk.text }]
        : []
    )),
  }
}

export interface VideoFrameScan {
  timestamp: number
  text: string
  startTime: number
  endTime: number
  durationOnScreen: number
}

type ProgressCallback = (percentage: number, status: string) => void

export interface VideoScanResult {
  duration: number
  visualOccurrences: VideoVisualOccurrence[]
  audioTranscript: VideoAudioTranscript | null
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked' | 'error',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent)
      video.removeEventListener('error', handleError)
    }
    const handleEvent = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('The video could not be decoded in this browser.'))
    }
    video.addEventListener(eventName, handleEvent, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

function seekVideo(video: HTMLVideoElement, timestamp: number): Promise<void> {
  if (Math.abs(video.currentTime - timestamp) < 0.001) {
    return Promise.resolve()
  }
  const seeked = waitForVideoEvent(video, 'seeked')
  video.currentTime = timestamp
  return seeked
}

function buildSampleTimes(duration: number): number[] {
  const times = new Set<number>()
  for (let timestamp = 0; timestamp < duration; timestamp += 2) {
    times.add(Number(timestamp.toFixed(2)))
  }
  const slateStart = Math.max(0, duration - 5)
  for (let timestamp = slateStart; timestamp < duration; timestamp += 1) {
    times.add(Number(timestamp.toFixed(2)))
  }
  times.add(Math.max(0, Number((duration - 0.1).toFixed(2))))
  return [...times].sort((first, second) => first - second)
}

export async function extractVideoFrames(
  file: File,
  onProgress?: ProgressCallback,
): Promise<{ duration: number; frames: VideoFrame[] }> {
  const video = globalThis.document.createElement('video')
  const objectUrl = URL.createObjectURL(file)
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  try {
    await waitForVideoEvent(video, 'loadedmetadata')
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('The video has no readable duration.')
    }

    const sampleTimes = buildSampleTimes(video.duration)
    const frames: VideoFrame[] = []
    for (const [index, timestamp] of sampleTimes.entries()) {
      await seekVideo(video, timestamp)
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create a canvas for video scanning.')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push({
        timestamp,
        startTime: timestamp,
        endTime: Math.min(video.duration, timestamp + 2),
        durationOnScreen: Math.min(2, video.duration - timestamp),
        canvas,
      })
      onProgress?.(
        Math.round(((index + 1) / sampleTimes.length) * 45),
        `Analyzing video frame at ${formatTimestamp(timestamp)}...`,
      )
    }
    return { duration: video.duration, frames }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

export async function scanVideo(
  file: File,
  onProgress?: ProgressCallback,
): Promise<VideoScanResult> {
  const extracted = await extractVideoFrames(file, onProgress)
  const visualOccurrences: VideoVisualOccurrence[] = []
  for (const [index, frame] of extracted.frames.entries()) {
    const result = await scanImageCanvas(frame.canvas, (percentage, status) => {
      const progress = 20 + ((index + percentage / 100) / extracted.frames.length) * 30
      onProgress?.(Math.round(progress), status)
    })
    visualOccurrences.push({
      startTime: frame.startTime,
      endTime: frame.endTime,
      durationOnScreen: frame.durationOnScreen,
      text: result.text,
    })
  }
  const audio = await extractAudio(file, onProgress)
  const audioTranscript = await transcribeAudio(audio, onProgress)
  onProgress?.(100, 'Auditing frames...')
  return {
    duration: extracted.duration,
    visualOccurrences,
    audioTranscript,
  }
}

export { formatTimestamp }
