import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://lpbcjbvgswtriptlfdab.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYmNqYnZnc3d0cmlwdGxmZGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMzc4NDMsImV4cCI6MjEwODkxMzg0M30.vwIrsaKdy-uyaLYx9ZGE2ef8pTmctvyCVqeupOT49iQ'

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)
export const isSupabaseConfigured = true
