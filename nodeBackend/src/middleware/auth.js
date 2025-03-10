import { auth } from "../config/firebaseAdmin.js";


export async function authMiddleware(req,res,next){
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer')){
        return res.status(401).json({message:"Unauthorized missing or invalid authorization header"});
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = {
            uid:decodedToken.uid,
            email:decodedToken.email,
            role:decodedToken.role || "user"
        };
        return next();
    } catch (error) {
        console.error("Error verifying auth token",error);
        return res.status(401).json({message:"unauthorized invalid token"});
    }
}