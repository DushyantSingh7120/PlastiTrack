import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Cloud, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw, 
  LogIn, 
  LogOut, 
  User,
  AlertCircle,
  BellRing
} from 'lucide-react';
import { 
  signInWithGoogle, 
  logOutUser, 
  subscribeToAuth, 
  syncLocalToFirestore,
  restoreAndMergeFromFirestore,
  requestNotificationPermission
} from '../../lib/firebase';

export default function CloudSyncModal({ isOpen, onClose }) {
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const res = await signInWithGoogle();
    setAuthLoading(false);
    if (!res.success) {
      setAuthError(res.error || "Google Sign-In failed. Check internet connection.");
    } else {
      // 1. Pull & merge from Firestore FIRST to prevent fresh device from overwriting cloud
      setSyncing(true);
      const restoreRes = await restoreAndMergeFromFirestore(res.user);
      setSyncing(false);

      if (restoreRes.success && restoreRes.count > 0) {
        setSyncStatus({ 
          type: 'success', 
          text: `Synchronized ${restoreRes.count} daily logs from Cloud Firestore!` 
        });
      } else {
        // If account is completely new with 0 cloud logs, sync local logs to cloud
        handleCloudSync(res.user);
      }
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    await logOutUser();
    setUser(null);
    setAuthLoading(false);
    setSyncStatus(null);
  };

  const handleCloudSync = async (activeUser = user) => {
    if (!activeUser) return;
    setSyncing(true);
    setSyncStatus(null);
    const res = await syncLocalToFirestore(activeUser);
    setSyncing(false);
    if (res.success) {
      setSyncStatus({ type: 'success', text: `Successfully synced ${res.count} daily logs to Cloud Firestore!` });
    } else {
      setSyncStatus({ type: 'error', text: res.message || "Cloud sync failed." });
    }
  };

  const handleRestoreCloud = async (activeUser = user) => {
    if (!activeUser) return;
    setSyncing(true);
    setSyncStatus(null);
    const res = await restoreAndMergeFromFirestore(activeUser);
    setSyncing(false);
    if (res.success) {
      setSyncStatus({ type: 'success', text: `Restored ${res.count} daily logs from Cloud Firestore!` });
    } else {
      setSyncStatus({ type: 'error', text: res.message || "Failed to retrieve cloud data." });
    }
  };

  const handleNotificationToggle = async () => {
    setNotifyLoading(true);
    setNotifyStatus(null);
    const res = await requestNotificationPermission();
    setNotifyLoading(false);
    
    if (res.success) {
      setNotifyStatus({ type: 'success', text: "Push notifications enabled!" });
    } else {
      setNotifyStatus({ type: 'error', text: res.message || "Failed to enable notifications." });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-md font-body text-stone-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="relative w-full max-w-lg bg-white border border-stone-200 rounded-3xl shadow-2xl p-6 sm:p-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-900">
                <Cloud size={20} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black font-heading text-stone-900">
                  Cloud Persistence &amp; Identity
                </h3>
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">
                  Firebase &amp; Local-First Hybrid Architecture
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="p-2 rounded-xl text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Active User State Banner */}
            {user ? (
              <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName} 
                      className="w-10 h-10 rounded-full border-2 border-emerald-400 object-cover shadow-xs" 
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold font-mono">
                      {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-mono font-bold text-emerald-950 flex items-center gap-1.5">
                      <span>{user.displayName || "PlastiTrack Student"}</span>
                      <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 text-[9px] rounded font-mono font-black">
                        CLOUD ACTIVE
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-emerald-800 truncate max-w-[200px]">
                      {user.email}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={authLoading}
                  type="button"
                  className="px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-mono font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <LogOut size={13} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-stone-100/90 border border-stone-300/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-stone-800 text-white shadow-xs">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-stone-900">
                      Active: Guest Mode (Local-First)
                    </div>
                    <div className="text-[11px] font-mono text-stone-600">
                      Zero-loss sandboxed storage
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  type="button"
                  className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-950 text-white font-mono text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer border border-emerald-500/40"
                >
                  <LogIn size={14} />
                  <span>{authLoading ? "Connecting..." : "Google Sign-In"}</span>
                </button>
              </div>
            )}

            {/* Error Notification */}
            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{authError}</span>
              </div>
            )}

            {/* Sync Feedback */}
            {syncStatus && (
              <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
                syncStatus.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {syncStatus.type === 'success' ? (
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                )}
                <span>{syncStatus.text}</span>
              </div>
            )}

            {/* Storage Architecture Explanation */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 text-xs font-body text-stone-700">
              <h4 className="font-heading font-bold text-stone-900 flex items-center gap-1.5 text-xs sm:text-sm">
                <ShieldCheck size={16} className="text-emerald-700" />
                How PlastiTrack Handles Your Environmental Data
              </h4>
              <p className="leading-relaxed">
                PlastiTrack is built as a <strong>Local-First Hybrid System</strong>:
              </p>
              <ul className="space-y-1.5 font-mono text-[11px] text-stone-600 list-disc list-inside">
                <li><strong className="text-stone-900">Offline Ready:</strong> You can log plastic items anywhere without internet. Everything saves directly to your device.</li>
                <li><strong className="text-stone-900">Cloud Sync:</strong> When signed in with Google, your logs mirror automatically to <strong>Google Cloud Firestore</strong> (<code className="bg-stone-200/80 px-1 py-0.5 rounded text-[10px]">plastitrack-e231a</code>) so you never lose your streaks across phones or laptops.</li>
                <li><strong className="text-stone-900">Strict Privacy:</strong> Student logs are protected by production security rules. No one else can view or edit your personal logs.</li>
              </ul>
            </div>

            {/* Push Notification Toggle */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-heading font-bold text-stone-900 flex items-center gap-1.5 text-xs sm:text-sm">
                    <BellRing size={16} className="text-emerald-700" />
                    Daily Engagement Reminders
                  </h4>
                  <p className="text-[11px] font-mono text-stone-600 mt-1">
                    Receive gentle nudges to log your plastic usage.
                  </p>
                </div>
                <button
                  onClick={handleNotificationToggle}
                  disabled={notifyLoading || (notifyStatus && notifyStatus.type === 'success')}
                  type="button"
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {notifyLoading ? "Wait..." : (notifyStatus && notifyStatus.type === 'success' ? "Enabled" : "Enable")}
                </button>
              </div>
              
              {/* Notification Status */}
              {notifyStatus && (
                <div className={`p-2.5 rounded-xl border text-[11px] font-mono flex items-center gap-2 ${
                  notifyStatus.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {notifyStatus.type === 'success' ? (
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={13} className="shrink-0 text-rose-600" />
                  )}
                  <span>{notifyStatus.text}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-between">
            <span className="text-[10px] font-mono text-stone-500">
              Project: <code className="text-emerald-800 font-bold">plastitrack-e231a</code>
            </span>
            <div className="flex items-center gap-2">
              {user && (
                <>
                  <button
                    onClick={() => handleRestoreCloud()}
                    disabled={syncing}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-mono text-xs font-bold transition cursor-pointer shadow-2xs"
                    title="Pull latest entries from Cloud Firestore"
                  >
                    <Cloud size={13} className={syncing ? "animate-spin text-emerald-600" : "text-emerald-700"} />
                    <span>Pull Cloud</span>
                  </button>
                  <button
                    onClick={() => handleCloudSync()}
                    disabled={syncing}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-xs font-bold transition cursor-pointer shadow-sm"
                    title="Upload local entries to Cloud Firestore"
                  >
                    <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
                    <span>Sync Cloud</span>
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                type="button"
                className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-black text-white font-mono text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
