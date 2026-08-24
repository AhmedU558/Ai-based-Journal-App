import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Sparkles, Plus, BookOpen, Flame, Heart, Edit3, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { journalService } from '@/services/journalService';
import { aiService } from '@/services/aiService';
import { MOOD_META, type Mood } from '@/lib/moods';
import { calculateStreak } from '@/lib/journalStats';

interface Journal {
  id: number | string;
  title?: string;
  content?: string;
  mood?: string;
  tags?: string[];
  createdAt?: string;
  [key: string]: unknown;
}

interface DashboardViewProps {
  onNewJournal: () => void;
  onSelectJournal: (journal: Journal) => void;
  showToast?: (message: string, type?: string) => void;
}

function getMoodEmoji(mood?: string): string {
  return MOOD_META[(mood || '').toUpperCase() as Mood]?.emoji || '😊';
}

interface MoodBadgeStyle {
  bg: string;
  border: string;
  color: string;
}

const DEFAULT_MOOD_BADGE_STYLE: MoodBadgeStyle = { bg: 'rgba(99, 102, 241, 0.18)', border: 'rgba(99, 102, 241, 0.35)', color: '#818cf8' };

function getMoodBadgeStyle(mood?: string): MoodBadgeStyle {
  const meta = MOOD_META[(mood || '').toUpperCase() as Mood];
  return meta ? { bg: meta.bg, border: meta.border, color: meta.text } : DEFAULT_MOOD_BADGE_STYLE;
}

