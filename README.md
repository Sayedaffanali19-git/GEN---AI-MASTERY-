
# ExamPrep AI — Starter Project

A from-scratch starter for an exam-preparation assistant using NLP-style retrieval and optional Generative AI.

## Current milestone
- Flask API on port 8000
- React + Vite frontend
- Small built-in sample knowledge base about NLP and AI (demo data, not an official university dataset)
- TF-IDF + cosine-similarity retrieval
- Optional Groq LLM answer generation when `GROQ_API_KEY` is configured
- Fallback answer built from retrieved passages when no API key is configured

## Requirements
- Python 3.10+
- Node.js LTS
- Internet connection for first-time package/model installation

## 1. Start backend (Windows PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Optional: add your Groq API key to backend/.env
python app.py
```
Backend: http://localhost:8000/health

## 2. Start frontend (second VS Code terminal)
```powershell
cd frontend
npm install
npm run dev
```
Open the URL Vite prints, normally http://localhost:5173.

## Notes
- The starter knowledge base is a small hand-authored demo corpus so the app works before you recover your college PDFs.
- It is not intended to predict real exam questions yet.
- Next milestone: add PDF upload/extraction, chunking, embeddings, persistent vector store, source/page citations, quizzes, and evaluation.
- Never commit `.env` or expose API keys in frontend code.
