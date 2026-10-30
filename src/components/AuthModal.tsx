import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

function authErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Invalid email or password.'
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Try signing in.'
  if (/password/i.test(message) && /6|short|characters/i.test(message)) return 'Password must be at least 6 characters.'
  return message
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setIsSubmitting(true)
    const result = mode === 'sign-in'
      ? await signInWithEmail(email.trim(), password)
      : await signUpWithEmail(email.trim(), password)
    setIsSubmitting(false)
    if (result.error) {
      setError(authErrorMessage(result.error.message))
      return
    }
    if (mode === 'sign-up') {
      setMessage('Account created. Check your email if confirmation is required.')
    }
    onClose()
  }

  return (
    <div className="auth-modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Close authentication dialog">
          <X size={17} />
        </button>
        <p className="eyebrow">{mode === 'sign-in' ? 'WELCOME BACK' : 'GET STARTED'}</p>
        <h2 id="auth-modal-title">{mode === 'sign-in' ? 'Sign in to your account' : 'Create your account'}</h2>
        <p className="auth-modal-intro">Authentication is handled securely by Supabase.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="onboarding-field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label className="onboarding-field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required /></label>
          {error && <p className="onboarding-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}
          <button type="submit" className="check-button onboarding-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button type="button" className="auth-mode-toggle" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(''); setMessage('') }}>
          {mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </div>
  )
}
