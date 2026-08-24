"""Shared constants used across app.py, ai_providers.py, and heuristics.py.

Split out specifically to avoid a circular import: ai_providers.py needs
MOOD_EMOJI_MAP's keys to validate a Gemini mood classification, and app.py's
route handlers need the same map to look up an emoji - putting it in app.py
would mean ai_providers.py importing from app.py, which imports
ai_providers.py right back.
"""

MOOD_EMOJI_MAP = {
    "HAPPY": "😊",
    "EXCITED": "🤩",
    "RELAXED": "😌",
    "STRESSED": "😰",
    "SAD": "🥺",
    "GRATEFUL": "🙏",
    "ANGRY": "😠",
    "NEUTRAL": "😐",
}

# No endpoint previously enforced any limit on `content`/`query` length - a
# client could POST tens of megabytes of text, which would (a) get forwarded
# whole to a paid LLM API as a huge prompt (real token-cost exposure), (b) be
# run through this file's own regex-based keyword matching against a
# multi-megabyte string on every request, and (c) just sit in memory as an
# oversized request body. 20,000 characters is generous for a real journal
# entry (roughly 3,000-4,000 words) while still ruling out a genuinely
# abusive payload.
MAX_INPUT_LENGTH = 20_000


def too_long(*values: str) -> bool:
    return any(v and len(v) > MAX_INPUT_LENGTH for v in values)
