import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { journalService } from '@/services/journalService';
import { cn } from '@/lib/utils';
import { MOOD_META, type Mood } from '@/lib/moods';

interface JournalEntry {
  createdAt?: string;
  mood?: string;
  [key: string]: unknown;
}

interface CalendarViewProps {
  onSelectJournal: (journal: JournalEntry) => void;
}

function getMoodEmoji(mood?: string): string {
  return MOOD_META[(mood || '').toUpperCase() as Mood]?.emoji || '😐';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarView({ onSelectJournal }: CalendarViewProps) {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJournals();
  }, []);

  const fetchJournals = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await journalService.getAllJournals();
      const list = res?.data || res || [];
      setJournals(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Calendar error:', err);
      setError('Could not load your calendar. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Days in month calculation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // Backward navigation is bounded to the month of the user's very first
  // journal entry - without this, prevMonth had no limit at all and could be
  // clicked indefinitely into empty years with nothing to show (found live:
  // several clicks landed on April 2022, long before the account existed).
  // A user with no entries yet has nothing earlier than the current month to
  // look back at, so the bound defaults to "now" in that case.
  const today = new Date();
  const currentMonthValue = today.getFullYear() * 12 + today.getMonth();
  const earliestEntryDate = journals.reduce<Date | null>((earliest, j) => {
    if (!j.createdAt) return earliest;
    const d = new Date(j.createdAt);
    if (Number.isNaN(d.getTime())) return earliest;
    return !earliest || d < earliest ? d : earliest;
  }, null);
  const minMonthValue = earliestEntryDate
    ? earliestEntryDate.getFullYear() * 12 + earliestEntryDate.getMonth()
    : currentMonthValue;
  const viewedMonthValue = year * 12 + month;
  const canGoPrev = viewedMonthValue > minMonthValue;

  const prevMonth = () => {
    if (canGoPrev) setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Map journal entry by date string (YYYY-MM-DD)
  const journalMap: Record<string, JournalEntry> = {};
  journals.forEach((j) => {
    if (j.createdAt) {
      const d = new Date(j.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      journalMap[key] = j;
    }
  });

  return (
    <div className="p-8 max-w-[1000px] mx-auto flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[2rem] font-extrabold">Mood Calendar & Timeline</h1>
          <p className="text-[var(--text-secondary)] text-[0.9rem]">Visual emotional tracking mapped across calendar days</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            disabled={!canGoPrev}
            title={canGoPrev ? 'Previous month' : "You have no entries before this month"}
            className="btn-secondary p-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[1.1rem] font-bold text-[var(--text-primary)] min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} title="Next month" className="btn-secondary p-2">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Calendar Grid */}
      {loading ? (
        <div className="glass-panel p-7 skeleton-pulse h-[420px] rounded-[20px]" />
      ) : (
        !error && (
          <div className="glass-panel p-7">
            <div className="grid grid-cols-7 gap-3 text-center font-semibold text-[var(--text-secondary)] mb-4 text-[0.85rem]">
              <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>

            <div className="grid grid-cols-7 gap-3">
              {days.map((day, idx) => {
                if (!day) {
                  return <div key={idx} className="h-20 opacity-20" />;
                }

                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const journalForDay = journalMap[dateKey];

                return (
                  <div
                    key={idx}
                    onClick={() => journalForDay && onSelectJournal(journalForDay)}
                    className={cn(
                      'h-20 rounded-xl p-2 flex flex-col justify-between transition-all duration-200',
                      journalForDay
                        ? 'bg-[rgba(99,102,241,0.18)] border border-[rgba(99,102,241,0.4)] cursor-pointer'
                        : 'bg-[var(--text-primary)]/[0.03] border border-[var(--text-primary)]/5 cursor-default'
                    )}
                  >
                    <span className={cn('text-[0.8rem] font-semibold', journalForDay ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]')}>
                      {day}
                    </span>
                    {journalForDay && (
                      <div className="text-[1.4rem] text-center">{getMoodEmoji(journalForDay.mood)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
