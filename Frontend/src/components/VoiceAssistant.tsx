import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthProvider';
import RecordRTC from 'recordrtc';
import axios from 'axios'
import { Buffer } from 'buffer';

interface Message {
    type: 'user' | 'assistant' | 'error';
    text: string;
    sourceType?: 'voice' | 'text';
}

const VoiceAssistant: React.FC = () => {
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentAudio, setCurrentAudio] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [textInput, setTextInput] = useState<string>("");
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);

    const socketRef = useRef<WebSocket | null>(null);
    const recorderRef = useRef<RecordRTC | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Use the auth context instead of directly importing auth
    const { getIdToken } = useAuth();

    // useEffect(() => {
    //     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // }, [messages]);

    useEffect(() => {
        const initializeChat = async () => {
            try {
                const token = await getIdToken();
                const response = await axios.post('http://localhost:7000/api/chat/new', { title: 'New Chat' }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = response.data;
                if (data.success) {
                    setCurrentChatId(data.data.chatId);
                    setMessages([{ type: 'assistant', text: "How can i help you today ?", sourceType: 'text' }]);
                } else {
                    console.error("Failed to create chat session ", data.error);
                }
            } catch (error) {
                console.error('Error initializing chat:', error);
            }
        }
        if (!currentChatId) {
            initializeChat();
        }
    }, [getIdToken, currentChatId]);


    // Connect to WebSocket server
    useEffect(() => {
        const connectWebSocket = async () => {
            try {
                // Get auth token using the context
                const token = await getIdToken() || '';

                // Create WebSocket connection with token
                const wsUrl = `ws://localhost:7000/?token=${token}`;
                socketRef.current = new WebSocket(wsUrl);

                socketRef.current.onopen = () => {
                    console.log('WebSocket connected');
                    setIsConnected(true);
                    if (currentChatId && socketRef.current) {
                        socketRef.current.send(JSON.stringify({
                            type: 'set_chat_id',
                            chatId: currentChatId
                        }));
                    }
                };

                socketRef.current.onclose = () => {
                    console.log('WebSocket disconnected');
                    setIsConnected(false);
                };

                socketRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    setIsConnected(false);
                };

                // socketRef.current.onmessage = (event) => {
                //     try {
                //         const response = JSON.parse(event.data);

                //         if (response.type === 'connection_established') {
                //             console.log('Connection confirmed:', response.message);
                //         } else if (response.type === 'speech_response') {
                //             if (response.success) {
                //                 // Add transcription and response to messages
                //                 setMessages(prev => [
                //                     ...prev,
                //                     { type: 'user', text: response.transcription },
                //                     { type: 'assistant', text: response.textResponse }
                //                 ]);

                //                 // Play audio response if available
                //                 console.log(response);
                //                 if (response.audioContent) {
                //                     try {
                //                         // Properly decode base64 in browser
                //                         const binaryString = atob(response.audioContent);
                //                         const bytes = new Uint8Array(binaryString.length);
                //                         for (let i = 0; i < binaryString.length; i++) {
                //                             bytes[i] = binaryString.charCodeAt(i);
                //                         }

                //                         const audioBlob = new Blob([bytes], { type: 'audio/mp3' });
                //                         const audioUrl = URL.createObjectURL(audioBlob);
                //                         setCurrentAudio(audioUrl);

                //                         const audio = new Audio(audioUrl);
                //                         audio.play().catch(err => {
                //                             console.error('Audio playback error:', err);
                //                         });
                //                     } catch (audioError) {
                //                         console.error('Error processing audio response:', audioError);
                //                     }
                //                 }
                //             } else {
                //                 console.error('Speech processing error:', response.error);
                //                 setMessages(prev => [
                //                     ...prev,
                //                     { type: 'error', text: `Error: ${response.error}` }
                //                 ]);
                //             }
                //             setIsProcessing(false);
                //         }
                //     } catch (parseError) {
                //         console.error('Error parsing WebSocket message:', parseError);
                //         setIsProcessing(false);
                //     }
                // };

                socketRef.current.onmessage = (event) => {
                    try {
                        // Check if the data is binary or text
                        if (typeof event.data === 'string') {
                            const response = JSON.parse(event.data);

                            if (response.type === 'connection_established') {
                                console.log('Connection confirmed:', response.message);
                            } else if (response.type === 'speech_response') {
                                if (response.success) {
                                    // Add transcription and response to messages
                                    setMessages(prev => [
                                        ...prev,
                                        { type: 'user', text: response.transcription, sourceType: 'voice' },
                                        { type: 'assistant', text: response.textResponse, sourceType: 'voice' }
                                    ]);
                                    setIsProcessing(false);
                                } else {
                                    console.error('Speech processing error:', response.error);
                                    // const errorMessage = response.error || 'Unknown error occurred';
                                    // setMessages(prev => [
                                    //     ...prev,
                                    //     { type: 'error', text: `Error: ${errorMessage}` }
                                    // ]);
                                    // setIsProcessing(false);
                                }
                            }
                            else if (response.type === 'text_response') {
                                // Add this handler for text responses
                                setMessages(prev => [
                                    ...prev,
                                    { type: 'assistant', text: response.textResponse, sourceType: 'text' }
                                ]);
                                setIsProcessing(false);
                            }
                            else if (response.type === 'audio_content') {
                                try {
                                    // Properly decode base64 in browser
                                    const binaryString = atob(response.audioContent);
                                    const bytes = new Uint8Array(binaryString.length);
                                    for (let i = 0; i < binaryString.length; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                    }

                                    const audioBlob = new Blob([bytes], { type: 'audio/mp3' });
                                    const audioUrl = URL.createObjectURL(audioBlob);
                                    setCurrentAudio(audioUrl);

                                    const audio = new Audio(audioUrl);
                                    audio.play().catch(err => {
                                        console.error('Audio playback error:', err);
                                    });
                                } catch (audioError) {
                                    console.error('Error processing audio response:', audioError);
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error('Error parsing WebSocket message:', parseError);
                        setIsProcessing(false);
                    }
                };
            } catch (error) {
                console.error('WebSocket connection error:', error);
                setIsConnected(false);
            }
        };

        if (currentChatId) {
            connectWebSocket();
        }

        // Clean up WebSocket connection when component unmounts
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }

            // Clean up any active recordings
            if (recorderRef.current) {
                recorderRef.current.stopRecording();
            }

            // Stop and release microphone
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [getIdToken, currentChatId]);

    // Clean up audio URLs when component unmounts
    useEffect(() => {
        return () => {
            if (currentAudio) {
                URL.revokeObjectURL(currentAudio);
            }
        };
    }, [currentAudio]);

    // Start recording
    const startRecording = async () => {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            streamRef.current = stream;

            // Initialize RecordRTC with WAV recording
            recorderRef.current = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/wav',
                recorderType: RecordRTC.StereoAudioRecorder,
                numberOfAudioChannels: 1, // Mono for better speech recognition
                desiredSampRate: 16000, // 16kHz sample rate for speech recognition
                timeSlice: 1000, // Optional: for streaming in 1-second intervals
                disableLogs: false,
                bufferSize: 4096
            });

            // Start recording
            recorderRef.current.startRecording();
            setIsRecording(true);

            // Inform server we're starting a stream
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'start_stream' }));
            }
        } catch (error) {
            console.error('Error starting recording:', error);

            // Display error message to user
            setMessages(prev => [
                ...prev,
                { type: 'error', text: `Microphone error: ${error instanceof Error ? error.message : 'Unknown error'}` }
            ]);
        }
    };

    // Stop recording
    const stopRecording = () => {
        if (recorderRef.current && isRecording) {
            setIsProcessing(true);

            recorderRef.current.stopRecording(() => {
                const blob = recorderRef.current?.getBlob();

                if (blob) {
                    console.log('Recording stopped, blob size:', blob.size, 'type:', blob.type);

                    // Send audio data to server
                    sendAudioToServer(blob);
                } else {
                    console.error('Failed to get recording blob');
                    setIsProcessing(false);
                }

                // Stop and release microphone
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            });

            setIsRecording(false);

            // Inform server we're ending the stream
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'end_stream' }));
            }
        }
    };

    // Send audio to server
    const sendAudioToServer = async (audioBlob: Blob) => {
        try {
            if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }

            console.log('Converting blob to ArrayBuffer...');
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);

            // Send the binary audio data directly over WebSocket
            socketRef.current.send(arrayBuffer);
            console.log('Audio data sent to server');
        } catch (error) {
            console.error('Error sending audio to server:', error);
            setMessages(prev => [
                ...prev,
                { type: 'error', text: `Send error: ${error instanceof Error ? error.message : 'Unknown error'}` }
            ]);
            setIsProcessing(false);
        }
    };

    const sendTextMessage = () => {
        if (!textInput.trim()) return;
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            setMessages(prev => [
                ...prev,
                { type: 'error', text: "Websocket not connected" }
            ]);
            return;
        }
        // setMessages(prev => [
        //     ...prev,
        //     { type: 'user', text: textInput, sourceType: 'text' }
        // ]);
        setIsProcessing(true);
        socketRef.current.send(JSON.stringify({
            type: "text_message",
            text: textInput
        }))
        setTextInput('');
    }

    // Clear messages
    const clearMessages = async () => {
        try {
            const token = await getIdToken();
            const response = await axios.post('http://localhost:7000/api/chat/new', { title: "New Chat" }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            })
            const data = response.data;
            if (data.success) {
                setCurrentChatId(data.data.chatId);
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({
                        type: 'set_chat_id',
                        chatId: data.data.chatId
                    }));
                }
                setMessages([{ type: "assistant", text: 'How can i help you today', sourceType: 'text' }]);
            } else {
                console.error("Failed to create new chat sessions", data.error);
            }
        } catch (error) {
            console.error("Error clearing conversation", error);
        }
        // setMessages([]);

        // // Tell backend to clear context
        // if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        //     socketRef.current.send(JSON.stringify({ type: 'clear_context' }));
        // }
    };
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendTextMessage();
    };

    return (
        // <div className="max-w-md mx-auto p-4">
        //     <div className="mb-4 text-center">
        //         <div className={`inline-block p-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}>
        //             <button
        //                 onClick={isRecording ? stopRecording : startRecording}
        //                 disabled={!isConnected || isProcessing}
        //                 className={`p-3 rounded-full ${isRecording ? 'bg-red-600' : 'bg-blue-600'} text-white disabled:opacity-50`}
        //             >
        //                 {isRecording ? '◼ Stop' : '🎤 Start'}
        //             </button>
        //         </div>

        //         {isProcessing && <div className="mt-2">Processing...</div>}
        //     </div>

        //     <div className="border p-4 rounded-lg bg-gray-50 h-80 overflow-y-auto">
        //         {messages.length === 0 ? (
        //             <div className="text-center text-gray-500">
        //                 Speak to start a conversation
        //             </div>
        //         ) : (
        //             <div className="space-y-2">
        //                 {messages.map((message, index) => (
        //                     <div
        //                         key={index}
        //                         className={`p-2 rounded ${message.type === 'user'
        //                             ? 'bg-blue-100 text-blue-800'
        //                             : message.type === 'error'
        //                                 ? 'bg-red-100 text-red-800'
        //                                 : 'bg-green-100 text-green-800'
        //                             }`}
        //                     >
        //                         <strong>{message.type === 'user' ? 'You' : message.type === 'error' ? 'Error' : 'Assistant'}:</strong> {message.text}
        //                     </div>
        //                 ))}
        //             </div>
        //         )}
        //     </div>

        //     <div className="mt-2 text-center">
        //         <button
        //             onClick={clearMessages}
        //             className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        //         >
        //             Clear Conversation
        //         </button>
        //     </div>
        // </div>
        <div className="max-w-2xl mx-auto p-4">
            <div className="mb-4 text-center">
                <div className={`inline-block p-2 rounded-full ${isConnected ? 'bg-green-100' : 'bg-red-100'}`}>
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!isConnected || isProcessing}
                        className={`p-3 rounded-full ${isRecording ? 'bg-red-600' : 'bg-blue-600'} text-white disabled:opacity-50`}
                    >
                        {isRecording ? '◼ Stop' : '🎤 Start'}
                    </button>
                </div>

                {isProcessing && <div className="mt-2">Processing...</div>}
            </div>

            <div className="border p-4 rounded-lg bg-gray-50 h-96 overflow-y-auto mb-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500">
                        Type or speak to start a conversation
                    </div>
                ) : (
                    <div className="space-y-2">
                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={`p-2 rounded ${message.type === 'user'
                                        ? 'bg-blue-100 ml-12'
                                        : message.type === 'assistant'
                                            ? 'bg-white border mr-12'
                                            : 'bg-red-100'
                                    }`}
                            >
                                <div className="flex items-center mb-1">
                                    <span className="font-bold text-xs">
                                        {message.type === 'user'
                                            ? 'You'
                                            : message.type === 'assistant'
                                                ? 'Assistant'
                                                : 'Error'}
                                    </span>
                                    {/* {message.sourceType && (
                                        <span className="ml-2 text-xs bg-gray-200 px-1 rounded">
                                            {message.sourceType === 'voice' ? '🎤 Voice' : '⌨️ Text'}
                                        </span>
                                    )} */}
                                </div>
                                <div className="whitespace-pre-wrap">
                                    {message.text}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center space-x-2">
                <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type a message..."
                    disabled={!isConnected || isProcessing}
                    className="flex-1 p-2 border rounded disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={!isConnected || isProcessing || !textInput.trim()}
                    className="p-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                    Send
                </button>
                <button
                    type="button"
                    onClick={clearMessages}
                    disabled={!isConnected || isProcessing || messages.length <= 1}
                    className="p-2 bg-gray-300 rounded disabled:opacity-50"
                >
                    Clear
                </button>
            </form>

            {currentAudio && (
                <div className="mt-4">
                    <audio controls src={currentAudio} className="w-full" />
                </div>
            )}
        </div>
    );
};

export default VoiceAssistant;