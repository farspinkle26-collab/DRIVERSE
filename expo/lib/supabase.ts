import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const message =
  'Missing Supabase environment variables. Add EXPO_PUBLIC_SUPABASE_URL and ' +
  'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example) before building.';

if (!supabaseUrl || !supabaseAnonKey) {
  // This module is imported by `app/_layout.tsx`, so it evaluates while Hermes
  // is still loading the bundle — before the first frame. A `throw` here would
  // abort the process on launch (an App Store "crashes on launch" rejection)
  // instead of surfacing anything actionable. Fail loudly in development so a
  // misconfigured build is caught before it ships; in a release build, log and
  // fall back to an inert placeholder client so the app still launches. Every
  // Supabase call in the app is already wrapped in error handling, so a
  // misconfigured build degrades to failed requests rather than a hard crash.
  if (__DEV__) {
    throw new Error(message);
  }
  console.error(`[supabase] ${message}`);
}

export const supabase = createClient(
  supabaseUrl ?? 'https://unconfigured.supabase.co',
  supabaseAnonKey ?? 'unconfigured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);