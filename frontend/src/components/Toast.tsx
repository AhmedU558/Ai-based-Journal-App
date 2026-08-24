import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastData {
  message: string;
  type?: ToastVariant;
}

interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={18} color="#4ade80" />,
  error: <AlertCircle size={18} color="#f87171" />,
  info: <Info size={18} color="#38bdf8" />,
};

export default function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const variant: ToastVariant = toast.type && toast.type in ICONS ? toast.type : 'info';

  return (
    <div
      className={cn(
        'glass-panel animate-fade-in',
        'fixed bottom-8 right-8 z-[9999] flex items-center gap-3',
        // No bg-[...] override here - the hardcoded rgba(16,20,38,...) dark
        // navy previously used was winning over .glass-panel's own
        // theme-aware `background: var(--panel-bg)` rule (Tailwind utilities
        // take precedence over component classes), so the toast stayed dark
        // even in light theme while its text correctly switched via
        // var(--text-primary) - dark text on a dark background, nearly
        // invisible. Letting .glass-panel's background apply keeps both in
        // sync with the active theme.
        'py-[0.85rem] px-5 rounded-[14px] min-w-[280px]',
        'shadow-[0_10px_30px_rgba(0,0,0,0.5)]',
        variant === 'success' && 'border-[rgba(34,197,94,0.4)]',
        variant === 'error' && 'border-[rgba(239,68,68,0.4)]',
        variant === 'info' && 'border-[rgba(56,189,248,0.4)]'
      )}
    >
      {ICONS[variant]}
      <span className="text-[0.9rem] text-[var(--text-primary)] font-medium flex-1">{toast.message}</span>
      <button
        onClick={onClose}
        className="bg-transparent border-0 text-[var(--text-secondary)] cursor-pointer flex items-center"
      >
        <X size={16} />
      </button>
    </div>
  );
}
