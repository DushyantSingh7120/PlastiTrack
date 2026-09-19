// Scripts for Firebase Cloud Messaging background process
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker dynamically from query parameters
// Passed from requestNotificationPermission()
const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
  measurementId: params.get('measurementId') || ''
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log(
        '[firebase-messaging-sw.js] Received background message ',
        payload
      );
      const notificationTitle = payload.notification?.title || 'PlastiTrack Reminder';
      const notificationOptions = {
        body: payload.notification?.body || 'Remember to log your plastic usage today!',
        icon: '/icons/icon-192x192.png',
        badge: '/favicon-48x48.png'
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (e) {
    console.warn('[firebase-messaging-sw.js] Initialization warning:', e);
  }
}

