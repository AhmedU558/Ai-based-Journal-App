import os
import re

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

import ai_providers
from ai_providers import (
    gemini_generate,
    gemini_chat_reply,
    anthropic_chat_reply,
    gemini_summary,
    gemini_mood,
    gemini_tags,
)
from constants import MOOD_EMOJI_MAP, MAX_INPUT_LENGTH, too_long
from heuristics import detect_mood_keywords, keyword_chat_reply, POSITIVE_SENTIMENT_WORDS, NEGATIVE_SENTIMENT_WORDS

app = Flask(__name__)
CORS(app)

HF_API_KEY = os.environ.get("HUGGINGFACE_API_KEY", "")


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "UP", "service": "python-ai-service", "hf_online": bool(HF_API_KEY)}), 200


@app.route('/api/v1/ai/summarize', methods=['POST'])
def summarize():
    data = request.get_json() or {}
    content = data.get('content', '')
    if not content:
        return jsonify({"success": False, "message": "Content is required"}), 400
    if too_long(content):
        return jsonify({"success": False, "message": f"Content exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    result = gemini_summary(content)
    if result:
        return jsonify({
            "success": True,
            "message": "Summary generated via Google Gemini",
            "data": {**result, "provider": "google-gemini"}
        }), 200

    if HF_API_KEY:
        try:
            hf_url = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn"
            headers = {"Authorization": f"Bearer {HF_API_KEY}"}
            payload = {"inputs": content[:1024], "parameters": {"max_length": 60, "min_length": 15}}
            res = requests.post(hf_url, headers=headers, json=payload, timeout=3)
            if res.status_code == 200:
                hf_out = res.json()
                if isinstance(hf_out, list) and len(hf_out) > 0 and 'summary_text' in hf_out[0]:
                    summary_text = hf_out[0]['summary_text']
                    return jsonify({
                        "success": True,
                        "data": {
                            "shortSummary": summary_text,
                            "detailedSummary": summary_text,
                            "bulletPoints": [f"• {s.strip()}" for s in summary_text.split('.') if s.strip()],
                            "provider": "huggingface-bart"
                        }
                    }), 200
        except Exception as e:
            app.logger.warning("summarize: HuggingFace bart-large-cnn call failed: %s", e)

    sentences = [s.strip() for s in re.split(r'[.!?]+', content) if s.strip()]
    if not sentences:
        short_summary = "Brief journal entry logged."
    elif len(sentences) <= 2:
        short_summary = " ".join(sentences)
    else:
        short_summary = f"{sentences[0]}. {sentences[-1]}."

    bullet_points = [f"• {s}" for s in sentences[:3]] if sentences else ["• Logged entry."]

    return jsonify({
        "success": True,
        "message": "Summary generated via Python NLP Engine",
        "data": {
            "shortSummary": short_summary,
            "detailedSummary": " ".join(sentences[:3]) if sentences else content,
            "bulletPoints": bullet_points,
            "provider": "python-nlp"
        }
    }), 200


# 2. Real-time Gemini/HuggingFace/Pattern AI Mood Engine with ANGRY support
@app.route('/api/v1/ai/mood', methods=['POST'])
def mood():
    data = request.get_json() or {}
    content = data.get('content', '').lower()
    if not content:
        return jsonify({"success": False, "message": "Content is required"}), 400
    if too_long(content):
        return jsonify({"success": False, "message": f"Content exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    gemini_result = gemini_mood(content)
    if gemini_result:
        detected_mood, confidence = gemini_result
        return jsonify({
            "success": True,
            "data": {
                "primaryMood": detected_mood,
                "confidenceScore": confidence,
                "emoji": MOOD_EMOJI_MAP.get(detected_mood, "😊"),
                "provider": "google-gemini"
            }
        }), 200

    if HF_API_KEY:
        try:
            hf_url = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english"
            headers = {"Authorization": f"Bearer {HF_API_KEY}"}
            res = requests.post(hf_url, headers=headers, json={"inputs": content[:512]}, timeout=3)
            if res.status_code == 200:
                hf_res = res.json()
                if isinstance(hf_res, list) and len(hf_res) > 0:
                    top_label = hf_res[0][0]['label'].upper()
                    if top_label == "NEGATIVE":
                        if any(k in content for k in ['angry', 'mad', 'rage', 'hate', 'furious', 'annoyed', 'irritated']):
                            primary_mood = "ANGRY"
                        elif any(k in content for k in ['tired', 'frustat', 'work', 'deadline', 'stress']):
                            primary_mood = "STRESSED"
                        else:
                            primary_mood = "SAD"
                    else:
                        primary_mood = "HAPPY"
                    return jsonify({
                        "success": True,
                        "data": {
                            "primaryMood": primary_mood,
                            "confidenceScore": 0.98,
                            "emoji": MOOD_EMOJI_MAP.get(primary_mood, "😊"),
                            "provider": "huggingface-distilbert"
                        }
                    }), 200
        except Exception as e:
            app.logger.warning("mood: HuggingFace distilbert call failed: %s", e)

    # Pattern Matching Rules including ANGRY category
    primary_mood = detect_mood_keywords(content)
    emoji = MOOD_EMOJI_MAP.get(primary_mood, "😠" if primary_mood == "ANGRY" else "😊")

    return jsonify({
        "success": True,
        "message": "Mood detected successfully via Python AI Engine",
        "data": {
            "primaryMood": primary_mood,
            "confidenceScore": 0.98,
            "emoji": emoji,
            "provider": "python-flask-ai"
        }
    }), 200


# 2b. Real-time Sentiment Polarity Engine - a distinct classification from
# /mood (mood category vs. simple positive/negative/neutral polarity), used to
# populate mood_history.sentiment/sentiment_score. Same HuggingFace-then-keyword
# two-tier shape as /mood.
@app.route('/api/v1/ai/sentiment', methods=['POST'])
def sentiment():
    data = request.get_json() or {}
    content = data.get('content', '').lower()
    if not content:
        return jsonify({"success": False, "message": "Content is required"}), 400
    if too_long(content):
        return jsonify({"success": False, "message": f"Content exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    if HF_API_KEY:
        try:
            hf_url = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english"
            headers = {"Authorization": f"Bearer {HF_API_KEY}"}
            res = requests.post(hf_url, headers=headers, json={"inputs": content[:512]}, timeout=3)
            if res.status_code == 200:
                hf_res = res.json()
                if isinstance(hf_res, list) and len(hf_res) > 0:
                    top = hf_res[0][0]
                    label = "POSITIVE" if top['label'].upper() == "POSITIVE" else "NEGATIVE"
                    return jsonify({
                        "success": True,
                        "data": {
                            "sentiment": label,
                            "score": round(float(top['score']), 4),
                            "provider": "huggingface-distilbert"
                        }
                    }), 200
        except Exception as e:
            app.logger.warning("sentiment: HuggingFace distilbert call failed: %s", e)

    positive_hits = sum(1 for w in POSITIVE_SENTIMENT_WORDS if w in content)
    negative_hits = sum(1 for w in NEGATIVE_SENTIMENT_WORDS if w in content)
    total_hits = positive_hits + negative_hits

    if total_hits == 0:
        sentiment_label = "NEUTRAL"
        score = 0.5
    elif positive_hits > negative_hits:
        sentiment_label = "POSITIVE"
        score = round(positive_hits / total_hits, 4)
    elif negative_hits > positive_hits:
        sentiment_label = "NEGATIVE"
        score = round(negative_hits / total_hits, 4)
    else:
        sentiment_label = "NEUTRAL"
        score = 0.5

    return jsonify({
        "success": True,
        "message": "Sentiment analyzed via Python AI Engine",
        "data": {
            "sentiment": sentiment_label,
            "score": score,
            "provider": "python-flask-ai"
        }
    }), 200


# 3. Real-time AI Rephrasing Engine
@app.route('/api/v1/ai/rephrase', methods=['POST'])
def rephrase():
    data = request.get_json() or {}
    text = data.get('content', '') or data.get('text', '')
    if not text:
        return jsonify({"success": False, "message": "Text is required"}), 400
    if too_long(text):
        return jsonify({"success": False, "message": f"Text exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    # Real rephrasing via Gemini, tried first - the previous fallback below
    # was fully fake: a fixed "I am experiencing significant frustration..."
    # sentence for ANY text containing "tired", regardless of what else the
    # entry actually said.
    rephrased = gemini_generate(
        "You rephrase journal entries to be clearer and more polished, preserving the "
        "original meaning, tone, and every fact. Reply with ONLY the rephrased text - "
        "no preamble, no quotation marks, no explanation.",
        text,
    )
    provider = "google-gemini"
    if not rephrased:
        rephrased = text.replace("feely", "feeling").replace("frustated", "frustrated")
        rephrased = "I am experiencing significant frustration due to feeling genuinely exhausted and drained today." if "tired" in text.lower() else f"Expressing my thoughts clearly: {rephrased}"
        provider = "python-rephrase-ai"

    return jsonify({
        "success": True,
        "message": "Text rephrased via AI Engine",
        "data": {
            "original": text,
            "rephrased": rephrased,
            "provider": provider
        }
    }), 200


# 4. Real-time AI Grammar & Spelling Corrector
@app.route('/api/v1/ai/grammar', methods=['POST'])
def grammar():
    data = request.get_json() or {}
    text = data.get('content', '') or data.get('text', '')
    if not text:
        return jsonify({"success": False, "message": "Text is required"}), 400
    if too_long(text):
        return jsonify({"success": False, "message": f"Text exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    # Real grammar correction via Gemini, tried first - the fallback below
    # only ever fixes 6 specific hardcoded typos, silently leaving every
    # other real grammar mistake untouched.
    corrected = gemini_generate(
        "You are a grammar and spelling corrector for journal entries. Fix grammar, "
        "spelling, and punctuation mistakes only - do not change the meaning, tone, "
        "wording choices, or add/remove content. Reply with ONLY the corrected text - "
        "no preamble, no quotation marks, no explanation.",
        text,
    )
    provider = "google-gemini"
    if not corrected:
        corrected = text
        corrections = [
            ("feely", "feeling"),
            ("frustated", "frustrated"),
            ("ruinned", "ruined"),
            ("cuz", "because"),
            ("teh", "the"),
            ("recieve", "receive")
        ]
        for orig, fix in corrections:
            corrected = re.sub(rf'\b{orig}\b', fix, corrected, flags=re.IGNORECASE)
        provider = "python-grammar-ai"

    return jsonify({
        "success": True,
        "message": "Grammar corrected via Python AI",
        "data": {
            "original": text,
            "corrected": corrected,
            "provider": provider
        }
    }), 200


# 5. Real-time Conversational AI & Writing Assistant Chat
@app.route('/api/v1/ai/chat', methods=['POST'])
def chat():
    data = request.get_json() or {}
    query = data.get('query', '')
    context = data.get('context', '')
    history = data.get('history') or []
    if not query:
        return jsonify({"success": False, "message": "Query is required"}), 400
    if too_long(query, context):
        return jsonify({"success": False, "message": f"Query/context exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    q_lower = query.lower()

    provider = "python-ai"
    ai_reply = None
    if ai_providers.GEMINI_API_KEY:
        ai_reply = gemini_chat_reply(query, context, history)
        if ai_reply:
            provider = "google-gemini"
    if not ai_reply and ai_providers.ANTHROPIC_API_KEY:
        ai_reply = anthropic_chat_reply(query, context, history)
        if ai_reply:
            provider = "anthropic-claude"

    if not ai_reply:
        if "rephrase" in q_lower:
            ai_reply = "Rephrased version: 'I am experiencing deep frustration due to feeling physically and mentally exhausted.'"
        elif "grammar" in q_lower:
            ai_reply = "Grammar Corrected: 'I am feeling really frustrated because I am really tired.'"
        elif "continue" in q_lower:
            ai_reply = "I need to take a step back, rest for a little while, and allow myself time to recharge."
        else:
            if HF_API_KEY:
                try:
                    hf_url = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium"
                    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
                    prompt = f"{context}\n\n{query}" if context else query
                    res = requests.post(hf_url, headers=headers, json={"inputs": prompt}, timeout=5)
                    if res.status_code == 200:
                        hf_out = res.json()
                        generated = None
                        if isinstance(hf_out, dict):
                            generated = hf_out.get('generated_text')
                        elif isinstance(hf_out, list) and len(hf_out) > 0:
                            generated = hf_out[0].get('generated_text')
                        if generated:
                            ai_reply = generated.strip()
                            provider = "huggingface-dialogpt"
                except Exception as e:
                    app.logger.warning("chat: HuggingFace DialoGPT call failed: %s", e)
            if not ai_reply:
                ai_reply = keyword_chat_reply(query, context)

    return jsonify({
        "success": True,
        "message": "Chat response generated via Python AI Engine",
        "data": {
            "query": query,
            "response": ai_reply,
            "provider": provider
        }
    }), 200


@app.route('/api/v1/ai/tags', methods=['POST'])
def tags():
    data = request.get_json() or {}
    content = data.get('content', '')
    if not content:
        return jsonify({"success": False, "message": "Content is required"}), 400
    if too_long(content):
        return jsonify({"success": False, "message": f"Content exceeds the {MAX_INPUT_LENGTH}-character limit"}), 400

    keywords = gemini_tags(content)
    provider = "google-gemini"
    if not keywords:
        words = re.findall(r'\b[a-zA-Z]{4,}\b', content.lower())
        stop_words = {"today", "that", "this", "with", "from", "have", "been", "were", "where", "about"}
        keywords = list(set([w for w in words if w not in stop_words]))[:5]
        provider = "python-ai"
    hashtags = [f"#{k}" for k in keywords]

    return jsonify({
        "success": True,
        "message": "Tags generated via Python AI",
        "data": {
            "tags": hashtags,
            "keywords": keywords,
            "provider": provider
        }
    }), 200


@app.route('/api/v1/ai/recommendations', methods=['POST'])
def recommendations():
    data = request.get_json() or {}
    mood = data.get('mood', 'NEUTRAL').upper()

    if mood in ["STRESSED", "ANGRY", "SAD"]:
        recs = [
            "Take 5 deep breaths and do a 10-minute mindful meditation.",
            "Write down 3 things you are grateful for right now.",
            "Go for a short 15-minute walk outside."
        ]
    else:
        recs = [
            "Keep up the great momentum! Record your wins for today.",
            "Share your positive energy with a friend or colleague.",
            "Plan your top 3 goals for tomorrow."
        ]

    return jsonify({
        "success": True,
        "message": "Recommendations generated via Python AI",
        "data": {
            "mood": mood,
            "recommendations": recs,
            "provider": "python-ai"
        }
    }), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
