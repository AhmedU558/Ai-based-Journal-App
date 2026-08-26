import api from './api';
import type { MoodDetectionResult } from '@/types';

// Mirrors frontend/src/services/aiService.js. Every method unwraps the
// ApiResponse<T> envelope (res.data.data), which is the shape every endpoint
// in this platform returns - reading res.data directly is a bug this codebase
// has hit more than once.
export const aiService = {
  async detectMood(content: string): Promise<MoodDetectionResult | null> {
    const res = await api.post('/api/v1/ai/mood', { content });
    return res?.data?.data ?? null;
  },

  // ai-service returns SummaryResult(shortSummary, detailedSummary,
  // bulletSummary) - the editor surfaces the short one, same as web.
  async summarize(content: string): Promise<string> {
    const res = await api.post('/api/v1/ai/summarize', { content });
    const short = res?.data?.data?.shortSummary;
    return typeof short === 'string' ? short : '';
  },

  // RephraseResult(original, rephrased) - returns '' rather than throwing when
  // the field is missing, so callers can just check for a non-empty string.
  async rephrase(content: string): Promise<string> {
    const res = await api.post('/api/v1/ai/rephrase', { content });
    const rephrased = res?.data?.data?.rephrased;
    return typeof rephrased === 'string' ? rephrased : '';
  },

  // GrammarResult(original, corrected).
  async fixGrammar(content: string): Promise<string> {
    const res = await api.post('/api/v1/ai/grammar', { content });
    const corrected = res?.data?.data?.corrected;
    return typeof corrected === 'string' ? corrected : '';
  },

  // /tags returns a bare array as `data`. The leading '#' is stripped here
  // because this app stores tags unprefixed and renders the '#' in the UI -
  // same normalization web's handleGenerateTags does.
  async generateTags(content: string): Promise<string[]> {
    const res = await api.post('/api/v1/ai/tags', { content });
    const raw = res?.data?.data;
    return Array.isArray(raw)
      ? raw.filter((t): t is string => typeof t === 'string').map((t) => t.replace('#', ''))
      : [];
  },

  // The /chat endpoint wraps a plain String via ApiResponse.success(message,
  // answer), so `data` IS the answer string directly - not an object with a
  // .response field (same gotcha noted in the web app's JournalEditor.tsx).
  // history is prior conversation turns, oldest first - without it, a real
  // LLM provider has no memory of the conversation and every message gets
  // evaluated in isolation, matching web's aiService.js.
  async chat(query: string, history?: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
    const res = await api.post('/api/v1/ai/chat', { query, history: history || [] });
    return typeof res?.data?.data === 'string' ? res.data.data : '';
  },
};
