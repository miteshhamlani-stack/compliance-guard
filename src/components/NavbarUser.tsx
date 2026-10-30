import { useEffect, useRef, useState } from 'react'
import { Crown, LogIn, LogOut, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AuthModal } from './AuthModal'

function initials(firstName: string | null | undefined, lastName: string | null | undefined, email: string | undefined): string {
  if (firstName || lastName) return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
  return (email?.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 2) || 'U').toUpperCase()
}

export function NavbarUser() {
  const { user, profile, activeEntityType, isAdmin, daysRemainingInTrial, signOut, updateProfile } = useAuth()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [profileError, setProfileError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  if (!user) return <><button type="button" className="google-sign-in" onClick={() => setIsAuthOpen(true)}><LogIn size={13} /> Sign In / Register</button><AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} /></>

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Account'
  async function switchRole(entityType: 'mfd' | 'amc') {
    setProfileError('')
    const { error } = await updateProfile({ entity_type: entityType, onboarding_completed: true })
    if (error) setProfileError(error.message)
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await updateProfile({
      first_name: String(form.get('first_name') ?? '').trim() || null,
      last_name: String(form.get('last_name') ?? '').trim() || null,
      mobile: String(form.get('mobile') ?? '').trim() || null,
    })
    if (error) setProfileError(error.message)
    else setIsSettingsOpen(false)
  }
  return (
    <div className="user-menu" ref={menuRef}>
      <button type="button" className="user-menu-trigger" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="menu">
        <span className="user-avatar">{initials(profile?.first_name, profile?.last_name, user.email)}{isAdmin && <span className="avatar-admin-mark" title="Admin (Lifetime)"><Crown size={9} /></span>}</span>
        {isAdmin ? <span className="admin-badge"><Crown size={12} /> Admin (Lifetime)</span> : <span className="trial-badge">Trial: {daysRemainingInTrial} days</span>}
      </button>
      {isOpen && <div className="user-dropdown" role="menu">
        <div className="user-dropdown-heading"><strong>{fullName}</strong><span>{user.email}</span>{profile?.mobile && <span>{profile.mobile}</span>}</div>
        <div className="user-role-pill">{profile?.entity_type === 'amc' ? 'Fund House / AMC' : 'Mutual Fund Distributor'}</div>
        {isAdmin && <div className="admin-role-switch" aria-label="Switch entity view"><button type="button" className={activeEntityType === 'mfd' ? 'active' : ''} onClick={() => void switchRole('mfd')}><Shield size={11} /> MFD</button><button type="button" className={activeEntityType === 'amc' ? 'active' : ''} onClick={() => void switchRole('amc')}><Shield size={11} /> AMC</button></div>}
        <button type="button" className="profile-settings" role="menuitem" onClick={() => { setIsOpen(false); setProfileError(''); setIsSettingsOpen(true) }}><UserRound size={14} /> Profile Settings</button>
        {profileError && <p className="profile-menu-error" role="alert">{profileError}</p>}
        <div className="user-dropdown-divider" />
        <button type="button" className="sign-out-menu" role="menuitem" onClick={() => void signOut()}><LogOut size={14} /> Sign Out</button>
      </div>}
      {isSettingsOpen && <div className="profile-settings-backdrop" role="presentation">
        <section className="profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
          <button type="button" className="auth-modal-close" onClick={() => setIsSettingsOpen(false)} aria-label="Close profile settings">×</button>
          <p className="eyebrow">ACCOUNT</p>
          <h2 id="profile-settings-title">Profile Settings</h2>
          <form onSubmit={(event) => void saveSettings(event)}>
            <label className="onboarding-field">First Name<input name="first_name" defaultValue={profile?.first_name ?? ''} required /></label>
            <label className="onboarding-field">Last Name<input name="last_name" defaultValue={profile?.last_name ?? ''} required /></label>
            <label className="onboarding-field">Mobile Number<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} defaultValue={profile?.mobile ?? ''} /></label>
            {profileError && <p className="onboarding-error" role="alert">{profileError}</p>}
            <button type="submit" className="check-button onboarding-submit">Save changes</button>
          </form>
        </section>
      </div>}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  )
}
