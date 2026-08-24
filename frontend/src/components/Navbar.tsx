import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Search,
  BarChart3,
  Calendar,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Award,
  Settings,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MindoraMark from './MindoraMark';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  onOpenAchievements: () => void;
  onOpenSettings: () => void;
  avatarUrl?: string | null;
}

export default function Navbar({ activeTab, setActiveTab, onLogout, onOpenAchievements, onOpenSettings, avatarUrl }: NavbarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('user_name') || 'Journaler';

  return (
    <motion.aside
      animate={{ width: collapsed ? '80px' : '260px' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={cn(
        'glass-panel m-4 flex flex-col h-[calc(100vh-2rem)] relative z-20 overflow-hidden',
        collapsed ? 'py-5 px-3' : 'p-6'
      )}
    >
      {/* Collapse Toggle Button - in normal flow (not absolutely positioned)
          so it never overlaps the brand logo once the sidebar shrinks to
          80px collapsed: an absolute top-right button and a 42px logo tile
          both competing for the same corner used to visibly merge together. */}
      <div className={cn('flex items-center mb-4', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="bg-[var(--text-primary)]/[0.08] border border-[var(--text-primary)]/[0.12] text-[var(--text-secondary)] rounded-full w-7 h-7 flex items-center justify-center cursor-pointer shrink-0"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-9">
        <div className="bg-[linear-gradient(135deg,var(--accent-indigo,#6366f1),var(--accent-purple,#a855f7))] rounded-xl w-[42px] h-[42px] flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(99,102,241,0.4)]">
          <MindoraMark size={26} />
        </div>
        {!collapsed && (
          <div>
            <h2 className="text-[1.4rem] font-extrabold bg-[linear-gradient(135deg,var(--text-primary),var(--text-secondary))] bg-clip-text text-transparent">
              Mindora
            </h2>
            <span className="text-xs text-[var(--accent-indigo,#6366f1)] font-semibold tracking-wider">
              AI Journaling Companion
            </span>
          </div>
        )}
      </div>

      {/* Navigation Items - below the global lg: (1024px) breakpoint the sidebar itself
          becomes a full-width block (see index.css); turn the item list into a compact
          horizontal scrollable row here instead of a tall stacked list pushing content down.
          `min-h-0` lets this flex child actually shrink instead of growing past the sidebar's
          fixed height with its content - without it, once there are enough nav items to
          overflow, the badges/settings buttons and profile footer below get pushed out of the
          visible area and silently clipped by the sidebar's own `overflow-hidden` (found live
          after adding the "Get App" item pushed the profile footer off the bottom edge). */}
      <nav className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto max-lg:flex-row max-lg:flex-none max-lg:overflow-x-auto max-lg:gap-1 max-lg:pb-1">
        <NavItem
          icon={<LayoutDashboard size={20} />}
          label="Dashboard"
          active={activeTab === 'dashboard'}
          collapsed={collapsed}
          onClick={() => setActiveTab('dashboard')}
        />
        <NavItem
          icon={<BookOpen size={20} />}
          label="My Journals"
          active={activeTab === 'journals'}
          collapsed={collapsed}
          onClick={() => setActiveTab('journals')}
        />
        <NavItem
          icon={<Calendar size={20} />}
          label="Mood Calendar"
          active={activeTab === 'calendar'}
          collapsed={collapsed}
          onClick={() => setActiveTab('calendar')}
        />
        <NavItem
          icon={<Sparkles size={20} />}
          label="Assistant"
          active={activeTab === 'ai-chat'}
          collapsed={collapsed}
          onClick={() => setActiveTab('ai-chat')}
        />
        <NavItem
          icon={<Search size={20} />}
          label="Search"
          active={activeTab === 'search'}
          collapsed={collapsed}
          onClick={() => setActiveTab('search')}
        />
        <NavItem
          icon={<BarChart3 size={20} />}
          label="Mood Analytics"
          active={activeTab === 'analytics'}
          collapsed={collapsed}
          onClick={() => setActiveTab('analytics')}
        />
        <NavItem
          icon={<Smartphone size={20} />}
          label="Get App"
          active={activeTab === 'download'}
          collapsed={collapsed}
          onClick={() => setActiveTab('download')}
        />
      </nav>

      {/* Gamified Achievements & Settings Triggers */}
      {!collapsed && (
        <div className="flex gap-2 mb-4">
          <button onClick={onOpenAchievements} className="btn-secondary flex-1 p-2 text-[0.8rem] justify-center">
            <Award size={14} color="#fde047" />
            <span>Badges</span>
          </button>

          <button onClick={onOpenSettings} className="btn-secondary flex-1 p-2 text-[0.8rem] justify-center">
            <Settings size={14} color="#38bdf8" />
            <span>Settings</span>
          </button>
        </div>
      )}

      {/* Profile Footer */}
      <div className="pt-4 border-t border-t-[var(--text-primary)]/[0.08]">
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[linear-gradient(135deg,#6366f1,#a855f7)] flex items-center justify-center text-white font-bold shrink-0">
                {username.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div>
                <div className="text-[0.9rem] font-semibold text-[var(--text-primary)]">{username}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={onLogout}
              title="Logout"
              className="bg-transparent border-0 text-[var(--text-secondary)] hover:text-[#ef4444] cursor-pointer p-2 rounded-lg transition-all duration-200"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: string;
  collapsed: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, badge, collapsed, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : ''}
      className={cn(
        'flex items-center gap-[0.85rem] rounded-xl border-0 text-[0.95rem] cursor-pointer w-full max-lg:w-auto max-lg:shrink-0 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] relative',
        collapsed ? 'py-3 justify-center' : 'py-[0.85rem] px-4 justify-start',
        active
          ? 'bg-[linear-gradient(135deg,rgba(99,102,241,0.25),rgba(168,85,247,0.15))] text-[var(--text-primary)] font-semibold'
          : 'bg-transparent text-[var(--text-secondary)] font-medium'
      )}
    >
      <span className={active ? 'text-[var(--accent-indigo,#6366f1)]' : 'text-inherit'}>{icon}</span>
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {!collapsed && badge && (
        <span className="text-[0.65rem] py-[0.2rem] px-[0.4rem] rounded-md bg-[rgba(99,102,241,0.25)] text-[#818cf8] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
