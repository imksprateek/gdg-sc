import { initializeApp } from "firebase/app";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_API_KEY,
    authDomain: "t-decoder-453012-a2.firebaseapp.com",
    projectId: "t-decoder-453012-a2",
    storageBucket: "t-decoder-453012-a2.firebasestorage.app",
    messagingSenderId: "208395140303",
    appId: "1:208395140303:web:86e936f1dc6dae9d0a8bba"
};
const app = initializeApp(firebaseConfig);

export default app;