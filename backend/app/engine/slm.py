"""
slm.py — the small-language-model layer: (a) query understanding and (b) a
grounded one-line "why recommended" per result.

If a local Ollama instance is reachable it is used for both tasks with strict,
grounded prompts. Otherwise everything degrades to a genuinely capable
rule-based parser and a metadata-grounded template generator — so the feature
works on any machine, and explanations NEVER invent facts.
"""
from __future__ import annotations

import json
import re

import httpx

from app.schemas import ParsedQuery

# --------------------------------------------------------------------------- #
#  Vocabulary for the rule-based parser                                       #
# --------------------------------------------------------------------------- #
GENRE_CANON = {
    "sci-fi": "Science Fiction", "scifi": "Science Fiction",
    "science fiction": "Science Fiction", "sf": "Science Fiction",
    "rom-com": "Romance", "romcom": "Romance", "romantic comedy": "Romance",
    "romance": "Romance", "romantic": "Romance", "love story": "Romance",
    "horror": "Horror", "scary": "Horror", "slasher": "Horror",
    "thriller": "Thriller", "thrillers": "Thriller", "suspense": "Thriller",
    "noir": "Crime", "neo-noir": "Crime", "crime": "Crime", "heist": "Crime",
    "gangster": "Crime", "mystery": "Mystery", "whodunit": "Mystery",
    "comedy": "Comedy", "comedies": "Comedy", "funny": "Comedy",
    "drama": "Drama", "dramas": "Drama", "action": "Action",
    "adventure": "Adventure", "fantasy": "Fantasy", "animated": "Animation",
    "animation": "Animation", "anime": "Animation", "documentary": "Documentary",
    "docs": "Documentary", "western": "Western", "war": "War", "musical": "Music",
    "family": "Family", "kids": "Family", "history": "History",
    "historical": "History", "biopic": "History", "superhero": "Action",
}

# adjective/phrase -> mood label + expansion terms fed to the dense query
MOODS = {
    "cozy": ("cozy", "cozy warm comforting gentle"),
    "comforting": ("cozy", "comforting warm feel-good"),
    "feel-good": ("feel-good", "uplifting heartwarming joyful"),
    "feelgood": ("feel-good", "uplifting heartwarming joyful"),
    "heartwarming": ("heartwarming", "heartwarming tender wholesome"),
    "wholesome": ("wholesome", "wholesome gentle warm"),
    "dark": ("dark", "dark bleak grim shadowy"),
    "gritty": ("gritty", "gritty raw visceral streetlevel"),
    "bleak": ("bleak", "bleak nihilistic desolate"),
    "mind-bending": ("cerebral", "mind-bending surreal reality-warping cerebral"),
    "mindbending": ("cerebral", "mind-bending surreal reality-warping cerebral"),
    "cerebral": ("cerebral", "cerebral intelligent philosophical"),
    "trippy": ("cerebral", "trippy psychedelic surreal dreamlike"),
    "surreal": ("cerebral", "surreal dreamlike absurd"),
    "slow-burn": ("slow-burn", "slow-burn deliberate simmering patient"),
    "slowburn": ("slow-burn", "slow-burn deliberate simmering patient"),
    "fast-paced": ("kinetic", "fast-paced relentless breakneck"),
    "emotional": ("emotional", "emotional heartfelt moving poignant"),
    "heartfelt": ("emotional", "heartfelt sincere moving"),
    "tearjerker": ("emotional", "tearjerker devastating moving"),
    "heart": ("emotional", "emotional heartfelt warm humane"),
    "epic": ("epic", "epic sweeping grand large-scale"),
    "violent": ("violent", "violent brutal bloody"),
    "creepy": ("creepy", "creepy unsettling eerie"),
    "atmospheric": ("atmospheric", "atmospheric moody immersive"),
    "quirky": ("quirky", "quirky offbeat whimsical"),
    "stylish": ("stylish", "stylish sleek visually striking"),
}

_STOP_FROM_CLEAN = {"movie", "movies", "film", "films", "like", "something",
                    "want", "watch", "some", "give", "me", "find", "show",
                    "but", "that", "for", "the", "with"}


def _decade_bounds(text: str) -> tuple[int | None, int | None]:
    t = text.lower()
    m = re.search(r"between\s+(19|20)\d{2}\s+and\s+(19|20)\d{2}", t)
    if m:
        ys = [int(x) for x in re.findall(r"(?:19|20)\d{2}", m.group())]
        return min(ys), max(ys)
    m = re.search(r"\b(before)\s+((?:19|20)\d{2})", t)
    if m:
        return None, int(m.group(2))
    m = re.search(r"\b(after|since)\s+((?:19|20)\d{2})", t)
    if m:
        return int(m.group(2)), None
    # "90s", "1990s", "'80s"
    for m in re.finditer(r"\b(?:(19|20)?(\d0))s\b", t):
        dec = m.group(2)
        cent = m.group(1)
        if cent:
            base = int(cent + dec)
        else:
            base = 1900 + int(dec) if int(dec) >= 30 else 2000 + int(dec)
        return base, base + 9
    if re.search(r"\b(classic|old|vintage|golden age)\b", t):
        return None, 1979
    if re.search(r"\b(recent|modern|new|latest|contemporary)\b", t):
        return 2015, None
    # explicit single year
    m = re.search(r"\b((?:19|20)\d{2})\b", t)
    if m:
        y = int(m.group(1))
        return y, y
    return None, None


