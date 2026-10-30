import { useEffect, useRef, useState } from 'react'
import { Crown, LogIn, LogOut, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AuthModal } from './AuthModal'
import { ProfileModal } from './ProfileModal'

function initials(firstName: string | null | undefined, lastName: string | null | undefined, email: string | undefined): string {
  if (firstName || lastName) return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
  return (email?.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 2) || 'U').toUpperCase()
}

export function NavbarUser() {
  const { user, profile, activeEntityType, isAdmin, daysRemainingInTrial, signOut, updateProfile } = useAuth()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [localEntityType, setLocalEntityType] = useState<'mfd' | 'amc'>(activeEntityType)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setLocalEntityType(activeEntityType), [activeEntityType])
  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  if (!user) return <><button type="button" className="google-sign-in" onClick={() => setIsAuthOpen(true)}><LogIn size={13} /> Sign In / Register</button><AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} /></>

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Account'
  const activeCategory = localEntityType === 'amc' ? 'Asset Management Company (AMC)' : 'Mutual Fund Distributor (MFD)'

  function switchRole(entityType: 'mfd' | 'amc') {
    setLocalEntityType(entityType)
    void updateProfile({ entity_type: entityType, onboarding_completed: true })
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button type="button" className="user-menu-trigger" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="menu" aria-label="Open profile menu">
        <span className="user-avatar">{initials(profile?.first_name, profile?.last_name, user.email)}{isAdmin && <span className="avatar-admin-mark" title="Admin (Lifetime)"><Crown size={9} /></span>}</span>
      </button>
      {isOpen && <div className="user-dropdown" role="menu">
        <div className="user-dropdown-heading"><strong>{fullName}</strong><span>{user.email}</span>{profile?.mobile && <span>{profile.mobile}</span>}</div>
        {isAdmin ? <span className="admin-badge dropdown-status"><Crown size={12} /> Admin (Lifetime)</span> : <span className="trial-badge dropdown-status">Trial: {daysRemainingInTrial} days</span>}
        <div className="user-role-pill">{activeCategory}</div>
        {isAdmin && <div className="admin-role-switch" aria-label="Switch entity view"><button type="button" className={localEntityType === 'mfd' ? 'active' : ''} onClick={() => switchRole('mfd')}><Shield size={11} /> MFD</button><button type="button" className={localEntityType === 'amc' ? 'active' : ''} onClick={() => switchRole('amc')}><Shield size={11} /> AMC</button></div>}
        <button type="button" className="profile-settings" role="menuitem" onClick={() => { setIsOpen(false); setIsSettingsOpen(true) }}><UserRound size={14} /> Profile Settings</button>
        <div className="user-dropdown-divider" />
        <button type="button" className="sign-out-menu" role="menuitem" onClick={() => void signOut()}><LogOut size={14} /> Sign Out</button>
      </div>}
      {isSettingsOpen && <ProfileModal profile={profile} onClose={() => setIsSettingsOpen(false)} onSave={(fields) => updateProfile(fields)} />}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  )
}
