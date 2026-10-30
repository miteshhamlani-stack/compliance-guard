import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const TRIAL_LENGTH_DAYS = 30
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || 'mitesh.h.amlani@gmail.com')
  .split(',')
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean)

export interface UserProfile {
  trial_ends_at: string | null
  total_scans: number | null
  entity_type: 'mfd' | 'amc' | null
  arn_number: string | null
  amc_name: string | null
  onboarding_completed: boolean
  subscription_tier: string | null
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  isLoading: boolean
  trialEndsAt: Date | null
  isTrialActive: boolean
  isAdmin: boolean
  isSubscribed: boolean
  totalScans: number
  daysRemainingInTrial: number
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
  updateProfile: (fields: Partial<UserProfile>) => Promise<{ error: Error | null }>
  incrementScanCount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function defaultTrialEnd(): Date {
  const end = new Date()
  end.setDate(end.getDate() + TRIAL_LENGTH_DAYS)
  return end
}

function daysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return TRIAL_LENGTH_DAYS
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
}

function errorFromUnknown(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null)
  const [totalScans, setTotalScans] = useState(0)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))

  const loadProfile = useCallback(async (user: User) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('trial_ends_at, total_scans, entity_type, arn_number, amc_name, onboarding_completed, subscription_tier')
      .eq('id', user.id)
      .maybeSingle<UserProfile>()

    if (error) {
      console.warn('Could not load Supabase user profile. Scanning remains available.', error)
      setTrialEndsAt(defaultTrialEnd())
      setTotalScans(0)
      return
    }

    const profileTrialEnd = data?.trial_ends_at ? new Date(data.trial_ends_at) : defaultTrialEnd()
    const nextProfile = {
      trial_ends_at: profileTrialEnd.toISOString(),
      total_scans: data?.total_scans ?? 0,
      entity_type: data?.entity_type ?? null,
      arn_number: data?.arn_number ?? null,
      amc_name: data?.amc_name ?? null,
      onboarding_completed: data?.onboarding_completed ?? false,
      subscription_tier: data?.subscription_tier ?? null,
    }
    setProfile(nextProfile)
    setTrialEndsAt(profileTrialEnd)
    setTotalScans(data?.total_scans ?? 0)

    if (!data) {
      const { error: insertError } = await supabase.from('user_profiles').upsert({
        id: user.id,
        trial_ends_at: profileTrialEnd.toISOString(),
        total_scans: 0,
        onboarding_completed: false,
        subscription_tier: null,
      })
      if (insertError) {
        console.warn('Could not initialize Supabase trial profile.', insertError)
      }
    }
  }, [])

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('Could not restore Supabase session.', error)
      if (!active) return
      setSession(data.session)
      if (data.session?.user) void loadProfile(data.session.user)
      setIsLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) void loadProfile(nextSession.user)
      else {
        setTrialEndsAt(null)
        setTotalScans(0)
        setProfile(null)
      }
      setIsLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? errorFromUnknown(error, 'Account creation failed.') : null }
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? errorFromUnknown(error, 'Sign-in failed.') : null }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    return { error: error ? errorFromUnknown(error, 'Sign-out failed.') : null }
  }, [])

  const updateProfile = useCallback(async (fields: Partial<UserProfile>) => {
    if (!session?.user) {
      return { error: new Error('You must be signed in to update your profile.') }
    }
    const nextProfile = { ...profile, ...fields }
    const { error } = await supabase.from('user_profiles').upsert({
      id: session.user.id,
      trial_ends_at: nextProfile.trial_ends_at ?? (trialEndsAt ?? defaultTrialEnd()).toISOString(),
      total_scans: nextProfile.total_scans ?? totalScans,
      entity_type: nextProfile.entity_type,
      arn_number: nextProfile.arn_number,
      amc_name: nextProfile.amc_name,
      onboarding_completed: nextProfile.onboarding_completed,
      subscription_tier: nextProfile.subscription_tier,
    })
    if (error) return { error: errorFromUnknown(error, 'Profile update failed.') }
    setProfile({
      trial_ends_at: nextProfile.trial_ends_at ?? null,
      total_scans: nextProfile.total_scans ?? 0,
      entity_type: nextProfile.entity_type ?? null,
      arn_number: nextProfile.arn_number ?? null,
      amc_name: nextProfile.amc_name ?? null,
      onboarding_completed: nextProfile.onboarding_completed ?? false,
      subscription_tier: nextProfile.subscription_tier ?? null,
    })
    return { error: null }
  }, [profile, session?.user, totalScans, trialEndsAt])

  const incrementScanCount = useCallback(async () => {
    const isAdmin = Boolean(
      session?.user?.email &&
      ADMIN_EMAILS.includes(session.user.email.toLowerCase()),
    ) || profile?.subscription_tier === 'admin'
    if (!session?.user || isAdmin) return
    const nextTotal = totalScans + 1
    setTotalScans(nextTotal)
    const { error } = await supabase.from('user_profiles').upsert({
      id: session.user.id,
      trial_ends_at: (trialEndsAt ?? defaultTrialEnd()).toISOString(),
      total_scans: nextTotal,
    })
    if (error) {
      setTotalScans(totalScans)
      console.warn('Could not record scan count. Scanning remains available.', error)
    }
  }, [session?.user, totalScans, trialEndsAt])

  const isAdmin = Boolean(
    session?.user?.email &&
    ADMIN_EMAILS.includes(session.user.email.toLowerCase()),
  ) || profile?.subscription_tier === 'admin'
  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    profile,
    session,
    isLoading,
    trialEndsAt,
    totalScans,
    daysRemainingInTrial: isAdmin ? 9999 : daysRemaining(trialEndsAt),
    isTrialActive: isAdmin || daysRemaining(trialEndsAt) > 0,
    isAdmin,
    isSubscribed: isAdmin,
    signUpWithEmail,
    signInWithEmail,
    signOut,
    updateProfile,
    incrementScanCount,
  }), [session, profile, isLoading, trialEndsAt, totalScans, isAdmin, signUpWithEmail, signInWithEmail, signOut, updateProfile, incrementScanCount])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
