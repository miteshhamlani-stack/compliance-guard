import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  || 'https://lpbcjbvgswtriptlfdab.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || 'missing-anon-key'

let supabase: SupabaseClient | null = null

try {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
} catch (error) {
  console.warn('Supabase is unavailable. Authentication remains disabled.', error)
}

export { supabase }
