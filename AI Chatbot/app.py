from flask import Flask, request, jsonify
import os
import base64
import json
import uuid
import logging
from flask_cors import CORS
from google.cloud import vision
from google.cloud import speech_v1 as speech
from google.cloud import texttospeech_v1 as texttospeech
import firebase_admin
from firebase_admin import credentials, firestore
import requests
from datetime import datetime
import tempfile
import re
import urllib.parse
from functools import wraps
import imghdr

# Configure logging with more detailed format for operational monitoring
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable cross-origin requests from Web Interface

# ===============================================================================
# FIREBASE INITIALIZATION
# Connects to "Firebase Database" in the architecture diagram
# ===============================================================================
firebase_initialized = False
db = None

try:
    cred_path = os.environ.get('FIREBASE_CREDENTIALS', 'serviceAccountKey.json')
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        firebase_initialized = True
        logger.info("Firebase initialized successfully")
    else:
        logger.warning(f"Firebase credentials file not found at {cred_path}. Context-aware features will be limited.")
        # Try to initialize with default credentials as fallback
        try:
            firebase_admin.initialize_app()
            db = firestore.client()
            firebase_initialized = True
            logger.info("Firebase initialized with default credentials")
        except Exception as inner_e:
            logger.error(f"Fallback Firebase initialization failed: {inner_e}")
except Exception as e:
    logger.error(f"Error initializing Firebase: {e}. Context-aware features will be disabled.")

# ===============================================================================
# GOOGLE CLOUD SERVICES INITIALIZATION
# Initializes the Vision, Speech, and Text-to-Speech clients
# ===============================================================================
vision_client = None
speech_client = None
tts_client = None

# Initialize Vision API client (connects to "Vertex AI API")
try:
    vision_client = vision.ImageAnnotatorClient()
    logger.info("Vision API client initialized")
except Exception as e:
    logger.error(f"Error initializing Vision API client: {e}")

# Initialize Speech-to-Text client (connects to "Speech-to-Text" in diagram)
try:
    speech_client = speech.SpeechClient()
    logger.info("Speech API client initialized")
except Exception as e:
    logger.error(f"Error initializing Speech API client: {e}")

# Initialize Text-to-Speech client (connects to "Text-to-Speech" in diagram)
try:
    tts_client = texttospeech.TextToSpeechClient()
    logger.info("Text-to-Speech API client initialized")
except Exception as e:
    logger.error(f"Error initializing Text-to-Speech API client: {e}")

# ===============================================================================
# HELPER DECORATORS
# Authentication and rate limiting for API endpoints
# ===============================================================================
def require_api_key(f):
    """Decorator to require API key for endpoint access"""
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        if os.environ.get('API_KEY_REQUIRED', 'False').lower() == 'true':
            if api_key and api_key == os.environ.get('API_KEY', 'development-key'):
                return f(*args, **kwargs)
            return jsonify({'error': 'Unauthorized access'}), 401
        return f(*args, **kwargs)  # Skip auth in development mode
    return decorated

