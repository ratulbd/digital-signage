import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import type { DashboardStats } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
} as const;

const itemVariants = {
  hidden: { y: 15, opacity: 0, scale: 0.98 },
  show: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 110,
      damping: 16,
      mass: 0.8,
    },
  },
} as const;

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
      {/* Header */}
      <motion.div variants={itemVariants} className="aether-header">
        <div>
          <h2 className="aether-header-title">Dashboard</h2>
          <p className="aether-header-sub">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => navigate(isCentralAdmin ? '/schedules' : '/media')} className="aether-btn">
          <Icon name={isCentralAdmin ? 'bolt' : 'auto_awesome'} className="text-sm" />
          {isCentralAdmin ? 'New Schedule' : 'Upload Media'}
        </button>
      </motion.div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard label="Total Devices" value={stats?.totalDevices ?? 0} icon="router" color="cyan" />
        <StatCard label="Online" value={stats?.onlineDevices ?? 0} icon="radar" color="signal" />
        <StatCard label="Offline" value={stats?.offlineDevices ?? 0} icon="sensors_off" color="alert" />
        <StatCard label="Screen Hours" value={stats?.todayScreenTimeHrs ?? 0} icon="hourglass_empty" color="amber" decimal />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Health */}
        <motion.div variants={itemVariants} className="aether-card xl:col-span-2">
          <div className="flex items-center gap-3 mb-8 pb-5 border-b border-edge">
            <Icon name="query_stats" className="text-cyan text-base" />
            <span className="aether-label !mb-0">Device Health</span>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-10">
            {/* Ring */}
            <div className="relative shrink-0">
              <svg className="w-36 h-36 rotate-[-90deg]">
                <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-edge" />
                <motion.circle
                  cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="5" fill="transparent"
                  strokeDasharray="414.7"
                  initial={{ strokeDashoffset: 414.7 }}
                  animate={{ strokeDashoffset: 414.7 - (414.7 * uptimePct / 100) }}
                  transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-cyan"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-text-prime font-data">
                  {uptimePct}<span className="text-base opacity-40">%</span>
                </span>
                <span className="text-xs font-data font-medium text-text-dim uppercase tracking-wider mt-1">Uptime</span>
              </div>
            </div>

            {/* Bars */}
            <div className="flex-1 w-full space-y-6">
              <HealthBar label="Network Quality" value={stats?.networkQuality ?? 0} color="bg-cyan" />
              <HealthBar label="Sync Status" value={stats?.syncStatus ?? 0} color="bg-signal" />
              <HealthBar label="Content Delivery" value={stats?.contentDelivery ?? 0} color="bg-amber" />
            </div>
          </div>
        </motion.div>

        {/* Audit */}
        <motion.div variants={itemVariants} className="aether-card flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-5 border-b border-edge">
            <div className="flex items-center gap-3">
              <Icon name="history_edu" className="text-amber text-base" />
              <span className="aether-label !mb-0">Recent Activity</span>
            </div>
            <span className="text-xs font-data font-medium text-cyan tracking-wider pulse-glow px-2 py-0.5 rounded bg-cyan/5">REC</span>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar max-h-[320px] pr-1">
            {stats?.recentActivity?.length ? (
              stats.recentActivity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1.5 w-1 h-1 rounded-full bg-cyan shrink-0 shadow-[0_0_6px_rgba(37,99,235,0.3)]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-prime leading-relaxed">{item.message}</p>
                    <p className="text-xs font-data text-text-dim mt-1">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="aether-empty !py-10">
                <Icon name="dns" className="text-2xl text-text-dim" />
                <span className="aether-empty-text">No recent activity</span>
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
    cyan: 'text-cyan bg-cyan/8 border-cyan/15',
    signal: 'text-signal bg-signal/8 border-signal/15',
    alert: 'text-alert bg-alert/8 border-alert/15',
    amber: 'text-amber bg-amber/8 border-amber/15',
  };

  return (
    <motion.div variants={itemVariants} className="aether-card group">
      <div className="flex justify-between items-start mb-5">
        <div className={`w-9 h-9 rounded-md flex items-center justify-center border ${colorMap[color]}`}>
          <Icon name={icon} className="text-base" />
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-edge group-hover:bg-cyan/30 transition-colors" />
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
      <div className="flex justify-between items-end">
        <span className="text-xs font-data font-medium text-text-dim uppercase tracking-wider">{label}</span>
        <span className="text-sm font-data font-medium text-text-prime">{value}%</span>
      </div>
      <div className="h-[3px] w-full bg-edge rounded-full overflow-hidden">
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
