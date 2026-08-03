# CineMatch backend — self-contained image (models + index baked in for fast cold starts).
# Tuned for Hugging Face Spaces (non-root user, listens on 7860) and also works on
# Render / Railway / Fly.io (they inject $PORT).
FROM python:3.11-slim

# Hugging Face Spaces runs containers as UID 1000; create that user.
RUN useradd -m -u 1000 user

# System build deps (as root, before dropping privileges).
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

USER user
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/home/user/.cache/huggingface \
    HF_HUB_DISABLE_TELEMETRY=1 \
    PATH="/home/user/.local/bin:$PATH"
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY --chown=user . .

# Build the corpus + index at image-build time so the container starts fast and never
# downloads anything at request time. (movies_dataframe.json is optional enrichment;
# build_corpus skips it gracefully if it isn't present.)
RUN python -c "import nltk;[nltk.download(p) for p in ['stopwords','wordnet','omw-1.4']]" \
 && python scripts/build_corpus.py \
 && python scripts/build_index.py

EXPOSE 7860
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}
