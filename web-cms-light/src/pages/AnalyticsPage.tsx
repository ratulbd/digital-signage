import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { ReportData, Subcenter, Device } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

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
        setError('Forensic link failure');
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
      setError('Signal filtering failed');
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
        <div className="aether-spinner !w-10 !h-10 !border-[3px]" />
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-8">
      {error && (
        <div className="aether-error">
          <Icon name="error" className="text-sm shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <motion.div variants={itemVariants} className="aether-header">
        <div>
          <h2 className="aether-header-title">Forensic Stream</h2>
          <p className="aether-header-sub">System Playback Forensics</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-[9px] font-data font-medium text-amber uppercase tracking-[0.2em] block mb-1">Total Runtime</span>
            <span className="text-3xl font-light text-text-prime font-data tracking-tight">{report?.totalHours.toFixed(1)} <span className="text-base opacity-40">H</span></span>
          </div>
          <button className="aether-btn-amber aether-btn">
            <Icon name="terminal" className="text-sm" />
            Export
          </button>
        </div>
      </motion.div>

      <motion.form variants={itemVariants} onSubmit={handleFilter} className="aether-card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 items-end">
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
              <select className="aether-select" value={selectedSubcenter} onChange={(e) => setSelectedSubcenter(e.target.value)}>
                <option value="">All Subcenters</option>
                {subcenters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="aether-label">Device</label>
            <select className="aether-select" value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)}>
              <option value="">All Devices</option>
              {filteredDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="aether-btn w-full justify-center">
              {isFiltering ? 'Scanning...' : 'Execute Scan'}
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
                <th className="min-w-[140px]">Date &amp; Time</th>
                <th className="min-w-[180px]">Device</th>
                <th className="min-w-[200px]">Media</th>
                <th className="text-right min-w-[150px]">Duration</th>
              </tr>
            </thead>
            <tbody>
              {report?.logs.length ? (
                report.logs.map((log, idx) => (
                  <motion.tr key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={'aether-status ' + (log.status === 'Completed' ? 'aether-status-online' : 'aether-status-offline')} />
                        <div className="flex flex-col">
                          <span className="text-xs font-data font-medium whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</span>
                          <span className="text-[9px] font-data text-text-dim whitespace-nowrap">{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-text-prime whitespace-nowrap">{log.deviceName}</span>
                        <span className="text-[9px] font-data text-amber uppercase tracking-widest">{log.subcenterName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium truncate max-w-[180px]" title={log.mediaName}>{log.mediaName}</span>
                        <div className="h-[2px] w-full bg-edge rounded-full overflow-hidden">
                          <div className="h-full bg-amber/30" style={{ width: '100%' }} />
                        </div>
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-data font-medium whitespace-nowrap">{log.durationHrs.toFixed(4)} <span className="text-[10px] opacity-40">hrs</span></span>
                        <span className={'aether-badge ' + (log.status === 'Completed' ? 'aether-badge-signal' : 'aether-badge-cyan')}>
                          <Icon name={log.status === 'Completed' ? 'check_circle' : 'sensors'} className="text-[11px]" />
                          {log.status === 'Completed' ? 'Locked' : 'Streaming'}
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="aether-empty !py-16">
                      <Icon name="wifi_off" className="text-4xl text-text-dim animate-pulse" />
                      <span className="aether-empty-text">Neural Signal Not Detected</span>
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
