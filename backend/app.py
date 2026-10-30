
from pathlib import Path
import json
import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
# file upload imports
import uuid
import fitz
from werkzeug.utils import secure_filename
import re
#add storage
from datetime import datetime, timezone


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATA_PATH = BASE_DIR / "data" / "sample_knowledge.json"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Persistent storage for chat history and study materials
STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

CHAT_HISTORY_PATH = STORAGE_DIR / "chat_history.json"
STUDY_MATERIALS_PATH = STORAGE_DIR / "study_materials.json"
PRACTICE_TEST_HISTORY_PATH = STORAGE_DIR / "practice_test_history.json"

def read_chat_history():
    try:
        with open(CHAT_HISTORY_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_chat_history(chats):
    with open(CHAT_HISTORY_PATH, "w", encoding="utf-8") as file:
        json.dump(chats, file, ensure_ascii=False, indent=2)
def read_practice_test_history():
    try:
        with open(PRACTICE_TEST_HISTORY_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_practice_test_history(history):
    with open(PRACTICE_TEST_HISTORY_PATH, "w", encoding="utf-8") as file:
        json.dump(history, file, ensure_ascii=False, indent=2)
        
def save_message_to_conversation(conversation_id, role, content, sources=None):
    if not conversation_id:
        return

    conversations = read_chat_history()

    for conversation in conversations:
        if conversation.get("id") == conversation_id:
            message = {
                "role": role,
                "content": content,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            if sources is not None:
                message["sources"] = sources

            conversation.setdefault("messages", []).append(message)
            conversation["updated_at"] = datetime.now(timezone.utc).isoformat()

            write_chat_history(conversations)
            return


import json
# Create storage files if they do not exist
if not CHAT_HISTORY_PATH.exists():
    CHAT_HISTORY_PATH.write_text("[]", encoding="utf-8")

if not STUDY_MATERIALS_PATH.exists():
    STUDY_MATERIALS_PATH.write_text("[]", encoding="utf-8")
if not PRACTICE_TEST_HISTORY_PATH.exists():
    PRACTICE_TEST_HISTORY_PATH.write_text("[]", encoding="utf-8")
app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        ]
    }
})

def load_knowledge():
    with DATA_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)



def extract_pdf_chunks(pdf_path):
    """Extract PDF text and create sentence-aware searchable chunks."""
    chunks = []

    with fitz.open(pdf_path) as document:
        for page_number, page in enumerate(document, start=1):
            page_text = page.get_text("text")

            # Preserve paragraph boundaries while cleaning excessive whitespace.
            lines = [line.strip() for line in page_text.splitlines()]
            page_text = "\n".join(line for line in lines if line)

            if not page_text.strip():
                continue

            # Split the page into paragraphs.
            paragraphs = re.split(r"\n\s*\n", page_text)

            sentences = []
            for paragraph in paragraphs:
                paragraph = re.sub(r"\s+", " ", paragraph).strip()
                if not paragraph:
                    continue

                # Split at likely sentence boundaries.
                parts = re.split(r"(?<=[.!?])\s+", paragraph)
                sentences.extend(part.strip() for part in parts if part.strip())

            # Group complete sentences into chunks of about 1,000 characters.
            chunk_size = 1000
            overlap_size = 150
            current_sentences = []
            current_length = 0
            page_chunks = []

            for sentence in sentences:
                if current_sentences and (
                    current_length + len(sentence) + 1 > chunk_size
                ):
                    page_chunks.append(" ".join(current_sentences))

                    # Keep recent sentences as overlap for context.
                    overlap = []
                    overlap_length = 0

                    for previous in reversed(current_sentences):
                        if overlap_length + len(previous) + 1 > overlap_size:
                            break
                        overlap.insert(0, previous)
                        overlap_length += len(previous) + 1

                    current_sentences = overlap
                    current_length = overlap_length

                current_sentences.append(sentence)
                current_length += len(sentence) + 1

            if current_sentences:
                page_chunks.append(" ".join(current_sentences))

            for chunk_number, content in enumerate(page_chunks, start=1):
                if not content.strip():
                    continue

                chunks.append({
                    "id": (
                        f"{pdf_path.stem}-page-{page_number}"
                        f"-section-{chunk_number}"
                    ),
                    "title": (
                        f"{pdf_path.stem} — Page {page_number}, "
                        f"Section {chunk_number}"
                    ),
                    "content": content,
                    "source": (
                        f"Uploaded PDF: {pdf_path.name}, "
                        f"page {page_number}"
                    )
                })

    if not chunks:
        raise ValueError(
            "No selectable text found. Scanned PDFs may require OCR."
        )

    return chunks



