import {
  hasMultilingualDisclaimer,
  scanCompliance,
  type ComplianceIssue,
  type EntityType,
} from './complianceEngine'

export interface VideoVisualOccurrence {
  startTime: number
  endTime: number
  durationOnScreen: number
  text: string
}

export interface VideoAudioTranscript {
  text: string
  startTime?: number
  endTime?: number
  segments?: Array<{ startTime: number; endTime: number; text: string }>
}

export interface VideoComplianceInput {
  duration: number
  visualOccurrences: VideoVisualOccurrence[]
  audioTranscript: VideoAudioTranscript | null
}

export interface VideoComplianceReport {
  issues: ComplianceIssue[]
  disclaimerOccurrences: VideoVisualOccurrence[]
}

function issue(
  id: string,
  title: string,
  detail: string,
  recommendation: string,
): ComplianceIssue {
  return {
    id,
    category: 'missing-disclaimer',
    severity: 'warning',
    regulatoryClass: 'disclosure-best-practice',
    title,
    detail,
    recommendation,
    citation: 'SEBI Master Circular for Mutual Funds, Clause 13.1 and Sixth Schedule.',
  }
}

export function validateVideoCompliance(
  input: VideoComplianceInput,
  entityType: EntityType = 'mfd',
): VideoComplianceReport {
  const issues: ComplianceIssue[] = []
  const disclaimerOccurrences = input.visualOccurrences.filter((occurrence) =>
    hasMultilingualDisclaimer(occurrence.text),
  )
  let longestDisclaimer = 0
  let runStart = 0
  let previousEnd = 0
  for (const [index, occurrence] of disclaimerOccurrences
    .sort((first, second) => first.startTime - second.startTime)
    .entries()) {
    if (index === 0 || occurrence.startTime > previousEnd + 0.5) {
      runStart = occurrence.startTime
    }
    previousEnd = occurrence.endTime
    longestDisclaimer = Math.max(longestDisclaimer, previousEnd - runStart)
  }

  if (longestDisclaimer < 5) {
    issues.push(issue(
      'video-disclaimer-duration',
      'Video risk disclaimer shown for under 5 seconds',
      'The longest continuous visual statutory disclaimer occurrence was detected for less than 5 seconds.',
      'Keep the multilingual statutory risk warning visible and legible for at least 5 seconds or throughout the end-slate.',
    ))
  }

  const finalFiveSeconds = input.visualOccurrences.filter(
    (occurrence) => occurrence.startTime >= Math.max(0, input.duration - 5),
  )
  if (entityType === 'mfd' && !finalFiveSeconds.some((occurrence) => /AMFI[- ]registered\s*Mutual\s*Fund\s*Distributor/i.test(occurrence.text))) {
    issues.push(issue(
      'video-mfd-tagline',
      'AMFI distributor tagline not detected on the end-slate',
      'The final five seconds did not contain the AMFI-registered Mutual Fund Distributor identification.',
      'Add the applicable AMFI-registered Mutual Fund Distributor tagline to the closing slate for distributor-promoted videos.',
    ))
  }

  for (const occurrence of input.visualOccurrences) {
    for (const finding of scanCompliance(occurrence.text, undefined, entityType).issues.filter((item) => item.severity !== 'info')) {
      issues.push({
        ...finding,
        id: `video-visual-${occurrence.startTime}-${finding.id}`,
        title: `${finding.title} · ${occurrence.startTime.toFixed(1)}s`,
      })
    }
  }

  if (input.audioTranscript?.text.trim()) {
    const audio = input.audioTranscript
    if (!hasMultilingualDisclaimer(audio.text)) {
      issues.push(issue(
        'audio-disclaimer-missing',
        'Audio voiceover statutory warning missing',
        'Promotional voiceover was transcribed, but no supported-language statutory risk warning was detected in the audio.',
        'Include the applicable spoken statutory risk warning in the voiceover.',
      ))
    }
    for (const finding of scanCompliance(audio.text, undefined, entityType).issues.filter((item) => item.severity !== 'info')) {
      issues.push({
        ...finding,
        id: `video-audio-${finding.id}`,
        title: `${finding.title} · voiceover`,
      })
    }
  }

  return { issues, disclaimerOccurrences }
}
