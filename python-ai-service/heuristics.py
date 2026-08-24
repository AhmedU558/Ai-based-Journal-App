"""Deterministic, non-AI fallback logic - keyword/pattern matching used when
no LLM provider is configured or a call fails. Kept separate from
ai_providers.py so the "real AI" and "real but not AI" tiers are easy to
tell apart at a glance.
"""

import re
from typing import Optional

# Keywords confirmed to also be a literal PREFIX of a common, unrelated
# English word - e.g. "mad" (meant to catch anger) is the first three
# letters of "made", so naive substring matching silently misclassified any
# entry containing that extremely common word as ANGRY. These need a
# right-side word boundary too (an exact-word match); every other keyword
# below only gets a left-side boundary so it keeps matching its natural
# inflections (e.g. "stress" -> "stressed"/"stressful").
_EXACT_WORD_KEYWORDS = {'mad', 'spa', 'soft', 'won', 'trip'}


def _keyword_matches(keyword: str, content: str) -> bool:
    if ' ' in keyword:
        # Multi-word phrases can't realistically collide mid-word.
        return keyword in content
    pattern = r'\b' + re.escape(keyword) + (r'\b' if keyword in _EXACT_WORD_KEYWORDS else '')
    return re.search(pattern, content) is not None


def _any_keyword(keywords, content: str) -> bool:
    return any(_keyword_matches(k, content) for k in keywords)


def detect_mood_keywords(content: str) -> str:
    """Shared keyword-based mood classifier - the single source of truth for
    the non-HF fallback used by both /mood and /chat, so a chat reply's tone
    always agrees with what /mood would have detected for the same text."""
    content = content.lower()
    if _any_keyword(['angry', 'furious', 'mad', 'rage', 'infuriated', 'irritated', 'annoyed', 'hate', 'outraged', 'bitter', 'disgusted'], content):
        return "ANGRY"
    if _any_keyword(['stress', 'overwhelmed', 'deadline', 'panic', 'crashed', 'anxious', 'pressure', 'workload', 'frantic', 'trouble', 'meetings', 'no time', 'broke down', 'worrying', 'urgent', 'argument', 'conflict', 'piling up', 'uninterrupted', 'interruption', 'balance work demands', 'frustat', 'frustrat', 'tired', 'exhausted', 'drained', 'burnout', 'fatigue', 'heavy load', 'feely really'], content):
        return "STRESSED"
    if _any_keyword(['ruin', 'ruined', 'ruinned', 'bad person', 'terrible', 'horrible', 'upset', 'worst', 'sad', 'lonely', 'grief', 'tears', 'disappoint', 'gloomy', 'hurt', 'melanchol', 'sorrow', 'missing', 'down and', 'heartbroken', 'left out', 'heavy-hearted', 'hurting'], content):
        return "SAD"
    if _any_keyword(['thankful', 'grateful', 'blessed', 'apprec', 'gratitude', 'blessings', 'appreciation'], content):
        return "GRATEFUL"
    if _any_keyword(['relax', 'calm', 'peaceful', 'serene', 'tranquil', 'meditat', 'cozy', 'spa', 'lake', 'sunset', 'soft', 'reading a book', 'sipping tea', 'unplugged', 'stillness', 'lazy sunday', 'resting', 'yoga', 'breeze', 'soothing', 'oak tree', 'nature sound', 'restful', 'no deadlines', 'listening to classical', 'zero stress'], content):
        return "RELAXED"
    if _any_keyword(['excit', 'hyped', 'thrill', "can't wait", 'launch', 'trip', 'concert', 'exhilarat', 'eager', 'won', 'signed', 'promotion', 'hackathon', 'unbox', 'wedding', 'game winning', 'festival', ' summit', 'road trip', 'developer workshop', 'celebrating with'], content):
        return "EXCITED"
    return "HAPPY"


# Independent word lists from detect_mood_keywords's mood-category lists,
# scoped specifically to sentiment polarity (positive/negative), not mood
# category - used by /sentiment.
POSITIVE_SENTIMENT_WORDS = ['happy', 'glad', 'great', 'good', 'love', 'excited', 'grateful',
    'thankful', 'wonderful', 'amazing', 'joy', 'proud', 'relaxed', 'calm', 'peaceful',
    'blessed', 'hopeful', 'excellent', 'fantastic', 'awesome', 'enjoy', 'delighted']
