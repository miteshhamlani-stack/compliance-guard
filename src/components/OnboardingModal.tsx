import { useState } from 'react'
import { Building2, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth, type UserProfile } from '../context/AuthContext'

export function OnboardingModal() {
  const { user, profile, updateProfile } = useAuth()
  const [entityType, setEntityType] = useState<UserProfile['entity_type']>(profile?.entity_type ?? 'mfd')
  const [arnNumber, setArnNumber] = useState(profile?.arn_number ?? '')
  const [amcName, setAmcName] = useState(profile?.amc_name ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  if (!user || !profile || profile.onboarding_completed) return null

  async function saveProfile() {
    setIsSaving(true)
    setError('')
    const { error: updateError } = await updateProfile({
      entity_type: entityType,
      arn_number: entityType === 'mfd' ? arnNumber.trim() || null : null,
      amc_name: entityType === 'amc' ? amcName.trim() || null : null,
      onboarding_completed: true,
    })
    setIsSaving(false)
    if (updateError) setError(updateError.message)
  }

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-icon"><ShieldCheck size={22} /></div>
        <p className="eyebrow">WELCOME TO COMPLIANCE GUARD</p>
        <h2 id="onboarding-title">Tell us about your entity</h2>
        <p className="onboarding-intro">We’ll calibrate regulatory checks and certificates for your role.</p>
        <div className="onboarding-options">
          <button type="button" className={`onboarding-option${entityType === 'mfd' ? ' selected' : ''}`} onClick={() => setEntityType('mfd')}>
            <UserRound size={18} />
            <span><strong>Mutual Fund Distributor (MFD)</strong><small>Distributor identification and ARN checks</small></span>
          </button>
          <button type="button" className={`onboarding-option${entityType === 'amc' ? ' selected' : ''}`} onClick={() => setEntityType('amc')}>
            <Building2 size={18} />
            <span><strong>Fund House / AMC</strong><small>Scheme Risk-o-meter and fund-house disclosures</small></span>
          </button>
        </div>
        {entityType === 'mfd' ? (
          <label className="onboarding-field">ARN number <span>(optional)</span><input value={arnNumber} onChange={(event) => setArnNumber(event.target.value)} placeholder="e.g. ARN-12345" /></label>
        ) : (
          <label className="onboarding-field">AMC entity name <span>(optional)</span><input value={amcName} onChange={(event) => setAmcName(event.target.value)} placeholder="e.g. Example Asset Management Co." /></label>
        )}
        {error && <p className="onboarding-error" role="alert">{error}</p>}
        <button type="button" className="check-button onboarding-submit" onClick={() => void saveProfile()} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save and continue'}
        </button>
      </section>
    </div>
  )
}
