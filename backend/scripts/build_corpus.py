"""
build_corpus.py — Reproducible corpus builder for CineMatch.

Merges three public, no-auth sources into one clean corpus:

  1. Pablinho "9000plus" TMDB dump  -> base catalog. Every row has a REAL
     TMDB poster URL, overview, genre, release date, rating, popularity.
  2. TMDB-5000 (rashida048 mirror)  -> enriches marquee films with structured
     cast / director / keywords / tagline / runtime / tmdb id.
  3. The repo's own movies_dataframe.json (45k pre-tokenized bags) -> adds
     extra lexical tokens (plot/cast/keyword terms) for BM25 depth.

Output: backend/data/corpus.json  — a list of movie records with BOTH the raw
display fields (preserved verbatim for the UI and for grounded explanations)
and two derived text fields used by the retrieval engine:
    - semantic_text : a natural-language blob for the embedding model
    - lexical_text  : a keyword-dense blob for BM25 tokenization

Run:  python scripts/build_corpus.py
It caches raw downloads under data/raw/ so re-runs are offline & deterministic.
"""
from __future__ import annotations

import ast
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "corpus.json"
REPO_JSON = ROOT / "data" / "movies_dataframe.json"

SOURCES = {
    "pablinho_movies.csv": "https://huggingface.co/datasets/Pablinho/movies-dataset/resolve/main/9000plus.csv",
    "tmdb_5000.csv": "https://raw.githubusercontent.com/rashida048/Some-NLP-Projects/master/movie_dataset.csv",
}


def log(msg: str) -> None:
    print(f"[build_corpus] {msg}", flush=True)


