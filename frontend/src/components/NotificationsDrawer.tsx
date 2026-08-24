import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, ShieldCheck, CheckCircle, X, BellOff } from 'lucide-react';

export interface NotificationItem {
  id: number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: NotificationItem[];
  onMarkAllRead?: () => void;
}

// Only "SECURITY" is emitted by the backend today (password change/reset, MFA
// toggle, admin disable) - a generic fallback keeps this from needing an
// update every time a new notification type is added server-side.
const TYPE_META: Record<string, { label: string; icon: ReactNode }> = {
  SECURITY: { label: 'Account Security', icon: <ShieldCheck size={16} color="#38bdf8" /> },
};
const DEFAULT_TYPE_META = { label: 'Notification', icon: <Bell size={16} color="#818cf8" /> };

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsDrawer({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
}: NotificationsDrawerProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[4px] z-[9998] flex justify-end"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel w-full max-w-[380px] h-screen rounded-none p-6 flex flex-col gap-5 shadow-[-12px_0_32px_rgba(0,0,0,0.4)] border-l border-l-[var(--text-primary)]/10"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-b-[var(--text-primary)]/[0.08] pb-4">
            <div className="flex items-center gap-[0.65rem]">
              <Bell size={20} color="var(--accent-indigo, #6366f1)" />
              <h2 className="text-[1.2rem] font-bold">Notifications</h2>
            </div>
            <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Action Bar */}
          {notifications.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={onMarkAllRead}
                className="bg-transparent border-0 text-[#818cf8] text-[0.8rem] font-semibold cursor-pointer flex items-center gap-[0.35rem]"
              >
                <CheckCircle size={14} />
                <span>Mark all as read</span>
              </button>
            </div>
          )}

          {/* Notifications Feed */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-[0.85rem]">
            {notifications.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-12">
                <BellOff size={32} color="#64748b" />
                <p className="text-[0.85rem] text-[var(--text-secondary)]">No notifications yet</p>
              </div>
            ) : (
              notifications.map((item) => {
                const meta = TYPE_META[item.type] || DEFAULT_TYPE_META;
                return (
                  <div
                    key={item.id}
                    className={`bg-[var(--text-primary)]/[0.04] border border-[var(--text-primary)]/[0.08] p-4 rounded-2xl flex gap-3 transition-all duration-200 ${item.read ? 'opacity-60' : ''}`}
                  >
                    <div className="p-2 rounded-[10px] bg-[var(--text-primary)]/[0.06] h-fit">{meta.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{meta.label}</h4>
                        <span className="text-[0.7rem] text-[var(--text-muted)]">{formatRelativeTime(item.createdAt)}</span>
                      </div>
                      <p className="text-[0.8rem] text-[var(--text-secondary)] leading-[1.4]">{item.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
