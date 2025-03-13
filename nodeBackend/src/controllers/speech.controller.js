import speech from "@google-cloud/speech"
import textToSpeech from "@google-cloud/text-to-speech"
import { queryContextualData, storeProcessedTextLog } from "../config/firebase.service.js";

let speechClient, ttsClient;
speechClient = new speech.SpeechClient();
ttsClient = new textToSpeech.TextToSpeechClient();

export const processSpeechStream = async (audioData, userId) => {
    try {
        if (!speechClient || !ttsClient) {
            throw new Error("Speech services not properly initialized");
        }

        const audioBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
        const audio = {
            content: audioBuffer.toString('base64'),
        };

        const config = {
            encoding: "LINEAR16",
            sampleRateHertz: 16000,
            languageCode: 'en-IN',
        };

        const request = {
            audio: audio,
            config: config,
        };

        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        if (transcription) {
            await storeProcessedTextLog({
                text: transcription,
                userId: userId || 'anonymous',
                source: 'speech-to-text',
                metadata: {
                    languageCode: config.languageCode,
                    confidence: response.results[0]?.alternatives[0]?.confidence || 0
                }
            });

            const queryResponse = await queryContextualData(transcription, userId);
            const ttsRequest = {
                input: { text: queryResponse.textResponse.data.response },
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

            const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
            const base64Audio = ttsResponse.audioContent.toString('base64');

            return {
                success: true,
                type: 'speech_response',
                transcription: transcription,
                textResponse: queryResponse.textResponse.data.response,
                audioContent: base64Audio,
                metadata: queryResponse.metadata
            };
        } else {
            console.error('No transcription generated');
            return {
                success: false,
                type: 'speech_response',
            };
        }
    } catch (error) {
        console.error('Error processing speech stream:', error);
        throw error;
    }
}

export const handleAudioChunk = async (req, res) => {
    try {
        const { audioData, userId } = req.body;
        if (!audioData) {
            return res.status(400).json({ error: "No audio data provided" });
        }
        const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData, 'base64');
        const result = await processSpeechStream(buffer, userId || req.user?.uid);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error handling audio chunk", error);
        return res.status(500).json({
            success: false,
            error: error.message
        })
    }
}