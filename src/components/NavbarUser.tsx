import { useEffect, useRef, useState } from 'react'
import { Crown, LogIn, LogOut, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { AuthModal } from './AuthModal'

function initials(firstName: string | null | undefined, lastName: string | null | undefined, email: string | undefined): string {
  if (firstName || lastName) return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
  return (email?.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 2) || 'U').toUpperCase()
}

export function NavbarUser() {
  const { user, profile, isAdmin, daysRemainingInTrial, signOut, updateProfile } = useAuth()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
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
  return (
    <div className="user-menu" ref={menuRef}>
      <button type="button" className="user-menu-trigger" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-haspopup="menu">
        <span className="user-avatar">{initials(profile?.first_name, profile?.last_name, user.email)}</span>
        {isAdmin ? <span className="admin-badge"><Crown size={12} /> Admin (Lifetime)</span> : <span className="trial-badge">Trial: {daysRemainingInTrial} days</span>}
      </button>
      {isOpen && <div className="user-dropdown" role="menu">
        <div className="user-dropdown-heading"><strong>{fullName}</strong><span>{user.email}</span>{profile?.mobile && <span>{profile.mobile}</span>}</div>
        <div className="user-role-pill">{profile?.entity_type === 'amc' ? 'Fund House / AMC' : 'Mutual Fund Distributor'}</div>
        {isAdmin && <div className="admin-role-switch" aria-label="Switch entity view"><button type="button" className={profile?.entity_type === 'mfd' ? 'active' : ''} onClick={() => void updateProfile({ entity_type: 'mfd', onboarding_completed: true })}><Shield size={11} /> MFD</button><button type="button" className={profile?.entity_type === 'amc' ? 'active' : ''} onClick={() => void updateProfile({ entity_type: 'amc', onboarding_completed: true })}><Shield size={11} /> AMC</button></div>}
        <button type="button" className="profile-settings" role="menuitem" onClick={() => setIsOpen(false)}><UserRound size={14} /> Profile Settings</button>
        <div className="user-dropdown-divider" />
        <button type="button" className="sign-out-menu" role="menuitem" onClick={() => void signOut()}><LogOut size={14} /> Sign Out</button>
      </div>}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  )
}
