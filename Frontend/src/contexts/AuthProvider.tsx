import { createContext, useState, ReactNode, useEffect, useContext } from "react"
import { getAuth, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence, } from "firebase/auth";
import app from "../firebase/firebase.config";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

interface User {
    name?: string,
    email?: string,
    uid?: string,
    role: "user" | "admin",
    state?:string,
}

interface AuthContextType {
    currUser: User | null;
    loading:boolean;
    signup: (name:string,email: string, password: string, role: "user" | "admin") => Promise<any>;
    login: (email: string, password: string) => Promise<any>;
    logout: () => Promise<void>;
}

interface AuthProviderProps {
    children: ReactNode
}


export const AuthContext = createContext<AuthContextType>({
    currUser: null,
    loading:true,
    signup: async () => { },
    login: async () => { },
    logout: async () => { },
})

export const useAuth = () =>{
    const context = useContext(AuthContext);
    if(!context){
        throw new Error("useAuth must be used within a valid authprovider");
    }
    return context;
}
const auth = getAuth(app);
const db = getFirestore(app);


setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Persistence set to local")
    })
    .catch((error) => {
        console.error("error setting persistence", error)
    })

const AuthProvider = ({ children }: AuthProviderProps) => {
    const [currUser, setCurrUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const signup = async (name:string,email: string, password: string, role: "user" | "admin") => {
        try {
            console.log("Inside signup");
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log(userCredential);
            await setDoc(doc(db, "User", userCredential.user.uid), {
                email,
                role,
                name,
                createdAt: new Date(),
            });
            return userCredential;
        } catch (error) {
            console.error("Error signing up:", error);
            throw error;
        }
    }

    const login = async (email: string, password: string) => {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return userCredential;
        } catch (error) {
            console.error("Error logging in", error);
            throw error;
        }
    }

    const logout = async () => {
        try {
            await signOut(auth);
            setCurrUser(null);
        } catch (error) {
            console.error("error logging out", error);
            throw error;
        }
    }

    useEffect(()=>{
        const unsubscribe = onAuthStateChanged(auth,async (firebaseUser)=>{
            if(firebaseUser){
                const userDoc = await getDoc(doc(db,"User",firebaseUser.uid));
                if(userDoc.exists()){
                    const userData = userDoc.data();
                    setCurrUser({
                        ...userData,
                        uid:firebaseUser.uid,
                        email:firebaseUser.email || undefined,
                        role:userData.role,
                        name:userData.name,
                    }as User);
                }else{
                    setCurrUser({
                        uid:firebaseUser.uid,
                        email:firebaseUser.email || undefined,
                        role:"user"
                    });
                }
            }else{
                setCurrUser(null);
            }
            setLoading(false);
        })
        return () => unsubscribe();
    },[]);




    return (
        <AuthContext.Provider value={{ currUser, signup, login, logout,loading }}>
            {!loading? children:<div>Loading...</div>}
        </AuthContext.Provider>
    )
}

export default AuthProvider