def build_knowledge_base():
    """Load built-in notes and previously uploaded PDFs."""
    items = load_knowledge()

    for pdf_path in sorted(UPLOAD_DIR.glob("*.pdf")):
        try:
            items.extend(extract_pdf_chunks(pdf_path))
        except Exception as exc:
            print(f"Could not load {pdf_path.name}: {exc}")

    return items


KNOWLEDGE = build_knowledge_base()

# Word-based and character-based retrieval indexes
VECTORIZER = None
DOC_MATRIX = None
CHAR_VECTORIZER = None
CHAR_MATRIX = None


def rebuild_index():
    """Build indexes for words and partial word patterns."""
    global VECTORIZER, DOC_MATRIX
    global CHAR_VECTORIZER, CHAR_MATRIX

    texts = [item["content"] for item in KNOWLEDGE]

    if not texts:
        raise ValueError("Cannot build an index with no documents.")

    # Index complete words and adjacent word pairs.
    VECTORIZER = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2),
        sublinear_tf=True
    )
    DOC_MATRIX = VECTORIZER.fit_transform(texts)

    # Index character patterns to help match technical terms.
    CHAR_VECTORIZER = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        lowercase=True,
        sublinear_tf=True,
        max_features=100000
    )
    CHAR_MATRIX = CHAR_VECTORIZER.fit_transform(texts)



def retrieve(query, top_k=5, document_id=None):
    query = query.strip()

    if not query or not KNOWLEDGE:
        return []

    # Select which knowledge passages are eligible for retrieval
    if document_id:
        eligible_indices = [
            i for i, item in enumerate(KNOWLEDGE)
            if document_id in item.get("source", "")
        ]
    else:
        eligible_indices = list(range(len(KNOWLEDGE)))

    if not eligible_indices:
        return []

    # Calculate word-based similarity
    word_query = VECTORIZER.transform([query])
    word_scores = cosine_similarity(
        word_query, DOC_MATRIX
    ).ravel()

    # Calculate character-based similarity
    char_query = CHAR_VECTORIZER.transform([query])
    char_scores = cosine_similarity(
        char_query, CHAR_MATRIX
    ).ravel()

    scores = (0.75 * word_scores) + (0.25 * char_scores)

    # Rank only passages from the selected document, if specified
    ranked_indices = sorted(
        eligible_indices,
        key=lambda i: scores[i],
        reverse=True
    )

    results = []

    for idx in ranked_indices:
        if scores[idx] <= 0.01:
            continue

        item = KNOWLEDGE[idx]

        results.append({
            "id": item["id"],
            "title": item["title"],
            "content": item["content"],
            "score": round(float(scores[idx]), 4),
            "source": item.get(
                "source", "Built-in demo knowledge base"
            )
        })

        if len(results) >= top_k:
            break

    return results



rebuild_index()



