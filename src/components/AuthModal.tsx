import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth, type RegistrationProfile } from '../context/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  message?: string
}

function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Invalid email or password.'
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Try signing in.'
  return message
}

export function AuthModal({ isOpen, onClose, message }: AuthModalProps) {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', mobile: '', password: '', entityType: 'mfd' as RegistrationProfile['entity_type'] })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null
  const isSignUp = mode === 'sign-up'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (form.password.length < 6) return setError('Password must be at least 6 characters.')
    if (isSignUp && !/^\d{10}$/.test(form.mobile)) return setError('Mobile number must be exactly 10 digits.')
    setIsSubmitting(true)
    const result = isSignUp
      ? await signUpWithEmail(form.email.trim(), form.password, {
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        mobile: form.mobile,
        entity_type: form.entityType,
      })
      : await signInWithEmail(form.email.trim(), form.password)
    setIsSubmitting(false)
    if (result.error) {
      setError(authErrorMessage(result.error.message))
      return
    }
    onClose()
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <section className={`auth-modal${isSignUp ? ' auth-modal-registration' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close authentication dialog"><X size={17} /></button>
        <div className="auth-tabs" role="tablist">
          <button type="button" className={!isSignUp ? 'active' : ''} onClick={() => { setMode('sign-in'); setError('') }}>Sign In</button>
          <button type="button" className={isSignUp ? 'active' : ''} onClick={() => { setMode('sign-up'); setError('') }}>Create Account</button>
        </div>
        <h2 id="auth-modal-title">{isSignUp ? 'Create your account' : 'Sign in to your account'}</h2>
        <p className="auth-modal-intro">Authentication is handled securely by Supabase.</p>
        {message && <p className="auth-required-message" role="status">{message}</p>}
        <form onSubmit={(event) => void submit(event)}>
          {isSignUp && (
            <div className="auth-name-row">
              <label className="onboarding-field">First Name<input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} required /></label>
              <label className="onboarding-field">Last Name<input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} required /></label>
            </div>
          )}
          <label className="onboarding-field">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></label>
          {isSignUp && <label className="onboarding-field">Mobile Number<input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value.replace(/\D/g, '') })} required /></label>}
          <label className="onboarding-field">Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={6} autoComplete={isSignUp ? 'new-password' : 'current-password'} required /></label>
          {isSignUp && <fieldset className="entity-choice"><legend>Entity Type</legend><label className={form.entityType === 'mfd' ? 'selected' : ''}><input type="radio" checked={form.entityType === 'mfd'} onChange={() => setForm({ ...form, entityType: 'mfd' })} /> Mutual Fund Distributor (MFD)</label><label className={form.entityType === 'amc' ? 'selected' : ''}><input type="radio" checked={form.entityType === 'amc'} onChange={() => setForm({ ...form, entityType: 'amc' })} /> Fund House / AMC</label></fieldset>}
          {error && <p className="onboarding-error" role="alert">{error}</p>}
          <button type="submit" className="check-button onboarding-submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button>
        </form>
      </section>
    </div>
  )
}
