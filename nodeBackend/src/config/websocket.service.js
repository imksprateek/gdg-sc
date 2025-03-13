import { WebSocketServer } from "ws"
import { processSpeechStream } from "../controllers/speech.controller.js";
import { verifyToken } from "../middleware/auth.js";

export const initializeWebsocketServer = (server) => {
    const wss = new WebSocketServer({ server, binaryType: 'arraybuffer' });
    wss.on('connection', async (ws, req) => {
        console.log('Websocket client connected');
        let userId = "anonymous";
        let authenticated = false;

        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        if (token) {
            try {
                const user = await verifyToken(token);
                if (user) {
                    userId = user.uid;
                    authenticated = true;
                    console.log(`User authenticated via token: ${userId}`);
                }
            } catch (error) {
                console.error("Authentication error:", error);
            }
        }
        ws.on('message', async (message) => {
            try {
                if (typeof message === 'string' || message.toString().startsWith('{')) {
                    try {
                        const controlMessage = JSON.parse(message.toString());

                        // Handle authentication via message
                        if (controlMessage.type === 'auth' && controlMessage.token) {
                            try {
                                const user = await verifyToken(controlMessage.token);
                                if (user) {
                                    userId = user.uid;
                                    authenticated = true;
                                    ws.send(JSON.stringify({
                                        type: 'auth_success',
                                        userId: userId
                                    }));
                                    console.log(`User authenticated: ${userId}`);
                                    return;
                                }
                            } catch (error) {
                                ws.send(JSON.stringify({
                                    type: 'auth_error',
                                    error: 'Invalid token'
                                }));
                                return;
                            }
                        }
                        if (controlMessage.type === 'user_info') {
                            userId = controlMessage.userId || userId;
                            console.log(`User identified: ${userId}`);
                            return;
                        } else if (controlMessage.type === 'start_stream') {
                            console.log('Starting audio stream');
                            return;
                        } else if (controlMessage.type === 'end_stream') {
                            console.log('Ending audio stream');
                            return;
                        }
                    } catch (parseError) {
                        if (typeof message === 'string') {
                            ws.send(JSON.stringify({
                                type: 'error',
                                error: 'Invalid JSON message format'
                            }));
                            return;
                        }
                    }
                }

                // Process binary audio data
                if (!authenticated && process.env.REQUIRE_AUTH === 'true') {
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Authentication required'
                    }));
                    return;
                }
                const result = await processSpeechStream(message, userId);
                // console.log(result);
                if (result && typeof result === 'object') {
                    // Extract and remove audioContent from the result object
                    const { audioContent, ...textParts } = result;

                    // First, send the text parts as JSON
                    ws.send(JSON.stringify({
                        ...textParts,
                        type: 'speech_response'
                    }));

                    // If there's audio content, send it separately as binary
                    if (audioContent) {
                        try {
                            // Convert base64 string to binary buffer if needed
                            // This assumes audioContent is a base64 string
                            // const audioBuffer = Buffer.from(audioContent, 'base64');
                            // ws.send(audioContent);

                            ws.send(JSON.stringify({
                                type: 'audio_content',
                                audioContent: audioContent
                            }));
                        } catch (audioError) {
                            console.error('Error sending audio content:', audioError);
                        }
                    }
                } else if (typeof result === 'string') {
                    ws.send(result);
                } else {
                    ws.send(JSON.stringify({
                        success: false,
                        error: 'Invalid response format'
                    }));
                }
            } catch (error) {
                console.error('WebSocket message handling error:', error);
                ws.send(JSON.stringify({
                    success: false,
                    error: error.message
                }));
            }
        });
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
        // Send initial connection confirmation
        ws.send(JSON.stringify({
            type: 'connection_established',
            message: 'Connected to speech processing service',
            authenticated: authenticated
        }));
    });
    return wss;
};

export const sendToUser = (wss, userId, message) => {
    wss.clients.forEach(client => {
        if (client.userId === userId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
};