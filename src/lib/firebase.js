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
  deleteDoc,
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
  getTrackerCounts,
  setTrackerCounts,
  syncTodayHistoryWithCounts,
  getTodayIsoDate,
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

      // Non-destructive guest-to-cloud migration:
      // Check existing cloud daily logs
      const logsCol = collection(db, "users", user.uid, "dailyLogs");
      const cloudSnap = await getDocs(logsCol);
      const cloudDates = new Set();
      cloudSnap.forEach(docSnap => cloudDates.add(docSnap.id));

      const localHistory = getStoredHistory();
      // If there are guest logs for dates that do not exist in cloud, migrate them safely
      for (const entry of localHistory) {
        const docId = entry.dateIso || getIsoDateFromTimestamp(entry.timestamp || entry.date);
        if (docId && !cloudDates.has(docId)) {
          const logRef = doc(db, "users", user.uid, "dailyLogs", docId);
          await setDoc(logRef, {
            timestamp: entry.timestamp || new Date().toISOString(),
            date: entry.date,
            dateIso: docId,
            totalGrams: Number(entry.totalGrams) || 0,
            totalCostINR: Number(entry.totalCostINR) || 0,
            counts: entry.counts || {},
            maxDecomposition: Number(entry.maxDecomposition) || 450,
            syncedAt: serverTimestamp(),
            updatedAt: Date.now()
          }, { merge: true });
        }
      }
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

let isRemoteSyncInProgress = false;

export function getIsRemoteSyncInProgress() {
  return isRemoteSyncInProgress;
}

/**
 * Delete a specific daily log from Cloud Firestore
 */
export async function deleteHistoryEntryFromFirestore(user, dateIso) {
  if (!user || !user.uid || !db || !dateIso) return;
  try {
    const logRef = doc(db, "users", user.uid, "dailyLogs", dateIso);
    await deleteDoc(logRef);
  } catch (err) {
    console.error("[Firebase] Error deleting log from Firestore:", err);
  }
}

/**
 * Save live uncommitted active draft counter state to Firestore user profile
 * Debounced to collapse rapid tap sequences (+, +, +) into a single write
 */
let liveDraftTimeout = null;
export async function saveLiveDraftCounts(user, counts, options = {}) {
  if (!user || !user.uid || !db) return;
  if (liveDraftTimeout) {
    clearTimeout(liveDraftTimeout);
    liveDraftTimeout = null;
  }
  const doSave = async () => {
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        activeDraftCounts: counts || {},
        activeDraftUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.warn("[Firebase] Failed to save live draft counts:", err);
    }
  };

  if (options.immediate) {
    await doSave();
  } else {
    liveDraftTimeout = setTimeout(doSave, 800);
  }
}

/**
 * Restore and merge Cloud Firestore data with local storage
 * Cloud is the master source of truth across devices
 */
export async function restoreAndMergeFromFirestore(user, options = { overwriteLocal: true }) {
  if (!user || !user.uid) return { success: false, message: "No authenticated user" };
  if (!db) return { success: false, message: "Cloud Firestore is not initialized." };

  isRemoteSyncInProgress = true;
  try {
    // 1. Fetch user profile document
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    let cloudDraftCounts = null;
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.dailyTargetGrams && Number(data.dailyTargetGrams) > 0) {
        setStoredTargetGrams(Number(data.dailyTargetGrams));
      }
      if (data.institution && typeof data.institution === 'string') {
        setStoredInstitution(data.institution);
      }
      if (data.activeDraftCounts !== undefined) {
        cloudDraftCounts = data.activeDraftCounts;
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

    const sortedCloud = cloudEntries.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.dateIso || 0).getTime();
      const timeB = new Date(b.timestamp || b.dateIso || 0).getTime();
      return timeA - timeB;
    });

    let finalHistory;
    if (options.overwriteLocal !== false) {
      finalHistory = sortedCloud;
    } else {
      const localHistory = getStoredHistory();
      finalHistory = mergeHistoryEntries(localHistory, sortedCloud);
    }

    setStoredHistory(finalHistory);

    // Synchronize today's tracker counts
    const todayIso = getTodayIsoDate();
    const todayEntry = finalHistory.find(e => e.dateIso === todayIso);
    
    if (cloudDraftCounts && Object.keys(cloudDraftCounts).length > 0) {
      setTrackerCounts(cloudDraftCounts);
      syncTodayHistoryWithCounts(cloudDraftCounts);
    } else if (todayEntry && todayEntry.counts && Object.keys(todayEntry.counts).length > 0) {
      setTrackerCounts(todayEntry.counts);
    } else {
      setTrackerCounts({});
    }

    dispatchDataUpdate();
    return { success: true, count: finalHistory.length };
  } catch (error) {
    console.error("[Firebase] Error restoring data from Firestore:", error);
    return { success: false, error: error.message };
  } finally {
    setTimeout(() => {
      isRemoteSyncInProgress = false;
    }, 400);
  }
}

/**
 * Real-time resilience supervisor for multi-device sync
 * Listens to active drafts (users/{uid}) and daily logs (users/{uid}/dailyLogs)
 * Features auto-reconnection with exponential backoff and auth token refresh
 */
