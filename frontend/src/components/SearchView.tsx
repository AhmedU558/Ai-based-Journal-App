import { useEffect, useState } from 'react';
import { Search, Filter, BookOpen, Sparkles, SortAsc, AlertCircle } from 'lucide-react';
import { searchService } from '@/services/searchService';
import { cn } from '@/lib/utils';
import { MOOD_META, MOOD_FILTERS, type Mood, type MoodFilter } from '@/lib/moods';

interface SearchResult {
  id: string;
  journalId: number;
  userId: number;
  title?: string;
  content?: string;
  mood?: string;
  tags?: string[];
  createdAt?: string;
}

type SortBy = 'newest' | 'oldest';

function getMoodEmoji(m?: string): string {
  return MOOD_META[(m || '').toUpperCase() as Mood]?.emoji || '😊';
}

// Requesting a larger single page rather than building pagination controls,
// to keep the existing "see all matches at once" UX without expanding scope.
const RESULTS_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedMoodFilter, setSelectedMoodFilter] = useState<MoodFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced, backend-driven search - re-runs whenever the query text or mood
  // filter changes. Sorting is applied client-side to whatever page comes back
  // (the endpoint doesn't offer server-side sorting).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await searchService.search({ query, mood: selectedMoodFilter, size: RESULTS_PAGE_SIZE });
        if (cancelled) return;
        const content = res?.data?.data?.content;
        setResults(Array.isArray(content) ? content : []);
      } catch (err) {
        if (cancelled) return;
        console.error('Search failed:', err);
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    // clearTimeout alone only stops a not-yet-fired debounce timer - it can't
    // cancel a request already in flight. The cancelled flag covers that gap
    // so a slower, now-stale response can never overwrite fresher results.
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedMoodFilter]);

  const sortedResults = [...results].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return sortBy === 'newest' ? bTime - aTime : aTime - bTime;
  });

  return (
    <div className="p-8 max-w-[1100px] mx-auto flex flex-col gap-6 animate-fade-in">
      {/* Search Header */}
      <div>
        <h1 className="text-[2rem] font-extrabold flex items-center gap-[0.6rem]">
          <Search size={26} color="#818cf8" /> Search Your Journals
        </h1>
        <p className="text-[var(--text-secondary)] text-[0.9rem]">
          Find any entry instantly by title, content, mood, or tag
        </p>
      </div>

      {/* Input & Control Bar */}
      <div className="glass-panel p-5 flex flex-col gap-4">
        <div className="relative">
          <Search size={20} color="#818cf8" className="absolute left-[1.2rem] top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="glass-input pl-[3.2rem] text-[1.1rem] font-semibold"
            placeholder="Type anything to search in real-time (e.g. hackathon, stressed, gratitude)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Filter Pills & Sort Bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-[0.2rem]">
            <Filter size={14} color="#64748b" />
            {MOOD_FILTERS.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMoodFilter(m)}
                className={cn(
                  'py-[0.35rem] px-3 rounded-2xl text-xs cursor-pointer',
                  selectedMoodFilter === m
                    ? 'bg-[rgba(99,102,241,0.25)] border border-[#6366f1] text-[var(--text-primary)] font-bold'
                    : 'bg-[var(--text-primary)]/[0.04] border border-[var(--text-primary)]/[0.08] text-[var(--text-secondary)] font-medium'
                )}
              >
                {m === 'ALL' ? 'All Moods' : `${m} ${getMoodEmoji(m)}`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <SortAsc size={14} color="#94a3b8" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="bg-[var(--text-primary)]/5 border border-[var(--text-primary)]/10 text-[var(--text-primary)] py-[0.35rem] px-3 rounded-xl text-[0.8rem] cursor-pointer"
            >
              <option value="newest" style={{ background: 'var(--bg-secondary)' }}>Newest First</option>
              <option value="oldest" style={{ background: 'var(--bg-secondary)' }}>Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Header Count */}
      <div className="text-[0.85rem] text-[var(--text-secondary)] flex items-center gap-[0.4rem]">
        <Sparkles size={14} color="#4ade80" />
        <span>{loading ? 'Searching...' : `Found ${sortedResults.length} matching entries`}</span>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Results Grid */}
      {!error && !loading && sortedResults.length === 0 ? (
        <div className="glass-panel p-14 text-center">
          <BookOpen size={44} color="#64748b" className="mb-4" />
          <h3 className="text-[1.15rem] mb-[0.4rem]">No Matching Entries</h3>
          <p className="text-[var(--text-secondary)]">Try adjusting your search query or mood filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
          {sortedResults.map((j) => (
            <div key={j.id} className="glass-panel p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs py-1 px-[0.65rem] rounded-2xl bg-[rgba(99,102,241,0.15)] text-[#818cf8] font-bold">
                  {getMoodEmoji(j.mood)} {j.mood || 'HAPPY'}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {j.createdAt ? new Date(j.createdAt).toLocaleDateString() : 'Recent'}
                </span>
              </div>

              <h3 className="text-[1.1rem] font-bold text-[var(--text-primary)]">{j.title}</h3>
              <p className="text-[0.88rem] text-[var(--text-secondary)] leading-[1.5] line-clamp-3">{j.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