def ensure_raw() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dst = RAW / name
        if dst.exists() and dst.stat().st_size > 1000:
            continue
        log(f"downloading {name} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "cinematch/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f:
            f.write(r.read())
        log(f"  saved {dst.stat().st_size // 1024} KB")


def norm_key(s: str) -> str:
    """Aggressive normalization for cross-source title joins (no separators)."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def slugify(s: str) -> str:
    """Human-readable, URL-safe slug used as the public movie id."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "untitled"


def parse_tmdb_json(raw, key: str = "name", limit: int | None = None) -> list[str]:
    """Parse a stringified list-of-dicts (raw TMDB JSON dump) into names."""
    if not isinstance(raw, str) or not raw.strip().startswith("["):
        return []
    data = None
    for loader in (json.loads, ast.literal_eval):
        try:
            data = loader(raw)
            break
        except Exception:
            continue
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if isinstance(item, dict) and item.get(key):
            out.append(str(item[key]).strip())
        if limit and len(out) >= limit:
            break
    return out


_KW_STOP = {
    "of", "the", "a", "an", "and", "or", "to", "in", "on", "at", "by", "for",
    "with", "is", "it", "as", "de", "la", "el", "los", "las",
}


def parse_keywords(raw, limit: int = 20) -> list[str]:
    """The rashida mirror pre-flattens keywords to a space-joined token string
    (e.g. 'culture clash future space war'). Fall back to raw JSON if present."""
    js = parse_tmdb_json(raw, limit=limit)
    if js:
        return js
    if not isinstance(raw, str) or not raw.strip():
        return []
    seen, out = set(), []
    for tok in raw.split():
        t = tok.strip().lower()
        if len(t) < 3 or t in _KW_STOP or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= limit:
            break
    return out


def year_of(date_str) -> int | None:
    m = re.search(r"(\d{4})", str(date_str))
    if not m:
        return None
    y = int(m.group(1))
    return y if 1878 <= y <= 2030 else None


def clean_ws(text) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def main() -> None:
    ensure_raw()

    # ---- 1. Base catalog: Pablinho -----------------------------------------
    pab = pd.read_csv(RAW / "pablinho_movies.csv")
    log(f"pablinho rows: {len(pab)}")

    # ---- 2. TMDB-5000 enrichment table (keyed by normalized title) ---------
    tm = pd.read_csv(RAW / "tmdb_5000.csv")
    enrich: dict[str, dict] = {}
    for _, r in tm.iterrows():
        key = norm_key(r.get("title"))
        if not key:
            continue
        # `cast` in this mirror is a space-joined string of top billed actors
        # that cannot be reliably split into individual names, so it is kept as
        # free text for retrieval only (never shown as structured facts).
        cast_json = parse_tmdb_json(r.get("cast"), limit=6)
        enrich[key] = {
            "tmdb_id": int(r["id"]) if pd.notna(r.get("id")) else None,
            "cast": cast_json,  # populated only when clean JSON is available
            "cast_text": "" if cast_json else clean_ws(r.get("cast")),
            "director": clean_ws(r.get("director")) or None,
            "keywords": parse_keywords(r.get("keywords"), limit=18),
            "tagline": clean_ws(r.get("tagline")) or None,
            "runtime": int(r["runtime"]) if pd.notna(r.get("runtime")) and r["runtime"] else None,
        }
    log(f"tmdb-5000 enrichment entries: {len(enrich)}")

    # ---- 3. Repo JSON extra lexical tokens (keyed by normalized title) -----
    repo_tokens: dict[str, list[str]] = {}
    if REPO_JSON.exists():
        repo = json.loads(REPO_JSON.read_text())
        for m in repo:
            key = norm_key(m.get("title"))
            if key and isinstance(m.get("tags"), list):
                repo_tokens[key] = m["tags"]
        log(f"repo-json token bags: {len(repo_tokens)}")

    # ---- Merge -------------------------------------------------------------
    records: list[dict] = []
    seen: dict[str, int] = {}      # norm title -> index in records (dedupe)
    used_slugs: dict[str, str] = {}  # slug -> norm key that owns it
    n_dir = n_kw = n_repo = 0

    def unique_slug(title: str, year, key: str) -> str:
        base = slugify(title)
        cand = base
        if cand in used_slugs and used_slugs[cand] != key:
            cand = f"{base}-{year}" if year else f"{base}-x"
        n = 2
        while cand in used_slugs and used_slugs[cand] != key:
            cand = f"{base}-{year}-{n}" if year else f"{base}-{n}"
            n += 1
        used_slugs[cand] = key
        return cand

    for _, row in pab.iterrows():
        title = clean_ws(row.get("Title"))
        if not title:
            continue
        key = norm_key(title)
        overview = clean_ws(row.get("Overview"))
        genres = [g.strip() for g in str(row.get("Genre") or "").split(",") if g.strip()]
        year = year_of(row.get("Release_Date"))

        try:
            vote = round(float(row.get("Vote_Average")), 1)
        except (TypeError, ValueError):
            vote = None
        try:
            popularity = round(float(row.get("Popularity")), 3)
        except (TypeError, ValueError):
            popularity = 0.0
        try:
            vote_count = int(float(row.get("Vote_Count")))
        except (TypeError, ValueError):
            vote_count = 0

        # De-dupe on normalized title, keeping the more-voted entry.
        if key in seen:
            prev = records[seen[key]]
            if vote_count <= prev.get("vote_count", 0):
                continue
            records[seen[key]] = None  # tombstone; rebuild below

        enr = enrich.get(key, {})
        if enr.get("director"):
            n_dir += 1
        if enr.get("keywords"):
            n_kw += 1
        extra = repo_tokens.get(key, [])
        if extra:
            n_repo += 1

        cast = enr.get("cast", [])
        cast_text = enr.get("cast_text", "")
        director = enr.get("director")
        keywords = enr.get("keywords", [])
        tagline = enr.get("tagline")

        rec = {
            "id": unique_slug(title, year, key),  # human-readable, URL-safe, unique
            "tmdb_id": enr.get("tmdb_id"),
            "title": title,
            "year": year,
            "genres": genres,
            "overview": overview,
            "tagline": tagline,
            "poster_url": clean_ws(row.get("Poster_Url")) or None,
            "vote_average": vote,
            "vote_count": vote_count,
            "popularity": popularity,
            "language": clean_ws(row.get("Original_Language")) or None,
            "cast": cast,
            "director": director,
            "keywords": keywords,
            "runtime": enr.get("runtime"),
        }

        # ---- derived retrieval text ----
        # semantic_text: natural language for the embedding model.
        parts = [title]
        if year:
            parts.append(f"({year})")
        if genres:
            parts.append("Genres: " + ", ".join(genres) + ".")
        if tagline:
            parts.append(tagline)
        if overview:
            parts.append(overview)
        if director:
            parts.append(f"Directed by {director}.")
        if cast:
            parts.append("Starring " + ", ".join(cast) + ".")
        elif cast_text:
            parts.append("Starring " + cast_text + ".")
        if keywords:
            parts.append("Themes: " + ", ".join(keywords) + ".")
        rec["semantic_text"] = clean_ws(" ".join(parts))

        # lexical_text: keyword-dense bag for BM25. Genres/keywords/cast get
        # repeated (they are high-signal facets) and the repo token bag is
        # appended for extra plot vocabulary.
        lex = [
            title,
            " ".join(genres * 2),
            overview,
            tagline or "",
            " ".join(keywords),
            " ".join(cast) or cast_text,
            director or "",
            " ".join(extra),
        ]
        rec["lexical_text"] = clean_ws(" ".join(lex))

        if key in seen:
            records[seen[key]] = rec
        else:
            seen[key] = len(records)
            records.append(rec)

    records = [r for r in records if r is not None]

    OUT.write_text(json.dumps(records, ensure_ascii=False))
    log(f"WROTE {OUT}  ({len(records)} movies, {OUT.stat().st_size // 1024} KB)")
    log(f"  with director:{n_dir}  with keywords:{n_kw}  with repo-tokens:{n_repo}")
    with_year = sum(1 for r in records if r["year"])
    with_poster = sum(1 for r in records if r["poster_url"])
    log(f"  with year:{with_year}  with poster:{with_poster}")
    decades = {}
    for r in records:
        if r["year"]:
            decades[r["year"] // 10 * 10] = decades.get(r["year"] // 10 * 10, 0) + 1
    log("  decades: " + ", ".join(f"{k}s:{v}" for k, v in sorted(decades.items())))


if __name__ == "__main__":
    sys.exit(main())
