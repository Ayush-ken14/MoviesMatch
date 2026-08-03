"""corpus.py — loads corpus.json and exposes movie records + lookups."""
from __future__ import annotations

import json
from pathlib import Path

from app.schemas import Movie

_DISPLAY_FIELDS = (
    "id", "tmdb_id", "title", "year", "genres", "overview", "tagline",
    "poster_url", "vote_average", "vote_count", "popularity", "language",
    "cast", "director", "keywords", "runtime",
)


class Corpus:
    def __init__(self, path: Path) -> None:
        if not path.exists():
            raise FileNotFoundError(
                f"corpus not found at {path}. Run: python scripts/build_corpus.py"
            )
        self.records: list[dict] = json.loads(Path(path).read_text())
        self.by_id: dict[str, int] = {r["id"]: i for i, r in enumerate(self.records)}
        self.size = len(self.records)

    def __len__(self) -> int:
        return self.size

    def index_of(self, movie_id: str) -> int | None:
        return self.by_id.get(movie_id)

    def semantic_texts(self) -> list[str]:
        return [r["semantic_text"] for r in self.records]

    def lexical_texts(self) -> list[str]:
        return [r["lexical_text"] for r in self.records]

    def to_movie(self, idx: int) -> Movie:
        r = self.records[idx]
        return Movie(**{k: r.get(k) for k in _DISPLAY_FIELDS})

    def record(self, idx: int) -> dict:
        return self.records[idx]
