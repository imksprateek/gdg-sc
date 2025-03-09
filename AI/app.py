import os
import google.generativeai as genai
import chromadb
from sentence_transformers import SentenceTransformer
from flask import Flask, request, jsonify
from PIL import Image
import io
import datetime

# ✅ Use API Key for Authentication
API_KEY = ""
genai.configure(api_key=API_KEY)

# ✅ Initialize Gemini Model
model = genai.GenerativeModel("gemini-2.0-flash")

# ✅ Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_store = chroma_client.get_or_create_collection(name="image_descriptions")

# ✅ Initialize SentenceTransformer for embedding text
embedder = SentenceTransformer("all-MiniLM-L6-v2")

app = Flask(__name__)


@app.route("/describe-image", methods=["POST"])
def describe_image():
    """Handles image uploads, generates descriptions, and stores them with userId and timestamp."""
    if "image" not in request.files or "userId" not in request.form:
        return jsonify({"error": "Image and userId are required"}), 400

    user_id = request.form["userId"]
    image_file = request.files["image"]
    image = Image.open(io.BytesIO(image_file.read()))

    # 🔹 Generate image description
    response = model.generate_content([image,
                                       "You are Sherlock Holmes, a mind with great attention to detail. Describe this image in complete detail without missing anything."])
    description = response.text.strip()

    # 🔹 Generate embedding for the description
    embedding = embedder.encode(description).tolist()

    # 🔹 Store userId, timestamp, description, and embedding in ChromaDB
    timestamp = datetime.datetime.utcnow().isoformat()  # Store UTC timestamp
    record_id = f"{user_id}_{timestamp}"

    vector_store.add(
        documents=[f"{timestamp} | {description}"],  # Store timestamp along with description
        embeddings=[embedding],
        ids=[record_id]
    )

    return jsonify({"userId": user_id, "timestamp": timestamp, "description": description})


@app.route("/query", methods=["POST"])
def query_images():
    """Handles user queries and retrieves context-aware responses for the specified userId."""
    data = request.json
    if "query" not in data or "userId" not in data:
        return jsonify({"error": "Query and userId are required"}), 400

    user_id = data["userId"]
    query_text = data["query"]
    query_embedding = embedder.encode(query_text).tolist()

    # 🔹 Retrieve only entries belonging to the specified user
    all_results = vector_store.query(query_embeddings=[query_embedding], n_results=10)

    # 🔹 Filter results for the given userId
    matched_descriptions = []
    for desc, doc_id in zip(all_results["documents"][0], all_results["ids"][0]):
        if doc_id.startswith(user_id):  # Match userId prefix
            matched_descriptions.append(desc)

    # 🔹 If no descriptions are found, return a fallback response
    if not matched_descriptions:
        return jsonify({"response": "No relevant information found."})

    # 🔹 Use Gemini to generate a context-aware response
    prompt = f"Based on the following stored descriptions, provide a response to the query '{query_text}':\n\n"
    for desc in matched_descriptions:
        prompt += f"- {desc}\n\n"

    response = model.generate_content(prompt)
    response_text = response.text.strip()
    timestamp = datetime.datetime.utcnow().isoformat()  # Capture response time

    return jsonify({"userId": user_id, "query": query_text, "response": response_text, "timestamp": timestamp})


@app.route("/clear-context", methods=["POST"])
def clear_context():
    """Clears all stored context for a given userId."""
    data = request.json
    if "userId" not in data:
        return jsonify({"error": "UserId is required"}), 400

    user_id = data["userId"]

    # 🔹 Retrieve all stored documents
    all_docs = vector_store.get()

    # 🔹 Identify document IDs belonging to the user
    user_doc_ids = [doc_id for doc_id in all_docs["ids"] if doc_id.startswith(user_id)]

    # 🔹 If no records exist for this user, return a message
    if not user_doc_ids:
        return jsonify({"message": "No context found for this user."})

    # 🔹 Delete user's records from the vector store
    vector_store.delete(user_doc_ids)

    return jsonify({"message": f"Cleared context for userId: {user_id}", "deleted_entries": len(user_doc_ids)})


if __name__ == "__main__":
    app.run(debug=True)