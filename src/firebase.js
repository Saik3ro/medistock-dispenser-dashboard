import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, set, get, child, update, remove, onValue, push } from "firebase/database";
import { getAuth } from "firebase/auth";

const env = import.meta.env;

const requiredConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
};

const missingKeys = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  throw new Error(
    `Missing Firebase config environment variables: ${missingKeys.join(", ")}.` +
      "\nPlease add them to your .env file with VITE_ prefixes."
  );
}

const firebaseConfig = {
  apiKey: requiredConfig.apiKey,
  authDomain: requiredConfig.authDomain,
  projectId: requiredConfig.projectId,
  storageBucket: requiredConfig.storageBucket,
  messagingSenderId: requiredConfig.messagingSenderId,
  appId: requiredConfig.appId,
  databaseURL: requiredConfig.databaseURL,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app, firebaseConfig.databaseURL);
const auth = getAuth(app);

export { db, auth, ref, set, get, child, update, remove, onValue, push };
