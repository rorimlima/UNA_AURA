const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'una-aura-auth',
    flowType: 'pkce',
    lock: (name, acquireTimeout, fn) => fn(),
  },
  global: {
    headers: { 'x-client-info': 'una-aura-pwa' },
  },
  // Desabilitar canal de realtime (não usado neste ERP)
  // reduz conexões WebSocket desnecessárias em mobile
  realtime: {
    params: { eventsPerSecond: 2 },
  },
  db: {
    schema: 'public',
  },
});
