/**
 * PlastiTrack Storage Hub (Ponytail Lean Architecture)
 * Centralizes sandboxed localStorage access with error isolation and event broadcasting.
 */

const HISTORY_KEY = 'plastitrack_history';
const TARGET_KEY = 'plastitrack_target_grams';
const INSTITUTION_KEY = 'plastitrack_institution';
const TRACKER_COUNTS_KEY = 'plastitrack_tracker_counts';

export const ITEM_SPECS = {
  pet_bottle_500: { weight: 12, cost: 20, years: 450, name: '500ml Water Bottle' },
  pet_bottle_1000: { weight: 24, cost: 20, years: 450, name: '1000ml (1L) Bottle' },
  chai_cup: { weight: 8, cost: 10, years: 30, name: 'Chai / Coffee Cup' },
  ldpe_bag: { weight: 6, cost: 5, years: 100, name: 'Carry Bag (>120μm)' },
  multi_pouch: { weight: 4, cost: 20, years: 500, name: 'Chip / Snack Pouch (MLP)' },
  takeout_box: { weight: 20, cost: 15, years: 450, name: 'Food Delivery Container' },
  ps_cutlery: { weight: 3, cost: 3, years: 400, name: 'Plastic Cutlery / Straw' }
};

export const normalizeItemId = (id) => {
  if (!id) return id;
  const map = {
    'pet_bottle': 'pet_bottle_500',
    'pet-bottle-500': 'pet_bottle_500',
    'pet-bottle-1000': 'pet_bottle_1000',
    'carry_bag': 'ldpe_bag',
    'carry-bag': 'ldpe_bag',
    'chai-cup': 'chai_cup',
    'snack-wrapper': 'multi_pouch',
    'milk-pouch': 'ldpe_bag',
    'meal-container': 'takeout_box',
    'straw': 'ps_cutlery'
  };
  return map[id] || id;
};

export const normalizeCounts = (counts) => {
  if (!counts || typeof counts !== 'object') return {};
  const normalized = {};
  for (const [key, val] of Object.entries(counts)) {
    const normKey = normalizeItemId(key);
    normalized[normKey] = (normalized[normKey] || 0) + (Number(val) || 0);
  }
  return normalized;
};

export const computeTotalsFromCounts = (counts) => {
  let totalGrams = 0;
  let totalCostINR = 0;
  let maxDecomposition = 0;

  if (counts && typeof counts === 'object') {
    for (const [rawId, qty] of Object.entries(counts)) {
      const id = normalizeItemId(rawId);
      const count = Number(qty) || 0;
      if (count > 0 && ITEM_SPECS[id]) {
        totalGrams += count * ITEM_SPECS[id].weight;
        totalCostINR += count * ITEM_SPECS[id].cost;
        if (ITEM_SPECS[id].years > maxDecomposition) {
          maxDecomposition = ITEM_SPECS[id].years;
        }
      }
    }
  }

  return { totalGrams, totalCostINR, maxDecomposition };
};

export const getTodayIsoDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getIsoDateFromTimestamp = (timestamp) => {
  if (!timestamp) return getTodayIsoDate();
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return getTodayIsoDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isSameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  if (typeof d1 === 'string' && typeof d2 === 'string' && d1.length === 10 && d2.length === 10 && d1.includes('-') && d2.includes('-')) {
    if (d1 === d2) return true;
  }
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export const dispatchDataUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('plastitrack-data-updated'));
    window.dispatchEvent(new Event('storage'));
  }
};

export const getStoredHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const setStoredHistory = (history) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(Array.isArray(history) ? history : []));
    dispatchDataUpdate();
  } catch (err) {
    console.error('Storage write error:', err);
  }
};

export const mergeHistoryEntries = (localList = [], cloudList = []) => {
  const map = new Map();

  const getEntryKey = (entry) => {
    if (!entry) return null;
    if (entry.dateIso) return entry.dateIso;
    if (entry.timestamp) return getIsoDateFromTimestamp(entry.timestamp);
    if (entry.date) return entry.date.replace(/[/\\]/g, '-');
    return null;
  };

  // Add local entries first
  (Array.isArray(localList) ? localList : []).forEach((entry) => {
    const key = getEntryKey(entry);
    if (key) {
      map.set(key, { ...entry, dateIso: key });
    }
  });

  // Merge cloud entries
  (Array.isArray(cloudList) ? cloudList : []).forEach((cloudEntry) => {
    const key = getEntryKey(cloudEntry);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, { ...cloudEntry, dateIso: key });
    } else {
      const existing = map.get(key);
      const cloudGrams = Number(cloudEntry.totalGrams) || 0;
      const localGrams = Number(existing.totalGrams) || 0;
      
      const cloudTime = cloudEntry.syncedAt?.seconds ? cloudEntry.syncedAt.seconds * 1000 : new Date(cloudEntry.timestamp || 0).getTime();
      const localTime = new Date(existing.timestamp || 0).getTime();

      if (cloudGrams >= localGrams || cloudTime > localTime) {
        map.set(key, {
          ...existing,
          ...cloudEntry,
          dateIso: key,
          counts: { ...(existing.counts || {}), ...(cloudEntry.counts || {}) }
        });
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.timestamp || a.dateIso || 0).getTime();
    const timeB = new Date(b.timestamp || b.dateIso || 0).getTime();
    return timeA - timeB;
  });
};

