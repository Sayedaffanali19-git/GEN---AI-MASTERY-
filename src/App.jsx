
import { useEffect, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  FileQuestion,
  GraduationCap,
  Send,
  Sparkles,
  Search,
  Database,
  Upload,
  FileText,
  Trash2,
  RefreshCw
} from "lucide-react";

const API = "http://127.0.0.1:8000";

export default function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connecting to backend…");
  const [knowledge, setKnowledge] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState("all");
  const [documentLoading, setDocumentLoading] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  
const [activeTab, setActiveTab] = useState("chat");
const [testHistory, setTestHistory] = useState([]);
const [testHistoryLoading, setTestHistoryLoading] = useState(false);

const [testSettings, setTestSettings] = useState({
  document_id: "all",
  num_questions: 10,
  difficulty: "medium",
  duration: 15,
});
const [practiceTest, setPracticeTest] = useState(null);
const [testAnswers, setTestAnswers] = useState({});
const [testIndex, setTestIndex] = useState(0);
const [testSubmitted, setTestSubmitted] = useState(false);
const [testLoading, setTestLoading] = useState(false);
const [testError, setTestError] = useState("");
const [timeLeft, setTimeLeft] = useState(null);

  
async function loadConversations() {
  setHistoryLoading(true);

  try {
    const response = await fetch(`${API}/api/conversations`);

    if (!response.ok) {
      throw new Error("Failed to load conversations.");
    }

    const data = await response.json();
    setConversations(data.conversations || []);
  } catch (error) {
    console.error("Error loading conversations:", error);
  } finally {
    setHistoryLoading(false);
  }
}
async function loadTestHistory() {
  setTestHistoryLoading(true);

  try {
    const response = await fetch(`${API}/api/practice-test-history`);

    if (!response.ok) {
      throw new Error("Could not load practice test history.");
    }

    const data = await response.json();
    setTestHistory(data.history || []);
  } catch (error) {
    console.error("Loading practice test history failed:", error);
  } finally {
    setTestHistoryLoading(false);
  }
}



  async function loadDocuments() {
    try {
      setDocumentLoading(true);

      const response = await fetch(`${API}/api/documents`);

      if (!response.ok) {
        throw new Error("Could not load documents");
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Loading documents failed:", error);
    } finally {
      setDocumentLoading(false);
    }
  }

  async function loadKnowledge() {
    try {
      const response = await fetch(`${API}/api/knowledge`);

      if (!response.ok) {
        throw new Error("Could not load knowledge base");
      }

      const data = await response.json();
      setKnowledge(data.items || []);
    } catch (error) {
      console.error("Knowledge request failed:", error);
    }
  }

  
useEffect(() => {
  fetch(`${API}/health`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      setStatus(
        `Backend connected · ${data.knowledge_items} knowledge items`
      );
    })
    .catch(error => {
      console.error("Backend health check failed:", error);
      setStatus("Backend offline · " + error.message);
    });

  loadKnowledge();
  loadDocuments();
  loadConversations();
  loadTestHistory();
}, []);

async function startNewConversation() {
  try {
    const response = await fetch(`${API}/api/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("Failed to create a conversation.");
    }

    const data = await response.json();

    const newConversation = data.conversation;
    setConversations(previous => [
      newConversation,
      ...previous,
    ]);

    setActiveConversationId(newConversation.id);
    setMessages([]);
    setQuestion("");
    setUploadMessage("");
  } catch (error) {
    console.error("Error creating conversation:", error);
    setUploadMessage("Could not create a new conversation.");
  }
}

async function openConversation(conversationId) {
  setHistoryLoading(true);

  try {
    const response = await fetch(
      `${API}/api/conversations/${encodeURIComponent(conversationId)}`
    );

    if (!response.ok) {
      throw new Error("Failed to open conversation.");
    }

    const data = await response.json();
    const conversation = data.conversation;

    setActiveConversationId(conversation.id);
    setMessages(
      (conversation.messages || []).map(message => ({
        role: message.role,
        content: message.content,
        sources: message.sources || [],
      }))
    );
    setQuestion("");
    setUploadMessage("");
  } catch (error) {
    console.error("Error opening conversation:", error);
    setUploadMessage("Could not open this conversation.");
  } finally {
    setHistoryLoading(false);
  }
}

async function generatePracticeTest() {
  setTestLoading(true);
  setTestError("");
  setPracticeTest(null);
  setTestAnswers({});
  setTestIndex(0);
  setTestSubmitted(false);
  setTimeLeft(null);

  try {
    const response = await fetch(`${API}/api/practice-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_id:
          testSettings.document_id === "all"
            ? null
            : testSettings.document_id,
        num_questions: testSettings.num_questions,
        difficulty: testSettings.difficulty,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not generate practice test.");
    }

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("The backend returned no questions.");
    }

    setPracticeTest(data);
    setTimeLeft(testSettings.duration * 60);
  } catch (error) {
    console.error("Practice test generation failed:", error);
    setTestError(error.message);
  } finally {
    setTestLoading(false);
  }
}

