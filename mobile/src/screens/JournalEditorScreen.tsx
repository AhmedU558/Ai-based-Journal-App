import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { X, Save, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { GlassInput } from '@/components/ui/GlassInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ConfettiBurst } from '@/components/ui/ConfettiBurst';
import { ErrorBanner } from '@/components/ErrorBanner';
import MoodWheel from '@/components/MoodWheel';
import { MOOD_META, type Mood } from '@/lib/moods';
import { cn } from '@/lib/utils';
import { journalService, aiService } from '@/services';
import type { MainStackParamList } from '@/navigation/types';
import type { JournalRef } from '@/types';

type RouteProps = { params?: { journal?: JournalRef } };

// Standardize free-form/AI-returned mood text into a known mood key - same
// normalization JournalEditor.tsx applies on the web.
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

// Instant keystroke mood evaluator (0ms latency) - identical keyword set to
// JournalEditor.tsx's client-side heuristic.
function evaluateInstantMood(text: string): { mood: Mood; emoji: string } {
  const txt = text.toLowerCase();
  if (!txt.trim()) return { mood: 'HAPPY', emoji: '😊' };
  if (/angry|mad|rage|furious|hate|annoyed|irritated|outraged/.test(txt)) return { mood: 'ANGRY', emoji: '😠' };
  if (/stress|overwhelm|frustrat|tired|exhaust|anxio|busy|workload/.test(txt)) return { mood: 'STRESSED', emoji: '😰' };
  if (/sad|lonely|hurt|ruin|bad|cry|depress|upset|worst/.test(txt)) return { mood: 'SAD', emoji: '🥺' };
  if (/thank|grate|bless|apprec/.test(txt)) return { mood: 'GRATEFUL', emoji: '🙏' };
  if (/relax|calm|peace|cozy|tea|lake|spa/.test(txt)) return { mood: 'RELAXED', emoji: '😌' };
  if (/excit|hype|thrill|win|launch|trip|concert/.test(txt)) return { mood: 'EXCITED', emoji: '🤩' };
  return { mood: 'HAPPY', emoji: '😊' };
}

export default function JournalEditorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute();
  const initialData = (route.params as RouteProps['params'])?.journal;

  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [mood, setMood] = useState<Mood>(normalizeMood(initialData?.mood));
  const [emoji, setEmoji] = useState(MOOD_META[normalizeMood(initialData?.mood)].emoji);
  const [tags, setTags] = useState<string[]>(initialData?.tags || ['reflection', 'journal']);
  const [tagInput, setTagInput] = useState('');
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [detectingMood, setDetectingMood] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  // One shared flag for the three content-rewriting actions (rephrase / fix
  // grammar / continue writing) so they can't run concurrently and clobber
  // each other's result - the same single `aiWriting` flag the web editor uses.
  // `aiAction` drives the per-button label so the user can tell which one is
  // running. Summarize and auto-tags get their own flags: neither rewrites
  // `content`, so there is no reason to block them against the others.
  const [aiWriting, setAiWriting] = useState(false);
  const [aiAction, setAiAction] = useState<'rephrase' | 'grammar' | 'continue' | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [summary, setSummary] = useState('');
  const [aiNotice, setAiNotice] = useState('');

  const handleContentChange = (val: string) => {
    setContent(val);
    if (!isManualOverride && val.trim().length >= 2) {
      const instant = evaluateInstantMood(val);
      setMood(instant.mood);
      setEmoji(instant.emoji);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  // Asynchronous AI mood sync (250ms debounce) - same timing as JournalEditor.tsx.
  // clearTimeout below only cancels a debounce timer that hasn't fired yet - it
  // cannot cancel a detectMood request already in flight. Without this counter,
  // two overlapping requests (pause typing, resume, pause again) that resolve
  // out of order let the older response overwrite the newer mood. That is worse
  // here than on the web app, where the same bug is display-only: handleSave
  // persists this `mood` state directly, so a stale response can be saved onto
  // the entry. Only the most recent request is allowed to touch state.
  const moodRequestId = useRef(0);

  useEffect(() => {
    if (!content.trim() || content.trim().length < 3 || isManualOverride) return;
    const timer = setTimeout(async () => {
      const requestId = ++moodRequestId.current;
      setDetectingMood(true);
      try {
        const res = await aiService.detectMood(content);
        if (requestId !== moodRequestId.current) return;
        if (res?.primaryMood) {
          const detectedKey = normalizeMood(res.primaryMood);
          setMood(detectedKey);
          setEmoji(res.emoji || MOOD_META[detectedKey].emoji);
          // Same celebratory trigger as JournalEditor.tsx's mood-detection
          // confetti on the web app - HAPPY/EXCITED only, nothing on save
          // or achievement-unlock (the web app doesn't do that either).
          if (detectedKey === 'HAPPY' || detectedKey === 'EXCITED') {
            setShowConfetti(true);
          }
        }
      } catch {
        // AI error fallback - keep the instant-heuristic mood already set.
      } finally {
        // Same staleness check: a superseded request finishing must not clear
        // the spinner while the newer one is still running.
        if (requestId === moodRequestId.current) {
          setDetectingMood(false);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [content, isManualOverride]);

  const handleAddTag = () => {
    const clean = tagInput.trim().replace('#', '');
    if (clean && !tags.includes(clean)) {
      setTags((prev) => [...prev, clean]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  // --- AI writing assistant -------------------------------------------------
  // Ports the web editor's toolbar (frontend/src/components/JournalEditor.tsx).
  // RN has no toast host on this screen, so feedback goes to an inline notice
  // line instead; failures surface there too rather than being swallowed.
  //
  // Rewriting `content` here counts as a manual edit for mood purposes: it
  // flows through handleContentChange so the debounced re-detection re-runs on
  // the new text, rather than leaving the previous text's mood attached.
  const runContentAction = async (
    action: 'rephrase' | 'grammar' | 'continue',
    label: string,
    fn: () => Promise<string>,
    apply: (result: string) => string
  ) => {
    if (!content.trim() || aiWriting) return;
    setAiWriting(true);
    setAiAction(action);
    setAiNotice('');
    try {
      const result = await fn();
      if (result) {
        handleContentChange(apply(result));
        setAiNotice(`${label} applied.`);
      } else {
        setAiNotice(`${label} returned nothing to apply.`);
      }
    } catch {
      setAiNotice(`${label} failed. Please try again.`);
    } finally {
      setAiWriting(false);
      setAiAction(null);
    }
  };

  const handleRephrase = () =>
    runContentAction('rephrase', 'Rephrase', () => aiService.rephrase(content), (r) => r);

  const handleFixGrammar = () =>
    runContentAction('grammar', 'Grammar fix', () => aiService.fixGrammar(content), (r) => r);

  // Continue-writing has no endpoint of its own - it asks /chat for the next
  // couple of sentences and appends them, exactly as the web editor does.
  const handleContinueWriting = () =>
    runContentAction(
      'continue',
      'Continue writing',
      () => aiService.chat(`Continue writing the next two sentences for this journal reflection: "${content}"`),
      (r) => `${content.trim()} ${r}`
    );

  const handleSummarize = async () => {
    if (!content.trim() || summarizing) return;
    setSummarizing(true);
    setAiNotice('');
    try {
      const short = await aiService.summarize(content);
      if (short) setSummary(short);
      else setAiNotice('Summary returned nothing to show.');
    } catch {
      setAiNotice('Summarize failed. Please try again.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleAutoTags = async () => {
    if (!content.trim() || tagging) return;
    setTagging(true);
    setAiNotice('');
    try {
      const generated = await aiService.generateTags(content);
      if (generated.length) {
        // Union with existing tags - auto-tagging adds, never replaces what
        // the user typed themselves.
        setTags((prev) => Array.from(new Set([...prev, ...generated])));
        setAiNotice('AI tags added.');
      } else {
        setAiNotice('No tags were suggested.');
      }
    } catch {
      setAiNotice('Auto-tagging failed. Please try again.');
    } finally {
      setTagging(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Title and Content are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { title, content, mood, tags };
      if (initialData?.id) {
        await journalService.updateJournal(initialData.id, payload);
      } else {
        await journalService.createJournal(payload);
      }
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || 'Failed to save journal entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg-primary" behavior="padding">
      {showConfetti ? <ConfettiBurst onEnd={() => setShowConfetti(false)} /> : null}
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
          <Text className="text-text-primary text-xl font-extrabold">{initialData ? 'Edit Entry' : 'New Entry'}</Text>
          <Pressable onPress={() => navigation.goBack()} className="p-2 rounded-full bg-white/5 border border-white/10">
            <X size={18} color="#94a3b8" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {error ? <ErrorBanner message={error} /> : null}

          <View>
            <Text className="text-[#cbd5e1] text-sm font-semibold mb-2">Title</Text>
            <GlassInput placeholder="e.g. Completing the redesign" value={title} onChangeText={setTitle} className="font-bold text-base" />
          </View>

          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[#cbd5e1] text-sm font-semibold">Content</Text>
              <Text className="text-text-muted text-xs">
                {wordCount} words · {charCount} chars
              </Text>
            </View>
            <GlassInput
              placeholder="Write your thoughts, feelings, or daily experience..."
              value={content}
              onChangeText={handleContentChange}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              className="min-h-[160px] leading-6"
            />
          </View>

          {/* AI writing assistant - mirrors the web editor's toolbar. Every
              button is disabled with no content, since all of them operate on
              it. Wraps to a second row on narrow screens rather than
              overflowing. */}
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <Sparkles size={14} color="#818cf8" />
              <Text className="text-[#cbd5e1] text-sm font-semibold">AI Assistant</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {(
                [
                  { key: 'rephrase', idle: 'Rephrase', busy: 'Rephrasing...', running: aiAction === 'rephrase', disabled: aiWriting, onPress: handleRephrase },
                  { key: 'grammar', idle: 'Fix Grammar', busy: 'Fixing...', running: aiAction === 'grammar', disabled: aiWriting, onPress: handleFixGrammar },
                  { key: 'continue', idle: 'Continue Writing', busy: 'Writing...', running: aiAction === 'continue', disabled: aiWriting, onPress: handleContinueWriting },
                  { key: 'summarize', idle: 'Summarize', busy: 'Summarizing...', running: summarizing, disabled: summarizing, onPress: handleSummarize },
                  { key: 'tags', idle: 'Auto-Tags', busy: 'Tagging...', running: tagging, disabled: tagging, onPress: handleAutoTags },
                ] as const
              ).map((btn) => {
                const blocked = btn.disabled || !content.trim();
                return (
                  <Pressable
                    key={btn.key}
                    onPress={btn.onPress}
                    disabled={blocked}
                    className={cn(
                      'py-2 px-3 rounded-xl border',
                      blocked
                        ? 'bg-white/[0.03] border-white/[0.06]'
                        : 'bg-[rgba(99,102,241,0.15)] border-[rgba(99,102,241,0.4)]'
                    )}
                  >
                    <Text className={cn('text-xs font-semibold', blocked ? 'text-text-muted' : 'text-[#a5b4fc]')}>
                      {btn.running ? btn.busy : btn.idle}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {aiNotice ? <Text className="text-text-muted text-xs mt-2">{aiNotice}</Text> : null}
          </View>

          {summary ? (
            <View className="bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.3)] p-4 rounded-2xl">
              <View className="flex-row items-center gap-2 mb-1">
                <Sparkles size={14} color="#818cf8" />
                <Text className="text-[#818cf8] text-xs font-bold">AI Summary</Text>
              </View>
              <Text className="text-white text-sm leading-5">{summary}</Text>
            </View>
          ) : null}

          <GlassPanel className="p-4">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2 flex-1">
                <Sparkles size={16} color="#818cf8" />
                <Text className="text-white text-sm font-bold">
                  Mood: <Text style={{ color: mood === 'ANGRY' ? '#ef4444' : '#4ade80' }}>{mood} {emoji}</Text>
                </Text>
              </View>
              {isManualOverride ? (
                <Text className="text-[#fde047] text-xs font-semibold bg-[rgba(253,224,71,0.15)] py-1 px-2 rounded-lg">Manual</Text>
              ) : (
                <View className="flex-row items-center gap-1 bg-[rgba(74,222,128,0.15)] py-1 px-2 rounded-lg">
                  <CheckCircle2 size={11} color="#4ade80" />
                  <Text className="text-[#4ade80] text-xs font-semibold">{detectingMood ? 'Analyzing...' : 'AI Active'}</Text>
                </View>
              )}
            </View>
            <MoodWheel
              selectedMood={mood}
              onSelectMood={(m, e) => {
                setMood(m);
                setEmoji(e);
                setIsManualOverride(true);
              }}
            />
          </GlassPanel>

          <View>
            <Text className="text-[#cbd5e1] text-sm font-semibold mb-2">Tags</Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => handleRemoveTag(tag)}
                  className="flex-row items-center gap-1 bg-[rgba(168,85,247,0.18)] border border-[rgba(168,85,247,0.35)] rounded-xl py-1 px-2"
                >
                  <Text className="text-[#c084fc] text-xs font-semibold">#{tag}</Text>
                  <X size={12} color="#c084fc" />
                </Pressable>
              ))}
            </View>
            <GlassInput
              placeholder="Add tag and hit enter..."
              value={tagInput}
              onChangeText={setTagInput}
              onSubmitEditing={handleAddTag}
              returnKeyType="done"
            />
          </View>

          <PrimaryButton
            title={saving ? 'Saving...' : 'Save Entry'}
            onPress={handleSave}
            loading={saving}
            icon={<Save size={18} color="#ffffff" />}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
