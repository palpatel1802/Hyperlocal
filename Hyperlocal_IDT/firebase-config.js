import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCCH9FPtt3wMRUrBZXpe7u_C69Vo0EVz7I",
    authDomain: "hyperlocal-b6e08.firebaseapp.com",
    projectId: "hyperlocal-b6e08",
    storageBucket: "hyperlocal-b6e08.firebasestorage.app",
    messagingSenderId: "335375575753",
    appId: "1:335375575753:web:58dba09d79beb0a2b7fb18"
  };

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
