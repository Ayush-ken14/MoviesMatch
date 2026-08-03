#!/usr/bin/env bash
# One-command backend: venv -> deps -> data -> index -> serve.
# Usage:  cd backend && ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

PY=${PYTHON:-python3}

if [ ! -d .venv ]; then
  echo "› creating virtualenv"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "› installing dependencies"
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo "› fetching NLTK data (stopwords / wordnet)"
python - <<'PY'
import nltk
for pkg in ("stopwords", "wordnet", "omw-1.4"):
    nltk.download(pkg, quiet=True)
PY

if [ ! -f data/corpus.json ]; then
  echo "› building corpus (downloads public CSVs, ~30MB, one time)"
  python scripts/build_corpus.py
fi

if [ ! -f data/embeddings.npy ] || [ ! -f data/lexical_tokens.pkl ]; then
  echo "› building index (downloads bge-small, embeds ${PWD##*/} corpus, one time)"
  python scripts/build_index.py
fi

echo "› starting API on http://localhost:8000  (docs at /docs)"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