export default function DashboardView({ onNewJournal, onSelectJournal, showToast }: DashboardViewProps) {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recommendation, setRecommendation] = useState('Take 5 deep breaths and reflect on 3 good things today.');
  const username = localStorage.getItem('user_name') || 'Journaler';
  // fetchDashboardData is called both from the mount effect and the
  // "Refresh" button below - a plain effect-scoped cancelled flag can't
  // guard the button-triggered call, so a request-id ref (same pattern
  // AnalyticsView already uses for its identical mount+button dual-trigger
  // shape) tracks which invocation is the latest and lets an earlier,
  // slower response be ignored if it resolves after a newer call started.
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const list = await journalService.getAllJournals();
      if (requestIdRef.current !== requestId) return;
      setJournals(Array.isArray(list) ? list : []);

      try {
        // Most recent entry (getAllJournals returns newest-first by default,
        // matching journal-service's default sortBy=createdAt&sortDir=DESC) -
        // not a hardcoded mood, so this actually reflects how the user's
        // been feeling instead of always requesting HAPPY-flavored content.
        const mostRecent = Array.isArray(list) ? list[0] : undefined;
        const currentMood = mostRecent?.mood || 'NEUTRAL';
        const aiRes = await aiService.getRecommendations(currentMood, mostRecent?.content);
        if (requestIdRef.current !== requestId) return;
        // ApiResponse<T> wraps every backend response as {success, message,
        // data, timestamp} - aiRes.data is that envelope, not the array
        // itself. Reading aiRes.data directly here meant Array.isArray()
        // was always false and this branch never actually fired.
        const recommendations = aiRes?.data?.data;
        if (Array.isArray(recommendations) && recommendations.length > 0) {
          setRecommendation(recommendations[0]);
        }
      } catch {
        // Fallback recommendation
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load dashboard data:', err);
      setError('Could not load your dashboard. Please try refreshing.');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  };

  const handleDelete = async (e: MouseEvent, id: Journal['id']) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this journal entry?')) return;
    try {
      await journalService.deleteJournal(id);
      setJournals(journals.filter((j) => j.id !== id));
      if (showToast) showToast('Journal entry deleted.', 'info');
    } catch (err) {
      console.error('Delete failed:', err);
      if (showToast) showToast('Failed to delete journal entry. Please try again.', 'error');
    }
  };

  return (
    <div className="p-8 flex flex-col gap-8 max-w-[1200px] mx-auto">
      {/* Hero Welcome Banner */}
      <div className="glass-panel glass-panel-glow animate-fade-in p-10 rounded-3xl relative overflow-hidden">
        <div className="relative z-[2] max-w-[600px]">
          <div className="inline-flex items-center gap-2 bg-[rgba(99,102,241,0.2)] border border-[rgba(99,102,241,0.3)] py-[0.4rem] px-[0.85rem] rounded-[20px] text-[0.8rem] text-[#818cf8] font-semibold mb-4">
            <Sparkles size={14} />
            <span>AI MOOD INSIGHTS</span>
          </div>
          <h1 className="text-[2.4rem] font-extrabold mb-3 leading-[1.2]">
            Good day,{' '}
            <span className="bg-[linear-gradient(135deg,#818cf8,#c084fc)] bg-clip-text text-transparent">{username}</span> 👋
          </h1>
          <p className="text-[var(--text-secondary)] text-[1.05rem] leading-[1.6] mb-6">
            Write about your day and we'll automatically pick up on your mood, adding a matching emoji as you type.
          </p>
          <button onClick={onNewJournal} className="btn-primary py-[0.85rem] px-7 text-base">
            <Plus size={20} />
            <span>Write New Journal Entry</span>
          </button>
        </div>
      </div>

      {/* Grid Summary Widgets */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        <div className="glass-panel p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(234,179,8,0.15)] flex items-center justify-center">
            <Flame size={28} color="#fde047" />
          </div>
          <div>
            <div className="text-[0.85rem] text-[var(--text-secondary)] font-medium">Journaling Streak</div>
            <div className="text-[1.8rem] font-extrabold text-[var(--text-primary)]">
              {calculateStreak(journals).current} Days
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(99,102,241,0.15)] flex items-center justify-center">
            <BookOpen size={28} color="#818cf8" />
          </div>
          <div>
            <div className="text-[0.85rem] text-[var(--text-secondary)] font-medium">Total Saved Entries</div>
            <div className="text-[1.8rem] font-extrabold text-[var(--text-primary)]">{journals.length} Entries</div>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(34,197,94,0.15)] flex items-center justify-center">
            <Heart size={28} color="#4ade80" />
          </div>
          <div className="flex-1">
            <div className="text-[0.85rem] text-[var(--text-secondary)] font-medium mb-[0.2rem]">AI Wellness Suggestion</div>
            <div className="text-[0.9rem] text-[var(--text-secondary)] italic leading-[1.3]">"{recommendation}"</div>
          </div>
        </div>
      </div>

      {/* Recent Entries Header */}
      <div className="flex items-center justify-between mt-4">
        <h2 className="text-[1.5rem] font-bold">Recent AI-Analyzed Entries</h2>
        <button onClick={fetchDashboardData} className="btn-secondary py-2 px-[0.85rem] text-[0.85rem]">
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Recent Entries Feed */}
      {error ? (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel skeleton-pulse h-[200px] rounded-[20px]" />
          ))}
        </div>
      ) : journals.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <BookOpen size={48} color="#64748b" className="mb-4" />
          <h3 className="text-[1.2rem] mb-2">No Journal Entries Yet</h3>
          <p className="text-[var(--text-secondary)] mb-6">Start your journaling journey by writing your first AI-analyzed entry.</p>
          <button onClick={onNewJournal} className="btn-primary">
            <Plus size={18} />
            <span>Create First Entry</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
          {journals.slice(0, 6).map((journal) => (
            <DashboardJournalCard
              key={journal.id}
              journal={journal}
              onSelect={() => onSelectJournal(journal)}
              onDelete={(e) => handleDelete(e, journal.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DashboardJournalCardProps {
  journal: Journal;
  onSelect: () => void;
  onDelete: (e: MouseEvent) => void;
}

function DashboardJournalCard({ journal, onSelect, onDelete }: DashboardJournalCardProps) {
  const badgeStyle = getMoodBadgeStyle(journal.mood);

  return (
    <div className="glass-panel p-6 flex flex-col gap-[0.85rem] relative">
      <div className="flex items-center justify-between">
        <span
          className="text-[0.85rem] py-[0.35rem] px-3 rounded-[14px] font-bold inline-flex items-center gap-[0.4rem] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
          style={{
            background: badgeStyle.bg,
            border: `1px solid ${badgeStyle.border}`,
            color: badgeStyle.color,
          }}
        >
          <span className="text-[1.1rem]">{getMoodEmoji(journal.mood)}</span>
          <span>{journal.mood || 'HAPPY'}</span>
        </span>

        <div className="flex items-center gap-[0.35rem]">
          <button onClick={onSelect} className="btn-secondary p-[0.35rem] rounded-lg" title="Edit Entry">
            <Edit3 size={14} color="#38bdf8" />
          </button>
          <button onClick={onDelete} className="btn-secondary p-[0.35rem] rounded-lg" title="Delete Entry">
            <Trash2 size={14} color="#f87171" />
          </button>
        </div>
      </div>

      <div onClick={onSelect} className="cursor-pointer">
        <h3 className="text-[1.15rem] font-bold text-[var(--text-primary)] leading-[1.3] mb-[0.4rem]">{journal.title}</h3>
        <p className="text-[0.9rem] text-[var(--text-secondary)] leading-[1.5] line-clamp-3">{journal.content}</p>
      </div>

      {journal.tags && journal.tags.length > 0 && (
        <div className="flex gap-[0.4rem] flex-wrap mt-auto">
          {journal.tags.map((tag, idx) => (
            <span key={idx} className="text-[0.7rem] text-[#a855f7] bg-[rgba(168,85,247,0.1)] py-[0.15rem] px-[0.4rem] rounded-md">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