def generate_answer(query, contexts):
    api_key = os.getenv("GROQ_API_KEY", "").strip()

    if not contexts:
        return (
            "I couldn't find relevant information in your study material. "
            "Try another question or upload suitable notes."
        )

    context_text = "\n\n".join(
        f"[Source: {c['title']}]\n{c['content']}"
        for c in contexts
    )

    if not api_key:
        return (
            "Demo mode: GROQ_API_KEY is not configured.\n\n"
            + "\n\n".join(
                f"**{c['title']}**\n{c['content']}"
                for c in contexts
            )
        )

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "temperature": 0.1,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are ExamPrep AI, an exam preparation assistant. "
                            "Answer using only the supplied study passages. "
                            "Explain concepts clearly for students. "
                            "If the passages do not contain enough information, "
                            "say so instead of guessing. "
                            "Do not invent facts, formulas, citations, or sources. "
                            "When appropriate, cite a source using its exact "
                            "title in this format: [Source: exact source title]."
                        )
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Study passages:\n{context_text}\n\n"
                            f"Question: {query}\n\n"
                            "Answer based on the passages above."
                        )
                    }
                ]
            },
            timeout=60
        )

        response.raise_for_status()
        answer = response.json()["choices"][0]["message"]["content"]

        if not answer or not answer.strip():
            raise ValueError("The AI returned an empty answer.")

        return answer.strip()

    except Exception as exc:
        print("Groq request failed:", str(exc))

        return (
            "The AI could not generate an answer. "
            "Here are the relevant retrieved study passages:\n\n"
            + "\n\n".join(
                f"**{c['title']}**\n{c['content']}"
                for c in contexts
            )
        )


def generate_practice_test(contexts, num_questions=10, difficulty="medium"):
    if not contexts:
        raise ValueError(
            "No relevant study material found. Upload a PDF first."
        )

    if not isinstance(num_questions, int) or not 1 <= num_questions <= 50:
        raise ValueError("Question count must be between 1 and 50.")

    if difficulty not in ("easy", "medium", "hard"):
        raise ValueError("Difficulty must be easy, medium, or hard.")

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured in your .env file.")

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    context_text = "\n\n".join(
        f"[Source: {c['title']}]\n{c['content']}"
        for c in contexts
    )

    prompt = f"""
Create exactly {num_questions} multiple-choice practice questions
at {difficulty} difficulty using ONLY the study material below.

Return only a valid JSON object:
{{
  "title": "Practice Test",
  "questions": [
    {{
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "explanation": "Explanation based on the study material"
    }}
  ]
}}

Rules:
- Return exactly {num_questions} questions.
- Each question must have exactly four distinct options.
- correct_answer must be an integer from 0 to 3.
- Exactly one option must be correct.
- Use only facts supported by the supplied material.
- Do not include answers in question text.
- Do not return Markdown fences or extra text.

Study material:
{context_text}
"""

    response = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You generate accurate educational practice tests. "
                        "Use only the provided study material and return "
                        "valid JSON in the requested format."
                    )
                },
                {"role": "user", "content": prompt}
            ]
        },
        timeout=90
    )

    response.raise_for_status()
    result = response.json()["choices"][0]["message"]["content"].strip()

    if result.startswith("```"):
        result = result.split("\n", 1)[1]
        if result.endswith("```"):
            result = result[:-3].strip()

    test_data = json.loads(result)
    questions = test_data.get("questions")

    if not isinstance(questions, list) or len(questions) != num_questions:
        raise ValueError("The AI returned an invalid number of questions.")

    for question in questions:
        options = question.get("options")
        answer = question.get("correct_answer")

        if (
            not isinstance(question.get("question"), str)
            or not question["question"].strip()
            or not isinstance(options, list)
            or len(options) != 4
            or not all(
                isinstance(option, str) and option.strip()
                for option in options
            )
            or len(set(options)) != 4
            or type(answer) is not int
            or answer not in range(4)
            or not isinstance(question.get("explanation"), str)
            or not question["explanation"].strip()
        ):
            raise ValueError("The AI returned an invalid question format.")

    return {
        "title": test_data.get("title", "Practice Test"),
        "questions": questions
    }


@app.get("/health")
def health():
    return jsonify({"status": "ok", "app": "ExamPrep AI", "knowledge_items": len(KNOWLEDGE)})

@app.get("/api/knowledge")
def knowledge():
    return jsonify({"items": [{"id": x["id"], "title": x["title"]} for x in KNOWLEDGE]})

