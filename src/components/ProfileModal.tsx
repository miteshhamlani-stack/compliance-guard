import { useState } from 'react'
import { X } from 'lucide-react'
import type { UserProfile } from '../context/AuthContext'

interface ProfileModalProps {
  profile: UserProfile | null
  onClose: () => void
  onSave: (fields: Pick<UserProfile, 'first_name' | 'last_name' | 'mobile'>) => Promise<{ error: Error | null }>
}

export function ProfileModal({ profile, onClose, onSave }: ProfileModalProps) {
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSaving(true)
    const form = new FormData(event.currentTarget)
    const result = await onSave({
      first_name: String(form.get('first_name') ?? '').trim() || null,
      last_name: String(form.get('last_name') ?? '').trim() || null,
      mobile: String(form.get('mobile') ?? '').trim() || null,
    })
    setIsSaving(false)
    if (result.error) setError(result.error.message)
    else onClose()
  }

  return (
    <div className="profile-settings-backdrop" role="presentation">
      <section className="profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close profile settings"><X size={17} /></button>
        <p className="eyebrow">ACCOUNT</p>
        <h2 id="profile-settings-title">Profile Settings</h2>
        <form onSubmit={(event) => void submit(event)}>
          <label className="onboarding-field">First Name<input name="first_name" defaultValue={profile?.first_name ?? ''} required /></label>
          <label className="onboarding-field">Last Name<input name="last_name" defaultValue={profile?.last_name ?? ''} required /></label>
          <label className="onboarding-field">Mobile Number<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} defaultValue={profile?.mobile ?? ''} /></label>
          {error && <p className="onboarding-error" role="alert">{error}</p>}
          <button type="submit" className="check-button onboarding-submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save changes'}</button>
        </form>
      </section>
    </div>
  )
}
