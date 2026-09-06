import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../components/Select';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import { MediaPreviewModal } from '../components/MediaPreviewModal';
import DeviceMultiSelect from '../components/DeviceMultiSelect';
import type { Schedule, MediaItem, Device, ScheduleTier } from '../types';

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

const TIER_CONFIG = {
  TIER_1: { label: 'Tier 1 (Override)', badge: 'aether-badge-red' },
  TIER_2: { label: 'Tier 2 (Circle)', badge: 'aether-badge-cyan' },
  TIER_3: { label: 'Tier 3 (Local)', badge: 'aether-badge-amber' },
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
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);

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

  const resetFormDefaults = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const start = `${hours}:${minutes}`;

    // End time = +3 minutes
    const endDateObj = new Date(now.getTime() + 3 * 60000);
    const end = `${pad(endDateObj.getHours())}:${pad(endDateObj.getMinutes())}`;

    setMediaId('');
    setTier('TIER_3');
    setDeviceIds([]);
    setStartDate(today);
    setEndDate(today);
    setStartTime(start);
    setEndTime(end);
    setIsRecurring(false);
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
      await api.post('/schedules/' + editingSchedule.id + '/update', { mediaId, tier, deviceIds, startDate, endDate, startTime, endTime, isRecurring });
      loadData();
      setShowForm(false);
    } catch {
      setError('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Confirm directive deletion?')) return;
    try {
      await api.post('/schedules/' + id + '/delete');
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
          <h2 className="aether-header-title">Schedules</h2>
          <p className="aether-header-sub">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditingSchedule(null); resetFormDefaults(); setShowForm(true); }} className="aether-btn">
          <Icon name="add" className="text-sm" />
          New Schedule
        </button>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={editingSchedule ? handleUpdate : handleCreate}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="aether-card"
          >
            <div className="aether-form-header">
              <div className="aether-form-header-icon"><Icon name="schedule" className="text-lg" /></div>
              <span className="aether-label !mb-0">{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Media</label>
                <Select
                  value={mediaId}
                  onChange={setMediaId}
                  options={Array.isArray(media) ? media.map((m) => ({
                    value: m.id,
                    label: m.contentName || m.filename,
                    sublabel: m.category?.name && m.contentType?.name
                      ? `${m.category.name} / ${m.contentType.name}`
                      : (m.category?.name || m.contentType?.name || ''),
                  })) : []}
                  placeholder="Select media"
                />
              </div>
              <div>
                <label className="aether-label">Priority</label>
                <Select
                  value={tier}
                  onChange={(v) => setTier(v as ScheduleTier)}
                  options={[
                    ...(isCentralAdmin || isCompanyAdmin ? [{ value: 'TIER_1', label: 'Tier 1 — Company Override' }] : []),
                    ...(isCentralAdmin || isCompanyAdmin || isCircleAdmin ? [{ value: 'TIER_2', label: 'Tier 2 — Circle Level' }] : []),
                    { value: 'TIER_3', label: 'Tier 3 — Local Level' },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 mt-5">
              <div>
                <label className="aether-label">Devices</label>
                <DeviceMultiSelect
                  devices={devices}
                  selectedIds={deviceIds}
                  onChange={setDeviceIds}
                />
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
                <span className="text-xs font-data font-medium uppercase tracking-wider text-text-dim group-hover:text-text-prime transition-colors">Repeat daily</span>
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="aether-btn-ghost px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="aether-btn px-8">
                  {saving ? 'Saving...' : editingSchedule ? 'Update Schedule' : 'Create Schedule'}
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
                    <button
                      type="button"
                      disabled={!s.media}
                      onClick={() => s.media && setPreviewMedia(s.media)}
                      className="w-8 h-8 rounded-md bg-void flex items-center justify-center text-cyan border border-edge hover:border-cyan hover:scale-105 transition-all disabled:opacity-50 disabled:pointer-events-none"
                      title={s.media ? "Preview Media" : undefined}
                    >
                      <Icon name="movie" className="text-sm" />
                    </button>
                    <div className="min-w-0 cursor-pointer" onClick={() => s.media && setPreviewMedia(s.media)}>
                      <div className="font-medium text-text-prime truncate max-w-[180px] hover:text-cyan transition-colors">{s.media?.contentName || s.media?.filename}</div>
                      <div className="text-[10px] text-text-dim font-data truncate max-w-[180px]">
                        {s.media?.category?.name && s.media?.contentType?.name
                          ? `${s.media.category.name} / ${s.media.contentType.name}`
                          : (s.media?.category?.name || s.media?.contentType?.name || s.media?.filename)}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={'aether-badge ' + TIER_CONFIG[s.tier].badge}>
                    {TIER_CONFIG[s.tier].label}
                  </span>
                </td>
                <td className="text-text-dim text-xs font-data">{s.deviceIds?.length || 0} device{s.deviceIds?.length !== 1 ? 's' : ''}</td>
                <td>
                  <div className="text-sm text-text-prime font-medium font-data">{s.startDate?.slice(5, 10)} &rarr; {s.endDate?.slice(5, 10)}</div>
                  <div className="text-xs text-text-dim font-data">{s.startTime} - {s.endTime}</div>
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
                    <span className="aether-empty-text">No schedules configured</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Media Preview Modal */}
      <AnimatePresence>
        {previewMedia && (
          <MediaPreviewModal
            item={previewMedia}
            onClose={() => setPreviewMedia(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