# ===============================================================================
# HEALTH CHECK ENDPOINT
# Allows monitoring of service status
# ===============================================================================
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint with service status details"""
    status = {
        "status": "healthy",
        "service": "ai-context-assistant",
        "version": "1.0.0",
        "firebase": "connected" if firebase_initialized else "disconnected",
        "vision_api": "connected" if vision_client else "disconnected",
        "speech_api": "connected" if speech_client else "disconnected",
        "tts_api": "connected" if tts_client else "disconnected",
        "timestamp": datetime.now().isoformat()
    }
    return jsonify(status)

# ===============================================================================
# IMAGE PROCESSING ENDPOINT
# Implements the flow from "Phone Camera" -> "AI Agents" -> "Vertex AI API"
# Processes captured images and stores results in Firebase Database
# ===============================================================================
@app.route('/api/process-image', methods=['POST'])
@require_api_key
def process_image():
    """Process image with Google Vision API and store in Firebase"""
    try:
        # Validate input
        if 'image' not in request.files and 'image_base64' not in request.form:
            return jsonify({'error': 'No image provided'}), 400
        
        # Check if Vision API is available
        if not vision_client:
            return jsonify({'error': 'Vision API service unavailable'}), 503
        
        # Extract user information for context tracking
        user_id = request.form.get('user_id', 'anonymous')
        session_id = request.form.get('session_id', str(uuid.uuid4()))
        location = request.form.get('location', 'unknown')
        
        # Get image content with size validation
        # This handles the "Sends Periodically Captured Images" flow from diagram
        content = None
        try:
            # Handle file uploads (large files use temporary storage)
            if 'image' in request.files:
                file = request.files['image']
                
                # Check for empty file
                if file.filename == '':
                    return jsonify({'error': 'Empty image filename'}), 400
                
                # For large files, use a temporary file approach
                if file.content_length and file.content_length > 5 * 1024 * 1024:
                    with tempfile.NamedTemporaryFile(delete=False) as temp:
                        file.save(temp.name)
                        with open(temp.name, 'rb') as f:
                            content = f.read()
                        os.unlink(temp.name)
                else:
                    content = file.read()
                
                # Validate content
                if len(content) == 0:
                    return jsonify({'error': 'Empty image file'}), 400
                elif len(content) > 10 * 1024 * 1024:  # 10MB limit
                    return jsonify({'error': 'Image too large (max 10MB)'}), 400
            else:
                # Safe base64 decoding
                try:
                    base64_data = request.form.get('image_base64', '')
                    # Handle potential padding issues
                    base64_data = base64_data.replace(' ', '+')  # Fix spaces
                    padding = 4 - (len(base64_data) % 4)
                    if padding < 4:
                        base64_data += '=' * padding
                    
                    # Try to decode
                    content = base64.b64decode(base64_data)
                    if len(content) == 0:
                        return jsonify({'error': 'Empty base64 image data'}), 400
                    elif len(content) > 10 * 1024 * 1024:  # 10MB limit
                        return jsonify({'error': 'Image too large (max 10MB)'}), 400
                except Exception as e:
                    return jsonify({'error': f'Invalid base64 image data: {str(e)}'}), 400
        except Exception as e:
            return jsonify({'error': f'Error reading image: {str(e)}'}), 400

        # Check if valid image format
        image_format = imghdr.what(None, h=content)
        if not image_format:
            return jsonify({'error': 'Invalid image format. Please upload a valid image file.'}), 400
        
        # Process with Vision API - This implements the "Processes Image and Generates Description" flow
        image = vision.Image(content=content)
        
        # Configure image analysis features
        features = [
            vision.Feature(type_=vision.Feature.Type.LABEL_DETECTION, max_results=10),
            vision.Feature(type_=vision.Feature.Type.OBJECT_LOCALIZATION, max_results=10),
            vision.Feature(type_=vision.Feature.Type.TEXT_DETECTION, max_results=5)
        ]
        
        # Send image to Vertex AI for analysis with retry logic
        max_retries = 3
        retry_count = 0
        response = None
        
        while retry_count < max_retries:
            try:
                request_vision = vision.AnnotateImageRequest(image=image, features=features)
                response = vision_client.annotate_image(request=request_vision)
                
                # Check for Vision API errors
                if response.error.message:
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        logger.warning(f"Vision API error, retrying ({retry_count}/{max_retries}): {response.error.message}")
                        continue
                    else:
                        return jsonify({'error': f'Vision API error: {response.error.message}'}), 500
                break  # Success, exit retry loop
            except Exception as e:
                if retry_count < max_retries - 1:
                    retry_count += 1
                    logger.warning(f"Vision API request failed, retrying ({retry_count}/{max_retries}): {e}")
                    continue
                else:
                    return jsonify({'error': f'Vision API request failed: {e}'}), 500
        
        # Extract results from Vertex AI response
        labels = response.label_annotations
        objects = response.localized_object_annotations
        texts = response.text_annotations
        
        # Generate description with safety checks
        description_parts = []
        
        if labels:
            description_parts.append("I can see: " + ", ".join([label.description for label in labels[:5]]))
        
        object_names = [obj.name for obj in objects]
        if object_names:
            description_parts.append("I detected these objects: " + ", ".join(object_names[:5]))
        
        # Extract text with proper handling
        detected_text = ""
        if texts and len(texts) > 0:
            detected_text = texts[0].description if texts[0].description else ""
            if detected_text:
                if len(detected_text) > 100:
                    detected_text = detected_text[:97] + "..."
                description_parts.append(f"I also found this text: \"{detected_text}\"")
        
        description = " ".join(description_parts)
        if not description:
            description = "I don't see anything significant in this image."
        
        # Identify potential products with confidence filtering
        # This supports the "E-commerce API" connection shown in diagram
        potential_products = []
        for label in labels:
            if (label.score > 0.7 and 
                not any(word in label.description.lower() for word in ['scene', 'room', 'background', 'photo', 'image'])):
                potential_products.append(label.description)
        
        for obj in objects:
            if obj.score > 0.7:
                potential_products.append(obj.name)
        
        # Remove duplicates and limit length
        potential_products = list(set(potential_products))[:10]  # Limit to 10 items
        
        # Store in Firebase (if available)
        # This implements the "Store Processed Text Logs" flow to Firebase
        timestamp = datetime.now().isoformat()
        doc_ref = None
        
        if firebase_initialized and db:
            try:
                doc_ref = db.collection('user_memories').document(user_id).collection('images').document()
                
                doc_data = {
                    'description': description,
                    'labels': [{'name': label.description, 'score': label.score} for label in labels],
                    'objects': [{'name': obj.name, 'score': obj.score} for obj in objects],
                    'text_content': detected_text,
                    'potential_products': potential_products,
                    'timestamp': timestamp,
                    'location': location,
                    'session_id': session_id
                }
                
                # Retry logic for Firebase write
                max_retries = 3
                retry_count = 0
                while retry_count < max_retries:
                    try:
                        doc_ref.set(doc_data)
                        logger.info(f"Stored image analysis in Firebase: {doc_ref.id}")
                        break  # Success, exit retry loop
                    except Exception as e:
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            logger.warning(f"Firebase write failed, retrying ({retry_count}/{max_retries}): {e}")
                            continue
                        else:
                            logger.error(f"Error storing in Firebase after retries: {e}")
                            # Continue without Firebase storage - don't fail the whole request
                            break
            except Exception as e:
                logger.error(f"Error preparing Firebase storage: {e}")
                # Continue without Firebase storage - don't fail the whole request
        
        # Check for storage locations with improved detection
        # This enables the "Where did I put X?" context awareness feature
        storage_areas = ['refrigerator', 'fridge', 'cabinet', 'drawer', 'shelf', 'table', 'counter', 'pantry', 'cupboard', 'closet', 'box']
        detected_storage = []
        
        # Look for storage locations in objects
        for obj in objects:
            obj_name = obj.name.lower()
            for area in storage_areas:
                if area in obj_name:
                    detected_storage.append(area)
                    break
        
        # Look in labels if not found in objects
        if not detected_storage:
            for label in labels:
                label_name = label.description.lower()
                for area in storage_areas:
                    if area in label_name:
                        detected_storage.append(area)
                        break
        
        # Store item location if detected - This creates spatial memory
        storage_location = None
        try:
            if detected_storage and potential_products and firebase_initialized and db and doc_ref:
                memory_ref = db.collection('user_memories').document(user_id).collection('item_locations').document()
                storage_data = {
                    'item_type': 'storage',
                    'items': potential_products,
                    'storage_location': detected_storage[0],
                    'location': location,
                    'timestamp': timestamp,
                    'image_ref': doc_ref.id
                }
                
                # Retry logic for Firebase write
                max_retries = 3
                retry_count = 0
                while retry_count < max_retries:
                    try:
                        memory_ref.set(storage_data)
                        storage_location = detected_storage[0]
                        logger.info(f"Stored item location in Firebase: {memory_ref.id}")
                        break  # Success, exit retry loop
                    except Exception as e:
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            logger.warning(f"Firebase write failed, retrying ({retry_count}/{max_retries}): {e}")
                            continue
                        else:
                            logger.error(f"Error storing item location after retries: {e}")
                            break
                
                friendly_response = f"I see you're storing {', '.join(potential_products[:3])} in the {detected_storage[0]}. I'll remember this for you."
            else:
                friendly_response = f"I've analyzed this image. {description}"
        except Exception as e:
            logger.error(f"Error storing item location: {e}")
            friendly_response = f"I've analyzed this image. {description}"
        
        # Generate audio response - Implements the "Text-to-Speech Conversion" flow
        audio_content = generate_audio_response(friendly_response)
        
        # Prepare the multimodal response to send back to Spring Boot Backend
        # This implements the "Sends Processed Text Data" flow in the diagram
        response_data = {
            'memory_id': doc_ref.id if doc_ref else None,
            'description': description,
            'text_response': friendly_response,
            'audio_response': audio_content,
            'potential_products': potential_products,  # Store but don't suggest yet
            'session_id': session_id,
            'multimodal_content': {
                'has_audio': audio_content is not None,
                'has_image': False,  # No product images by default
                'has_item_location': storage_location is not None,
                'storage_location': storage_location
            }
        }
        
        logger.info(f"Image processing complete for session {session_id}")
        return jsonify(response_data)
    
    except Exception as e:
        logger.error(f"Unhandled error in process_image: {e}", exc_info=True)
        return jsonify({
            'error': 'Internal server error processing image',
            'text_response': "I'm sorry, I encountered an error processing your image. Please try again.",
            'session_id': request.form.get('session_id', str(uuid.uuid4())),
            'multimodal_content': {'has_audio': False, 'has_image': False}
        }), 500

# ===============================================================================
# VOICE PROCESSING ENDPOINT
# Implements the "Voice Interactions" flow to "Speech Services"
# Converts speech to text, processes the query, and returns audio response
# ===============================================================================
@app.route('/api/process-voice', methods=['POST'])
@require_api_key
def process_voice():
    """Process voice input with Google Speech-to-Text API"""
    temp_path = None
    converted_path = None
    
    try:
        # Check if Speech API is available
        if not speech_client:
            return jsonify({'error': 'Speech API service unavailable'}), 503
            
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio provided'}), 400
        
        audio_file = request.files['audio']
        user_id = request.form.get('user_id', 'anonymous')
        session_id = request.form.get('session_id', str(uuid.uuid4()))
        
        # Validate audio file
        if audio_file.filename == '':
            return jsonify({'error': 'Empty audio filename'}), 400
            
        # Check file size
        audio_file.seek(0, os.SEEK_END)
        file_size = audio_file.tell()
        audio_file.seek(0)
        
        if file_size == 0:
            return jsonify({'error': 'Empty audio file'}), 400
        elif file_size > 10 * 1024 * 1024:  # 10MB limit
            return jsonify({'error': 'Audio file too large (max 10MB)'}), 400
        
        # Get file extension for format detection
        file_extension = os.path.splitext(audio_file.filename)[1].lower() if audio_file.filename else '.wav'
        
        # Save audio to temp file with proper cleanup handling
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_audio:
                audio_file.save(temp_audio.name)
                temp_path = temp_audio.name
            
            # Default audio format and parameters
            audio_format = speech.RecognitionConfig.AudioEncoding.LINEAR16
            sample_rate = 16000
            audio_content = None
            
            # Try to convert with pydub if available - This ensures audio format compatibility
            try:
                from pydub import AudioSegment
                # Load with original format
                sound = AudioSegment.from_file(temp_path)
                # Convert to mono, 16kHz
                sound = sound.set_channels(1).set_frame_rate(16000)
                
                converted_path = temp_path + '.converted.wav'
                sound.export(converted_path, format="wav")
                
                # Read converted audio
                with open(converted_path, 'rb') as f:
                    audio_content = f.read()
                
            except ImportError:
                logger.warning("Pydub not available, using original audio format")
                with open(temp_path, 'rb') as f:
                    audio_content = f.read()
                    
                # Make best guess about format based on extension
                if file_extension in ['.mp3', '.mpeg']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.MP3
                elif file_extension in ['.flac']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.FLAC
                elif file_extension in ['.ogg']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
                
            except Exception as e:
                logger.warning(f"Audio conversion failed: {e}. Using original format.")
                with open(temp_path, 'rb') as f:
                    audio_content = f.read()
                
                # Make best guess about format based on extension
                if file_extension in ['.mp3', '.mpeg']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.MP3
                elif file_extension in ['.flac']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.FLAC
                elif file_extension in ['.ogg']:
                    audio_format = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
            
            # Configure speech recognition with fallbacks
            # This implements the "Request Speech-to-Text Conversion" flow
            config = speech.RecognitionConfig(
                encoding=audio_format,
                sample_rate_hertz=sample_rate,
                language_code="en-US",
                model="command_and_search",  # More versatile model
                enable_automatic_punctuation=True,
                audio_channel_count=1
            )
            
            # Create audio object
            audio = speech.RecognitionAudio(content=audio_content)
            
            # Detect speech with retry logic
            max_retries = 3
            retry_count = 0
            response = None
            
            while retry_count < max_retries:
                try:
                    response = speech_client.recognize(config=config, audio=audio)
                    break  # Success, exit retry loop
                except Exception as e:
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        logger.warning(f"Speech API request failed, retrying ({retry_count}/{max_retries}): {e}")
                        continue
                    else:
                        return jsonify({'error': f'Speech API request failed: {e}'}), 500
            
            if not response.results:
                logger.warning("No speech detected in audio")
                return jsonify({
                    'response': "I couldn't hear anything. Could you please speak again?",
                    'text_response': "I couldn't hear anything. Could you please speak again?",
                    'error': 'No speech detected',
                    'session_id': session_id,
                    'multimodal_content': {'has_audio': True, 'has_image': False}
                })
            
            # Get transcribed text
            text = response.results[0].alternatives[0].transcript
            confidence = response.results[0].alternatives[0].confidence
            
            logger.info(f"Transcribed: '{text}' with confidence {confidence}")
            
            # Process the text query - This uses the same logic as text chat
            chat_response = process_chat_query(text, user_id, session_id)
            response_text = chat_response.get('response', '')
            
            # Generate audio response - This implements "Request Text-to-Speech Conversion"
            audio_content = generate_audio_response(response_text)
            
            # Add audio to response for multimodal output
            chat_response['speech_recognition'] = text
            chat_response['confidence'] = confidence
            chat_response['audio_response'] = audio_content
            
            # Store in Firebase if available - Implements "Store Processed Text Logs"
            if firebase_initialized and db:
                try:
                    chat_ref = db.collection('user_memories').document(user_id).collection('voice_interactions').document()
                    chat_data = {
                        'query': text,
                        'response': response_text,
                        'confidence': confidence,
                        'timestamp': datetime.now().isoformat(),
                        'session_id': session_id
                    }
                    
                    # Retry logic for Firebase write
                    max_retries = 3
                    retry_count = 0
                    while retry_count < max_retries:
                        try:
                            chat_ref.set(chat_data)
                            logger.info(f"Stored voice interaction in Firebase: {chat_ref.id}")
                            break  # Success, exit retry loop
                        except Exception as e:
                            if retry_count < max_retries - 1:
                                retry_count += 1
                                logger.warning(f"Firebase write failed, retrying ({retry_count}/{max_retries}): {e}")
                                continue
                            else:
                                logger.error(f"Error storing voice interaction after retries: {e}")
                                break
                except Exception as e:
                    logger.error(f"Error preparing voice interaction storage: {e}")
                    # Continue without Firebase storage
            
            logger.info(f"Voice processing complete for session {session_id}")
            return jsonify(chat_response)
        
        finally:
            # Cleanup temporary files
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temporary file {temp_path}: {e}")
            
            if converted_path and os.path.exists(converted_path):
                try:
                    os.unlink(converted_path)
                except Exception as e:
                    logger.warning(f"Failed to delete converted file {converted_path}: {e}")
    
    except Exception as e:
        logger.error(f"Unhandled error in process_voice: {e}", exc_info=True)
        
        # Cleanup temporary files in case of exception
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass
        
        if converted_path and os.path.exists(converted_path):
            try:
                os.unlink(converted_path)
            except:
                pass
        
        error_response = {
            'error': 'Internal server error processing voice',
            'text_response': "Sorry, I encountered an error processing your voice input. Could you try again?",
            'response': "Sorry, I encountered an error processing your voice input. Could you try again?",
            'session_id': request.form.get('session_id', str(uuid.uuid4())),
            'multimodal_content': {'has_audio': False, 'has_image': False}
        }
        return jsonify(error_response), 500

# ===============================================================================
# TEXT CHAT ENDPOINT
# Implements the context-aware query processing
# ===============================================================================
@app.route('/api/chat', methods=['POST'])
@require_api_key
def chat():
    """Process text chat queries with context awareness"""
    try:
        data = request.json
        if not data or 'query' not in data:
            return jsonify({'error': 'No query provided'}), 400
        
        query = data['query']
        # Validate query
        if not isinstance(query, str) or not query.strip():
            return jsonify({'error': 'Invalid query: must be a non-empty string'}), 400
            
        user_id = data.get('user_id', 'anonymous')
        session_id = data.get('session_id', str(uuid.uuid4()))
        
        logger.info(f"Processing chat query: '{query}' for user {user_id}, session {session_id}")
        
        # Process query with context - This implements "Query AI Agents for Contextual Search"
        chat_response = process_chat_query(query, user_id, session_id)
        response_text = chat_response.get('response', '')
        
        # Generate audio response for multimodal reply
        audio_content = generate_audio_response(response_text)
        chat_response['audio_response'] = audio_content
        
        # Store in Firebase if available - Implements "Store Processed Text Logs"
        if firebase_initialized and db:
            try:
                chat_ref = db.collection('user_memories').document(user_id).collection('chat_interactions').document()
                chat_data = {
                    'query': query,
                    'response': response_text,
                    'product_recommendations': chat_response.get('product_recommendations', []),
                    'timestamp': datetime.now().isoformat(),
                    'session_id': session_id
                }
                
                # Retry logic for Firebase write
                max_retries = 3
                retry_count = 0
                while retry_count < max_retries:
                    try:
                        chat_ref.set(chat_data)
                        logger.info(f"Stored chat interaction in Firebase: {chat_ref.id}")
                        break  # Success, exit retry loop
                    except Exception as e:
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            logger.warning(f"Firebase write failed, retrying ({retry_count}/{max_retries}): {e}")
                            continue
                        else:
                            logger.error(f"Error storing chat interaction after retries: {e}")
                            break
            except Exception as e:
                logger.error(f"Error preparing chat interaction storage: {e}")
                # Continue without Firebase storage
        
        logger.info(f"Chat processing complete for session {session_id}")
        return jsonify(chat_response)
    
    except Exception as e:
        logger.error(f"Unhandled error in chat: {e}", exc_info=True)
        error_response = {
            'error': 'Internal server error processing chat',
            'response': "Sorry, I encountered an error processing your message. Could you try again?",
            'text_response': "Sorry, I encountered an error processing your message. Could you try again?",
            'session_id': request.json.get('session_id', str(uuid.uuid4())) if request.json else str(uuid.uuid4()),
            'multimodal_content': {'has_audio': False, 'has_image': False}
        }
        return jsonify(error_response), 500

# ===============================================================================
# TEXT-TO-SPEECH FUNCTION
# Converts text responses to audio using Google Text-to-Speech
# Implements the "Text-to-Speech" component in Speech Services
# ===============================================================================
def generate_audio_response(text):
    """Generate audio response using Text-to-Speech API"""
    if not tts_client:
        logger.warning("Text-to-Speech client not available")
        return None
        
    try:
        # Skip empty text
        if not text:
            return None
            
        # Limit text length to avoid TTS API limits (5000 chars is Google's limit)
        if len(text) > 4500:
            text = text[:4500] + "..."
            
        # Create TTS request
        synthesis_input = texttospeech.SynthesisInput(text=text)
        
        # Configure voice - using standard (free) voice instead of premium Neural voice
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL,
            name="en-US-Standard-C"  # Standard voice (not premium)
        )
        
        # Configure audio
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=0.9,  # Slightly slower for better comprehension
            pitch=0.0,
            volume_gain_db=1.0
        )
        
        # Generate speech with retry logic
        max_retries = 3
        retry_count = 0
        response = None
        
        while retry_count < max_retries:
            try:
                response = tts_client.synthesize_speech(
                    input=synthesis_input,
                    voice=voice,
                    audio_config=audio_config
                )
                break  # Success, exit retry loop
            except Exception as e:
                if retry_count < max_retries - 1:
                    retry_count += 1
                    logger.warning(f"TTS API request failed, retrying ({retry_count}/{max_retries}): {e}")
                    continue
                else:
                    logger.error(f"Error generating speech after retries: {e}")
                    return None
        
        # Encode audio content as base64
        audio_data = base64.b64encode(response.audio_content).decode('utf-8')
        logger.info(f"Generated audio response ({len(audio_data)} bytes)")
        return audio_data
        
    except Exception as e:
        logger.error(f"Error generating audio: {e}")
        return None

# ===============================================================================
# QUERY PROCESSING FUNCTION
# Core logic for handling different types of user queries
# Implements the contextual search capabilities by querying Firebase
# ===============================================================================
def process_chat_query(query, user_id, session_id):
    """Process queries with context awareness and memory retrieval"""
    try:
        query_lower = query.lower().strip()
        timestamp = datetime.now().isoformat()
        
        # Store in chat history - Implements "Store Processed Text Logs"
        if firebase_initialized and db:
            try:
                chat_ref = db.collection('user_memories').document(user_id).collection('chats').document()
                chat_data = {
                    'query': query,
                    'timestamp': timestamp,
                    'session_id': session_id
                }
                
                # Retry logic for Firebase write
                max_retries = 3
                retry_count = 0
                while retry_count < max_retries:
                    try:
                        chat_ref.set(chat_data)
                        break  # Success, exit retry loop
                    except Exception as e:
                        if retry_count < max_retries - 1:
                            retry_count += 1
                            logger.warning(f"Firebase write failed, retrying ({retry_count}/{max_retries}): {e}")
                            continue
                        else:
                            logger.error(f"Error storing chat history after retries: {e}")
                            break
            except Exception as e:
                logger.error(f"Error preparing chat history storage: {e}")
                # Continue processing even if Firebase storage fails
        
        # -------------------------------------------------------------
        # LOCATION QUERY HANDLER - "Where did I put X?"
        # Implements the "Query Logs for AI Agents" flow for item retrieval
        # -------------------------------------------------------------
        location_patterns = [
            'where did i put', 'where are my', 'where is my', 
            'where are the', 'where is the', 'can\'t find', 
            'find my', 'where did i store', 'where did i leave'
        ]
        
        if any(pattern in query_lower for pattern in location_patterns):
            # Extract the item being searched for
            used_pattern = next((pattern for pattern in location_patterns if pattern in query_lower), None)
            
            if used_pattern:
                # Get the item name
                pattern_end_index = query_lower.find(used_pattern) + len(used_pattern)
                remaining_text = query_lower[pattern_end_index:].strip()
                
                # Clean up search term
                for word in ['the', 'my', 'a', 'an']:
                    if remaining_text.startswith(f"{word} "):
                        remaining_text = remaining_text[len(word)+1:]
                
                search_item = remaining_text.rstrip('.?!,;:')
                
                # Guard against empty search terms
                if not search_item:
                    return {
                        'response': "I'm not sure what you're looking for. Can you please specify what item you're trying to find?",
                        'memory_type': 'clarification_needed',
                        'session_id': session_id,
                        'multimodal_content': {
                            'has_audio': True,
                            'has_image': False,
                            'has_item_location': False
                        }
                    }
                
                logger.info(f"Looking for item: '{search_item}'")
                
                # Find in memory (only if Firebase is available)
                # This implements "Request Relevant Data from Firebase"
                memory_results = None
                if firebase_initialized and db:
                    memory_results = find_item_in_memory(user_id, search_item)
                
                if memory_results:
                    location = memory_results.get('location', '')
                    timestamp = memory_results.get('timestamp', '')
                    item_type = memory_results.get('item_type', '')
                    
                    # Format timestamp with error handling
                    try:
                        dt = datetime.fromisoformat(timestamp)
                        formatted_time = dt.strftime("%A, %B %d at %I:%M %p")
                    except Exception as e:
                        logger.error(f"Error formatting timestamp: {e}")
                        formatted_time = "recently"
                    
                    if item_type == 'storage':
                        storage_location = memory_results.get('storage_location', 'somewhere')
                        response = f"Based on what I remember, you stored {search_item} in the {storage_location} on {formatted_time}."
                    elif item_type == 'purchase':
                        response = f"Based on what I remember, you purchased {search_item} on {formatted_time}."
                    else:
                        response = f"I remember seeing {search_item} at {location} on {formatted_time}."
                    
                    logger.info(f"Found item memory: {item_type}")
                    
                    # Return ONLY location information, no product recommendations
                    return {
                        'response': response,
                        'memory_type': 'item_location',
                        'memory_details': memory_results,
                        'session_id': session_id,
                        'multimodal_content': {
                            'has_audio': True,
                            'has_image': False,
                            'has_item_location': True
                        }
                    }
                else:
                    logger.info(f"No memory found for item: {search_item}")
                    return {
                        'response': f"I'm sorry, I don't remember where you put {search_item}. Try uploading a photo the next time you store it.",
                        'memory_type': 'not_found',
                        'session_id': session_id,
                        'multimodal_content': {
                            'has_audio': True,
                            'has_image': False,
                            'has_item_location': False
                        }
                    }
        
        # -------------------------------------------------------------
        # PRODUCT RECOMMENDATION HANDLER
        # Implements the "Fetch Similar Products When Required"
        # Connects to E-commerce API
        # -------------------------------------------------------------
        product_patterns = [
            'buy', 'purchase', 'shop for', 'get me', 
            'where can i get', 'find products', 'similar to',
            'shopping', 'order', 'want to purchase'
        ]
        
        if any(pattern in query_lower for pattern in product_patterns):
            # Extract product name
            product_name = extract_product_name_from_query(query_lower)
            
            if product_name:
                logger.info(f"Looking for product: '{product_name}'")
                
                # Look up in memory (only if Firebase is available)
                product_memory = None
                if firebase_initialized and db:
                    product_memory = find_product_in_memory(user_id, product_name)
                
                # Get recommendations - This implements connection to E-commerce API
                recommendations = get_product_recommendations(product_name)
                
                if recommendations:
                    if product_memory:
                        response = f"I found some {product_name} products that you might like. Here are some options you can buy online."
                    else:
                        response = f"I don't recall you showing me {product_name} before, but here are some products you might like."
                    
                    logger.info(f"Found {len(recommendations)} product recommendations")
                    
                    return {
                        'response': response,
                        'product_recommendations': recommendations,
                        'memory_type': 'product_recommendation',
                        'session_id': session_id,
                        'multimodal_content': {
                            'has_audio': True,
                            'has_image': True,
                            'has_item_location': False
                        }
                    }
            
            # Try with recent products only for explicit shopping queries
            recent_products = []
            if firebase_initialized and db:
                recent_products = get_recent_products(user_id)
            
            if recent_products:
                recommendations = get_product_recommendations(recent_products[0])
                
                if recommendations:
                    response = f"Based on your recent activity, I think you might be interested in {recent_products[0]}. Here are some options."
                    
                    logger.info(f"Recommended recent product: {recent_products[0]}")
                    
                    return {
                        'response': response,
                        'product_recommendations': recommendations,
                        'memory_type': 'recent_product_recommendation',
                        'session_id': session_id,
                        'multimodal_content': {
                            'has_audio': True,
                            'has_image': True,
                            'has_item_location': False
                        }
                    }
            
            # Fallback for product queries when no specific product is found
            return {
                'response': "I'm not sure what product you're looking for. Can you be more specific about what you want to buy?",
                'memory_type': 'clarification_needed',
                'session_id': session_id,
                'multimodal_content': {
                    'has_audio': True,
                    'has_image': False,
                    'has_item_location': False
                }
            }
        
        # -------------------------------------------------------------
        # MEMORY RECALL HANDLER - "What did I see?"
        # Implements "Retrieve Logs and Metadata" from Firebase
        # -------------------------------------------------------------
        memory_patterns = [
            'what did i see', 'what did you see', 'remember seeing', 
            'last image', 'latest photo', 'what was in the picture'
        ]
        
        if any(pattern in query_lower for pattern in memory_patterns):
            recent_memory = None
            if firebase_initialized and db:
                recent_memory = get_recent_memory(user_id)
            
            if recent_memory:
                description = recent_memory.get('description', '')
                response = f"In your most recent image, {description}"
                
                logger.info("Retrieved recent memory description")
                
                return {
                    'response': response,
                    'memory_type': 'recent_image',
                    'memory_details': recent_memory,
                    'session_id': session_id,
                    'multimodal_content': {
                        'has_audio': True,
                        'has_image': False,
                        'has_item_location': False
                    }
                }
            else:
                logger.info("No recent memory found")
                response = "I don't have any recent image memories for you."
                return {
                    'response': response,
                    'memory_type': 'not_found',
                    'session_id': session_id,
                    'multimodal_content': {
                        'has_audio': True,
                        'has_image': False,
                        'has_item_location': False
                    }
                }
        
        # -------------------------------------------------------------
        # OBJECT IDENTIFICATION HANDLER - "What is this?"
        # Uses recent Vertex AI image processing results
        # -------------------------------------------------------------
        if any(phrase in query_lower for phrase in ['what is this', 'what am i looking at', 'what do you see', 'what is that']):
            recent_memory = None
            if firebase_initialized and db:
                recent_memory = get_recent_memory(user_id)
            
            if recent_memory:
                description = recent_memory.get('description', '')
                potential_products = recent_memory.get('potential_products', [])
                
                # Just identify objects, DO NOT offer product recommendations
                if potential_products:
                    product_name = potential_products[0]
                    response = f"This appears to be {product_name}. {description}"
                else:
                    response = description
                
                logger.info(f"Identified object without product recommendations")
                
                return {
                    'response': response,
                    'memory_type': 'object_identification',
                    'session_id': session_id,
                    'multimodal_content': {
                        'has_audio': True,
                        'has_image': False,
                        'has_item_location': False
                    }
                }
            else:
                logger.info("No recent memory for object identification")
                return {
                    'response': "I need to see an image first. Try uploading a photo of what you're looking at.",
                    'memory_type': 'not_found',
                    'session_id': session_id,
                    'multimodal_content': {
                        'has_audio': True,
                        'has_image': False,
                        'has_item_location': False
                    }
                }
        
        # General assistant response for unrecognized queries
        general_response = "I'm here to help you find items and recommend products. You can ask me where you put something, or about products you've shown me in photos."
        
        logger.info("Provided general assistant response")
        
        return {
            'response': general_response,
            'memory_type': 'general',
            'session_id': session_id,
            'multimodal_content': {
                'has_audio': True,
                'has_image': False,
                'has_item_location': False
            }
        }
    
    except Exception as e:
        logger.error(f"Error processing query: {e}", exc_info=True)
        return {
            'response': "I encountered an error processing your request. Please try again.",
            'error': str(e),
            'session_id': session_id,
            'multimodal_content': {
                'has_audio': True,
                'has_image': False,
                'has_item_location': False
            }
        }

# ===============================================================================
# ITEM MEMORY SEARCH FUNCTION
# Searches Firebase for information about where items were seen/stored
# Implements the "Query Logs for AI Agents" 
# ===============================================================================
def find_item_in_memory(user_id, item_name):
    """Search for an item's location in Firestore"""
    if not firebase_initialized or not db:
        logger.warning("Firebase not available for memory lookup")
        return None
        
    try:
        if not item_name or not item_name.strip():
            return None
            
        search_term = item_name.lower().strip()
        
        # Search in item_locations collection
        item_locations_ref = db.collection('user_memories').document(user_id).collection('item_locations')
        
        # Try array-contains query for exact matches
        try:
            exact_matches_query = item_locations_ref.where('items', 'array_contains', search_term)
            exact_matches = exact_matches_query.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(1).stream()
            
            exact_match_list = list(exact_matches)
            if exact_match_list:
                return exact_match_list[0].to_dict()
        except Exception as e:
            logger.error(f"Error querying exact matches: {e}")
        
        # Try partial matches with improved algorithm
        try:
            all_locations_query = item_locations_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20)
            all_locations = all_locations_query.stream()
            
            # Use a scoring system for better matches
            best_match = None
            best_score = 0
            
            for location in all_locations:
                location_data = location.to_dict()
                items = location_data.get('items', [])
                
                for stored_item in items:
                    if not isinstance(stored_item, str):
                        continue
                        
                    stored_item_lower = stored_item.lower()
                    
                    # Calculate match score - exact match gets highest score
                    if search_term == stored_item_lower:
                        score = 100
                    elif search_term in stored_item_lower:
                        score = 75
                    elif stored_item_lower in search_term:
                        score = 60
                    elif any(word in stored_item_lower for word in search_term.split()):
                        score = 40
                    else:
                        continue
                    
                    if score > best_score:
                        best_score = score
                        best_match = location_data
            
            if best_match:
                return best_match
                
        except Exception as e:
            logger.error(f"Error querying all locations: {e}")
        
        # Search in images as fallback
        try:
            images_ref = db.collection('user_memories').document(user_id).collection('images')
            image_matches_query = images_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20)
            image_matches = image_matches_query.stream()
            
            # Use a scoring system for better matches
            best_match = None
            best_score = 0
            
            for image in image_matches:
                image_data = image.to_dict()
                
                # Check labels
                for label in image_data.get('labels', []):
                    if isinstance(label, dict):
                        label_name = label.get('name', '').lower()
                        
                        # Calculate match score
                        if search_term == label_name:
                            score = 90
                        elif search_term in label_name:
                            score = 70
                        elif label_name in search_term:
                            score = 50
                        elif any(word in label_name for word in search_term.split()):
                            score = 30
                        else:
                            continue
                        
                        if score > best_score:
                            best_score = score
                            best_match = {
                                'location': image_data.get('location', 'unknown'),
                                'timestamp': image_data.get('timestamp', ''),
                                'item_type': 'seen_in_image'
                            }
                
                # Check objects
                for obj in image_data.get('objects', []):
                    if isinstance(obj, dict):
                        obj_name = obj.get('name', '').lower()
                        
                        # Calculate match score
                        if search_term == obj_name:
                            score = 90
                        elif search_term in obj_name:
                            score = 70
                        elif obj_name in search_term:
                            score = 50
                        elif any(word in obj_name for word in search_term.split()):
                            score = 30
                        else:
                            continue
                        
                        if score > best_score:
                            best_score = score
                            best_match = {
                                'location': image_data.get('location', 'unknown'),
                                'timestamp': image_data.get('timestamp', ''),
                                'item_type': 'seen_in_image'
                            }
            
            if best_match:
                return best_match
                
        except Exception as e:
            logger.error(f"Error searching in images: {e}")
        
        return None
    
    except Exception as e:
        logger.error(f"Error finding item in memory: {e}")
        return None

