import { createClient } from 'npm:@supabase/supabase-js@2.117.0'
import { handleStaffPassword } from './api.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
Deno.serve((req) => handleStaffPassword(req, admin))
