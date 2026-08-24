import { type ReactNode, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Flame, Sparkles, Smile, BookOpen, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateStreak } from '@/lib/journalStats';
import { hasUsedAi } from '@/lib/achievementTracking';
import { journalService } from '@/services/journalService';

interface AchievementsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Journal {
  mood?: string;
  createdAt?: string;
}

interface Badge {
  id: number;
  title: string;
  desc: string;
  unlocked: boolean;
  icon: ReactNode;
}

// Badges are computed from real journal data (fetched fresh every time the
// modal opens) and real AI-chat usage this session, not a hardcoded
// journalCount default - App.jsx never actually passed a journalCount prop
// here, so 3 of the 4 badges always showed "unlocked" regardless of the
// user's real progress, even for a brand-new account. Also fixes "Emotional
// Master": its own description says "5 distinct mood categories" but it used
// to check journalCount >= 5 (total entries, not distinct moods) - it now
// checks the actual distinct-mood count.
export default function AchievementsModal({ isOpen, onClose }: AchievementsModalProps) {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    journalService
      .getAllJournals()
      .then((list: Journal[]) => {
        if (!cancelled) setJournals(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setJournals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const journalCount = journals.length;
  const streak = calculateStreak(journals);
  const distinctMoods = new Set(journals.map((j) => (j.mood || '').toUpperCase()).filter(Boolean)).size;

  const badges: Badge[] = [
    {
      id: 1,
      title: 'First Reflection 📝',
      desc: 'Logged your first AI-analyzed journal entry',
      unlocked: journalCount >= 1,
      icon: <BookOpen size={24} color="#38bdf8" />,
    },
    {
      id: 2,
      title: '3-Day Streak 🔥',
      desc: 'Maintained a 3-day continuous journaling streak',
      unlocked: streak.current >= 3 || streak.longest >= 3,
      icon: <Flame size={24} color="#fde047" />,
    },
    {
      id: 3,
      title: 'AI Pioneer 🤖',
      desc: 'Used AI Assistant for reflection insights',
      unlocked: hasUsedAi(),
      icon: <Sparkles size={24} color="#c084fc" />,
    },
    {
      id: 4,
      title: 'Emotional Master 😌',
      desc: 'Recorded journals across 5 distinct mood categories',
      unlocked: distinctMoods >= 5,
      icon: <Smile size={24} color="#4ade80" />,
    },
  ];

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-[8px] z-[9999] flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel w-full max-w-[580px] p-7 flex flex-col gap-5 shadow-[0_24px_48px_rgba(0,0,0,0.5)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[0.65rem]">
              <div className="p-2 rounded-xl bg-[rgba(234,179,8,0.15)]">
                <Award size={22} color="#fde047" />
              </div>
              <div>
                <h2 className="text-[1.3rem] font-bold">Journaling Achievements</h2>
                <span className="text-xs text-[var(--text-secondary)]">Milestones unlocked as you reflect</span>
              </div>
            </div>
            <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Badges Grid */}
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
              <div className="glass-panel skeleton-pulse h-[88px] rounded-2xl" />
              <div className="glass-panel skeleton-pulse h-[88px] rounded-2xl" />
              <div className="glass-panel skeleton-pulse h-[88px] rounded-2xl" />
              <div className="glass-panel skeleton-pulse h-[88px] rounded-2xl" />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className={cn(
                    'p-5 rounded-2xl flex items-start gap-[0.85rem]',
                    b.unlocked
                      ? 'bg-[rgba(99,102,241,0.12)] border border-[rgba(99,102,241,0.3)] opacity-100'
                      : 'bg-[var(--text-primary)]/[0.03] border border-[var(--text-primary)]/[0.06] opacity-50'
                  )}
                >
                  <div className="p-2 rounded-xl bg-[var(--text-primary)]/[0.06]">{b.icon}</div>
                  <div>
                    <div className="flex items-center gap-[0.4rem] mb-[0.2rem]">
                      <h4 className="text-[0.95rem] font-bold text-[var(--text-primary)]">{b.title}</h4>
                      {b.unlocked && <CheckCircle2 size={14} color="#4ade80" />}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-[1.3]">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
