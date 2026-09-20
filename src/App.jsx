import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ClickRippleProvider from './components/ui/ClickRippleProvider';
import ErrorBoundary from './components/ui/ErrorBoundary';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './features/dashboard/DashboardPage';
import DailyTrackerPage from './features/tracker/DailyTrackerPage';
import DailyInsightsPage from './features/insights/DailyInsightsPage';
import SundayReviewPage from './features/sunday-review/SundayReviewPage';
import AlternativesPage from './features/alternatives/AlternativesPage';
import LandingPage from './features/landing/LandingPage';
import ResearchDocumentationPage from './features/docs/ResearchDocumentationPage';
import { 
  auth, 
  debouncedSyncLocalToFirestore, 
  subscribeToAuth, 
  restoreAndMergeFromFirestore, 
  subscribeToCloudLogs 
} from './lib/firebase';

function App() {
  React.useEffect(() => {
    // Purge any stale firestore cache left over by previous Service Worker configurations
    if (typeof caches !== 'undefined') {
      caches.delete('firebase-firestore-cache').catch(() => {});
    }

    let cloudUnsub = () => {};

    // 1. Listen for auth changes: when logged in, restore cloud data and listen to live updates
    const authUnsub = subscribeToAuth((user) => {
      cloudUnsub();
      if (user) {
        restoreAndMergeFromFirestore(user, { overwriteLocal: true });
        cloudUnsub = subscribeToCloudLogs(user);
      }
    });

    // 2. Debounced auto-upload when local data changes
    const handleDataUpdate = () => {
      if (auth?.currentUser) {
        debouncedSyncLocalToFirestore(auth.currentUser);
      }
    };
    window.addEventListener('plastitrack-data-updated', handleDataUpdate);

    return () => {
      authUnsub();
      cloudUnsub();
      window.removeEventListener('plastitrack-data-updated', handleDataUpdate);
    };
  }, []);
  return (
    <ErrorBoundary>
      <ClickRippleProvider>
      {/* Global 3D Environmental Background */}
      <motion.div 
        className="fixed inset-0 w-full h-full bg-cover bg-center -z-10 pointer-events-none"
        style={{ backgroundImage: "url('/backgrounds/hero_water_caustics.jpg')" }}
        animate={{
          scale: [1, 1.04, 1],
          opacity: 1
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: "reverse",
          ease: "easeInOut"
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route 
            path="/dashboard" 
            element={
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            } 
          />
          <Route 
            path="/tracker" 
            element={
              <DashboardLayout>
                <DailyTrackerPage />
              </DashboardLayout>
            } 
          />
          <Route 
            path="/alternatives" 
            element={
              <DashboardLayout>
                <AlternativesPage />
              </DashboardLayout>
            } 
          />
          <Route 
            path="/insights" 
            element={
              <DashboardLayout>
                <DailyInsightsPage />
              </DashboardLayout>
            } 
          />
          <Route 
            path="/sunday-review" 
            element={
              <DashboardLayout>
                <SundayReviewPage />
              </DashboardLayout>
            } 
          />
          <Route 
            path="/docs" 
            element={<ResearchDocumentationPage />} 
          />
          <Route 
            path="/research" 
            element={<Navigate to="/docs" replace />} 
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ClickRippleProvider>
    </ErrorBoundary>
  );
}

export default App;
