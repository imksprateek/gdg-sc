import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: "gdg-sc.firebaseapp.com",
    projectId: "gdg-sc",
    storageBucket: "gdg-sc.firebasestorage.app",
    messagingSenderId: "878719169342",
    appId: "1:878719169342:web:397eeec4e929de8baef26f",
    measurementId: "G-7HYP2J7S5P"
};

const app = initializeApp(firebaseConfig);

export default app;