useEffect(() => {
  if (!practiceTest || testSubmitted || timeLeft === null) {
    return;
  }

  if (timeLeft <= 0) {
    setTestSubmitted(true);
    return;
  }

  const timerId = setTimeout(() => {
    setTimeLeft(previous => (
      previous === null ? null : previous - 1
    ));
  }, 1000);

  return () => clearTimeout(timerId);
}, [practiceTest, testSubmitted, timeLeft]);


async function submitPracticeTest() {
  if (testSubmitted || !practiceTest) return;

  const score = practiceTest.questions.reduce(
    (totalScore, item, index) =>
      totalScore +
      (testAnswers[index] === item.correct_answer ? 1 : 0),
    0
  );

  setTestSubmitted(true);

  try {
    const response = await fetch(`${API}/api/practice-test-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: practiceTest.title || "Practice Test",
        score,
        total: practiceTest.questions.length,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not save test result.");
    }

    console.log("Practice test result saved:", data.attempt);
  } catch (error) {
    console.error("Saving practice test result failed:", error);
    setTestError(
      "Your test was submitted, but its result could not be saved. Check the backend."
    );
  }
}








async function ask(q = question) {
  const text = q.trim();

  if (!text || busy) return;

  let conversationId = activeConversationId;

  // Create a conversation if one is not active
  if (!conversationId) {
    try {
      const response = await fetch(`${API}/api/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to create conversation.");
      }

      const data = await response.json();
      const newConversation = data.conversation;

      if (!newConversation?.id) {
        throw new Error("Invalid conversation response from backend.");
      }

      conversationId = newConversation.id;

      setActiveConversationId(conversationId);
      setConversations(previous => [
        newConversation,
        ...previous.filter(item => item.id !== conversationId),
      ]);
    } catch (error) {
      console.error("Could not start conversation:", error);
      setUploadMessage("Could not start a conversation.");
      return;
    }
  }

  setQuestion("");
  setMessages(previous => [
    ...previous,
    { role: "user", text },
  ]);
  setBusy(true);

  try {
    const response = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: text,
        document_id:
          selectedDocument === "all" ? null : selectedDocument,
        conversation_id: conversationId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    setMessages(previous => [
      ...previous,
      {
        role: "assistant",
        text: data.answer,
        sources: data.sources || [],
      },
    ]);

    // Refresh the saved conversation list
    await loadConversations();
  } catch (error) {
    console.error("Chat request failed:", error);

    setMessages(previous => [
      ...previous,
      {
        role: "assistant",
        text: `Could not get an answer: ${error.message}. Check that the Flask backend is running on port 8000.`,
      },
    ]);
  } finally {
    setBusy(false);
  }
}


  async function uploadPDF(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Please select a PDF file.");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setUploadMessage("The PDF must be smaller than 100 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setUploadMessage(`Uploading ${file.name}...`);

    try {
      const response = await fetch(`${API}/api/upload`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setUploadMessage(
        `${data.filename} uploaded successfully. ` +
        `${data.chunks_added} sections indexed.`
      );

      await Promise.all([loadDocuments(), loadKnowledge()]);
    } catch (error) {
      setUploadMessage(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(documentId, documentName) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${documentName}"?\n\n` +
      "The PDF will be removed from your uploads."
    );

    if (!confirmed) return;

    setDeletingDocument(documentId);

    try {
      const response = await fetch(
        `${API}/api/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete the PDF.");
      }

      if (selectedDocument === documentId) {
        setSelectedDocument("all");
      }

      setUploadMessage(`${documentName} deleted successfully.`);

      await Promise.all([loadDocuments(), loadKnowledge()]);
    } catch (error) {
      setUploadMessage(`Deletion failed: ${error.message}`);
    } finally {
      setDeletingDocument("");
    }
  }

  const examples = [
    "What is the difference between stemming and lemmatization?",
    "Explain TF-IDF and cosine similarity.",
    "How does RAG work?",
    "What is hybrid retrieval?"
  ];

  
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BrainCircuit size={23} />
          </div>
          <div>
            <strong>ExamPrep AI</strong>
            <small>Study smarter</small>
          </div>
        </div>

        <div className="side-label">WORKSPACE</div>

        <button
          type="button"
          className={`nav ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          <BookOpen size={18} />
          AI Study Chat
        </button>

        <button
          type="button"
          className={`nav ${activeTab === "practice" ? "active" : ""}`}
          onClick={() => setActiveTab("practice")}
        >
          <FileQuestion size={18} />
          Practice Tests
        </button>

        <button
  type="button"
  className={`nav ${activeTab === "dashboard" ? "active" : ""}`}
  onClick={() => {
    setActiveTab("dashboard");
    loadTestHistory();
  }}
>
  <GraduationCap size={18} />
  Student Dashboard
</button>

<div className="nav">
  <Database size={18} />
  Knowledge Base
</div>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>{status}</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">YOUR AI STUDY PARTNER</span>
            <h1>
              ExamPrep <span>AI</span>
            </h1>
          </div>

          <div className="model-pill">
            <Sparkles size={15} />
            NLP + RAG {import.meta.env.VITE_DEMO || ""}
          </div>
        </header>

        {/* AI STUDY CHAT PAGE */}
        {activeTab === "chat" && (
          <>
            <section className="hero">
              <div className="hero-icon">
                <GraduationCap size={27} />
              </div>
              <div>
                <h2>Learn it. Understand it. Ace it.</h2>
                <p>
                  Ask questions about your study material and get answers
                  grounded in your uploaded notes.
                </p>
              </div>
            </section>

            <section className="upload-panel">
              <div className="upload-heading">
                <FileText size={22} />
                <div>
                  <h2>Study Materials</h2>
                  <p>Upload, select, and manage your PDF notes.</p>
                </div>
              </div>

              <label className="upload-button">
                <Upload size={17} />
                {uploading ? "Uploading PDF..." : "Choose PDF"}
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={uploadPDF}
                  disabled={uploading}
                  hidden
                />
              </label>

              {uploadMessage && (
                <p className="upload-message" role="status">
                  {uploadMessage}
                </p>
              )}

              <p className="upload-hint">
                PDF only · Maximum size 100 MB
              </p>

              <div className="document-heading">
                <h3>Your PDFs ({documents.length})</h3>
                <button
                  type="button"
                  onClick={() => {
                    loadDocuments();
                    loadKnowledge();
                  }}
                  disabled={documentLoading}
                  title="Refresh documents"
                  className="document-refresh"
                >
                  <RefreshCw size={15} />
                  {documentLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <label
                className="document-select-label"
                htmlFor="document-select"
              >
                Answer questions using
              </label>

              <select
                id="document-select"
                className="document-select"
                value={selectedDocument}
                onChange={event => setSelectedDocument(event.target.value)}
              >
                <option value="all">All available study materials</option>
                {documents.map(document => (
                  <option key={document.id} value={document.id}>
                    {document.name}
                  </option>
                ))}
              </select>

              <div className="document-list">
                {documentLoading && documents.length === 0 ? (
                  <p>Loading documents...</p>
                ) : documents.length === 0 ? (
                  <p>No PDFs uploaded yet. Choose a PDF to get started.</p>
                ) : (
                  documents.map(document => (
                    <div className="document-item" key={document.id}>
                      <div className="document-info">
                        <FileText size={18} />
                        <div>
                          <span className="document-name">
                            {document.name}
                          </span>
                          <small>PDF document</small>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="document-delete"
                        title={`Delete ${document.name}`}
                        aria-label={`Delete ${document.name}`}
                        disabled={deletingDocument !== ""}
                        onClick={() =>
                          deleteDocument(document.id, document.name)
                        }
                      >
                        {deletingDocument === document.id ? (
                          "Deleting..."
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="chat-area">
              {messages.length === 0 ? (
                <div className="welcome">
                  <div className="sparkle">
                    <Sparkles size={22} />
                  </div>

                  <h2>What are you studying today?</h2>
                  <p>
                    Start with a question below, or choose a suggested prompt.
                  </p>

                  <div className="suggestions">
                    {examples.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => ask(example)}
                        disabled={busy}
                      >
                        {example}
                        <span>↗</span>
                      </button>
                    ))}
                  </div>

                  <div className="knowledge-note">
                    <Search size={16} />
                    <span>
                      {knowledge.length} knowledge passages indexed with TF-IDF
                      search
                    </span>
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`message ${message.role}`}
                    >
                      <div className="avatar">
                        {message.role === "assistant" ? (
                          <BrainCircuit size={17} />
                        ) : (
                          "You"
                        )}
                      </div>

                      <div className="bubble">
                        <div className="role-label">
                          {message.role === "assistant"
                            ? "EXAMPREP AI"
                            : "YOU"}
                        </div>

                        <div className="answer-text">
                          {message.text}
                        </div>

                        {message.sources?.length > 0 && (
                          <div className="sources">
                            <strong>Retrieved sources</strong>
                            {message.sources.map((source, sourceIndex) => (
                              <div
                                className="source"
                                key={source.id || sourceIndex}
                              >
                                <span>{source.title}</span>
                                <small>
                                  Relevance score: {source.score}
                                </small>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {busy && (
                    <div className="loading">
                      <span />
                      <span />
                      <span />
                      Searching notes and preparing answer…
                    </div>
                  )}
                </div>
              )}
            </section>

            <form
              className="composer"
              onSubmit={event => {
                event.preventDefault();
                ask();
              }}
            >
              <textarea
                value={question}
                onChange={event => setQuestion(event.target.value)}
                placeholder="Ask a question about your study material…"
                rows={2}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask();
                  }
                }}
              />

              <div className="composer-footer">
                <span>Enter to send · Shift + Enter for a new line</span>
                <button type="submit" disabled={!question.trim() || busy}>
                  <Send size={16} /> Ask AI
                </button>
              </div>
            </form>
          </>
        )}

        {/* PRACTICE TESTS PAGE */}
        {activeTab === "practice" && (
          <section className="upload-panel practice-panel">
            <div className="upload-heading">
              <FileQuestion size={24} />
              <div>
                <h2>Practice Tests</h2>
                <p>
                  Test your knowledge using questions generated from your PDFs.
                </p>
              </div>
            </div>

            {!practiceTest && (
              <div className="practice-settings">
                <p>Select the material you want to practise.</p>

                <label className="document-select-label">
                  Study material
                </label>
                <select
                  className="document-select"
                  value={testSettings.document_id}
                  onChange={event =>
                    setTestSettings(previous => ({
                      ...previous,
                      document_id: event.target.value,
                    }))
                  }
                >
                  <option value="all">All available study materials</option>
                  {documents.map(document => (
                    <option key={document.id} value={document.id}>
                      {document.name}
                    </option>
                  ))}
                </select>

                <p>
                  <label>Number of questions</label>
                  <select
                    className="document-select"
                    value={testSettings.num_questions}
                    onChange={event =>
                      setTestSettings(previous => ({
                        ...previous,
                        num_questions: Number(event.target.value),
                      }))
                    }
                  >
                    {[5, 10, 15, 20].map(number => (
                      <option key={number} value={number}>
                        {number} questions
                      </option>
                    ))}
                  </select>
                </p>

                <p>
                  <label>Difficulty</label>
                  <select
                    className="document-select"
                    value={testSettings.difficulty}
                    onChange={event =>
                      setTestSettings(previous => ({
                        ...previous,
                        difficulty: event.target.value,
                      }))
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </p>

                <p>
                  <label>Time limit</label>
                  <select
                    className="document-select"
                    value={testSettings.duration}
                    onChange={event =>
                      setTestSettings(previous => ({
                        ...previous,
                        duration: Number(event.target.value),
                      }))
                    }
                  >
                    {[5, 10, 15, 30].map(minutes => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
                    ))}
                  </select>
                </p>

                {documents.length === 0 && (
                  <p role="status">
                    Upload a PDF in AI Study Chat before generating a test.
                  </p>
                )}

                {testError && <p role="alert">{testError}</p>}

                <button
                  type="button"
                  onClick={generatePracticeTest}
                  disabled={testLoading || documents.length === 0}
                >
                  {testLoading ? "Generating test..." : "Generate Practice Test"}
                </button>
              </div>
            )}

            {practiceTest && !testSubmitted && (
              <div className="practice-question">
                <hr />
                <h2>{practiceTest.title}</h2>

                <p>
                  Time remaining:{" "}
                  {Math.floor(Math.max(0, timeLeft ?? 0) / 60)
                    .toString()
                    .padStart(2, "0")}
                  :
                  {(Math.max(0, timeLeft ?? 0) % 60)
                    .toString()
                    .padStart(2, "0")}
                </p>

                <p>
                  Question {testIndex + 1} of {practiceTest.questions.length}
                </p>

                <h3>{practiceTest.questions[testIndex].question}</h3>

                {practiceTest.questions[testIndex].options.map(
                  (option, optionIndex) => (
                    <label
                      key={optionIndex}
                      style={{
                        display: "block",
                        padding: "12px",
                        margin: "8px 0",
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`question-${testIndex}`}
                        checked={testAnswers[testIndex] === optionIndex}
                        onChange={() =>
                          setTestAnswers(previous => ({
                            ...previous,
                            [testIndex]: optionIndex,
                          }))
                        }
                      />
                      {" "}{option}
                    </label>
                  )
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                  <button
                    type="button"
                    disabled={testIndex === 0}
                    onClick={() => setTestIndex(previous => previous - 1)}
                  >
                    Previous
                  </button>

                  {testIndex < practiceTest.questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setTestIndex(previous => previous + 1)}
                    >
                      Next
                    </button>
                  ) : (
                    <button type="button" onClick={submitPracticeTest}>
                      Submit Test
                    </button>
                  )}
                </div>
              </div>
            )}

            {practiceTest && testSubmitted && (
              <div className="practice-results">
                <hr />
                <h2>Test Results</h2>

                <h3>
                  Score:{" "}
                  {practiceTest.questions.reduce(
                    (score, item, index) =>
                      score +
                      (testAnswers[index] === item.correct_answer ? 1 : 0),
                    0
                  )}{" "}
                  / {practiceTest.questions.length}
                </h3>

                <p>
                  Percentage:{" "}
                  {Math.round(
                    (practiceTest.questions.reduce(
                      (score, item, index) =>
                        score +
                        (testAnswers[index] === item.correct_answer ? 1 : 0),
                      0
                    ) /
                      practiceTest.questions.length) *
                      100
                  )}
                  %
                </p>

                {practiceTest.questions.map((item, index) => (
                  <div key={index} style={{ marginBottom: "20px" }}>
                    <h4>
                      {index + 1}. {item.question}
                    </h4>
                    <p>
                      Your answer:{" "}
                      {testAnswers[index] === undefined
                        ? "Not answered"
                        : item.options[testAnswers[index]]}
                    </p>
                    <p>
                      Correct answer: {item.options[item.correct_answer]}
                    </p>
                    <p>Explanation: {item.explanation}</p>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setPracticeTest(null);
                    setTestAnswers({});
                    setTestIndex(0);
                    setTestSubmitted(false);
                    setTestError("");
                    setTimeLeft(null);
                  }}
                >
                  Create Another Test
                </button>
              </div>
            )}
          </section>
        )}
      
{/* STUDENT DASHBOARD PAGE */}
{activeTab === "dashboard" && (
  <section className="upload-panel">
    <div className="upload-heading">
      <GraduationCap size={24} />
      <div>
        <h2>Student Dashboard</h2>
        <p>Track your practice-test performance and progress.</p>
      </div>
    </div>

    {testHistoryLoading ? (
      <p>Loading your statistics...</p>
    ) : (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "16px",
            margin: "24px 0",
          }}
        >
          <div className="upload-panel">
            <p>Tests completed</p>
            <h2>{testHistory.length}</h2>
          </div>

          <div className="upload-panel">
            <p>Average score</p>
            <h2>
              {testHistory.length
                ? Math.round(
                    testHistory.reduce(
                      (sum, test) => sum + Number(test.percentage || 0),
                      0
                    ) / testHistory.length
                  )
                : 0}%
            </h2>
          </div>

          <div className="upload-panel">
            <p>Best score</p>
            <h2>
              {testHistory.length
                ? Math.max(
                    ...testHistory.map(test => Number(test.percentage || 0))
                  )
                : 0}%
            </h2>
          </div>
        </div>

        <h3>Recent Practice Tests</h3>

        {testHistory.length === 0 ? (
          <p>
            No completed tests yet. Complete a practice test to see your
            results here.
          </p>
        ) : (
          <div className="document-list">
            {testHistory.map(test => (
              <div className="document-item" key={test.id}>
                <div className="document-info">
                  <FileQuestion size={20} />
                  <div>
                    <span className="document-name">{test.title}</span>
                    <small>
                      {test.score}/{test.total} correct ·{" "}
                      {test.completed_at
                        ? new Date(test.completed_at).toLocaleString()
                        : "Date unavailable"}
                    </small>
                  </div>
                </div>

                <strong>{Math.round(Number(test.percentage || 0))}%</strong>
              </div>
            ))}
          </div>
        )}
      </>
    )}
  </section>
)}

        <footer>ExamPrep AI · AI study chat and practice tests</footer>
      </main>
    </div>
  );
}
