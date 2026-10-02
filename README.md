# AI-Powered Resume Management & Recruitment Search System

Professional SaaS-style recruitment platform for centralizing resumes, AI extraction, requirement matching, and candidate pipeline management.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + TypeScript + Tailwind CSS + Framer Motion |
| Backend | Python + FastAPI + SQLAlchemy (async) + Pydantic |
| Database | PostgreSQL |
| AI Extraction | Google Gemini (free tier) – structured JSON |
| OCR | Tesseract (free, open-source) |
| File Storage | Cloudflare R2 (S3-compatible, free tier) |
| Auth | JWT (simple, upgradeable) |
| Charts | Recharts |
| Deployment | Frontend → Vercel · Backend → Render · DB → Neon/Railway/etc. |

## Free / Production-Ready Choices

- **AI**: Google Gemini free tier (excellent structured output, generous limits)
- **OCR**: Tesseract (completely free, runs locally)
- **Storage**: Cloudflare R2 free tier (10 GB storage, S3 API)
- **Auth**: Simple JWT for V1 (easily replaceable later)

## Quick Start (Development)

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 15+ (or Docker)
- Tesseract OCR (`sudo apt install tesseract-ocr` or brew)

### 1. Clone & Environment
```bash
cp .env.example .env
# Edit .env – at minimum set GEMINI_API_KEY and DATABASE_URL
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Docker Compose (recommended)
```bash
docker compose up -d
```

## Project Structure

```
resume-management-system/
├── frontend/          # React + Vite
├── backend/           # FastAPI
├── docs/              # Architecture & API docs
├── .env.example
├── .gitignore
└── README.md
```

## Core Features (V1)

- Secure authentication
- Professional dark-theme SaaS UI (responsive)
- Bulk resume upload (PDF, DOC, DOCX, images)
- AI structured extraction + OCR for scanned resumes
- Duplicate detection
- Candidate database + profile + status pipeline + notes
- Requirements module with Paste JD / Upload JD + AI analysis
- Keyword, filter & natural-language search
- Match score + transparent explanations
- Resume viewer / download (private storage)
- Processing center + retry
- Dashboard with interactive charts
- Manual correction of AI data
- Audit-ready history

## Non-Negotiable Rules Enforced

- Never invent candidate data
- Internships & projects kept separate from professional experience
- Recruiter stays in control – AI only assists
- Private resume storage only
- Missing info ≠ automatic rejection
- Required vs Preferred skills distinguished

## License

Proprietary – for the recruitment company.