export function subscribeToCloudLogs(user, onUpdate) {
  if (!user || !user.uid || !db) {
    return () => {};
  }

  let active = true;
  let unsubUser = () => {};
  let unsubLogs = () => {};
  let reconnectTimer = null;
  let backoffDelay = 2000;

  const connect = () => {
    if (!active) return;

    try {
      // 1. Listen to activeDraftCounts and settings on user doc
      const userRef = doc(db, "users", user.uid);
      unsubUser = onSnapshot(userRef, (snapshot) => {
        backoffDelay = 2000;
        if (snapshot.metadata.hasPendingWrites) return;

        const data = snapshot.data();
        if (data && data.activeDraftCounts !== undefined) {
          isRemoteSyncInProgress = true;
          try {
            const counts = data.activeDraftCounts || {};
            setTrackerCounts(counts);
            syncTodayHistoryWithCounts(counts);
            dispatchDataUpdate();
          } finally {
            setTimeout(() => {
              isRemoteSyncInProgress = false;
            }, 400);
          }
        }
      }, (err) => {
        handleError(err, 'userDoc');
      });

      // 2. Listen to historical daily logs collection
      const logsCol = collection(db, "users", user.uid, "dailyLogs");
      unsubLogs = onSnapshot(logsCol, (snapshot) => {
        backoffDelay = 2000;
        if (snapshot.metadata.hasPendingWrites) return;

        isRemoteSyncInProgress = true;
        try {
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

          const sortedCloud = cloudEntries.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.dateIso || 0).getTime();
            const timeB = new Date(b.timestamp || b.dateIso || 0).getTime();
            return timeA - timeB;
          });

          setStoredHistory(sortedCloud);

          const todayIso = getTodayIsoDate();
          const todayEntry = sortedCloud.find(e => e.dateIso === todayIso);
          if (todayEntry && todayEntry.counts && Object.keys(todayEntry.counts).length > 0) {
            setTrackerCounts(todayEntry.counts);
          } else if (!todayEntry) {
            const currentCounts = getTrackerCounts();
            const hasCounts = Object.values(currentCounts).some(v => v > 0);
            if (!hasCounts) {
              setTrackerCounts({});
            }
          }

          dispatchDataUpdate();
          if (typeof onUpdate === 'function') {
            onUpdate(sortedCloud);
          }
        } finally {
          setTimeout(() => {
            isRemoteSyncInProgress = false;
          }, 400);
        }
      }, (err) => {
        handleError(err, 'dailyLogs');
      });

    } catch (err) {
      handleError(err, 'connect');
    }
  };

  const handleError = async (err, context) => {
    console.warn(`[Firebase] Real-time listener warning in ${context}:`, err?.code || err?.message || err);
    if (!active) return;

    try { unsubUser(); } catch (_) {}
    try { unsubLogs(); } catch (_) {}

    // Refresh auth token if session expired during background/sleep
    if (auth?.currentUser && (err?.code === 'permission-denied' || err?.code === 'unavailable')) {
      try {
        await auth.currentUser.getIdToken(true);
      } catch (tokenErr) {
        console.warn("[Firebase] Auth token refresh warning:", tokenErr);
      }
    }

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      backoffDelay = Math.min(backoffDelay * 1.5, 30000);
      connect();
    }, backoffDelay);
  };

  connect();

  return () => {
    active = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { unsubUser(); } catch (_) {}
    try { unsubLogs(); } catch (_) {}
  };
}

/**
 * Sync local history and counts to Cloud Firestore
 * Handles both additions, updates, and DELETIONS
 */
export async function syncLocalToFirestore(user) {
  if (!user || !user.uid) return { success: false, message: "No authenticated user" };
  if (!db) return { success: false, message: "Cloud Firestore is not initialized." };

  try {
    const history = getStoredHistory();
    const institution = getStoredInstitution();
    const targetGrams = getStoredTargetGrams();
    const trackerCounts = getTrackerCounts();

    // 1. Update user profile document
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      institution,
      dailyTargetGrams: targetGrams,
      activeDraftCounts: trackerCounts || {},
      totalEntries: history.length,
      lastSyncedAt: serverTimestamp(),
      updatedAt: Date.now()
    }, { merge: true });

    // 2. Fetch existing cloud documents to delete orphaned / cleared entries
    const logsCol = collection(db, "users", user.uid, "dailyLogs");
    const cloudSnap = await getDocs(logsCol);
    
    const validDocIds = new Set();
    for (const entry of history) {
      const docId = entry.dateIso || getIsoDateFromTimestamp(entry.timestamp || entry.date);
      if (docId) validDocIds.add(docId);
    }

    // A. Delete any cloud document that was deleted locally
    for (const docSnap of cloudSnap.docs) {
      if (!validDocIds.has(docSnap.id)) {
        await deleteDoc(docSnap.ref);
      }
    }

    // B. Upload current active historical daily log documents using standardized ISO dates
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
        syncedAt: serverTimestamp(),
        updatedAt: Date.now()
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
 * Waits 1 second after the last call before syncing to the cloud.
 */
let syncTimeout = null;
export function debouncedSyncLocalToFirestore(user) {
  if (!user || !user.uid) return;
  
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(async () => {
    await syncLocalToFirestore(user);
    syncTimeout = null;
  }, 1000);
}

export default app;
