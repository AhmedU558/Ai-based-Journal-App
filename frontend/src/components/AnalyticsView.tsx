import { useEffect, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Rectangle,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { Smile, TrendingUp, Flame, Award, RefreshCw, AlertCircle, BarChart3, Hash, PenLine, CalendarDays } from 'lucide-react';
import { journalService } from '@/services/journalService';
import { analyticsService } from '@/services/analyticsService';
import { useThemeTokens } from '@/lib/useThemeTokens';
import { MOODS as SHARED_MOODS, MOOD_META, type Mood as SharedMood, type MoodMeta } from '@/lib/moods';
import { getAiLevel } from '@/lib/journalStats';

interface Insights {
  longestStreakDays: number;
  writingFrequency: string;
  mostProductiveDays: string[];
  topTopics: string[];
  [key: string]: unknown;
}

// AnalyticsView is the only consumer that needs an 8th "NEUTRAL" bucket: the
// backend seeds newly-indexed journals with mood "NEUTRAL" before AI
// classification runs, and that value is a real, reportable analytics
// bucket here - but it's a system placeholder, not a feeling a user picks,
// so it deliberately stays out of the shared Mood/MOOD_META contract that
// MoodWheel's mood *picker* also relies on.
type Mood = SharedMood | 'NEUTRAL';

interface Journal {
  id: number | string;
  mood?: string;
  createdAt?: string;
  [key: string]: unknown;
}

const MOODS: Mood[] = [...SHARED_MOODS, 'NEUTRAL'];

const NEUTRAL_META: MoodMeta = {
  key: 'NEUTRAL' as SharedMood,
  label: 'Neutral',
  emoji: '😐',
  bg: 'rgba(148, 163, 184, 0.15)',
  border: 'rgba(148, 163, 184, 0.4)',
  text: '#94a3b8',
};

const ANALYTICS_MOOD_META: Record<Mood, MoodMeta> = { ...MOOD_META, NEUTRAL: NEUTRAL_META };

// recharts' `shape` render-prop passes a large, loosely-typed geometry/payload
// bag - `any` here matches how recharts' own examples and most TS consumers type it.
const CustomBarShape = (props: any) => <Rectangle {...props} fill={props.payload?.color || props.color} />;

export default function AnalyticsView() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState<Insights | null>(null);
  // Recharts reads raw SVG props, not CSS - it can't resolve var(--text-secondary)
  // the way className-based styling can, so chart axis/tick colors need the
  // theme's actual resolved value, live-updated when the theme toggles.
  const { textSecondary, textMuted } = useThemeTokens();
  // fetchRealtimeAnalytics is called both from the mount effect below and
  // from the "Refresh Data" button - a plain effect-scoped `cancelled` flag
  // can't guard the button-triggered call, so a request-id ref tracks which
  // invocation is the latest and lets every earlier one's response be
  // ignored if it resolves after a newer call has already started.
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchRealtimeAnalytics();
  }, []);

  const fetchRealtimeAnalytics = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const list = await journalService.getAllJournals();
      if (requestIdRef.current !== requestId) return;
      setJournals(Array.isArray(list) ? list : []);

      try {
        // Deeper Insights is a separate, non-blocking data source
        // (analytics-service) - a failure here must never take down the
        // charts above, which are computed entirely from `list` and always
        // work regardless of this call's outcome.
        const res = await analyticsService.getInsights();
        if (requestIdRef.current !== requestId) return;
        const data = res?.data?.data;
        if (data && typeof data === 'object') {
          setInsights(data as Insights);
        }
      } catch {
        if (requestIdRef.current === requestId) setInsights(null);
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load realtime analytics:', err);
      setError('Could not load analytics data. Please try refreshing.');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  };

  const totalEntries = journals.length;
  const moodCounts: Record<string, number> = {
    HAPPY: 0, EXCITED: 0, RELAXED: 0, STRESSED: 0, SAD: 0, GRATEFUL: 0, ANGRY: 0, NEUTRAL: 0,
  };

  journals.forEach((j) => {
    const m = (j.mood || 'HAPPY').toUpperCase();
    if (moodCounts[m] !== undefined) {
      moodCounts[m] += 1;
    } else {
      moodCounts.HAPPY += 1;
    }
  });

  let dominantMood: Mood = 'HAPPY';
  let maxCount = -1;
  MOODS.forEach((m) => {
    if (moodCounts[m] > maxCount) {
      maxCount = moodCounts[m];
      dominantMood = m;
    }
  });

  const positiveCount = (moodCounts.HAPPY || 0) + (moodCounts.EXCITED || 0) + (moodCounts.RELAXED || 0) + (moodCounts.GRATEFUL || 0);
  const positivityRate = totalEntries > 0 ? Math.round((positiveCount / totalEntries) * 100) : 100;

  const moodBreakdown = MOODS.filter((m) => moodCounts[m] > 0 || totalEntries === 0).map((m) => ({
    name: `${m.charAt(0) + m.slice(1).toLowerCase()} ${ANALYTICS_MOOD_META[m]?.emoji || '😊'}`,
    value: moodCounts[m],
    color: ANALYTICS_MOOD_META[m]?.text || '#6366f1',
  }));

  // Real counts only - no fabricated fallback numbers. A mood axis genuinely at 0 is
  // honest; the whole chart is hidden behind an empty state (below) when there's no
  // data at all, rather than substituting plausible-looking fake numbers for every axis.
  const radarData = [
    { subject: 'Joy 😊', A: moodCounts.HAPPY, fullMark: 15 },
    { subject: 'Excitement 🤩', A: moodCounts.EXCITED, fullMark: 15 },
    { subject: 'Relaxation 😌', A: moodCounts.RELAXED, fullMark: 15 },
    { subject: 'Stress 😰', A: moodCounts.STRESSED, fullMark: 15 },
    { subject: 'Melancholy 🥺', A: moodCounts.SAD, fullMark: 15 },
    { subject: 'Gratitude 🙏', A: moodCounts.GRATEFUL, fullMark: 15 },
    { subject: 'Anger 😠', A: moodCounts.ANGRY, fullMark: 15 },
  ];

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const trendMap: Record<string, { day: string; count: number; score: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayName = days[d.getDay()];
    trendMap[dayName] = { day: dayName, count: 0, score: 70 };
  }

  journals.forEach((j) => {
    if (j.createdAt) {
      const d = new Date(j.createdAt);
      const dayName = days[d.getDay()];
      if (trendMap[dayName]) {
        trendMap[dayName].count += 1;
        const isPos = ['HAPPY', 'EXCITED', 'RELAXED', 'GRATEFUL'].includes((j.mood || '').toUpperCase());
        trendMap[dayName].score = isPos ? 95 : 60;
      }
    }
  });

  const trendData = Object.values(trendMap);

  return (
    <div className="p-8 max-w-[1100px] mx-auto flex flex-col gap-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[2rem] font-extrabold">Real-Time Data Analytics</h1>
          <p className="text-[var(--text-secondary)] text-[0.9rem]">Live sentiment metrics calculated dynamically from your journal entries</p>
        </div>
        <button type="button" onClick={fetchRealtimeAnalytics} className="btn-secondary py-2 px-[0.85rem]">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Top Real-Time Metric Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <div className="glass-panel p-6 text-center">
          <Smile size={32} color={totalEntries > 0 ? ANALYTICS_MOOD_META[dominantMood]?.text || '#4ade80' : '#64748b'} className="mb-[0.4rem]" />
          <div className="text-[0.8rem] text-[var(--text-secondary)]">Dominant Real-Time Mood</div>
          {totalEntries > 0 ? (
            <div className="text-[1.4rem] font-extrabold" style={{ color: ANALYTICS_MOOD_META[dominantMood]?.text || '#4ade80' }}>
              {dominantMood} {ANALYTICS_MOOD_META[dominantMood]?.emoji || '😊'}
            </div>
          ) : (
            <div className="text-[1.4rem] font-extrabold text-[var(--text-muted)]">No data yet</div>
          )}
        </div>

        <div className="glass-panel p-6 text-center">
          <TrendingUp size={32} color="#38bdf8" className="mb-[0.4rem]" />
          <div className="text-[0.8rem] text-[var(--text-secondary)]">Live Positivity Rate</div>
          <div className="text-[1.5rem] font-extrabold text-[#38bdf8]">{positivityRate}%</div>
        </div>

        <div className="glass-panel p-6 text-center">
          <Flame size={32} color="#fde047" className="mb-[0.4rem]" />
          <div className="text-[0.8rem] text-[var(--text-secondary)]">Total Logged Entries</div>
          <div className="text-[1.5rem] font-extrabold text-[#fde047]">{totalEntries} Entries</div>
        </div>

        <div className="glass-panel p-6 text-center">
          <Award size={32} color="#c084fc" className="mb-[0.4rem]" />
          <div className="text-[0.8rem] text-[var(--text-secondary)]">AI Level</div>
          <div className="text-[1.4rem] font-extrabold text-[#c084fc]">{getAiLevel(totalEntries)}</div>
        </div>
      </div>

      {totalEntries === 0 && !loading ? (
        <div className="glass-panel p-12 text-center">
          <BarChart3 size={48} color="#64748b" className="mb-4 mx-auto" />
          <h3 className="text-[1.2rem] mb-2">No Data to Analyze Yet</h3>
          <p className="text-[var(--text-secondary)]">Write a few journal entries and your real mood trends, positivity stream, and emotional balance will appear here.</p>
        </div>
      ) : (
        <>
          {/* Grid Charts Suite - single column below lg:, deterministically stacked rather
              than relying on auto-fit/minmax alone (which overflows on real phone widths) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[1.15rem] font-bold text-[var(--text-primary)]">Live Positivity Stream</h3>
                <span className="text-xs text-[#4ade80] bg-[rgba(74,222,128,0.15)] py-[0.2rem] px-[0.6rem] rounded-lg font-semibold">
                  ● Active Stream
                </span>
              </div>
              <div className="w-full h-[260px]">
                <ResponsiveContainer>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="scoreGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke={textMuted} tick={{ fill: textSecondary }} />
                    <YAxis domain={[0, 100]} stroke={textMuted} tick={{ fill: textSecondary }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-primary)' }} />
                    <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#scoreGlow)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-8">
              <h3 className="text-[1.15rem] font-bold text-[var(--text-primary)] mb-6">Emotional Balance Radar Wheel</h3>
              <div className="w-full h-[260px]">
                <ResponsiveContainer>
                  <RadarChart outerRadius={90} data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="subject" stroke={textSecondary} tick={{ fill: textSecondary, fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 15]} stroke={textMuted} />
                    <Radar name="Mood Spectrum" dataKey="A" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="glass-panel p-8">
            <h3 className="text-[1.2rem] font-bold text-[var(--text-primary)] mb-6">Real-Time Mood Frequency Breakdown</h3>
            <div className="w-full h-[260px]">
              <ResponsiveContainer>
                <BarChart data={moodBreakdown}>
                  <XAxis dataKey="name" stroke={textMuted} tick={{ fill: textSecondary }} />
                  <YAxis stroke={textMuted} tick={{ fill: textSecondary }} />
                  <Tooltip contentStyle={{ background: '#101426', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} shape={<CustomBarShape />} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {insights && (
            <div className="glass-panel p-8">
              <h3 className="text-[1.2rem] font-bold text-[var(--text-primary)] mb-6">Deeper Insights</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5 mb-6">
                <div className="text-center">
                  <Flame size={26} color="#fde047" className="mb-2 mx-auto" />
                  <div className="text-[0.8rem] text-[var(--text-secondary)]">Longest Streak</div>
                  <div className="text-[1.2rem] font-extrabold text-[#fde047]">{insights.longestStreakDays} Days</div>
                </div>
                <div className="text-center">
                  <PenLine size={26} color="#38bdf8" className="mb-2 mx-auto" />
                  <div className="text-[0.8rem] text-[var(--text-secondary)]">Writing Frequency</div>
                  <div className="text-[1.2rem] font-extrabold text-[#38bdf8]">{insights.writingFrequency}</div>
                </div>
                <div className="text-center">
                  <CalendarDays size={26} color="#4ade80" className="mb-2 mx-auto" />
                  <div className="text-[0.8rem] text-[var(--text-secondary)]">Most Productive Day{insights.mostProductiveDays.length !== 1 ? 's' : ''}</div>
                  <div className="text-[1.2rem] font-extrabold text-[#4ade80]">
                    {insights.mostProductiveDays.length > 0 ? insights.mostProductiveDays.join(', ') : 'N/A'}
                  </div>
                </div>
              </div>
              {insights.topTopics.length > 0 && (
                <div>
                  <div className="text-[0.8rem] text-[var(--text-secondary)] mb-2 flex items-center gap-1"><Hash size={14} /> Top Topics</div>
                  <div className="flex flex-wrap gap-2">
                    {insights.topTopics.map((topic) => (
                      <span key={topic} className="text-xs bg-[rgba(99,102,241,0.15)] border border-[rgba(99,102,241,0.35)] text-[#818cf8] py-1 px-3 rounded-full">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