# ===============================================================================
# RECENT MEMORY FUNCTION
# Gets the most recent image analysis from Firebase
# Used for "What did I see?" queries
# ===============================================================================
def get_recent_memory(user_id):
    """Get most recent image memory from Firestore"""
    if not firebase_initialized or not db:
        logger.warning("Firebase not available for memory lookup")
        return None
        
    try:
        images_ref = db.collection('user_memories').document(user_id).collection('images')
        recent_query = images_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(1)
        
        # Add retry logic
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                recent_images = recent_query.stream()
                recent_list = list(recent_images)
                if recent_list:
                    return recent_list[0].to_dict()
                return None
            except Exception as e:
                if retry_count < max_retries - 1:
                    retry_count += 1
                    logger.warning(f"Firebase query failed, retrying ({retry_count}/{max_retries}): {e}")
                    continue
                else:
                    logger.error(f"Error getting recent memory after retries: {e}")
                    return None
    
    except Exception as e:
        logger.error(f"Error getting recent memory: {e}")
        return None

# ===============================================================================
# PRODUCT MEMORY SEARCH FUNCTION
# Searches Firebase for information about products
# Used for contextual product recommendations
# ===============================================================================
def find_product_in_memory(user_id, product_name):
    """Find a product in memory"""
    if not firebase_initialized or not db:
        logger.warning("Firebase not available for product memory lookup")
        return None
        
    try:
        if not product_name or not product_name.strip():
            return None
            
        search_term = product_name.lower().strip()
        
        # Search in images collection
        images_ref = db.collection('user_memories').document(user_id).collection('images')
        
        # Try exact match in potential_products
        try:
            product_matches_query = images_ref.where('potential_products', 'array_contains', search_term)
            
            # Add retry logic
            max_retries = 3
            retry_count = 0
            
            while retry_count < max_retries:
                try:
                    product_matches = product_matches_query.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(1).stream()
                    match_list = list(product_matches)
                    if match_list:
                        return match_list[0].to_dict()
                    break  # No matches, exit retry loop
                except Exception as e:
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        logger.warning(f"Firebase query failed, retrying ({retry_count}/{max_retries}): {e}")
                        continue
                    else:
                        logger.error(f"Error querying exact product matches after retries: {e}")
                        break
        except Exception as e:
            logger.error(f"Error setting up exact product matches query: {e}")
        
        # Try partial matches with improved algorithm
        try:
            all_images_query = images_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(20)
            
            # Add retry logic
            max_retries = 3
            retry_count = 0
            all_images = None
            
            while retry_count < max_retries:
                try:
                    all_images = list(all_images_query.stream())
                    break  # Success, exit retry loop
                except Exception as e:
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        logger.warning(f"Firebase query failed, retrying ({retry_count}/{max_retries}): {e}")
                        continue
                    else:
                        logger.error(f"Error querying all images after retries: {e}")
                        return None
            
            if not all_images:
                return None
                
            # Use a scoring system for better matches
            best_match = None
            best_score = 0
            
            for image in all_images:
                image_data = image.to_dict()
                
                # Check potential_products
                potential_products = image_data.get('potential_products', [])
                for product in potential_products:
                    if not isinstance(product, str):
                        continue
                        
                    product_lower = product.lower()
                    
                    # Calculate match score
                    if search_term == product_lower:
                        score = 100
                    elif search_term in product_lower:
                        score = 80
                    elif product_lower in search_term:
                        score = 70
                    elif any(word in product_lower for word in search_term.split()):
                        score = 50
                    else:
                        continue
                    
                    if score > best_score:
                        best_score = score
                        best_match = image_data
                
                # Only check labels and objects if we haven't found a good match in potential_products
                if best_score < 70:
                    # Check labels
                    for label in image_data.get('labels', []):
                        if isinstance(label, dict):
                            label_name = label.get('name', '').lower()
                            
                            # Calculate match score
                            if search_term == label_name:
                                score = 90
                            elif search_term in label_name:
                                score = 70
                            elif label_name in search_term:
                                score = 60
                            elif any(word in label_name for word in search_term.split()):
                                score = 40
                            else:
                                continue
                            
                            if score > best_score:
                                best_score = score
                                best_match = image_data
                    
                    # Check objects
                    for obj in image_data.get('objects', []):
                        if isinstance(obj, dict):
                            obj_name = obj.get('name', '').lower()
                            
                            # Calculate match score
                            if search_term == obj_name:
                                score = 90
                            elif search_term in obj_name:
                                score = 70
                            elif obj_name in search_term:
                                score = 60
                            elif any(word in obj_name for word in search_term.split()):
                                score = 40
                            else:
                                continue
                            
                            if score > best_score:
                                best_score = score
                                best_match = image_data
            
            if best_match:
                return best_match
                
        except Exception as e:
            logger.error(f"Error searching partial product matches: {e}")
        
        return None
    
    except Exception as e:
        logger.error(f"Error finding product in memory: {e}")
        return None

