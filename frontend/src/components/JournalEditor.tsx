import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Sparkles, Save, X, Smile, Tag, FileText, Mic, AlertCircle, CheckCircle2, Wand2, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
import MoodWheel from './MoodWheel';
import { journalService } from '@/services/journalService';
import { aiService } from '@/services/aiService';
import { MOOD_META, type Mood } from '@/lib/moods';
import { cn } from '@/lib/utils';

// The Web Speech API isn't part of TypeScript's standard DOM lib - this covers
// only the subset actually used here (constructor, config flags, event handlers).
interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: { [index: number]: SpeechRecognitionResultItem };
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface JournalData {
  id?: number | string;
  title?: string;
  content?: string;
  mood?: string;
  tags?: string[];
}

interface JournalEditorProps {
  initialData?: JournalData | null;
  onClose: () => void;
  onSaveSuccess: () => void;
  showToast?: (message: string, type?: string) => void;
}

function getEmojiForMood(mKey: Mood): string {
  return MOOD_META[mKey]?.emoji || '😊';
}

// Standardize free-form/AI-returned mood text into one of our known mood keys.
function normalizeMood(rawMood?: string): Mood {
  if (!rawMood) return 'HAPPY';
  const m = rawMood.toUpperCase();
  if (m.includes('ANGRY') || m.includes('MAD') || m.includes('RAGE')) return 'ANGRY';
  if (m.includes('EXCITE')) return 'EXCITED';
  if (m.includes('HAPP') || m.includes('JOY')) return 'HAPPY';
  if (m.includes('RELAX') || m.includes('CALM')) return 'RELAXED';
  if (m.includes('STRESS') || m.includes('ANXIO')) return 'STRESSED';
  if (m.includes('SAD') || m.includes('DEPR')) return 'SAD';
  if (m.includes('GRATE') || m.includes('THANK')) return 'GRATEFUL';
  return 'HAPPY';
}

// Keywords confirmed to also be a literal PREFIX of a common, unrelated
// English word - e.g. "mad" (meant to catch anger) is the first three
// letters of "made", so naive .includes() substring matching silently
// flagged any text containing that extremely common word as ANGRY. These
// need a right-side word boundary too (an exact-word match); every other
// keyword below only gets a left-side boundary so it keeps matching its
// natural inflections (e.g. "stress" -> "stressed"/"stressful").
const EXACT_WORD_KEYWORDS = new Set(['mad', 'spa', 'tea', 'win', 'trip', 'bad']);

