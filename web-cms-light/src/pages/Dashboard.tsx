import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import type { DashboardStats } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isCentralAdmin = user?.role === 'CENTRAL_ADMIN';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/analytics/dashboard');
        setStats(res.data);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="aether-spinner !w-8 !h-8 !border-[3px]" />
      </div>
    );
  }

  const uptimePct = stats?.totalDevices ? Math.round((stats.onlineDevices / stats.totalDevices) * 100) : 0;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={itemVariants} className="aether-header">
        <div>
          <h2 className="aether-header-title">System Overview</h2>
          <p className="aether-header-sub">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => navigate(isCentralAdmin ? '/schedules' : '/media')} className="aether-btn">
          <Icon name={isCentralAdmin ? 'bolt' : 'auto_awesome'} className="text-sm" />
          {isCentralAdmin ? 'Create priority campaign' : 'Open content library'}
        </button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Registered devices" value={stats?.totalDevices ?? 0} icon="router" color="cyan" />
        <StatCard label="Online now" value={stats?.onlineDevices ?? 0} icon="radar" color="signal" />
        <StatCard label="Needs attention" value={stats?.offlineDevices ?? 0} icon="warning" color="alert" />
        <StatCard label="Playback hours" value={stats?.todayScreenTimeHrs ?? 0} icon="schedule" color="amber" decimal />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <motion.div variants={itemVariants} className="aether-card xl:col-span-2">
          <div className="mb-8 flex items-center gap-3 border-b border-edge pb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="query_stats" className="text-base" />
            </div>
            <div>
              <div className="aether-label !mb-1">Performance snapshot</div>
              <p className="text-sm text-text-dim">A quick read on network stability and delivery quality.</p>
            </div>
          </div>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
            <div className="relative shrink-0">
              <svg className="w-36 h-36 rotate-[-90deg]">
                <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-200" />
                <motion.circle
                  cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="10" fill="transparent"
                  strokeDasharray="414.7"
                  initial={{ strokeDashoffset: 414.7 }}
                  animate={{ strokeDashoffset: 414.7 - (414.7 * uptimePct / 100) }}
                  transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-cyan"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-data text-4xl font-semibold text-text-prime">
                  {uptimePct}<span className="text-base opacity-40">%</span>
                </span>
                <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">System uptime</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-6">
              <HealthBar label="Signal latency" value={98} color="bg-cyan" />
              <HealthBar label="Content sync" value={100} color="bg-signal" />
              <HealthBar label="Delivery success" value={stats?.todayScreenTimeHrs ? 94 : 0} color="bg-amber" />
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-ghost">Primary action</div>
                  <div className="mt-2 text-sm leading-6 text-text-dim">Push urgent schedules faster from the schedule center.</div>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">Operational note</div>
                  <div className="mt-2 text-sm leading-6 text-emerald-800">Healthy devices are checking in and screen playback is flowing.</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="aether-card flex flex-col">
          <div className="mb-6 flex items-center justify-between border-b border-edge pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber/10 text-amber">
                <Icon name="history_edu" className="text-base" />
              </div>
              <span className="aether-label !mb-0">Recent activity</span>
            </div>
            <span className="pulse-glow rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">Live</span>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar max-h-[320px] pr-1">
            {stats?.recentActivity?.length ? (
              stats.recentActivity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan shadow-[0_0_0_6px_rgba(37,99,235,0.08)]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium leading-relaxed text-text-prime">{item.message}</p>
                    <p className="mt-1 text-[11px] text-text-dim">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="aether-empty !py-10">
                <Icon name="dns" className="text-2xl text-text-dim" />
                <span className="aether-empty-text">No recent activity yet</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon, color, decimal }: any) {
  const display = decimal ? value.toFixed(1) : value.toLocaleString();
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan bg-cyan/10 border-cyan/15',
    signal: 'text-signal bg-signal/10 border-signal/15',
    alert: 'text-alert bg-alert/10 border-alert/15',
    amber: 'text-amber bg-amber/10 border-amber/15',
  };

  return (
    <motion.div variants={itemVariants} className="aether-card group">
      <div className="mb-5 flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${colorMap[color]}`}>
          <Icon name={icon} className="text-base" />
        </div>
        <div className="h-2 w-2 rounded-full bg-edge transition-colors group-hover:bg-cyan/40" />
      </div>
      <div className="aether-stat">
        <div className="aether-stat-value">{display}</div>
        <div className="aether-stat-label">{label}</div>
      </div>
    </motion.div>
  );
}

function HealthBar({ label, value, color }: any) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">{label}</span>
        <span className="font-data text-[12px] font-medium text-text-prime">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}