# ===============================================================================
# RECENT PRODUCTS FUNCTION
# Gets list of recently detected products from Firebase
# Used for contextual product recommendations
# ===============================================================================
def get_recent_products(user_id):
    """Get list of recent products from memory"""
    if not firebase_initialized or not db:
        logger.warning("Firebase not available for recent products lookup")
        return []
        
    try:
        images_ref = db.collection('user_memories').document(user_id).collection('images')
        recent_query = images_ref.order_by('timestamp', direction=firestore.Query.DESCENDING).limit(5)
        
        # Add retry logic
        max_retries = 3
        retry_count = 0
        recent_images = None
        
        while retry_count < max_retries:
            try:
                recent_images = list(recent_query.stream())
                break  # Success, exit retry loop
            except Exception as e:
                if retry_count < max_retries - 1:
                    retry_count += 1
                    logger.warning(f"Firebase query failed, retrying ({retry_count}/{max_retries}): {e}")
                    continue
                else:
                    logger.error(f"Error getting recent products after retries: {e}")
                    return []
        
        if not recent_images:
            return []
            
        all_products = []
        for image in recent_images:
            image_data = image.to_dict()
            potential_products = image_data.get('potential_products', [])
            
            # Filter out non-string items
            potential_products = [p for p in potential_products if isinstance(p, str)]
            all_products.extend(potential_products)
        
        # Remove duplicates preserving order
        seen = set()
        unique_products = [p for p in all_products if not (p in seen or seen.add(p))]
        
        return unique_products[:5]
    
    except Exception as e:
        logger.error(f"Error getting recent products: {e}")
        return []

