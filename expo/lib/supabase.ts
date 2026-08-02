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

      // PKCE, explicitly. supabase-js v2 defaults to the IMPLICIT flow, which
      // returns the session as a URL *fragment* (`#access_token=…`) — and a
      // fragment is exactly the part of a redirect a native app cannot rely on
      // receiving. `lib/socialAuth.ts` opens the provider in an auth session
      // and finishes with `exchangeCodeForSession`, which needs a `?code=` on
      // the query string and REFUSES TO RUN AT ALL under the implicit flow
      // ("exchangeCodeForSession is not available in implicit flow"). With the
      // default left in place, Google sign-in could only ever fail: the
      // callback carried no `code`, so the flow returned null and the button
      // did nothing, with no error to see.
      //
      // PKCE also stores its code verifier in `storage` above (AsyncStorage),
      // so the exchange survives the app being backgrounded while the browser
      // sheet is open. Do not remove this line without moving the callback
      // handling off `exchangeCodeForSession` first.
      flowType: 'pkce',
    },
  }
);