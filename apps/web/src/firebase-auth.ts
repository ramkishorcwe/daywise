import { initializeApp, getApps } from 'firebase/app';
import { indexedDBLocalPersistence, getAuth, setPersistence, signInAnonymously, connectAuthEmulator } from 'firebase/auth';

let initialized = false;
export async function connectFirebase(): Promise<(forceRefresh?: boolean) => Promise<string>> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID, apiKey = import.meta.env.VITE_FIREBASE_API_KEY, appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!projectId || !apiKey || !appId) throw new Error('Firebase browser configuration is missing. Set the public Firebase variables, then restart the web server.');
  const app = getApps()[0] ?? initializeApp({ projectId, apiKey, appId, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com` });
  const auth = getAuth(app);
  if (!initialized) {
    if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: false });
    await setPersistence(auth, indexedDBLocalPersistence); initialized = true;
  }
  await auth.authStateReady(); if (!auth.currentUser) await signInAnonymously(auth);
  return async (forceRefresh = false) => { if (!auth.currentUser) throw new Error('Your Firebase session ended. Reconnect.'); return auth.currentUser.getIdToken(forceRefresh); };
}