# ===============================================================================
# PRODUCT RECOMMENDATION FUNCTION
# Connects to free E-commerce APIs to get product recommendations
# Implements the connection to "E-commerce API"
# ===============================================================================
def get_product_recommendations(product_name):
    """Get product information using various APIs"""
    try:
        if not product_name or not product_name.strip():
            return []
            
        cleaned_product = product_name.lower().strip()
        
        # Clean product name further to remove any special characters
        cleaned_product = re.sub(r'[^a-z0-9 ]', '', cleaned_product)
        
        # Generate direct shopping links with proper URL encoding
        google_shopping_url = f"https://www.google.com/search?q={urllib.parse.quote(cleaned_product)}&tbm=shop"
        amazon_url = f"https://www.amazon.com/s?k={urllib.parse.quote(cleaned_product)}"
        ebay_url = f"https://www.ebay.com/sch/i.html?_nkw={urllib.parse.quote(cleaned_product)}"
        
        products = []
        
        # Try Amazon Product API if credentials exist
        amazon_api_key = os.environ.get('AMAZON_API_KEY')
        if amazon_api_key:
            try:
                # Placeholder for Amazon API integration
                # This would be implemented with the actual Amazon Product API
                pass
            except Exception as e:
                logger.warning(f"Amazon API error: {e}")
        
        # Try OpenFoodFacts API for food items
        try:
            food_url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={urllib.parse.quote(cleaned_product)}&search_simple=1&action=process&json=1"
            
            # Add timeout to prevent hanging
            food_response = requests.get(food_url, timeout=3)
            if food_response.status_code == 200:
                data = food_response.json()
                
                if 'products' in data and data['products'] and len(data['products']) > 0:
                    # We have food product results
                    for item in data['products'][:2]:  # Get top 2
                        product = {
                            'title': item.get('product_name', cleaned_product.title()),
                            'price': 'Price varies by store',
                            'image': item.get('image_url', f'https://via.placeholder.com/150?text={urllib.parse.quote(cleaned_product)}'),
                            'url': f"https://world.openfoodfacts.org/product/{item.get('code', '')}"
                        }
                        products.append(product)
        except Exception as e:
            logger.warning(f"OpenFoodFacts API error: {e}")
        
        # Try Open Library API for books
        if len(products) < 2:
            try:
                book_url = f"https://openlibrary.org/search.json?q={urllib.parse.quote(cleaned_product)}"
                # Add timeout to prevent hanging
                book_response = requests.get(book_url, timeout=3)
                
                if book_response.status_code == 200:
                    data = book_response.json()
                    
                    if 'docs' in data and data['docs'] and len(data['docs']) > 0:
                        for item in data['docs'][:2]:
                            if 'title' in item:
                                cover_id = item.get('cover_i', 0)
                                cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else f"https://via.placeholder.com/150?text=Book"
                                
                                product = {
                                    'title': item.get('title', cleaned_product.title()),
                                    'price': 'Price varies by store',
                                    'image': cover_url,
                                    'url': f"https://openlibrary.org{item.get('key', '')}"
                                }
                                products.append(product)
            except Exception as e:
                logger.warning(f"Open Library API error: {e}")
        
        # Always add general shopping links if we need more results
        if len(products) < 3:
            remaining_slots = 3 - len(products)
            shopping_links = [
                {
                    'title': f'{cleaned_product.title()} - Google Shopping',
                    'price': 'Various prices',
                    'image': f'https://via.placeholder.com/150?text={urllib.parse.quote("Google Shopping")}',
                    'url': google_shopping_url
                },
                {
                    'title': f'{cleaned_product.title()} - Amazon',
                    'price': 'Various prices',
                    'image': f'https://via.placeholder.com/150?text={urllib.parse.quote("Amazon")}',
                    'url': amazon_url
                },
                {
                    'title': f'{cleaned_product.title()} - eBay',
                    'price': 'Various prices',
                    'image': f'https://via.placeholder.com/150?text={urllib.parse.quote("eBay")}',
                    'url': ebay_url
                }
            ]
            products.extend(shopping_links[:remaining_slots])
        
        return products[:3]  # Return top 3 results
    
    except Exception as e:
        logger.error(f"Error getting product recommendations: {e}")
        # Fallback with safe URL encoding
        google_shopping_url = f"https://www.google.com/search?q={urllib.parse.quote(product_name)}&tbm=shop"
        return [
            {
                'title': f'Search results for {product_name}',
                'price': 'Various prices',
                'image': f'https://via.placeholder.com/150?text={urllib.parse.quote("Shopping Search")}',
                'url': google_shopping_url
            }
        ]

