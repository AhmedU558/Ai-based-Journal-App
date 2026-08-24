import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Sparkles, BookOpen, Calendar, BarChart3, Sun, Command, X, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandAction {
  id: string;
  label: string;
  category: string;
  icon: ReactNode;
  shortcut: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

const ACTIONS: CommandAction[] = [
  { id: 'new-journal', label: 'Create New Journal Entry', category: 'Actions', icon: <Plus size={18} color="#818cf8" />, shortcut: 'N' },
  { id: 'voice-dictation', label: 'Start Voice Dictation', category: 'Actions', icon: <Mic size={18} color="#4ade80" />, shortcut: 'V' },
  { id: 'ai-chat', label: 'Open AI Conversational Assistant', category: 'AI Tools', icon: <Sparkles size={18} color="#c084fc" />, shortcut: 'A' },
  { id: 'journals', label: 'View All Journal Entries', category: 'Navigation', icon: <BookOpen size={18} color="#38bdf8" />, shortcut: 'J' },
  { id: 'calendar', label: 'Open Mood Heatmap Calendar', category: 'Navigation', icon: <Calendar size={18} color="#fde047" />, shortcut: 'C' },
  { id: 'search', label: 'Type-Ahead Deep Search', category: 'Navigation', icon: <Search size={18} color="#fb7185" />, shortcut: 'S' },
  { id: 'analytics', label: 'View Real-Time Data Analytics', category: 'Navigation', icon: <BarChart3 size={18} color="#4ade80" />, shortcut: 'R' },
  { id: 'toggle-theme', label: 'Toggle Light / Dark Mode', category: 'Preferences', icon: <Sun size={18} color="#f59e0b" />, shortcut: 'T' },
];

export default function CommandPalette({ isOpen, onClose, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredActions = ACTIONS.filter(
    (act) =>
      act.label.toLowerCase().includes(query.toLowerCase()) ||
      act.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleExecute = useCallback(
    (actionId: string) => {
      onSelectAction(actionId);
      onClose();
      setQuery('');
    },
    [onSelectAction, onClose]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredActions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % (filteredActions.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredActions[selectedIndex]) {
          handleExecute(filteredActions[selectedIndex].id);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredActions, handleExecute, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-[8px] z-[9999] flex items-start justify-center pt-[10vh]"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel w-full max-w-[640px] overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.5)] border border-[var(--text-primary)]/15"
        >
          {/* Command Search Header */}
          <div className="flex items-center py-5 px-6 border-b border-b-[var(--text-primary)]/[0.08] gap-[0.85rem]">
            <Search size={22} color="var(--accent-indigo, #6366f1)" />
            <input
              type="text"
              autoFocus
              placeholder="Type a command or search actions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent border-0 outline-none text-[var(--text-primary,#ffffff)] text-[1.1rem] w-full font-medium"
            />
            <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Action List */}
          <div className="max-h-[380px] overflow-y-auto p-3">
            {filteredActions.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)] text-[0.9rem]">
                No commands matching "{query}"
              </div>
            ) : (
              filteredActions.map((act, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={act.id}
                    onClick={() => handleExecute(act.id)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      'flex items-center justify-between py-[0.85rem] px-4 rounded-xl cursor-pointer transition-all duration-150',
                      isSelected
                        ? 'bg-[linear-gradient(135deg,rgba(99,102,241,0.25),rgba(168,85,247,0.15))]'
                        : 'bg-transparent'
                    )}
                  >
                    <div className="flex items-center gap-[0.85rem]">
                      {act.icon}
                      <div>
                        <div className={cn('text-[0.95rem] font-semibold', isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]')}>
                          {act.label}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{act.category}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-[0.35rem]">
                      <span className="text-[0.7rem] text-[#818cf8] bg-[rgba(99,102,241,0.15)] py-[0.2rem] px-2 rounded-md font-bold">
                        {act.shortcut}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="py-3 px-6 bg-black/20 border-t border-t-[var(--text-primary)]/[0.06] flex items-center justify-between text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-4">
              <span><strong className="text-[var(--text-secondary)]">↑↓</strong> Navigate</span>
              <span><strong className="text-[var(--text-secondary)]">↵</strong> Select</span>
              <span><strong className="text-[var(--text-secondary)]">ESC</strong> Close</span>
            </div>
            <div className="flex items-center gap-[0.35rem]">
              <Command size={12} />
              <span>Raycast Command Palette</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