function keywordPresent(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}` + (EXACT_WORD_KEYWORDS.has(keyword) ? '\\b' : ''));
  return pattern.test(text);
}

function anyKeyword(keywords: string[], text: string): boolean {
  return keywords.some((k) => keywordPresent(k, text));
}

// Instant Keystroke Mood Evaluator (0ms Latency)
function evaluateInstantMood(text: string): { mood: Mood; emoji: string } {
  const txt = (text || '').toLowerCase();
  if (!txt.trim()) return { mood: 'HAPPY', emoji: '😊' };

  if (anyKeyword(['angry', 'mad', 'rage', 'furious', 'hate', 'annoyed', 'irritated', 'outraged'], txt)) {
    return { mood: 'ANGRY', emoji: '😠' };
  }
  if (anyKeyword(['stress', 'overwhelm', 'frustat', 'frustrat', 'tired', 'exhaust', 'anxio', 'busy', 'workload'], txt)) {
    return { mood: 'STRESSED', emoji: '😰' };
  }
  if (anyKeyword(['sad', 'lonely', 'hurt', 'ruin', 'bad', 'cry', 'depress', 'upset', 'worst'], txt)) {
    return { mood: 'SAD', emoji: '🥺' };
  }
  if (anyKeyword(['thank', 'grate', 'bless', 'apprec'], txt)) {
    return { mood: 'GRATEFUL', emoji: '🙏' };
  }
  if (anyKeyword(['relax', 'calm', 'peace', 'cozy', 'tea', 'lake', 'spa'], txt)) {
    return { mood: 'RELAXED', emoji: '😌' };
  }
  if (anyKeyword(['excit', 'hype', 'thrill', 'win', 'launch', 'trip', 'concert'], txt)) {
    return { mood: 'EXCITED', emoji: '🤩' };
  }
  return { mood: 'HAPPY', emoji: '😊' };
}

export default function JournalEditor({ initialData, onClose, onSaveSuccess, showToast }: JournalEditorProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [mood, setMood] = useState<Mood>(normalizeMood(initialData?.mood));
  const [emoji, setEmoji] = useState('😊');
  const [tags, setTags] = useState<string[]>(initialData?.tags || ['reflection', 'journal']);
  const [tagInput, setTagInput] = useState('');

  const [isListening, setIsListening] = useState(false);
  // Holds the live SpeechRecognition instance so the toggle-off path and the
  // unmount-cleanup effect below can both actually stop it - previously the
  // instance created in toggleSpeechRecognition's `else` branch was a local
  // variable with nothing keeping a reference to it, so toggling off (or
  // navigating away entirely) only flipped React state while the browser's
  // real microphone stream kept listening in the background.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [detectingMood, setDetectingMood] = useState(false);
  // Shared "only the latest call wins" guard for mood detection - it's
  // triggered from two separate call sites (the debounced effect below and
  // handleDetectMood's button), so a plain per-effect `cancelled` flag isn't
  // enough; a request-id ref covers both without either site needing to know
  // about the other.
  const moodDetectRequestId = useRef(0);
  const [summarizing, setSummarizing] = useState(false);
  const [aiWriting, setAiWriting] = useState(false);
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isManualOverride, setIsManualOverride] = useState(false);

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    if (!isManualOverride && val.trim().length >= 2) {
      const instant = evaluateInstantMood(val);
      setMood(instant.mood);
      setEmoji(instant.emoji);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  // Asynchronous Python AI Sync (250ms Debounce)
  useEffect(() => {
    if (!content.trim() || content.trim().length < 3 || isManualOverride) return;

    const timer = setTimeout(async () => {
      const requestId = ++moodDetectRequestId.current;
      setDetectingMood(true);
      try {
        const res = await aiService.detectMood(content);
        if (requestId !== moodDetectRequestId.current) return;
        if (res?.data?.data && res.data.data.primaryMood) {
          const detectedKey = normalizeMood(res.data.data.primaryMood);
          const detectedEmoji = res.data.data.emoji || getEmojiForMood(detectedKey);

          setMood(detectedKey);
          setEmoji(detectedEmoji);

          if (detectedKey === 'HAPPY' || detectedKey === 'EXCITED') {
            confetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
          }
        }
      } catch {
        // Asynchronous AI error fallback
      } finally {
        if (requestId === moodDetectRequestId.current) setDetectingMood(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [content, isManualOverride]);

  // Unmount cleanup - if the user navigates away mid-dictation, the browser's
  // real microphone stream must stop too, not just the React state.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggleSpeechRecognition = () => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      if (showToast) showToast('Speech recognition is not supported in this browser.', 'error');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
    } else {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        if (showToast) showToast('Voice dictation active. Speak clearly...', 'info');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setContent((prev) => prev + ' ' + transcript);
      };

      recognition.onerror = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };
      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const handleAIRephrase = async () => {
    if (!content.trim()) return;
    setAiWriting(true);
    try {
      const res = await aiService.rephrase(content);
      const newText = res?.data?.data?.rephrased;
      if (newText && typeof newText === 'string') {
        setContent(newText);
        if (showToast) showToast('AI Rephrased Content!', 'success');
      }
    } catch {
      if (showToast) showToast('Rephrase failed. Please try again.', 'error');
    } finally {
      setAiWriting(false);
    }
  };

  const handleAIFixGrammar = async () => {
    if (!content.trim()) return;
    setAiWriting(true);
    try {
      const res = await aiService.fixGrammar(content);
      const newText = res?.data?.data?.corrected;
      if (newText && typeof newText === 'string') {
        setContent(newText);
        if (showToast) showToast('AI Corrected Grammar & Spelling!', 'success');
      }
    } catch {
      if (showToast) showToast('Grammar fix failed. Please try again.', 'error');
    } finally {
      setAiWriting(false);
    }
  };

  const handleAIContinueWriting = async () => {
    if (!content.trim()) return;
    setAiWriting(true);
    try {
      const res = await aiService.chat(`Continue writing the next two sentences for this journal reflection: "${content}"`);
      const newText = res?.data?.data;
      if (newText && typeof newText === 'string') {
        setContent((prev) => prev.trim() + ' ' + newText);
        if (showToast) showToast('AI Continued Writing!', 'success');
      }
    } catch {
      if (showToast) showToast('AI continue-writing failed. Please try again.', 'error');
    } finally {
      setAiWriting(false);
    }
  };

  const handleSelectTemplate = (templateType: 'daily' | 'gratitude' | 'weekly') => {
    if (templateType === 'daily') {
      setTitle('Daily Reflection & Wins');
      setContent("1. Today's Top Accomplishment:\n2. What made me feel grateful:\n3. Key takeaways for tomorrow:");
    } else if (templateType === 'gratitude') {
      setTitle('Gratitude & Positive Focus');
      setContent('1. Three things I appreciate today:\n2. Someone who helped me recently:\n3. A pleasant surprise that happened:');
    } else if (templateType === 'weekly') {
      setTitle('Weekly Review & Milestones');
      setContent('• Highlights of the week:\n• Challenges overcome:\n• Priority goals for next week:');
    }
    if (showToast) showToast('Journal Template Applied!', 'info');
  };

  const handleDetectMood = async () => {
    if (!content.trim()) return;
    const requestId = ++moodDetectRequestId.current;
    setDetectingMood(true);
    try {
      const res = await aiService.detectMood(content);
      if (requestId !== moodDetectRequestId.current) return;
      if (res?.data?.data && res.data.data.primaryMood) {
        const detectedKey = normalizeMood(res.data.data.primaryMood);
        const detectedEmoji = res.data.data.emoji || getEmojiForMood(detectedKey);

        setMood(detectedKey);
        setEmoji(detectedEmoji);
        setIsManualOverride(false);

        if (showToast) showToast(`AI Detected Mood: ${detectedKey} ${detectedEmoji}`, 'success');

        if (detectedKey === 'HAPPY' || detectedKey === 'EXCITED') {
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        }
      }
    } catch {
      // Mood detection fallback
    } finally {
      if (requestId === moodDetectRequestId.current) setDetectingMood(false);
    }
  };

  const handleSummarize = async () => {
    if (!content.trim()) return;
    setSummarizing(true);
    try {
      const res = await aiService.summarize(content);
      if (res?.data?.data?.shortSummary) {
        setSummary(res.data.data.shortSummary);
        if (showToast) showToast('AI Summary Generated!', 'info');
      }
    } catch {
      // Summarize fallback
    } finally {
      setSummarizing(false);
    }
  };

  const handleGenerateTags = async () => {
    if (!content.trim()) return;
    try {
      const res = await aiService.generateTags(content);
      if (res?.data?.data && Array.isArray(res.data.data)) {
        const cleanTags = res.data.data.map((t: string) => t.replace('#', ''));
        setTags((prev) => [...new Set([...prev, ...cleanTags])]);
        if (showToast) showToast('AI Auto-Tags Added!', 'success');
      }
    } catch {
      if (showToast) showToast('Auto-tag generation failed. Please try again.', 'error');
    }
  };

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const clean = tagInput.trim().replace('#', '');
      if (!tags.includes(clean)) {
        setTags([...tags, clean]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setMessage('Title and Content are required.');
      return;
    }

    setSaving(true);
    try {
      let finalMood: Mood = mood;
      if (!isManualOverride && content.trim().length >= 3) {
        try {
          const aiRes = await aiService.detectMood(content);
          if (aiRes?.data?.data?.primaryMood) {
            finalMood = normalizeMood(aiRes.data.data.primaryMood);
          }
        } catch {
          // Fallback to active mood
        }
      }

      const payload = { title, content, mood: finalMood, tags };
      if (initialData && initialData.id) {
        await journalService.updateJournal(initialData.id, payload);
        if (showToast) showToast(`Journal updated with AI Mood ${finalMood} ${getEmojiForMood(finalMood)}!`, 'success');
      } else {
        await journalService.createJournal(payload);
        if (showToast) showToast(`New journal entry saved with AI Mood ${finalMood} ${getEmojiForMood(finalMood)}!`, 'success');
      }
      onSaveSuccess();
    } catch (err: any) {
      setMessage(err?.message || 'Failed to save journal entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-[1000px] mx-auto">
      <div className="glass-panel animate-fade-in p-10">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[2rem] font-extrabold">{initialData ? 'Edit Journal Entry' : 'Create Journal Entry'}</h1>
            <p className="text-[var(--text-secondary)] text-[0.9rem]">Real-time instant mood detection, voice dictation & AI writing suite</p>
          </div>
          <button onClick={onClose} className="btn-secondary p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Quick Templates Bar */}
        <div className="flex items-center gap-[0.6rem] mb-6 overflow-x-auto pb-2">
          <span className="text-[0.8rem] text-[var(--text-muted)] font-semibold">Templates:</span>
          <button type="button" onClick={() => handleSelectTemplate('daily')} className="btn-secondary py-[0.35rem] px-3 text-[0.8rem]">
            Daily Reflection
          </button>
          <button type="button" onClick={() => handleSelectTemplate('gratitude')} className="btn-secondary py-[0.35rem] px-3 text-[0.8rem]">
            Gratitude Log
          </button>
          <button type="button" onClick={() => handleSelectTemplate('weekly')} className="btn-secondary py-[0.35rem] px-3 text-[0.8rem]">
            Weekly Review
          </button>
        </div>

        {message && (
          <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-[14px] mb-6 flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* Title Input */}
          <div>
            <label className="block text-[0.85rem] text-[var(--text-secondary)] mb-[0.4rem] font-semibold">Journal Title</label>
            <input
              type="text"
              required
              className="glass-input text-[1.15rem] font-bold"
              placeholder="e.g. A quiet Sunday morning"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Journal Content Textarea */}
          <div>
            <div className="flex items-center justify-between mb-[0.4rem]">
              <label className="text-[0.85rem] text-[var(--text-secondary)] font-semibold">Journal Content</label>

              {/* Metrics Badge */}
              <div className="flex items-center gap-[0.85rem] text-xs text-[var(--text-secondary)]">
                <span>{wordCount} Words</span>
                <span>{charCount} Characters</span>
                <span className="flex items-center gap-[0.2rem]">
                  <Clock size={12} /> {readingTime} Min Read
                </span>
              </div>
            </div>

            <textarea
              required
              rows={9}
              className="glass-input leading-[1.7] resize-y text-base"
              placeholder="What's on your mind today? Write freely about your thoughts, feelings, or how your day went..."
              value={content}
              onChange={handleContentChange}
            />
          </div>

          {/* AI Writing Assistant Toolbar */}
          <div className="flex gap-[0.6rem] flex-wrap bg-[var(--text-primary)]/[0.03] p-[0.85rem] rounded-2xl border border-[var(--text-primary)]/[0.06]">
            <span className="text-[0.8rem] text-[#818cf8] font-bold w-full flex items-center gap-[0.35rem] mb-1">
              <Wand2 size={14} /> AI Writing Assistant Suite
            </span>
            <button type="button" onClick={handleAIRephrase} disabled={aiWriting || !content.trim()} className="btn-secondary text-[0.8rem] py-[0.4rem] px-[0.85rem]">
              {aiWriting ? 'Rephrasing...' : 'Rephrase Text'}
            </button>
            <button type="button" onClick={handleAIFixGrammar} disabled={aiWriting || !content.trim()} className="btn-secondary text-[0.8rem] py-[0.4rem] px-[0.85rem]">
              {aiWriting ? 'Fixing...' : 'Fix Grammar'}
            </button>
            <button type="button" onClick={handleAIContinueWriting} disabled={aiWriting || !content.trim()} className="btn-secondary text-[0.8rem] py-[0.4rem] px-[0.85rem]">
              {aiWriting ? 'Writing...' : 'Continue Writing'}
            </button>
          </div>

          {/* AI Automated Mood Selection Grid */}
          <div className="bg-[rgba(12,16,34,0.6)] border border-[var(--text-primary)]/[0.08] rounded-[18px] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} color="#818cf8" />
                <span className="text-[0.9rem] text-[var(--text-primary)] font-bold">
                  AI Detected Mood: <strong className={mood === 'ANGRY' ? 'text-[#ef4444]' : 'text-[#4ade80]'}>{mood} {emoji}</strong>
                </span>
              </div>

              {isManualOverride ? (
                <span className="text-xs text-[#fde047] bg-[rgba(253,224,71,0.15)] py-1 px-[0.6rem] rounded-lg font-semibold">
                  Manual Override
                </span>
              ) : (
                <span className="text-xs text-[#4ade80] bg-[rgba(74,222,128,0.15)] py-1 px-[0.6rem] rounded-lg font-semibold inline-flex items-center gap-[0.3rem]">
                  <CheckCircle2 size={12} />
                  <span>Real-Time AI Active</span>
                </span>
              )}
            </div>

            <MoodWheel
              selectedMood={mood}
              onSelectMood={(m, emo) => {
                setMood(m);
                setEmoji(emo);
                setIsManualOverride(true);
              }}
            />
          </div>

          {/* Voice Dictation & AI Controls */}
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={cn(
                'py-[0.65rem] px-[1.15rem] rounded-[14px] text-[0.85rem] font-semibold cursor-pointer inline-flex items-center gap-[0.6rem]',
                isListening
                  ? 'bg-[rgba(239,68,68,0.25)] border border-[#ef4444] text-[#f87171]'
                  : 'bg-[var(--text-primary)]/[0.06] border border-[var(--text-primary)]/[0.15] text-[var(--text-primary)]'
              )}
            >
              <Mic size={18} color="#ec4899" />
              <span>{isListening ? 'Listening...' : 'Voice Dictation'}</span>
            </button>

            <button type="button" onClick={handleDetectMood} disabled={detectingMood || !content.trim()} className="btn-secondary text-[0.85rem]">
              <Smile size={18} color="#4ade80" />
              <span>Re-Analyze Mood</span>
            </button>

            <button type="button" onClick={handleSummarize} disabled={summarizing || !content.trim()} className="btn-secondary text-[0.85rem]">
              <FileText size={18} color="#38bdf8" />
              <span>Summarize</span>
            </button>

            <button type="button" onClick={handleGenerateTags} disabled={!content.trim()} className="btn-secondary text-[0.85rem]">
              <Tag size={18} color="#c084fc" />
              <span>Auto-Tags</span>
            </button>
          </div>

          {/* AI Summary Preview */}
          {summary && (
            <div className="bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.3)] p-5 rounded-2xl">
              <div className="text-[0.8rem] text-[#818cf8] font-bold mb-[0.4rem] flex items-center gap-[0.4rem]">
                <Sparkles size={16} />
                <span>AI Summary</span>
              </div>
              <p className="text-[0.95rem] text-[var(--text-primary)] leading-[1.5]">{summary}</p>
            </div>
          )}

          {/* Tags Input */}
          <div>
            <label className="block text-[0.85rem] text-[var(--text-secondary)] mb-[0.4rem] font-semibold">Tags (Press Enter)</label>
            <div className="flex gap-2 flex-wrap mb-3">
              {tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="bg-[rgba(168,85,247,0.18)] border border-[rgba(168,85,247,0.35)] text-[#c084fc] py-[0.35rem] px-3 rounded-[10px] text-[0.85rem] inline-flex items-center gap-[0.4rem] font-semibold"
                >
                  #{tag}
                  <X size={14} className="cursor-pointer" onClick={() => handleRemoveTag(tag)} />
                </span>
              ))}
            </div>
            <input
              type="text"
              className="glass-input"
              placeholder="Add tag and hit enter (e.g. mindfulness)..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
            />
          </div>

          {/* Submit Action Buttons */}
          <div className="flex gap-4 justify-end mt-4">
            <button type="button" onClick={onClose} className="btn-secondary py-[0.85rem] px-6">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary py-[0.85rem] px-8">
              <Save size={20} />
              <span>{saving ? 'Saving...' : 'Save Journal Entry'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
