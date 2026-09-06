import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../components/Select';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { ReportData, Subcenter, Device } from '../types';

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

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [subcenters, setSubcenters] = useState<Subcenter[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSubcenter, setSelectedSubcenter] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState('');

  const isCentralAdmin = user?.role === 'CENTRAL_ADMIN';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reportRes, subcentersRes, devicesRes] = await Promise.all([
          api.get('/analytics/reports'),
          isCentralAdmin ? api.get('/subcenters') : Promise.resolve({ data: [] }),
          api.get('/devices'),
        ]);
        setReport(reportRes.data);
        setSubcenters(subcentersRes.data);
        setDevices(devicesRes.data);
      } catch {
        setError('Failed to load analytics data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isCentralAdmin]);

  const handleFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFiltering(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedSubcenter) params.append('subcenterId', selectedSubcenter);
      if (selectedDevice) params.append('deviceId', selectedDevice);
      const res = await api.get('/analytics/reports?' + params.toString());
      setReport(res.data);
    } catch {
      setError('Filtering failed');
    } finally {
      setIsFiltering(false);
    }
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedSubcenter('');
    setSelectedDevice('');
    api.get('/analytics/reports').then(res => setReport(res.data));
  };

  const filteredDevices = selectedSubcenter
    ? devices.filter(d => d.subcenterId === selectedSubcenter)
    : devices;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="aether-spinner !w-8 !h-8 !border-[3px]" />
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="aether-error">
            <Icon name="error" className="text-sm shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto opacity-50 hover:opacity-100"><Icon name="close" className="text-sm" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="aether-header">
        <div>
          <h2 className="aether-header-title">Analytics</h2>
          <p className="aether-header-sub">Playback Reports &amp; Insights</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-xs font-data text-text-dim uppercase tracking-wider block">Total Runtime</span>
            <span className="text-2xl font-semibold text-text-prime font-data">{report?.totalHours.toFixed(1)}<span className="text-sm text-text-dim ml-1">hrs</span></span>
          </div>
          <button className="aether-btn">
            <Icon name="download" className="text-sm" />
            Export
          </button>
        </div>
      </motion.div>

      <motion.form variants={itemVariants} onSubmit={handleFilter} className="aether-card">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <label className="aether-label">Start Date</label>
            <input type="date" className="aether-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="aether-label">End Date</label>
            <input type="date" className="aether-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {isCentralAdmin && (
            <div>
              <label className="aether-label">Subcenter</label>
              <Select
                value={selectedSubcenter}
                onChange={setSelectedSubcenter}
                options={[{ value: '', label: 'All Subcenters' }, ...subcenters.map(s => ({ value: s.id, label: s.name }))]}
              />
            </div>
          )}
          <div>
            <label className="aether-label">Device</label>
            <Select
              value={selectedDevice}
              onChange={setSelectedDevice}
              options={[{ value: '', label: 'All Devices' }, ...filteredDevices.map(d => ({ value: d.id, label: d.name }))]}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="aether-btn w-full justify-center">
              {isFiltering ? 'Filtering...' : 'Apply Filters'}
            </button>
            <button type="button" onClick={handleClearFilters} className="aether-btn-icon !w-10 !h-10 shrink-0" title="Reset">
              <Icon name="restart_alt" />
            </button>
          </div>
        </div>
      </motion.form>

      <motion.div variants={itemVariants} className="aether-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="aether-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Device</th>
                <th>Media</th>
                <th className="text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {report?.logs.length ? (
                report.logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={'aether-status ' + (log.status === 'Completed' ? 'aether-status-online' : 'aether-status-offline')} />
                        <div className="flex flex-col">
                          <span className="text-xs font-data font-medium whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</span>
                          <span className="text-xs font-data text-text-dim whitespace-nowrap">{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-text-prime whitespace-nowrap">{log.deviceName}</span>
                        <span className="text-xs font-data text-text-dim">{log.subcenterName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium truncate max-w-[200px]" title={log.mediaName}>{log.mediaName}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-data font-medium whitespace-nowrap">{log.durationHrs.toFixed(2)} <span className="text-xs text-text-dim">hrs</span></span>
                        <span className={'aether-badge ' + (log.status === 'Completed' ? 'aether-badge-signal' : 'aether-badge-cyan')}>
                          <Icon name={log.status === 'Completed' ? 'check_circle' : 'sensors'} className="text-xs" />
                          {log.status === 'Completed' ? 'Completed' : 'Streaming'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="aether-empty">
                      <Icon name="analytics" className="text-3xl text-text-dim" />
                      <span className="aether-empty-text">No playback data available</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
