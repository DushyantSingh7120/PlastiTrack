import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Zap, Coffee, Droplets, ShoppingBag, Utensils } from 'lucide-react';
import { kineticHover, kineticTap } from '../../lib/motion';
import { quickAddTrackerItem, getTrackerCounts } from '../../lib/storage';
import { auth, saveLiveDraftCounts, debouncedSyncLocalToFirestore } from '../../lib/firebase';

const FREQUENT_ITEMS = [
  {
    id: 'pet_bottle_500',
    label: 'Water Bottle',
    resin: 'PET #1',
    weight: 12,
    cost: 20,
    icon: Droplets,
    badgeBg: 'bg-emerald-100 text-emerald-800'
  },
  {
    id: 'chai_cup',
    label: 'Chai / Coffee Cup',
    resin: 'Paper/PE',
    weight: 8,
    cost: 10,
    icon: Coffee,
    badgeBg: 'bg-amber-100 text-amber-800'
  },
  {
    id: 'ldpe_bag',
    label: 'Carry Bag',
    resin: 'LDPE #4',
    weight: 6,
    cost: 5,
    icon: ShoppingBag,
    badgeBg: 'bg-teal-100 text-teal-800'
  },
  {
    id: 'takeout_box',
    label: 'Food Container',
    resin: 'PP #5',
    weight: 20,
    cost: 15,
    icon: Utensils,
    badgeBg: 'bg-blue-100 text-blue-800'
  }
];

export default function FrequentItemsShelf() {
  const [loggedItem, setLoggedItem] = useState(null);

  const handleQuickLog = (item) => {
    try {
      quickAddTrackerItem(item.id, 1);
      if (auth?.currentUser) {
        const counts = getTrackerCounts();
        saveLiveDraftCounts(auth.currentUser, counts);
        debouncedSyncLocalToFirestore(auth.currentUser);
      }
      setLoggedItem(`${item.label} (+${item.weight}g)`);
      setTimeout(() => setLoggedItem(null), 2400);
    } catch (e) {
      console.error('Quick-log failed:', e);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white/35 backdrop-blur-xl border border-white/60 shadow-sm transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2 font-mono text-xs text-stone-900 font-bold">
          <Zap size={15} className="text-amber-600 animate-pulse" />
          <span className="uppercase tracking-wider">1-CLICK CAMPUS QUICK-SHELF // ZERO-FRICTION LOGGING</span>
        </div>

        <AnimatePresence>
          {loggedItem && (
            <motion.span
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-700 text-white font-mono text-xs font-bold shadow-sm"
            >
              <Check size={13} />
              <span>Logged {loggedItem}!</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* 4 Interactive Quick-Log Action Chips with Expanded Hit Targets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {FREQUENT_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              whileHover={kineticHover}
              whileTap={kineticTap}
              onClick={() => handleQuickLog(item)}
              type="button"
              className="relative before:absolute before:-inset-2 before:content-[''] p-3 rounded-xl bg-white/60 hover:bg-white/90 border border-white/80 hover:border-emerald-600/60 shadow-2xs hover:shadow-md transition-all flex items-center justify-between gap-2 text-left cursor-pointer group"
              title={`Quick log +1 ${item.label} (+${item.weight}g, ₹${item.cost})`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-stone-100/90 group-hover:bg-emerald-100 group-hover:text-forest text-stone-700 transition-colors shrink-0">
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <div className="font-heading font-bold text-xs text-stone-900 truncate">
                    {item.label}
                  </div>
                  <div className="font-mono text-[10px] text-stone-500">
                    +{item.weight}g · ₹{item.cost}
                  </div>
                </div>
              </div>

              <div className="h-6 w-6 rounded-full bg-emerald-50 text-emerald-800 group-hover:bg-emerald-700 group-hover:text-white flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                <Plus size={13} strokeWidth={3} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