NEGATIVE_SENTIMENT_WORDS = ['sad', 'angry', 'upset', 'terrible', 'horrible', 'hate', 'furious',
    'stressed', 'anxious', 'worried', 'awful', 'bad', 'miserable', 'lonely', 'hurt',
    'disappointed', 'frustrated', 'exhausted', 'overwhelmed', 'grief', 'tears', 'worst']

# Mood-aware canned replies for the non-HF chat fallback - one genuinely
# different, relevant response per detected mood, instead of a single
# template that echoed the same advice back for every message regardless of
# what was actually said (the bug: "hello" and a real venting message both
# got the identical "take a walk / 5 deep breaths" reply).
CHAT_REPLIES_BY_MOOD = {
    "ANGRY": "It sounds like something's really frustrating you right now. Try naming exactly what triggered it in a few sentences - putting it into words often takes the edge off, and you can revisit it once you're calmer.",
    "STRESSED": "That sounds like a lot to carry. Try breaking down what's overwhelming you into 2-3 concrete next steps, and give yourself permission to tackle just one of them today.",
    "SAD": "I'm sorry you're going through that. Writing about what's weighing on you, even just a few honest lines, can help you process it. Is there one small thing that might bring a bit of comfort right now?",
    "GRATEFUL": "It's great that you're noticing the good things. Try jotting down exactly why this moment mattered to you - specific details make gratitude entries much more powerful to look back on.",
    "RELAXED": "Sounds like a calm moment - a good time to reflect. What's one thing from today you'd like to remember or build on?",
    "EXCITED": "That's exciting! Capture the details now while the energy's fresh - what led up to this, and what are you looking forward to next?",
    "HAPPY": "That's good to hear. What made this feel good? Writing it down helps reinforce what's working for you.",
}

# Topic-based replies checked before mood classification - the mood-only
# fallback above only ever answers "how do you feel", so a functional request
# with no mood keyword in it (e.g. the app's own ChatScreen/AIChatView preset
# prompt buttons: "Suggest 3 daily journal prompts...", "How can I build a
# consistent daily writing habit?") always fell through to the generic HAPPY
# reply regardless of what was actually asked - found live via a screenshot
# of exactly that mismatch. Each entry is (trigger keywords, real answer).
TOPIC_CHAT_REPLIES = [
    (
        ['journal prompt', 'writing prompt', 'what should i write', 'give me a prompt', 'prompt idea'],
        "Here are 3 prompts to try: 1) What moment today would you want to remember a year from now, and why? "
        "2) What's something you're avoiding thinking about, and what would happen if you wrote about it for five minutes? "
        "3) Describe your current mood as if it were weather - what's the forecast for tomorrow?"
    ),
    (
        ['writing habit', 'consistent daily', 'journal every day', 'journal daily', 'build a habit', 'stay consistent'],
        "Building a daily writing habit works best when you lower the bar: commit to 3 sentences a minute, same time each day "
        "(right after coffee or before bed are easiest to anchor to). Skip trying to write something 'good' - the goal for the "
        "first few weeks is just showing up, not quality. A short streak you can see (even just counting days) helps more than "
        "long entries you dread starting."
    ),
    (
        ['how do i start journaling', 'new to journaling', "don't know what to write", 'writing block', "can't think of anything"],
        "A good way to start: pick one moment from today - a conversation, a small win, a frustration - and just describe what "
        "happened and how it made you feel, in plain language. Don't worry about structure or where it's going; the goal is to "
        "get something real on the page, not to write well."
    ),
]


def topic_chat_reply(query: str, context: str) -> Optional[str]:
    """Returns a canned reply if the query/context matches one of the
    functional-request topics in TOPIC_CHAT_REPLIES (e.g. "give me a journal
    prompt"), or None if nothing matches - the caller falls through to
    keyword-based mood matching in that case."""
    combined = f"{query} {context}".lower()
    for keywords, reply in TOPIC_CHAT_REPLIES:
        if any(k in combined for k in keywords):
            return reply
    return None


def keyword_chat_reply(query: str, context: str) -> str:
    topic_reply = topic_chat_reply(query, context)
    if topic_reply:
        return topic_reply
    combined = f"{query} {context}".strip()
    mood = detect_mood_keywords(combined) if combined else "HAPPY"
    return CHAT_REPLIES_BY_MOOD.get(mood, CHAT_REPLIES_BY_MOOD["HAPPY"])
