import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Schedule, MediaItem, Device, ScheduleTier } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { y: 10, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

const TIER_CONFIG: Record<ScheduleTier, { badge: string; label: string }> = {
  TIER_1: { badge: 'aether-badge-alert', label: 'Override' },
  TIER_2: { badge: 'aether-badge-amber', label: 'Circle' },
  TIER_3: { badge: 'aether-badge-cyan', label: 'Local' },
};

export default function SchedulesPage() {
  const { user } = useAuth();
  const isCentralAdmin = user?.role === 'CENTRAL_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isCircleAdmin = user?.role === 'CIRCLE_ADMIN';

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const [mediaId, setMediaId] = useState('');
  const [tier, setTier] = useState<ScheduleTier>('TIER_3');
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    setIsLoading(true);
    Promise.all([
      api.get('/schedules').then((res) => setSchedules(res.data)),
      api.get('/media').then((res) => {
        const data = res.data;
        if (data.own && data.public) setMedia([...data.own, ...data.public]);
        else setMedia(Array.isArray(data) ? data : []);
      }),
      api.get('/devices').then((res) => setDevices(res.data)),
    ])
      .catch(() => setError('Operational data link failure'))
      .finally(() => setIsLoading(false));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/schedules', { mediaId, tier, deviceIds, startDate, endDate, startTime, endTime, isRecurring });
      loadData();
      setShowForm(false);
    } catch {
      setError('Schedule deployment failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setSaving(true);
    try {
      await api.put('/schedules/' + editingSchedule.id, { mediaId, tier, deviceIds, startDate, endDate, startTime, endTime, isRecurring });
      loadData();
      setShowForm(false);
    } catch {
      setError('Directive update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Confirm directive deletion?')) return;
    try {
      await api.delete('/schedules/' + id);
      loadData();
    } catch {
      setError('Failed to purge directive');
    }
  };

  const openEditForm = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setMediaId(schedule.mediaId);
    setTier(schedule.tier);
    setDeviceIds(schedule.deviceIds || []);
    setStartDate(schedule.startDate ? schedule.startDate.slice(0, 10) : '');
    setEndDate(schedule.endDate ? schedule.endDate.slice(0, 10) : '');
    setStartTime(schedule.startTime || '');
    setEndTime(schedule.endTime || '');
    setIsRecurring(schedule.isRecurring);
    setShowForm(true);
  };

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
          <h2 className="aether-header-title">Broadcast Directives</h2>
          <p className="aether-header-sub">{schedules.length} Active Directives</p>
        </div>
        <button onClick={() => { setEditingSchedule(null); setShowForm(true); }} className="aether-btn">
          <Icon name="add" className="text-sm" />
          Create Directive
        </button>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={editingSchedule ? handleUpdate : handleCreate}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="aether-card tactical-corners"
          >
            <div className="aether-form-header">
              <div className="aether-form-header-icon"><Icon name="schedule" className="text-lg" /></div>
              <span className="aether-label !mb-0">{editingSchedule ? 'Modify Directive' : 'New Directive'}</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Media Asset</label>
                <select required value={mediaId} onChange={(e) => setMediaId(e.target.value)} className="aether-select">
                  <option value="">Select Asset</option>
                  {Array.isArray(media) && media.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}
                </select>
              </div>
              <div>
                <label className="aether-label">Priority Tier</label>
                <select required value={tier} onChange={(e) => setTier(e.target.value as ScheduleTier)} className="aether-select">
                  {(isCentralAdmin || isCompanyAdmin) && <option value="TIER_1">Tier 1 - Company Override</option>}
                  {(isCentralAdmin || isCompanyAdmin || isCircleAdmin) && <option value="TIER_2">Tier 2 - Circle Level</option>}
                  <option value="TIER_3">Tier 3 - Local Level</option>
                </select>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 mt-5">
              <div>
                <label className="aether-label">Target Hardware</label>
                <div className="aether-input h-28 overflow-y-auto space-y-2 p-3 !bg-void">
                  {devices.map(d => (
                    <label key={d.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={deviceIds.includes(d.id)}
                        onChange={(e) => {
                          if (e.target.checked) setDeviceIds([...deviceIds, d.id]);
                          else setDeviceIds(deviceIds.filter(id => id !== d.id));
                        }}
                        className="aether-checkbox"
                      />
                      <span className="text-xs text-text-dim group-hover:text-text-prime transition-colors">{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="aether-label">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="aether-input" />
                  </div>
                  <div>
                    <label className="aether-label">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="aether-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="aether-label">Start Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="aether-input" />
                  </div>
                  <div>
                    <label className="aether-label">End Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="aether-input" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="aether-checkbox" />
                <span className="text-[10px] font-data font-medium uppercase tracking-wider text-text-dim group-hover:text-text-prime transition-colors">Recurring daily window</span>
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="aether-btn-ghost px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="aether-btn px-8">
                  {saving ? 'Syncing...' : editingSchedule ? 'Update Directive' : 'Deploy Directive'}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="aether-card !p-0 overflow-hidden">
        <table className="aether-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Tier</th>
              <th>Scope</th>
              <th>Window</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-void flex items-center justify-center text-cyan border border-edge">
                      <Icon name="movie" className="text-sm" />
                    </div>
                    <span className="font-medium text-text-prime truncate max-w-[140px]">{s.media?.filename}</span>
                  </div>
                </td>
                <td>
                  <span className={'aether-badge ' + TIER_CONFIG[s.tier].badge}>
                    {TIER_CONFIG[s.tier].label}
                  </span>
                </td>
                <td className="text-text-dim text-xs font-data">{s.deviceIds?.length || 0} Nodes</td>
                <td>
                  <div className="text-[11px] text-text-prime font-medium font-data">{s.startDate?.slice(5, 10)} &rarr; {s.endDate?.slice(5, 10)}</div>
                  <div className="text-[9px] text-text-dim font-data">{s.startTime} - {s.endTime}</div>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditForm(s)} className="aether-btn-icon !w-7 !h-7"><Icon name="edit" className="text-sm" /></button>
                    <button onClick={() => handleDelete(s.id)} className="aether-btn-icon alert !w-7 !h-7"><Icon name="delete" className="text-sm" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="aether-empty">
                    <Icon name="schedule" className="text-3xl text-text-dim" />
                    <span className="aether-empty-text">No directives configured</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}
