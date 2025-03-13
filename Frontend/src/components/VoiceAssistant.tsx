import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthProvider';
import RecordRTC from 'recordrtc';
import { Buffer } from 'buffer';

interface Message {
    type: 'user' | 'assistant' | 'error';
    text: string;
}

const VoiceAssistant: React.FC = () => {
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentAudio, setCurrentAudio] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    const socketRef = useRef<WebSocket | null>(null);
    const recorderRef = useRef<RecordRTC | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Use the auth context instead of directly importing auth
    const { getIdToken } = useAuth();

    // Connect to WebSocket server
    useEffect(() => {
        const connectWebSocket = async () => {
            try {
                // Get auth token using the context
                const token = await getIdToken() || '';

                // Create WebSocket connection with token
                const wsUrl = `ws://localhost:7000?token=${token}`;
                socketRef.current = new WebSocket(wsUrl);

                socketRef.current.onopen = () => {
                    console.log('WebSocket connected');
                    setIsConnected(true);
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
                                        { type: 'user', text: response.transcription },
                                        { type: 'assistant', text: response.textResponse }
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
                            } else if (response.type === 'audio_content') {
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

        connectWebSocket();

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
    }, [getIdToken]);

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

    // Clear messages
    const clearMessages = () => {
        setMessages([]);

        // Tell backend to clear context
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'clear_context' }));
        }
    };

    return (
        <div className="max-w-md mx-auto p-4">
            <div className="mb-4 text-center">
                <div className={`inline-block p-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}>
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

            <div className="border p-4 rounded-lg bg-gray-50 h-80 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500">
                        Speak to start a conversation
                    </div>
                ) : (
                    <div className="space-y-2">
                        {messages.map((message, index) => (
                            <div
                                key={index}
                                className={`p-2 rounded ${message.type === 'user'
                                        ? 'bg-blue-100 text-blue-800'
                                        : message.type === 'error'
                                            ? 'bg-red-100 text-red-800'
                                            : 'bg-green-100 text-green-800'
                                    }`}
                            >
                                <strong>{message.type === 'user' ? 'You' : message.type === 'error' ? 'Error' : 'Assistant'}:</strong> {message.text}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-2 text-center">
                <button
                    onClick={clearMessages}
                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                    Clear Conversation
                </button>
            </div>
        </div>
    );
};

export default VoiceAssistant;