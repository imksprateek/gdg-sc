import { queryContextualData } from "../config/firebase.service.js";
import { firestore } from "../config/firebaseAdmin.js";
import textToSpeech from "@google-cloud/text-to-speech"


const ttsClient = new textToSpeech.TextToSpeechClient();

const generateSpeechAudio = async (text) => {
    const ttsRequest = {
        input: { text },
        voice: {
            languageCode: 'en-IN',
            name: 'en-IN-Standard-D',
            ssmlGender: 'NEUTRAL',
        },
        audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0
        },
    };

    const ttsResponse = await ttsClient.synthesizeSpeech(ttsRequest);
    return ttsResponse.audioContent.toString('base64');
}

export const startConversation = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { title = "New Chat" } = req.body;
        const timestamp = new Date().toISOString();
        const chatSessionRef = firestore.collection("chatSessions").doc();
        const chatId = chatSessionRef.id;

        await chatSessionRef.set({
            userId,
            title,
            createdAt: timestamp,
            lastUpdated: timestamp,
        });

        const messageRef = chatSessionRef.collection("messages").doc();
        const messageId = messageRef.id;

        await messageRef.set({
            messageId,
            role: "assistant",
            text: "How can i help you today ?",
            timestamp,
            sourceType: "text"
        });

        res.status(201).json({
            success: true,
            data: {
                chatId,
                title,
                createdAt: timestamp,
                lastUpdated: timestamp,
            }
        });
    } catch (error) {
        console.error("Error starting conversation: ", error);
        res.status(500).json({
            success: false,
            error: "Failed to start conversation"
        });
    }
};

export const storeMessageAndAiResponse = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { chatId, message,sourceType="text" } = req.body;
        if (!chatId || !message) {
            return res.status(400).json({
                success: false,
                error: 'ChatID and message are required'
            });
        }
        const timestamp = new Date().toISOString();
        const chatSessionRef = firestore.collection("chatSessions").doc(chatId);
        const chatDoc = await chatSessionRef.get();
        if (!chatDoc.exists || chatDoc.data().userId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Unauthorized access to this chat!"
            });
        }
        await chatSessionRef.update({
            lastUpdated: timestamp
        })

        const messageRef = chatSessionRef.collection("messages").doc();
        const userMessageId = messageRef.id;
        await messageRef.set({
            messageId: userMessageId,
            role: req.user.role,
            text: message,
            timestamp,
            sourceType
        })
        const queryResponse = await queryContextualData(message, userId);
        const aiResponseText = queryResponse.textResponse.data.response;
        const audioContent = await generateSpeechAudio(aiResponseText);

        const aiMessageRef = chatSessionRef.collection("messages").doc();
        const aiMessageId = aiMessageRef.id;
        await aiMessageRef.set({
            messageId: aiMessageId,
            role: "assistant",
            text: aiResponseText,
            timestamp: new Date().toISOString(),
            sourceType:"text",
        });

        return res.status(200).json({
            success: true,
            data: {
                message: aiResponseText,
                audioContent,
                messageId: aiMessageId
            }
        });



    } catch (error) {
        console.error("error processing message", error);
        return res.status(500).json({
            success: false,
            error: "Failed to process message",
        })
    }
}

export const fetchAllChatSessions = async (req, res) => {
    try {
        console.log("inside");
        const userId = req.user.uid;
        const sessionRef = firestore.collection("chatSessions");
        const snapshot = await sessionRef.where("userId", "==", userId).orderBy("lastUpdated", "desc").get();
        const sessions = [];
        snapshot.forEach(doc => {
            sessions.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return res.status(200).json({
            success: true,
            data: sessions
        });
    } catch (error) {
        console.error("error fetching chat sessions", error);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch chat sessions"
        })
    }
}

export const fetchChatForParticularSession = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { chatId } = req.params;
        if (!chatId) {
            return res.status(400).json({
                success: false,
                error: "Chat ID is required"
            });
        }
        const chatSessionRef = firestore.collection("chatSessions").doc(chatId);
        const chatDoc = await chatSessionRef.get();
        if(!chatDoc.exists || chatDoc.data().userId !== userId){
            return res.status(403).json({
                success:false,
                error:"Unauthorized access to the chat!"
            });
        }
        const messageRef = chatSessionRef.collection("messages");
        const snapshot = await messageRef.orderBy('timestamp',"asc").get();
        const messages = [];
        snapshot.forEach(doc=>{
            messages.push({
                id:doc.id,
                ...doc.data()
            });
        });
        return res.status(200).json({
            success:true,
            data:{
                chat:chatDoc.data(),
                messages
            }
        })
    } catch (error) {
        console.error("error fetching chat",error);
        return res.status(500).json({
            success:false,
            error:"Failed to fetch chat"
        })
    }
}