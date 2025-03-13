import { admin, firestore } from "./firebaseAdmin.js";
import axios from "axios";


export const storeProcessedTextLog = async (data) => {
    try {
        const logsCollection = firestore.collection('processedTextLogs');
        const result = await logsCollection.add({
            text: data.text,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userId: data.userId || 'anonymous',
            source: data.source || 'speech-to-text',
            metadata: data.metadata || {}
        });
        return {
            success: true,
            id: result.id
        };
    } catch (error) {
        console.error('Error storing processed text logs: ', error);
        throw error;
    }
};


export const queryLogsForAiAgents = async ({ userId, limit = 10, startAfter }) => {
    try {
        let query = firestore.collection('processedTextLogs')
            .orderBy('timestamp', 'desc')
            .limit(limit);
        if (userId) {
            query = query.where('userId', '==', userId);
        }
        if (startAfter) {
            const doc = await db.collection('processedTextLogs').doc(startAfter).get();
            query = query.startAfter(doc);
        }

        const snapshot = await query.get();
        const logs = [];

        snapshot.forEach(doc => {
            logs.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return logs;

    } catch (error) {
        console.error('Error querying logs for AI agents:', error);
        throw error;
    }
}

export const queryContextualData = async (queryText,userId) => {
    try {
        const normalizedQuery = queryText.toLowerCase();
        let response = "I'm sorry, I couldn't understand your query";

        if (normalizedQuery) {
            const flaskResponse = await axios.post("http://127.0.0.1:5000/query", {
                userId: userId,
                query:normalizedQuery,
            })
            return {
                textResponse: flaskResponse || response,
                metadata: {
                    intent: determineIntent(normalizedQuery),
                    confidence: 0.85
                }
            };
        }
    } catch (error) {
        console.error('Error querying contextual data:', error);
        throw error;
    }
}


function determineIntent(queryText) {
    if (queryText.includes('weather')) return 'WEATHER_QUERY';
    if (queryText.includes('time')) return 'TIME_QUERY';
    if (queryText.includes('account') || queryText.includes('profile')) return 'ACCOUNT_QUERY';
    if (queryText.includes('help')) return 'HELP_REQUEST';
    return 'UNKNOWN';
}