def rule_parse(query: str) -> ParsedQuery:
    q = query.strip()
    low = q.lower()

    # similar_to: "like X", "similar to X", "in the vein of X", "reminds me of X"
    similar_to = None
    sim = re.search(
        r"(?:like|similar to|in the vein of|reminiscent of|reminds me of|à la|a la)\s+(.+?)"
        r"(?:\s+but\b|\s+except\b|\s+with\b|\s+without\b|\s+that\b|[,.;]|$)",
        low,
    )
    if sim:
        cand = sim.group(1).strip(" .,'\"")
        # trim trailing genre/mood words that aren't part of a title
        cand = re.sub(r"\b(movies?|films?)\b", "", cand).strip()
        if 1 <= len(cand) <= 60:
            similar_to = q[sim.start(1):sim.start(1) + len(sim.group(1))].strip(" .,'\"")
            similar_to = re.sub(r"\s+but\b.*$", "", similar_to, flags=re.I).strip(" .,'\"")

    # negations: "but not X", "less X", "without X", "no X", "not too X"
    negations: list[str] = []
    for m in re.finditer(
        r"(?:but\s+not|not\s+too|not|less|without|no|minus|avoid|except)\s+([a-z][a-z\- ]{2,30})",
        low,
    ):
        phrase = m.group(1).strip()
        for w in re.split(r"\s+and\s+|,|\s+", phrase):
            w = w.strip("- ")
            if w and w not in _STOP_FROM_CLEAN and len(w) > 2:
                negations.append(w)
    negations = list(dict.fromkeys(negations))[:4]

    # genres
    genres: list[str] = []
    for phrase, canon in sorted(GENRE_CANON.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(phrase)}\b", low):
            neg_hit = any(phrase in n or n in phrase for n in negations)
            if canon not in genres and not neg_hit:
                genres.append(canon)
    genres = genres[:4]

    # moods
    moods: list[str] = []
    mood_expand: list[str] = []
    for phrase, (label, expand) in MOODS.items():
        if re.search(rf"(?<![a-z]){re.escape(phrase)}(?![a-z])", low):
            if not any(phrase in n for n in negations):
                if label not in moods:
                    moods.append(label)
                    mood_expand.append(expand)
    moods = moods[:4]

    era_from, era_to = _decade_bounds(low)

    # min_rating
    min_rating = None
    if re.search(r"\b(highly rated|top[- ]rated|acclaimed|critically acclaimed|best|masterpiece|great)\b", low):
        min_rating = 7.5

    # clean semantic query: strip connectors/filler, keep the descriptive core,
    # then append mood expansions to strengthen dense retrieval.
    clean = low
    clean = re.sub(r"(?:like|similar to|in the vein of|reminiscent of|reminds me of)\s+.+?"
                   r"(?=\s+but\b|\s+with\b|[,.;]|$)", " ", clean)
    clean = re.sub(
        r"(?:but\s+not|not\s+too|not|less|without|no|minus|avoid)\s+[a-z\-]+(?:\s+[a-z\-]+)?",
        " ", clean,
    )
    for w in _STOP_FROM_CLEAN:
        clean = re.sub(rf"\b{w}\b", " ", clean)
    clean = re.sub(r"[^a-z0-9\- ]", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    expanded = " ".join([clean] + mood_expand).strip()

    # intent
    if similar_to and len(clean.split()) <= 2:
        intent = "similar"
    elif len(q.split()) <= 4 and not moods and not genres and era_from is None:
        intent = "find_title"
    else:
        intent = "recommend"

    # descriptive keywords (content words) for display
    kw = [w for w in clean.split() if len(w) > 3 and w not in {c.lower() for c in genres}]
    keywords = list(dict.fromkeys(kw))[:6]

    return ParsedQuery(
        intent=intent,
        clean_query=expanded or clean or q.lower(),
        genres=genres,
        moods=moods,
        era_from=era_from,
        era_to=era_to,
        similar_to=similar_to,
        keywords=keywords,
        negations=negations,
        min_rating=min_rating,
        source="rules",
    )


# --------------------------------------------------------------------------- #
#  Grounded explanation templates (fallback)                                  #
# --------------------------------------------------------------------------- #
_GENRE_HUMAN = {
    "Science Fiction": "sci-fi", "TV Movie": "TV movie",
}


def _genre_phrase(genres: list[str]) -> str:
    if not genres:
        return "film"
    g = [_GENRE_HUMAN.get(x, x.lower()) for x in genres[:2]]
    return " ".join(g)


def template_reason(query: str, parsed: ParsedQuery, rec: dict, match_terms: list[str]) -> str:
    """A grounded one-liner built only from this movie's real metadata."""
    year = rec.get("year")
    director = rec.get("director")
    genres = rec.get("genres") or []
    rating = rec.get("vote_average")

    subject = f"{director}'s" if director else "This"
    desc = f"{year} " if year else ""
    desc += _genre_phrase(genres)

    # strongest available grounded connector
    shared_kw = [t for t in match_terms if t][:3]
    if shared_kw:
        clause = f"its {', '.join(shared_kw)} threads line up with your search"
    elif parsed.similar_to:
        clause = f"a kindred watch to {parsed.similar_to}"
    elif parsed.moods:
        clause = f"it carries the {parsed.moods[0]} tone you asked for"
    elif set(parsed.genres) & set(genres):
        hit = next(iter(set(parsed.genres) & set(genres)))
        clause = f"squarely in the {_GENRE_HUMAN.get(hit, hit.lower())} lane you want"
    else:
        clause = "a strong thematic match to your query"

    tail = ""
    if rating and rating >= 7.8:
        tail = f", and it's well-rated at {rating}"

    templates = [
        f"{subject} {desc} — {clause}{tail}.",
        f"A {desc} from {subject.rstrip('s') if director else 'the catalog'} where {clause}{tail}.",
        f"{subject} {desc}: {clause}{tail}.",
    ]
    # deterministic pick so the same movie reads consistently
    return templates[sum(map(ord, rec.get("id", ""))) % len(templates)].replace("  ", " ")


# --------------------------------------------------------------------------- #
#  Ollama-backed SLM (optional upgrade)                                       #
# --------------------------------------------------------------------------- #
class SLM:
    def __init__(self, host: str, model: str, enabled: bool, timeout: float):
        self.host = host.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.available = False
        if enabled:
            self.available = self._probe()

    @property
    def label(self) -> str:
        return f"ollama:{self.model}" if self.available else "rules"

    def _probe(self) -> bool:
        try:
            r = httpx.get(f"{self.host}/api/tags", timeout=2.0)
            if r.status_code != 200:
                return False
            models = [m.get("name", "") for m in r.json().get("models", [])]
            return any(self.model.split(":")[0] in m for m in models)
        except Exception:
            return False

    def _generate(self, prompt: str, *, json_mode: bool = False) -> str | None:
        try:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 220},
            }
            if json_mode:
                payload["format"] = "json"
            r = httpx.post(f"{self.host}/api/generate", json=payload, timeout=self.timeout)
            r.raise_for_status()
            return r.json().get("response", "").strip()
        except Exception:
            return None

    # ---- query understanding ----
    def parse(self, query: str) -> ParsedQuery:
        base = rule_parse(query)  # always compute rules as the backbone/fallback
        if not self.available:
            return base
        prompt = (
            "You extract structured search intent from a movie query. "
            "Return ONLY JSON with keys: genres (list of canonical TMDB genres), "
            "moods (list of short adjectives), era_from (int|null), era_to (int|null), "
            "similar_to (movie title string|null), negations (list of adjectives the "
            "user does NOT want), min_rating (float|null). Do not invent titles.\n"
            f"Query: {query!r}\nJSON:"
        )
        raw = self._generate(prompt, json_mode=True)
        if not raw:
            return base
        try:
            data = json.loads(raw)
            merged = base.model_copy(update={
                "genres": data.get("genres") or base.genres,
                "moods": data.get("moods") or base.moods,
                "era_from": data.get("era_from", base.era_from),
                "era_to": data.get("era_to", base.era_to),
                "similar_to": data.get("similar_to") or base.similar_to,
                "negations": data.get("negations") or base.negations,
                "min_rating": data.get("min_rating", base.min_rating),
                "source": self.label,
            })
            return merged
        except Exception:
            return base

    # ---- grounded explanation ----
    def explain(self, query: str, parsed: ParsedQuery, rec: dict, match_terms: list[str]) -> str:
        if not self.available:
            return template_reason(query, parsed, rec, match_terms)
        facts = {
            "title": rec.get("title"), "year": rec.get("year"),
            "genres": rec.get("genres"), "director": rec.get("director"),
            "keywords": rec.get("keywords", [])[:8], "rating": rec.get("vote_average"),
            "overview": (rec.get("overview") or "")[:280],
        }
        prompt = (
            "Write ONE sentence (max 26 words) explaining why this movie fits the "
            "user's search. Use ONLY the facts provided — never invent actors, plot "
            "points, or awards. Be specific and confident, not generic.\n"
            f"User search: {query!r}\n"
            f"Movie facts (JSON): {json.dumps(facts, ensure_ascii=False)}\n"
            "Sentence:"
        )
        out = self._generate(prompt)
        if not out:
            return template_reason(query, parsed, rec, match_terms)
        out = out.strip().strip('"').split("\n")[0]
        return out if 8 <= len(out) <= 240 else template_reason(query, parsed, rec, match_terms)
