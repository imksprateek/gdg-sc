# AI Context-Aware Service

This service handles image processing, speech recognition, and context-aware responses as part of the GDG project.

## Setup Instructions

1. Install dependencies:

pip install -r requirements.txt

 # Set up environment variables
export GOOGLE_APPLICATION_CREDENTIALS="./google-credentials.json"
export FIREBASE_CREDENTIALS="./serviceAccountKey.json"

2. Set up credentials:
- .env` and customize values
- Create a Firebase service account and save as `serviceAccountKey.json`
- Create a Google Cloud service account with Vision, Speech, and Text-to-Speech permissions
  and save as `google-credentials.json`

3. Run the service:

## API Endpoints

- `GET /health` - Service health check
- `POST /api/process-image` - Process and describe images
- `POST /api/process-voice` - Process voice input
- `POST /api/chat` - Handle text queries with context awareness

## Environment Variables

- `PORT` - Service port (default: 8080)
- `DEBUG` - Enable debug mode (default: False)
- `API_KEY_REQUIRED` - Require API key for endpoints (default: False)
- `API_KEY` - API key for endpoint authentication
- `FIREBASE_CREDENTIALS` - Path to Firebase credentials file
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Cloud credentials file