@app.route("/api/documents", methods=["GET"])
def list_documents():
    documents = []

    for pdf_path in UPLOAD_DIR.glob("*.pdf"):
        stored_name = pdf_path.name

        # Remove the UUID prefix added during upload
        display_name = stored_name.split("_", 1)[-1]

        documents.append({
            "id": stored_name,
            "name": display_name,
            "filename": stored_name
        })

    documents.sort(key=lambda item: item["name"].lower())

    return jsonify({
        "documents": documents,
        "count": len(documents)
    })

@app.route("/api/documents/<document_id>", methods=["DELETE"])
def delete_document(document_id):
    # Only allow deletion of a PDF directly inside uploads/
    if (
        not document_id.endswith(".pdf")
        or Path(document_id).name != document_id
    ):
        return jsonify({"error": "Invalid document ID"}), 400

    pdf_path = UPLOAD_DIR / document_id

    if not pdf_path.is_file():
        return jsonify({"error": "Document not found"}), 404

    try:
        # Delete the selected PDF
        pdf_path.unlink()

        # Rebuild knowledge from built-in notes and remaining PDFs
        KNOWLEDGE.clear()
        KNOWLEDGE.extend(build_knowledge_base())

        # Rebuild both TF-IDF indexes
        rebuild_index()

        return jsonify({
            "message": "Document deleted successfully",
            "deleted": document_id,
            "documents_remaining": len(list(UPLOAD_DIR.glob("*.pdf"))),
            "knowledge_items": len(KNOWLEDGE)
        })

    except Exception:
        # Report a generic error without exposing internal details
        return jsonify({
            "error": "Deletion or knowledge-base rebuilding failed. Check the backend terminal."
        }), 500
    
@app.route("/api/conversations", methods=["GET"])
def list_conversations():
    chats = read_chat_history()

    summaries = [
        {
            "id": chat["id"],
            "title": chat.get("title", "New conversation"),
            "updated_at": chat.get("updated_at", ""),
            "message_count": len(chat.get("messages", []))
        }
        for chat in chats
    ]

    summaries.sort(
        key=lambda chat: chat["updated_at"],
        reverse=True
    )

    return jsonify({"conversations": summaries})


@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "New conversation")).strip()

    if not title:
        title = "New conversation"

    now = datetime.now(timezone.utc).isoformat()

    chat = {
        "id": str(uuid.uuid4()),
        "title": title[:120],
        "created_at": now,
        "updated_at": now,
        "messages": []
    }

    chats = read_chat_history()
    chats.append(chat)
    write_chat_history(chats)

    return jsonify({"conversation": chat}), 201


@app.route("/api/conversations/<conversation_id>", methods=["GET"])
def get_conversation(conversation_id):
    chats = read_chat_history()

    for chat in chats:
        if chat.get("id") == conversation_id:
            return jsonify({"conversation": chat})

    return jsonify({"error": "Conversation not found"}), 404


@app.route("/api/conversations/<conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id):
    chats = read_chat_history()

    remaining = [
        chat for chat in chats
        if chat.get("id") != conversation_id
    ]

    if len(remaining) == len(chats):
        return jsonify({"error": "Conversation not found"}), 404

    write_chat_history(remaining)

    return jsonify({
        "message": "Conversation deleted successfully"
    })






@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}

    query = data.get("question", "").strip()
    document_id = data.get("document_id")
    conversation_id = data.get("conversation_id")

    if not query:
        return jsonify({"error": "Please enter a question."}), 400

    # Validate the selected PDF
    if document_id:
        if (
            not isinstance(document_id, str)
            or Path(document_id).name != document_id
            or not document_id.endswith(".pdf")
        ):
            return jsonify({"error": "Invalid document ID."}), 400

        if not (UPLOAD_DIR / document_id).is_file():
            return jsonify({"error": "Selected PDF was not found."}), 404

    # Validate the conversation ID, if provided
    if conversation_id:
        conversations = read_chat_history()

        if not any(
            conversation.get("id") == conversation_id
            for conversation in conversations
        ):
            return jsonify({"error": "Conversation not found."}), 404

    # Retrieve passages from the selected PDF, if specified
    contexts = retrieve(
        query,
        top_k=10,
        document_id=document_id
    )

    answer = generate_answer(query, contexts)

    # Save the question and answer to the conversation
    if conversation_id:
        save_message_to_conversation(
            conversation_id,
            "user",
            query
        )

        save_message_to_conversation(
            conversation_id,
            "assistant",
            answer,
            sources=contexts
        )

    return jsonify({
        "question": query,
        "answer": answer,
        "sources": contexts,
        "conversation_id": conversation_id
    })

