"""
preprocess.py — the text normalization pipeline shared by the lexical index
and the query parser.

Pipeline: unicode-normalize -> lowercase -> tokenize on word boundaries ->
drop stopwords & very short tokens -> lemmatize (WordNet, noun+verb passes).

Uses NLTK when its data is available and degrades gracefully to a built-in
stopword list + light suffix stripper otherwise, so the engine never hard-fails
on a fresh machine.
"""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Compact fallback stopword list (used only if NLTK data is missing).
_FALLBACK_STOP = {
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
    "by", "for", "with", "about", "as", "is", "are", "was", "were", "be",
    "been", "being", "it", "its", "this", "that", "these", "those", "he",
    "she", "they", "them", "his", "her", "their", "who", "whom", "which",
    "what", "when", "where", "why", "how", "from", "into", "out", "up", "down",
    "over", "under", "then", "than", "so", "not", "no", "do", "does", "did",
    "has", "have", "had", "will", "would", "can", "could", "should", "s",
}


class Preprocessor:
    def __init__(self) -> None:
        self._lemmatize = None
        self.stopwords: set[str] = set(_FALLBACK_STOP)
        self.backend = "fallback"
        try:
            from nltk.corpus import stopwords as nltk_stop
            from nltk.stem import WordNetLemmatizer

            self.stopwords = set(nltk_stop.words("english"))
            lemm = WordNetLemmatizer()
            # warm it up (raises if wordnet data is missing)
            lemm.lemmatize("movies")

            @lru_cache(maxsize=200_000)
            def _lem(tok: str) -> str:
                return lemm.lemmatize(lemm.lemmatize(tok, "n"), "v")

            self._lemmatize = _lem
            self.backend = "nltk"
        except Exception:
            self._lemmatize = self._light_stem

    @staticmethod
    @lru_cache(maxsize=200_000)
    def _light_stem(tok: str) -> str:
        for suf in ("ings", "ing", "edly", "ed", "ies", "es", "s", "ly"):
            if len(tok) > len(suf) + 2 and tok.endswith(suf):
                return tok[: -len(suf)]
        return tok

    def normalize(self, text: str) -> str:
        text = unicodedata.normalize("NFKD", str(text or ""))
        text = "".join(c for c in text if not unicodedata.combining(c))
        return text.lower()

    def tokenize(self, text: str, *, keep_stop: bool = False) -> list[str]:
        toks = _TOKEN_RE.findall(self.normalize(text))
        out: list[str] = []
        for t in toks:
            if len(t) < 2:
                continue
            if not keep_stop and t in self.stopwords:
                continue
            out.append(self._lemmatize(t))
        return out


# module-level singleton
preprocessor = Preprocessor()
