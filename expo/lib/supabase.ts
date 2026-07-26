import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE is what makes the OAuth flow in `lib/socialAuth.ts` work: the
    // provider hands back a short-lived `?code=` that we exchange for a
    // session, instead of putting tokens in a URL fragment a deep link
    // would have to carry. Do not switch this back to the implicit default.
    flowType: 'pkce',
    // On web the provider redirects the browser back to the app, so let
    // supabase-js pick the session out of the URL itself. On native the
    // redirect lands in `app/auth-callback.tsx` (or in the auth session
    // opened by expo-web-browser), which does the exchange explicitly.
    detectSessionInUrl: Platform.OS === 'web',
  },
});