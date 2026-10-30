import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const fallbackSupabaseUrl = 'https://lpbcjbvgswtriptlfdab.supabase.co'
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
let supabaseUrl = fallbackSupabaseUrl

if (configuredSupabaseUrl) {
  try {
    const parsedUrl = new URL(configuredSupabaseUrl)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      supabaseUrl = parsedUrl.toString().replace(/\/$/, '')
    }
  } catch {
    console.warn('Invalid VITE_SUPABASE_URL; using the configured Supabase project URL.')
  }
}

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYmNqYnZnc3d0cmlwdGxmZGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzc4NDMsImV4cCI6MjEwODkxMzg0M30.vwIrsaKdy-uyaLYx9ZGE2ef8pTmctvyCVqeupOT49iQ'

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)
export const isSupabaseConfigured = true
