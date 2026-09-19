import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

import { getStoredHistory, getStoredInstitution, getStoredTargetGrams } from "./storage";

// Read configuration from environment variables (.env / .env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Initialize Firebase App safely (prevent duplicate initialization in hot-reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const messaging = typeof window !== 'undefined' && 'serviceWorker' in navigator ? getMessaging(app) : null;

/**
 * Request Notification Permission & Get FCM Token
 */
export async function requestNotificationPermission() {
  if (!messaging) return { success: false, message: "Messaging not supported in this browser." };
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";
      if (!vapidKey) {
        return { success: false, message: "VAPID key is missing. Add VITE_FIREBASE_VAPID_KEY to your environment variables." };
      }
      
      let serviceWorkerRegistration = undefined;
      if ('serviceWorker' in navigator && firebaseConfig.apiKey) {
        const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(firebaseConfig.apiKey)}&projectId=${encodeURIComponent(firebaseConfig.projectId || '')}&messagingSenderId=${encodeURIComponent(firebaseConfig.messagingSenderId || '')}&appId=${encodeURIComponent(firebaseConfig.appId || '')}&authDomain=${encodeURIComponent(firebaseConfig.authDomain || '')}&storageBucket=${encodeURIComponent(firebaseConfig.storageBucket || '')}`;
        serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl);
      }

      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
      if (token) {
        console.log("FCM Token retrieved:", token);
        return { success: true, token };
      } else {
        return { success: false, message: "Failed to generate FCM registration token." };
      }
    } else {
      return { success: false, message: "Notification permission denied by user." };
    }
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger 1-Click Google Sign-In Popup
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Sync basic profile in Firestore
    if (user) {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || "PlastiTrack Student",
        email: user.email,
        photoURL: user.photoURL,
        lastLoginAt: serverTimestamp(),
      }, { merge: true });
    }

    return { success: true, user };
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Sign Out active user
 */
export async function logOutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error("Sign-out Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Subscribe to Auth State changes (persists login across tabs and reloads)
 */
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Sync local history and counts to Cloud Firestore
 */
export async function syncLocalToFirestore(user) {
  if (!user || !user.uid) return { success: false, message: "No authenticated user" };

  try {
    const history = getStoredHistory();
    const institution = getStoredInstitution();
    const targetGrams = getStoredTargetGrams();

    // 1. Update user profile document
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      institution,
      dailyTargetGrams: targetGrams,
      totalEntries: history.length,
      lastSyncedAt: serverTimestamp()
    }, { merge: true });

    // 2. Upload historical daily log documents
    for (const entry of history) {
      if (!entry.date) continue;
      // Sanitize date for document ID (e.g., "2026-09-07" or replace slashes)
      const docId = entry.date.replace(/[/\\]/g, "-");
      const logRef = doc(db, "users", user.uid, "dailyLogs", docId);
      await setDoc(logRef, {
        timestamp: entry.timestamp || new Date().toISOString(),
        date: entry.date,
        totalGrams: Number(entry.totalGrams) || 0,
        totalCostINR: Number(entry.totalCostINR) || 0,
        counts: entry.counts || {},
        maxDecomposition: Number(entry.maxDecomposition) || 450,
        syncedAt: serverTimestamp()
      }, { merge: true });
    }

    return { success: true, count: history.length };
  } catch (error) {
    console.error("Cloud Firestore Sync Failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Debounced Sync to prevent Firebase Quota Exhaustion
 * Waits 3 seconds after the last call before syncing to the cloud.
 */
let syncTimeout = null;
export function debouncedSyncLocalToFirestore(user) {
  if (!user || !user.uid) return;
  
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(async () => {
    console.log("[Firebase] Auto-syncing debounced logs to cloud...");
    await syncLocalToFirestore(user);
    syncTimeout = null;
  }, 3000);
}

export default app;