# ===============================================================================
# PRODUCT NAME EXTRACTION FUNCTION
# Parses queries to identify product names for shopping requests
# Supports the E-commerce API connection
# ===============================================================================
def extract_product_name_from_query(query):
    """Extract product name from a query string"""
    try:
        if not query or not query.strip():
            return None
            
        query_lower = query.lower().strip()
        
        # Define patterns with improved recognition
        patterns = [
            ('buy', ['for', 'online', 'now', 'from', 'at', 'on']),
            ('purchase', ['for', 'online', 'from', 'at', 'on']),
            ('shop for', ['online', 'at', 'on', 'in']),
            ('get me', ['from', 'at', 'online', 'on']),
            ('get me a', ['from', 'at', 'online', 'on']),
            ('where can i get', ['from', 'at', 'online', 'on']),
            ('find products like', ['online', 'similar to', 'from']),
            ('similar to', ['online', 'like', 'from']),
            ('looking for', ['online', 'like', 'similar to', 'from'])
        ]
        
        for start_pattern, end_patterns in patterns:
            if start_pattern in query_lower:
                start_idx = query_lower.find(start_pattern) + len(start_pattern)
                
                # Find earliest end pattern
                end_idx = len(query_lower)
                for end_pattern in end_patterns:
                    pattern_idx = query_lower.find(end_pattern, start_idx)
                    if pattern_idx != -1 and pattern_idx < end_idx:
                        end_idx = pattern_idx
                
                product_name = query_lower[start_idx:end_idx].strip()
                
                # Clean up
                product_name = product_name.strip('?!.,;: ')
                
                # Remove articles
                for article in ['a ', 'an ', 'the ', 'some ']:
                    if product_name.startswith(article):
                        product_name = product_name[len(article):]
                
                if product_name:
                    return product_name
        
        # Simple keyword extraction fallback
        keywords = ['buy', 'purchase', 'get', 'find', 'shop', 'want', 'need', 'looking']
        for keyword in keywords:
            if keyword in query_lower:
                start_idx = query_lower.find(keyword) + len(keyword)
                
                # Skip connecting words
                connecting_words = [' a ', ' an ', ' the ', ' some ', ' for ', ' to ']
                for word in connecting_words:
                    if query_lower[start_idx:].strip().startswith(word.strip()):
                        start_idx += len(word)
                
                product_name = query_lower[start_idx:].strip()
                
                # Clean up
                product_name = product_name.strip('?!.,;: ')
                
                # Extract up to first preposition
                prepositions = [' from ', ' at ', ' in ', ' on ', ' by ', ' with ', ' for ']
                for prep in prepositions:
                    if prep in product_name:
                        product_name = product_name.split(prep)[0].strip()
                
                if product_name:
                    return product_name
        
        # If all detection methods fail, return None
        return None
    
    except Exception as e:
        logger.error(f"Error extracting product name: {e}")
        return None

# ===============================================================================
# MAIN ENTRY POINT
# Starts the Flask server when the script is run directly
# ===============================================================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting AI assistant server on port {port}")
    app.run(debug=debug, host='0.0.0.0', port=port)
