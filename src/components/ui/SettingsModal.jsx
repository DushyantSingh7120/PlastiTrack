import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Trash2, Download, Check, Database, ShieldCheck, Scale, FileText } from 'lucide-react';
import { 
  getStoredTargetGrams, 
  setStoredTargetGrams, 
  getStoredInstitution, 
  setStoredInstitution, 
  clearAllStoredData, 
  getFullBackupData 
} from '../../lib/storage';
import { auth, syncLocalToFirestore } from '../../lib/firebase';

export default function SettingsModal({ isOpen, onClose, onOpenLegal }) {
  if (!isOpen) return null;
  return <SettingsModalDialog onClose={onClose} onOpenLegal={onOpenLegal} />;
}

function SettingsModalDialog({ onClose, onOpenLegal }) {
  const [targetGrams, setTargetGrams] = useState(() => getStoredTargetGrams());
  const [institution, setInstitution] = useState(() => getStoredInstitution());
  const [resetConfirm, setResetConfirm] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setStoredTargetGrams(targetGrams);
    setStoredInstitution(institution);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleExportJSON = () => {
    const backupData = getFullBackupData();
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plastitrack_audit_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearData = async () => {
    clearAllStoredData();
    setResetConfirm(false);
    onClose();
    if (auth?.currentUser) {
      await syncLocalToFirestore(auth.currentUser);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="relative w-full max-w-lg bg-white border border-stone-200 rounded-3xl shadow-2xl p-6 sm:p-8 font-body text-stone-900"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-stone-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-900">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black font-heading text-stone-900">
                  System Preferences &amp; Telemetry Targets
                </h3>
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-widest block">
                  Configuration &amp; Storage Controls
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

          <div className="space-y-6">
            {/* Daily Target Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-mono font-bold text-stone-800">
                  Daily Plastic Footprint Target (Grams)
                </label>
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                  {targetGrams} g / day
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="2"
                value={targetGrams}
                onChange={(e) => setTargetGrams(Number(e.target.value))}
                className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] font-mono text-stone-500 mt-1">
                <span>10g (Zero SUP)</span>
                <span className="text-emerald-700 font-bold">34g (CPCB Urban Benchmark)</span>
                <span>60g (High Volume)</span>
              </div>
            </div>

            {/* Institution / Context */}
            <div>
              <label className="text-xs font-mono font-bold text-stone-800 block mb-1.5">
                Audit Setting / Campus Zone
              </label>
              <select
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 text-xs font-mono text-stone-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="Campus Hostel">University Hostel / Residential</option>
                <option value="Central Canteen / Food Court">Central Canteen / Food Court</option>
                <option value="Off-Campus PG / Apartment">Off-Campus PG / Apartment</option>
                <option value="Home / Commuter">Home / Commuter</option>
              </select>
            </div>

            {/* Storage Architecture Mode */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-stone-900 flex items-center gap-1.5">
                  <Database size={14} className="text-emerald-700" />
                  Storage Engine
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                  LOCAL-FIRST (ACTIVE)
                </span>
              </div>
              <p className="text-xs text-stone-600 font-mono leading-relaxed">
                Logs are cached locally on this device via high-speed WebStorage with zero latency and complete student privacy.
              </p>
            </div>

            {/* Statutory Compliance & Policies */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-700" />
                  Statutory &amp; Data Compliance
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-200 text-stone-700 font-bold">
                  DPDP ACT 2023
                </span>
              </div>
              <p className="text-xs text-stone-600 font-mono leading-relaxed">
                Review data protection rights under the Digital Personal Data Protection Act 2023, MIT academic terms, and CPCB mathematical derivations.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onOpenLegal && onOpenLegal('privacy')}
                  type="button"
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-50 text-emerald-950 border border-stone-300 hover:border-emerald-300 text-[11px] font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <ShieldCheck size={13} className="text-emerald-700" />
                  <span>Privacy Policy</span>
                </button>
                <button
                  onClick={() => onOpenLegal && onOpenLegal('terms')}
                  type="button"
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-950 border border-stone-300 hover:border-amber-300 text-[11px] font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Scale size={13} className="text-amber-700" />
                  <span>Terms of Use</span>
                </button>
                <button
                  onClick={() => onOpenLegal && onOpenLegal('methodology')}
                  type="button"
                  className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-teal-50 text-teal-950 border border-stone-300 hover:border-teal-300 text-[11px] font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileText size={13} className="text-teal-700" />
                  <span>Methodology</span>
                </button>
              </div>
            </div>

            {/* Backup & Reset Actions */}
            <div className="pt-2 border-t border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleExportJSON}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-mono font-bold transition cursor-pointer border border-stone-300"
                >
                  <Download size={14} />
                  <span>Export JSON Backup</span>
                </button>

                {!resetConfirm ? (
                  <button
                    onClick={() => setResetConfirm(true)}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-mono font-bold transition cursor-pointer border border-red-200"
                  >
                    <Trash2 size={14} />
                    <span>Reset All Logs</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-red-600 font-bold">Confirm purge?</span>
                    <button
                      onClick={handleClearData}
                      type="button"
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-black"
                    >
                      Yes, Clear
                    </button>
                    <button
                      onClick={() => setResetConfirm(false)}
                      type="button"
                      className="px-2 py-1 rounded-lg bg-stone-200 text-stone-700 text-xs font-mono"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
            <span className="text-[11px] font-mono text-emerald-700 font-bold">
              {savedSuccess ? "Saved successfully!" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                type="button"
                className="px-4 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-xs font-mono transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                type="button"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs font-black transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
