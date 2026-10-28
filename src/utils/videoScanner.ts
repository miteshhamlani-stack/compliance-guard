export interface VideoFrame {
  timestamp: number
  canvas: HTMLCanvasElement
}

export interface VideoFrameScan {
  timestamp: number
  text: string
}

type ProgressCallback = (percentage: number, status: string) => void

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
      frames.push({ timestamp, canvas })
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

export { formatTimestamp }
