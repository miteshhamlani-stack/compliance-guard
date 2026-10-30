import { Crown, LogIn, LogOut, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AuthModal } from './AuthModal'
import { useState } from 'react'

export function NavbarUser() {
  const { user, profile, isAdmin, daysRemainingInTrial, signOut, updateProfile } = useAuth()
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  async function handleSignOut() {
    const { error } = await signOut()
    if (error) console.warn('Sign-out failed.', error)
  }

  if (!user) {
    return (
      <>
      <button type="button" className="google-sign-in" onClick={() => setIsAuthOpen(true)}>
        <LogIn size={13} />
        Sign In / Register
      </button>
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      </>
    )
  }

  return (
    <>
    <div className="auth-profile">
      <span className="auth-user-name" title={user.email ?? undefined}>{user.email ?? 'Account'}</span>
      {profile?.entity_type && <span className="entity-badge">{profile.entity_type.toUpperCase()}</span>}
      {isAdmin ? (
        <>
          <span className="admin-badge"><Crown size={12} /> Admin (Lifetime)</span>
          <span className="admin-role-switch" aria-label="Switch entity view">
            <button type="button" className={profile?.entity_type === 'mfd' ? 'active' : ''} onClick={() => void updateProfile({ entity_type: 'mfd', onboarding_completed: true })}><Shield size={11} /> MFD</button>
            <button type="button" className={profile?.entity_type === 'amc' ? 'active' : ''} onClick={() => void updateProfile({ entity_type: 'amc', onboarding_completed: true })}><Shield size={11} /> AMC</button>
          </span>
        </>
      ) : (
        <span className="trial-badge">Trial: {daysRemainingInTrial} days remaining</span>
      )}
      <button
        type="button"
        className="auth-icon-button"
        onClick={() => void handleSignOut()}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </div>
    <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  )
}