export const getTodayHistoryEntry = () => {
  const history = getStoredHistory();
  if (!Array.isArray(history) || history.length === 0) return null;
  const today = new Date();
  const todayStr = today.toLocaleDateString();
  const todayIso = getTodayIsoDate();
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryDate = entry?.timestamp ? new Date(entry.timestamp) : null;
    if (
      entry?.dateIso === todayIso ||
      (entryDate && isSameDay(entryDate, today)) || 
      entry?.date === todayStr
    ) {
      return entry;
    }
  }
  return null;
};

export const getLatestHistoryEntry = () => {
  const history = getStoredHistory();
  if (!Array.isArray(history) || history.length === 0) return null;
  return history[history.length - 1];
};

export const removeHistoryEntryByIndex = (index) => {
  const history = getStoredHistory();
  if (Array.isArray(history) && index >= 0 && index < history.length) {
    history.splice(index, 1);
    setStoredHistory(history);
    setTrackerCounts({});
    dispatchDataUpdate();
    return true;
  }
  return false;
};

export const syncTodayHistoryWithCounts = (rawCounts) => {
  const counts = normalizeCounts(rawCounts);
  const { totalGrams, totalCostINR, maxDecomposition } = computeTotalsFromCounts(counts);
  const history = getStoredHistory();
  const today = new Date();
  const todayStr = today.toLocaleDateString();
  const todayIso = getTodayIsoDate();
  const nowIso = today.toISOString();

  let targetIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryDate = entry?.timestamp ? new Date(entry.timestamp) : null;
    if (
      entry?.dateIso === todayIso ||
      (entryDate && isSameDay(entryDate, today)) || 
      entry?.date === todayStr
    ) {
      targetIdx = i;
      break;
    }
  }

  // If not matched strictly by today's date, target the latest entry in history
  if (targetIdx === -1 && history.length > 0) {
    targetIdx = history.length - 1;
  }

  if (totalGrams <= 0) {
    if (targetIdx !== -1) {
      history.splice(targetIdx, 1);
      setStoredHistory(history);
    }
    return;
  }

  const updatedEntry = {
    timestamp: targetIdx !== -1 && history[targetIdx]?.timestamp ? history[targetIdx].timestamp : nowIso,
    date: targetIdx !== -1 && history[targetIdx]?.date ? history[targetIdx].date : todayStr,
    dateIso: targetIdx !== -1 && history[targetIdx]?.dateIso ? history[targetIdx].dateIso : todayIso,
    counts,
    totalGrams,
    totalCostINR,
    maxDecomposition: maxDecomposition || 450
  };

  if (targetIdx !== -1) {
    history[targetIdx] = updatedEntry;
  } else {
    history.push(updatedEntry);
  }

  setStoredHistory(history);
};

export const quickAddTrackerItem = (itemId, qty = 1) => {
  const normId = normalizeItemId(itemId);
  const counts = getTrackerCounts();
  counts[normId] = (counts[normId] || 0) + qty;
  setTrackerCounts(counts);
  syncTodayHistoryWithCounts(counts);
  dispatchDataUpdate();
};

export const appendHistoryEntry = (entry) => {
  const history = getStoredHistory();
  history.push(entry);
  setStoredHistory(history);
};

export const getStoredTargetGrams = () => {
  try {
    const val = Number(localStorage.getItem(TARGET_KEY));
    return val > 0 ? val : 33;
  } catch {
    return 33;
  }
};

export const setStoredTargetGrams = (grams) => {
  try {
    localStorage.setItem(TARGET_KEY, String(grams));
    dispatchDataUpdate();
  } catch (err) {
    console.error('Storage write error:', err);
  }
};

export const getStoredInstitution = () => {
  try {
    return localStorage.getItem(INSTITUTION_KEY) || 'LPU Campus // Central Hostels';
  } catch {
    return 'LPU Campus // Central Hostels';
  }
};

export const setStoredInstitution = (name) => {
  try {
    localStorage.setItem(INSTITUTION_KEY, name);
    dispatchDataUpdate();
  } catch (err) {
    console.error('Storage write error:', err);
  }
};

export const getTrackerCounts = () => {
  try {
    const raw = localStorage.getItem(TRACKER_COUNTS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeCounts(parsed);
      }
    }

    // Fallback only if tracker counts key was never created in localStorage
    const todayEntry = getTodayHistoryEntry();
    if (todayEntry && todayEntry.counts) {
      const countsToUse = normalizeCounts(todayEntry.counts);
      const hasPositive = Object.values(countsToUse).some((v) => v > 0);
      if (hasPositive) {
        localStorage.setItem(TRACKER_COUNTS_KEY, JSON.stringify(countsToUse));
        return countsToUse;
      }
    }

    return {};
  } catch {
    return {};
  }
};

export const setTrackerCounts = (counts) => {
  try {
    localStorage.setItem(TRACKER_COUNTS_KEY, JSON.stringify(counts || {}));
  } catch (err) {
    console.error('Tracker counts storage error:', err);
  }
};

export const clearAllStoredData = () => {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(TRACKER_COUNTS_KEY);
    localStorage.removeItem('plastitrack_logs');
    localStorage.removeItem('plastitrack_is_demo');
    dispatchDataUpdate();
  } catch (err) {
    console.error('Clear data error:', err);
  }
};

export const getFullBackupData = () => {
  return {
    history: getStoredHistory(),
    trackerCounts: getTrackerCounts(),
    targetGrams: getStoredTargetGrams(),
    institution: getStoredInstitution(),
    exportedAt: new Date().toISOString()
  };
};
