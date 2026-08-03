# Deploying CineMatch

**Read this first (the honest reality):**

CineMatch has two parts with very different hosting needs:

| Part | What it is | Can it run on Vercel? |
|---|---|---|
| **Frontend** | Next.js app | ✅ **Yes — Vercel is the perfect host.** |
| **Backend** | FastAPI + PyTorch + FAISS + 2 ML models (~500 MB+) | ❌ **No.** Vercel serverless functions cap at ~250 MB and can't hold models in memory between requests. |

So there are **two realistic deployment paths**:

- **Path A — Frontend-only on Vercel (mock mode).** Fastest. The frontend ships with
  bundled real-data fixtures and falls back to them automatically, so you get a fully
  clickable live demo (real posters, real movies, working UI) with **zero backend**. Great
  for a portfolio link.
- **Path B — Frontend on Vercel + backend on a container host** (Render / Railway / Fly.io
  / Hugging Face Spaces). This is the "fully live" version where searches hit the real ML
  engine.

---

## Path A — Frontend-only on Vercel (recommended for a portfolio link)

1. Push the repo to GitHub (done).
2. Go to **vercel.com → Add New → Project → import your `CineMatch` repo**.
3. In the import screen set **Root Directory = `frontend`** (this is the key step —
   Vercel then auto-detects Next.js).
4. Add one **Environment Variable**:
   - `NEXT_PUBLIC_USE_MOCK` = `1`
   (This makes the app use its bundled real-data fixtures instead of trying to reach a
   backend, so searches are instant and always work.)
5. Click **Deploy**. Done — you get a `https://cinematch-xxx.vercel.app` URL.

That's it. The landing page, sample queries, results grid, score meters, movie detail and
"More like this" all work against the fixture data.

---

## Path B — Fully live (frontend on Vercel + real backend elsewhere)

### B1. Deploy the backend on a container host
The backend needs a always-on container with a few hundred MB of RAM for the models. Any
of these work; **Hugging Face Spaces (Docker)** and **Render** are free-tier friendly.

Add this `Dockerfile` to `backend/`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# build the corpus + index at image-build time (bakes models/artifacts in)
RUN python -c "import nltk;[nltk.download(p) for p in ['stopwords','wordnet','omw-1.4']]" \
 && python scripts/build_corpus.py \
 && python scripts/build_index.py
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
```
- **Render:** New → Web Service → point at the repo, root `backend`, it detects the
  Dockerfile. Pick an instance with ≥1 GB RAM.
- **Hugging Face Spaces:** create a **Docker** Space, push `backend/` contents; it builds
  and serves. (Models download at build.)
- **Railway / Fly.io:** same idea — deploy the Docker image.

You'll get a URL like `https://cinematch-api.onrender.com`.

> Note: building the index downloads models — first build takes a few minutes. Also open
> CORS to your Vercel domain: add it to `cors_origins` in `backend/app/config.py` (or set
> the `CINEMATCH_CORS_ORIGINS` env var).

### B2. Point the Vercel frontend at it
In the Vercel project settings → Environment Variables:
- `NEXT_PUBLIC_API_URL` = `https://cinematch-api.onrender.com`
- (remove `NEXT_PUBLIC_USE_MOCK`)

Redeploy the frontend. Now searches hit the real hybrid engine.

---

## Local run (no deploy)
```bash
# terminal 1 — backend
cd backend && ./run.sh              # http://localhost:8000

# terminal 2 — frontend
cd frontend && npm install && npm run dev   # http://localhost:3000
```

---

## Quick decision guide
- **Just want a live link to show people?** → Path A (5 minutes, Vercel + mock mode).
- **Want searches to run the real ML?** → Path B (Vercel frontend + Render/HF backend).
- **Demoing on your own laptop?** → Local run.
