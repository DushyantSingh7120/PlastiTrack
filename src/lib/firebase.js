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
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  serverTimestamp 
} from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

import { 
  getStoredHistory, 
  setStoredHistory,
  getStoredInstitution, 
  setStoredInstitution,
  getStoredTargetGrams,
  setStoredTargetGrams,
  mergeHistoryEntries,
  getIsoDateFromTimestamp,
  dispatchDataUpdate
} from "./storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "plastitrack-e231a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "plastitrack-e231a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "plastitrack-e231a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "700500715665",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:700500715665:web:749eaf521ebb66ed4fb730",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-756PB9MF76"
};

// Initialize Firebase App safely (prevent duplicate initialization in hot-reload & never crash on invalid keys)
let app = null;
let authInstance = null;
let dbInstance = null;
let messagingInstance = null;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  messagingInstance = typeof window !== 'undefined' && 'serviceWorker' in navigator ? getMessaging(app) : null;
} catch (e) {
  console.warn("[Firebase] Initialization warning (running in offline/local fallback mode):", e);
}

export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
export const db = dbInstance;
export const messaging = messagingInstance;

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
  if (!auth) return { success: false, error: "Firebase Authentication is not available." };
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Sync basic profile in Firestore
    if (user && db) {
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
    let friendlyMessage = error.message;
    if (error.code === 'auth/unauthorized-domain') {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
      friendlyMessage = `Domain '${currentHost}' is not authorized in Firebase. Add '${currentHost}' to Firebase Console > Authentication > Settings > Authorized Domains (or open via http://localhost:5173).`;
    } else if (error.code === 'auth/popup-closed-by-user') {
      friendlyMessage = "Sign-in popup was closed before completing.";
    } else if (error.code === 'auth/popup-blocked') {
      friendlyMessage = "Sign-in popup was blocked by the browser. Please allow popups for this site.";
    } else if (error.code === 'auth/api-key-not-valid' || (error.message && error.message.includes('api-key-not-valid'))) {
      const currentHost = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      friendlyMessage = `API Key domain restriction: Google Cloud is blocking requests from '${currentHost}'. To fix, add '${currentHost}/*' to allowed HTTP referrers in Google Cloud Console > APIs & Services > Credentials (or test on your deployed Vercel/Firebase URL).`;
    }
    return { success: false, error: friendlyMessage, code: error.code };
  }
}

/**
 * Sign Out active user
 */
export async function logOutUser() {
  if (!auth) return { success: true };
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
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Restore and merge Cloud Firestore data with local storage
 * Called immediately upon login and on initial auth state resolution
 */
export async function restoreAndMergeFromFirestore(user) {
  if (!user || !user.uid) return { success: false, message: "No authenticated user" };
  if (!db) return { success: false, message: "Cloud Firestore is not initialized." };

  try {
    // 1. Fetch user profile document
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.dailyTargetGrams && Number(data.dailyTargetGrams) > 0) {
        setStoredTargetGrams(Number(data.dailyTargetGrams));
      }
      if (data.institution && typeof data.institution === 'string') {
        setStoredInstitution(data.institution);
      }
    }

    // 2. Fetch dailyLogs subcollection
    const logsCol = collection(db, "users", user.uid, "dailyLogs");
    const logsSnap = await getDocs(logsCol);
    const cloudEntries = [];

    logsSnap.forEach((docSnap) => {
      const log = docSnap.data();
      if (log) {
        const id = docSnap.id;
        const entryIso = log.dateIso || (id.length === 10 && id.includes('-') ? id : null);
        cloudEntries.push({
          ...log,
          dateIso: entryIso || getIsoDateFromTimestamp(log.timestamp || log.date)
        });
      }
    });

    const localHistory = getStoredHistory();
    const mergedHistory = mergeHistoryEntries(localHistory, cloudEntries);
    setStoredHistory(mergedHistory);

    // If local had entries that cloud did not have, upload the merged set so cloud is up to date
    if (mergedHistory.length > cloudEntries.length) {
      debouncedSyncLocalToFirestore(user);
    }

    dispatchDataUpdate();
    return { success: true, count: mergedHistory.length };
  } catch (error) {
    console.error("[Firebase] Error restoring data from Firestore:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Real-time listener for multi-device sync
 * Whenever any device modifies dailyLogs in Firestore, updates local storage automatically
 */
export function subscribeToCloudLogs(user, onUpdate) {
  if (!user || !user.uid || !db) {
    return () => {};
  }

  try {
    const logsCol = collection(db, "users", user.uid, "dailyLogs");
    const unsubscribe = onSnapshot(logsCol, (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }

      const cloudEntries = [];
      snapshot.forEach((docSnap) => {
        const log = docSnap.data();
        if (log) {
          const id = docSnap.id;
          const entryIso = log.dateIso || (id.length === 10 && id.includes('-') ? id : null);
          cloudEntries.push({
            ...log,
            dateIso: entryIso || getIsoDateFromTimestamp(log.timestamp || log.date)
          });
        }
      });

      if (cloudEntries.length > 0) {
        const localHistory = getStoredHistory();
        const mergedHistory = mergeHistoryEntries(localHistory, cloudEntries);
        
        if (JSON.stringify(localHistory) !== JSON.stringify(mergedHistory)) {
          setStoredHistory(mergedHistory);
          dispatchDataUpdate();
          if (typeof onUpdate === 'function') {
            onUpdate(mergedHistory);
          }
        }
      }
    }, (err) => {
      console.warn("[Firebase] Real-time cloud logs listener error:", err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn("[Firebase] Failed to attach cloud listener:", err);
    return () => {};
  }
}

/**
 * Sync local history and counts to Cloud Firestore
 */
export async function syncLocalToFirestore(user) {
  if (!user || !user.uid) return { success: false, message: "No authenticated user" };
  if (!db) return { success: false, message: "Cloud Firestore is not initialized." };

  try {
    const history = getStoredHistory();
    const institution = getStoredInstitution();
    const targetGrams = getStoredTargetGrams();

    // 1. Update user profile document safely
    const userRef = doc(db, "users", user.uid);
    let totalToSave = history.length;
    
    // Guard against blank overwrite: if local has 0, check if cloud has existing logs
    if (totalToSave === 0) {
      try {
        const existingSnap = await getDoc(userRef);
        if (existingSnap.exists() && existingSnap.data()?.totalEntries > 0) {
          totalToSave = existingSnap.data().totalEntries;
        }
      } catch {
        // ignore fallback check
      }
    }

    await setDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      institution,
      dailyTargetGrams: targetGrams,
      totalEntries: totalToSave,
      lastSyncedAt: serverTimestamp()
    }, { merge: true });

    // 2. Upload historical daily log documents using standardized ISO dates
    for (const entry of history) {
      const docId = entry.dateIso || getIsoDateFromTimestamp(entry.timestamp || entry.date);
      if (!docId) continue;
      const logRef = doc(db, "users", user.uid, "dailyLogs", docId);
      await setDoc(logRef, {
        timestamp: entry.timestamp || new Date().toISOString(),
        date: entry.date,
        dateIso: docId,
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
