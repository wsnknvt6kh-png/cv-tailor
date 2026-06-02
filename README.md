# ATS CV Tailor

A mobile-responsive web app that uses **Gemini Flash AI** to tailor your CV to any job description — identifying missing keywords, proposing sentence rewrites, and generating a clean single-page PDF.

## Features

- 📄 Upload your CV (PDF)
- 🔗 Paste a Job Description URL or text
- 🤖 Gemini Flash identifies 10–15 prioritised missing keywords
- ✏️ AI proposes context-sensitive sentence rewrites in your experience bullets
- ✅ You choose which changes to accept via toggle switches
- 📥 Downloads a professionally formatted single-page PDF CV

## Running Locally

```bash
pip install -r requirements.txt
python app.py
# Open http://127.0.0.1:5000
```

Set your Gemini API key in the settings panel (⚙️) in the app, or via environment variable:

```bash
set GEMINI_API_KEY=your_key_here   # Windows
```

## Deploying

- **Backend**: Deploy to [Render](https://render.com) — `render.yaml` is included.
- **Frontend**: Served by Flask directly (no separate Netlify step needed).

## Stack

- **Backend**: Python, Flask, pypdf, ReportLab, google-genai, BeautifulSoup4
- **Frontend**: HTML, Tailwind CSS v3 (CDN), Vanilla JavaScript
