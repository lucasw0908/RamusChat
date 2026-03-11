# RamusChat

A tree-structured AI chat application where conversations branch like a family tree, with intelligent memory management and automatic session organization.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![React](https://img.shields.io/badge/React-19.2+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0+-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## Overview

RamusChat (named after the Latin word for "branch") organizes conversations as a hierarchical tree structure. Each session can spawn child sessions that inherit memories from their parent, enabling you to:

- **Branch conversations** while preserving context
- **Retain inherited memories** across the session tree
- **Organize topics** with automatic semantic clustering
- **Version control** your chat history with snapshots

The AI uses Mistral Large for intelligent responses and Google Gemini for semantic embeddings, enabling context-aware conversations that remember relevant past discussions.


## Quick Start

You need two API keys:
- [Mistral AI](https://console.mistral.ai/) API key
- [Google AI](https://aistudio.google.com/apikey) API key

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and add your keys:

```
MISTRAL_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
```

Start the server:

```bash
python app.py
```

Backend runs at `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. Open it in your browser.

## Project Structure

```
RamusChat/
├── backend/                    # Python Flask API server
│   ├── app.py                 # Main Flask application with all API endpoints
│   ├── ai.py                  # AI integration (Mistral chat + Gemini embeddings)
│   ├── session.py             # Session tree management (create, delete, move)
│   ├── memory.py              # Memory CRUD and semantic search
│   ├── clustering.py          # Two-phase hierarchical clustering algorithm
│   ├── snapshot.py            # Version control with snapshots
│   ├── config.py              # Configuration constants
│   ├── utils.py               # Utility functions
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example          # Environment variable template
│   └── data/                 # Per-session data (gitignored)
│       └── sessions.json     # Session tree structure
│       └── session_*.json    # Individual session message history
│       └── snapshots/        # Version control snapshots
│
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── main.jsx           # React entry point
│   │   ├── api.js             # API client functions
│   │   ├── Chat.jsx           # Main application component
│   │   ├── Message.jsx        # Message rendering with markdown/LaTeX
│   │   ├── styles.css         # App styles
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useSSE.js      # Server-Sent Events subscription
│   │   │   ├── useToast.js    # Toast notification management
│   │   │   └── useElapsedTimer.js  # Timer for long-running operations
│   │   ├── utils/             # Utility functions
│   │   │   ├── format.js      # Date/time formatting
│   │   │   └── markdown.jsx   # Markdown/LaTeX preprocessing
│   │   └── components/        # Reusable UI components
│   │       ├── SessionSidebar.jsx
│   │       ├── ChatInput.jsx
│   │       ├── MemoryPanel.jsx
│   │       ├── VersionControlPanel.jsx
│   │       ├── ClusteringResultModal.jsx
│   │       └── ...            # Other components
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── README.md                   # This file
└── .gitignore
```

## License
MIT