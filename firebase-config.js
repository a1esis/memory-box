/* =========================================================================
   FIREBASE CONFIG — fill in with your own project's values from:
   Firebase console -> Project settings -> Your apps -> Web app -> SDK setup
   ========================================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyB7XyyI9u93R17hi3lsRG9Jhsifkl7w34c",
  authDomain: "mem-box-99d58.firebaseapp.com",
  projectId: "mem-box-99d58",
  storageBucket: "mem-box-99d58.firebasestorage.app",
  messagingSenderId: "91166769253",
  appId: "1:91166769253:web:8fa8d88e35b3967c30c68c"
};

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);
}
