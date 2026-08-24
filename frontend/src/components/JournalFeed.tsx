import { useEffect, useState, type MouseEvent } from 'react';
import { BookOpen, Plus, Edit3, Trash2, LayoutGrid, List, Filter, AlertCircle } from 'lucide-react';
import { journalService } from '@/services/journalService';
import { cn } from '@/lib/utils';
import { MOOD_META, MOOD_FILTERS, type Mood, type MoodFilter } from '@/lib/moods';

interface Journal {
  id: number | string;
  title?: string;
  content?: string;
  mood?: string;
  tags?: string[];
  createdAt?: string;
  [key: string]: unknown;
}

type ViewMode = 'grid' | 'list';

interface JournalFeedProps {
  onNewJournal: () => void;
  onEditJournal: (journal: Journal) => void;
  showToast?: (message: string, type?: string) => void;
}

function getMoodEmoji(mood?: string): string {
  return MOOD_META[(mood || '').toUpperCase() as Mood]?.emoji || '😐';
}

export default function JournalFeed({ onNewJournal, onEditJournal, showToast }: JournalFeedProps) {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [filteredJournals, setFilteredJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<MoodFilter>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    fetchJournals();
  }, []);

  const fetchJournals = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await journalService.getAllJournals();
      const arr: Journal[] = Array.isArray(list) ? list : [];
      setJournals(arr);
      setFilteredJournals(arr);
    } catch (err) {
      console.error('Failed to load journals:', err);
      setError('Could not load your journals. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterMood = (mood: MoodFilter) => {
    setSelectedMoodFilter(mood);
    if (mood === 'ALL') {
      setFilteredJournals(journals);
    } else {
      setFilteredJournals(journals.filter((j) => (j.mood || '').toUpperCase() === mood));
    }
  };

  const handleDelete = async (e: MouseEvent, id: Journal['id']) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this journal entry?')) return;
    try {
      await journalService.deleteJournal(id);
      const updated = journals.filter((j) => j.id !== id);
      setJournals(updated);
      setFilteredJournals(updated);
      if (showToast) showToast('Journal entry deleted.', 'info');
    } catch (err) {
      console.error('Delete failed:', err);
      if (showToast) showToast('Failed to delete journal entry. Please try again.', 'error');
    }
  };

  return (
    <div className="p-8 max-w-[1200px] mx-auto flex flex-col gap-7 animate-fade-in">
      {/* Feed Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[2rem] font-extrabold">My Journal Library</h1>
          <p className="text-[var(--text-secondary)] text-[0.9rem]">Browse, filter, edit, and delete your AI-analyzed entries</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-[var(--text-primary)]/5 p-[0.2rem] rounded-[10px] border border-[var(--text-primary)]/10">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-[0.4rem] border-0 rounded-lg cursor-pointer',
                viewMode === 'grid' ? 'bg-[rgba(99,102,241,0.25)] text-[#818cf8]' : 'bg-transparent text-[var(--text-secondary)]'
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-[0.4rem] border-0 rounded-lg cursor-pointer',
                viewMode === 'list' ? 'bg-[rgba(99,102,241,0.25)] text-[#818cf8]' : 'bg-transparent text-[var(--text-secondary)]'
              )}
            >
              <List size={16} />
            </button>
          </div>

          <button onClick={onNewJournal} className="btn-primary">
            <Plus size={18} /> New Entry
          </button>
        </div>
      </div>

      {/* Mood Filter Pill Bar with ANGRY support */}
      <div className="flex items-center gap-[0.6rem] overflow-x-auto pb-2">
        <Filter size={16} color="#64748b" />
        {MOOD_FILTERS.map((m) => (
          <button
            key={m}
            onClick={() => handleFilterMood(m)}
            className={cn(
              'py-[0.4rem] px-[0.85rem] rounded-[20px] text-[0.8rem] cursor-pointer whitespace-nowrap',
              selectedMoodFilter === m
                ? 'bg-[linear-gradient(135deg,rgba(99,102,241,0.25),rgba(168,85,247,0.15))] border border-[#6366f1] text-[var(--text-primary)] font-semibold'
                : 'bg-[var(--text-primary)]/[0.04] border border-[var(--text-primary)]/[0.08] text-[var(--text-secondary)] font-medium'
            )}
          >
            {m === 'ALL' ? 'All Entries' : `${m} ${getMoodEmoji(m)}`}
          </button>
        ))}
      </div>

      {/* Journal Cards Feed */}
      {error ? (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel skeleton-pulse h-[220px] rounded-[20px]" />
          ))}
        </div>
      ) : filteredJournals.length === 0 ? (
        <div className="glass-panel py-16 px-8 text-center">
          <BookOpen size={48} color="#64748b" className="mb-4" />
          <h3 className="text-[1.2rem] mb-[0.4rem]">No Journal Entries Found</h3>
          <p className="text-[var(--text-secondary)] mb-6">Try clearing filters or create a new journal entry.</p>
          <button onClick={onNewJournal} className="btn-primary">
            <Plus size={18} /> Write Journal
          </button>
        </div>
      ) : (
        <div className={cn('gap-6', viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))]' : 'flex flex-col')}>
          {filteredJournals.map((journal) => (
            <div key={journal.id} className="glass-panel p-6 flex flex-col gap-[0.85rem] relative">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-xs py-1 px-[0.65rem] rounded-xl font-semibold inline-flex items-center gap-[0.35rem]',
                    (journal.mood || '').toUpperCase() === 'ANGRY'
                      ? 'bg-[rgba(239,68,68,0.2)] text-[#ef4444]'
                      : 'bg-[rgba(99,102,241,0.15)] text-[#818cf8]'
                  )}
                >
                  <span>{getMoodEmoji(journal.mood)}</span>
                  <span>{journal.mood || 'HAPPY'}</span>
                </span>

                <div className="flex items-center gap-[0.35rem]">
                  <button
                    onClick={() => onEditJournal(journal)}
                    className="btn-secondary p-[0.35rem] rounded-lg"
                    title="Edit Entry"
                  >
                    <Edit3 size={14} color="#38bdf8" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, journal.id)}
                    className="btn-secondary p-[0.35rem] rounded-lg"
                    title="Delete Entry"
                  >
                    <Trash2 size={14} color="#f87171" />
                  </button>
                </div>
              </div>

              <div onClick={() => onEditJournal(journal)} className="cursor-pointer">
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
          ))}
        </div>
      )}
    </div>
  );
}
