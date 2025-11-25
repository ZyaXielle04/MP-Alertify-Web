// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCNBFSdGEG-1932G67Zxd4re9IP3tU1XH4",
  authDomain: "mp-alertify.firebaseapp.com",
  databaseURL: "https://mp-alertify-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mp-alertify",
  storageBucket: "mp-alertify.firebasestorage.app",
  messagingSenderId: "53548793070",
  appId: "1:53548793070:web:573180d6bda9e5c25987ff",
  measurementId: "G-QGHVZ61J6P"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Optional analytics
// firebase.analytics();

// References for database and auth
const db = firebase.database();
const auth = firebase.auth();
