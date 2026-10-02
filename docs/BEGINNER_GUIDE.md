# 👶 Super Simple Step-by-Step Guide  
## Build & Run the Resume Management System (Like Teaching a 10-Year-Old)

This guide is written so anyone can follow it. No advanced knowledge needed.

---

## What You Will Have at the End

A real professional recruitment system that:
- Lets you upload many resumes at once
- Uses AI to read the resumes automatically
- Stores everything in a safe database
- Lets you search and match candidates to job requirements
- Looks beautiful (dark professional theme)
- Works on phone and computer

---

## Part 1 – Things You Need to Install First (One Time Only)

### 1. Install Node.js (for the frontend)
1. Go to https://nodejs.org
2. Download the **LTS** version
3. Install it (just click Next, Next, Finish)
4. Open Terminal / Command Prompt and type:
   ```
   node -v
   ```
   You should see a number like v20.x.x → Good!

### 2. Install Python 3.11 or 3.12
1. Go to https://www.python.org/downloads/
2. Download and install
3. **Important**: Check the box “Add Python to PATH”
4. Test:
   ```
   python --version
   ```

### 3. Install PostgreSQL (or use free Neon cloud later)
For local testing the easiest is Docker, or just use free Neon later.

### 4. Install Tesseract OCR (for reading scanned resumes)
**Windows**:
- Download from https://github.com/UB-Mannheim/tesseract/wiki
- Install and remember the path (usually `C:\Program Files\Tesseract-OCR\tesseract.exe`)

**Mac**:
```
brew install tesseract
```

**Ubuntu/Linux**:
```
sudo apt update
sudo apt install tesseract-ocr
```

---

## Part 2 – Get Free API Keys (Very Important)

### A. Google Gemini (Free AI)
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google
3. Click “Create API Key”
4. Copy the key and keep it safe

### B. Cloudflare R2 (Free Storage for resumes)
1. Go to https://dash.cloudflare.com and sign up (free)
2. In left menu → R2 → Create bucket → name it `resumes`
3. Go to “Manage R2 API Tokens” → Create API token
4. Give it Object Read & Write permission
5. Copy **Access Key ID** and **Secret Access Key**
6. Also copy your Account ID (shown on R2 page)

### C. Neon Database (Free PostgreSQL)
1. Go to https://neon.tech and sign up
2. Create a new project
3. Copy the connection string (it looks like `postgresql://user:pass@ep-xxx.neon.tech/neondb`)

---

## Part 3 – Download / Open the Project

If you already have the folder `resume-management-system`, open it in VS Code.

Otherwise:
```
git clone <your-repo-url>
cd resume-management-system
```

---

## Part 4 – Create the Secret File

1. Copy the example file:
   ```
   cp .env.example .env
   ```

2. Open `.env` with any text editor and fill these lines:

```
SECRET_KEY=make-a-long-random-string-here-at-least-32-characters-long
DATABASE_URL=postgresql+asyncpg://your-neon-connection-string-here
GEMINI_API_KEY=your-gemini-key-here

STORAGE_PROVIDER=r2
STORAGE_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=your-r2-access-key
STORAGE_SECRET_KEY=your-r2-secret-key
STORAGE_BUCKET=resumes
```

Save the file.

---

## Part 5 – Start the Backend (Python)

Open a terminal **inside the project folder**:

```
cd backend
python -m venv .venv
```

**Windows**:
```
.venv\Scripts\activate
```

**Mac / Linux**:
```
source .venv/bin/activate
```

Then:
```
pip install -r requirements.txt
```

Start the server:
```
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see:
```
Application startup complete.
```

Open browser → http://localhost:8000/health  
You should see `{"status":"ok"...}`

---

## Part 6 – Start the Frontend (React)

Open a **new** terminal:

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Part 7 – First Login

On first run the system will create a default admin user (or you register).

Email: `admin@example.com`  
Password: `admin123` (change it later!)

---

## What is Already Built / What is Coming

✅ Project structure  
✅ Database models (Candidates, Skills, Experience, Requirements, etc.)  
✅ AI extraction service (Gemini)  
✅ OCR service (Tesseract)  
✅ Private storage service (R2)  
✅ Security (JWT)  
✅ Professional dark theme direction  

🔄 Still being completed (I am building them now):
- Full API routes (upload, search, match…)
- Frontend pages (Dashboard, Candidates, Upload, Requirements, Search…)
- Matching engine + explanations
- Processing center
- Docker Compose for easy start

---

## Next Message From Me

I will continue building the remaining backend APIs and the complete beautiful frontend.

Just reply **“continue”** and I will keep going until the whole system is ready.

You can also ask me any question like:
- “How do I create the first user?”
- “How do I deploy to Vercel?”
- “Show me the upload page code”

I am here to guide you like a patient teacher.