@app.route("/api/practice-test", methods=["POST"])
def create_practice_test():
    data = request.get_json(silent=True) or {}

    document_id = data.get("document_id")
    num_questions = data.get("num_questions", 10)
    difficulty = data.get("difficulty", "medium")

    # Validate question count
    if type(num_questions) is not int or not 1 <= num_questions <= 50:
        return jsonify({
            "error": "Question count must be between 1 and 50."
        }), 400

    # Validate difficulty
    if difficulty not in ("easy", "medium", "hard"):
        return jsonify({
            "error": "Difficulty must be easy, medium, or hard."
        }), 400

    # Validate selected PDF
    if document_id:
        if (
            not isinstance(document_id, str)
            or Path(document_id).name != document_id
            or not document_id.endswith(".pdf")
        ):
            return jsonify({"error": "Invalid document ID."}), 400

        if not (UPLOAD_DIR / document_id).is_file():
            return jsonify({"error": "Selected PDF was not found."}), 404

    # Retrieve material for the test
    query = "important concepts definitions explanations examples"
    contexts = retrieve(
        query,
        top_k=20,
        document_id=document_id
    )

    try:
        test_data = generate_practice_test(
            contexts,
            num_questions=num_questions,
            difficulty=difficulty
        )

        return jsonify(test_data), 200

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except Exception:
        app.logger.exception("Practice test generation failed")
        return jsonify({
            "error": "Could not generate the practice test. Please try again."
        }), 500

@app.route("/api/practice-test-history", methods=["GET"])
def get_practice_test_history():
    history = read_practice_test_history()
    return jsonify({"history": history}), 200


@app.route("/api/practice-test-history", methods=["POST"])
def save_practice_test_history():
    data = request.get_json(silent=True) or {}

    title = str(data.get("title", "Practice Test")).strip()
    score = data.get("score")
    total = data.get("total")

    if (
        isinstance(score, bool)
        or isinstance(total, bool)
        or not isinstance(score, int)
        or not isinstance(total, int)
        or total < 1
        or score < 0
        or score > total
    ):
        return jsonify({"error": "Invalid test score."}), 400

    history = read_practice_test_history()

    attempt = {
        "id": str(uuid.uuid4()),
        "title": title or "Practice Test",
        "score": score,
        "total": total,
        "percentage": round((score / total) * 100, 2),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    history.insert(0, attempt)
    write_practice_test_history(history)

    return jsonify({"message": "Test result saved.", "attempt": attempt}), 201


@app.post("/api/upload")
def upload_pdf():
    if "file" not in request.files:
        return jsonify({"error": "Please select a PDF file."}), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    safe_name = secure_filename(file.filename)

    if not safe_name.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported."}), 400

    if request.content_length and request.content_length > 100 * 1024 * 1024:
        return jsonify({"error": "Maximum upload size is 100 MB."}), 413

    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    destination = UPLOAD_DIR / unique_name

    try:
        file.save(destination)
        new_chunks = extract_pdf_chunks(destination)

        KNOWLEDGE.extend(new_chunks)
        rebuild_index()

        return jsonify({
            "message": "PDF uploaded and indexed successfully.",
            "filename": safe_name,
            "chunks_added": len(new_chunks),
            "knowledge_items": len(KNOWLEDGE)
        }), 201

    except ValueError as exc:
        destination.unlink(missing_ok=True)
        return jsonify({"error": str(exc)}), 400

    except Exception:
        destination.unlink(missing_ok=True)
        app.logger.exception("PDF processing failed")
        return jsonify({
            "error": "Could not process the PDF."
        }), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
