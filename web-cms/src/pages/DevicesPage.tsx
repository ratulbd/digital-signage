import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../components/Select';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Device, Subcenter } from '../types';

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

export default function DevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [subcenters, setSubcenters] = useState<Subcenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairDeviceId, setRepairDeviceId] = useState<string | null>(null);
  const [repairDeviceName, setRepairDeviceName] = useState('');
  const [repairSubcenterId, setRepairSubcenterId] = useState('');
  const [repairCode, setRepairCode] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [codeType, setCodeType] = useState<'pair' | 'repair'>('pair');

  // Human-readable relative time
  const timeAgo = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  const [deviceName, setDeviceName] = useState('');
  const [subcenterId, setSubcenterId] = useState('');

  const isCentralAdmin = user?.role === 'CENTRAL_ADMIN';

  const fetchDevices = () => {
    api.get('/devices')
      .then((res) => setDevices(res.data))
      .catch(() => setError('Failed to load devices'))
      .finally(() => setIsLoading(false));
  };

  const fetchSubcenters = () => {
    if (isCentralAdmin) {
      api.get('/subcenters')
        .then((res: any) => {
          if (res?.data) {
            setSubcenters(res.data);
            if (res.data.length > 0) setSubcenterId(res.data[0].id);
          }
        })
        .catch(() => {});
    } else if (user?.subcenterId) {
      setSubcenterId(user.subcenterId);
    }
  };

  useEffect(() => { fetchDevices(); fetchSubcenters(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName || !subcenterId) return;
    setSaving(true);
    try {
      await api.post('/devices/register', { name: deviceName, subcenterId });
      setDeviceName('');
      setShowForm(false);
      fetchDevices();
    } catch {
      setError('Failed to create device');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCode = async (deviceId: string, subcenterId?: string) => {
    setRepairing(true);
    setRepairDeviceId(deviceId);
    setCodeType('pair');
    const device = devices.find(d => d.id === deviceId);
    setRepairDeviceName(device?.name || '');
    setRepairSubcenterId(subcenterId || device?.subcenterId || '');
    try {
      const body: any = {};
      if (subcenterId) body.subcenterId = subcenterId;
      const res = await api.post(`/devices/${deviceId}/pair-code`, body);
      setRepairCode(res.data.code);
      setShowRepairModal(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate pairing code');
    } finally {
      setRepairing(false);
    }
  };

  const handleRepairCode = async (deviceId: string, subcenterId?: string) => {
    setRepairing(true);
    setRepairDeviceId(deviceId);
    setCodeType('repair');
    const device = devices.find(d => d.id === deviceId);
    setRepairDeviceName(device?.name || '');
    setRepairSubcenterId(subcenterId || device?.subcenterId || '');
    try {
      const body: any = {};
      if (subcenterId) body.subcenterId = subcenterId;
      const res = await api.post(`/devices/${deviceId}/repair`, body);
      setRepairCode(res.data.code);
      setShowRepairModal(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate repair code');
    } finally {
      setRepairing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this device?')) return;
    try { await api.post('/devices/' + id + '/delete'); fetchDevices(); }
    catch { setError('Delete failed'); }
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
          <h2 className="aether-header-title">Devices</h2>
          <p className="aether-header-sub">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <a
            href="https://tv.sbmoffice.net/MPL-Dash-TV.apk"
            target="_blank"
            rel="noopener noreferrer"
            download="MPL-Dash-TV.apk"
            className="aether-btn-ghost !text-purple-400 !border-purple-500/30 hover:!bg-purple-500/10 flex items-center gap-2"
            title="Download Android TV App (MPL-Dash-TV.apk)"
          >
            <Icon name="android" className="text-sm text-purple-400" />
            Download TV App (MPL-Dash-TV)
          </a>
          <button onClick={() => setShowForm(!showForm)} className="aether-btn">
            <Icon name={showForm ? 'close' : 'add'} className="text-sm" />
            {showForm ? 'Cancel' : 'Add Device'}
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleCreate}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="aether-card"
          >
            <div className="aether-form-header">
              <div className="aether-form-header-icon"><Icon name="settings_input_component" className="text-lg" /></div>
              <span className="aether-label !mb-0">New Device</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Device Name</label>
                <input type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="aether-input" placeholder="e.g. Lobby TV 01" required />
              </div>
              <div>
                <label className="aether-label">Subcenter</label>
                {isCentralAdmin ? (
                  <Select
                    value={subcenterId}
                    onChange={setSubcenterId}
                    options={subcenters.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Select subcenter"
                  />
                ) : (
                  <input type="text" value={user?.subcenterId ? 'Assigned' : 'N/A'} disabled className="aether-input opacity-50 cursor-not-allowed" />
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="submit" disabled={saving} className="aether-btn px-8">
                {saving ? 'Saving...' : 'Add Device'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="aether-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="aether-table">
            <thead>
              <tr>
                <th>Device</th>
                {isCentralAdmin && <th>Subcenter</th>}
                <th>Status</th>
                <th>Last Seen</th>
                <th>Pairing</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`aether-status ${device.isOnline ? 'aether-status-online' : 'aether-status-offline'}`} />
                      <span className="font-medium text-text-prime text-sm">{device.name}</span>
                    </div>
                  </td>
                  {isCentralAdmin && <td className="text-text-dim text-xs">{device.subcenter?.name || '—'}</td>}
                  <td>
                    <span className={`aether-badge ${device.isOnline ? 'aether-badge-signal' : 'aether-badge-ghost'}`}>
                      {device.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="text-text-dim text-xs">
                    {timeAgo(device.lastHeartbeat)}
                  </td>
                  <td>
                    <span className={`aether-badge ${device.pairedAt ? 'aether-badge-signal' : 'aether-badge-ghost'}`}>
                      {device.pairedAt ? 'Paired' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => device.pairedAt ? handleRepairCode(device.id) : handleGenerateCode(device.id)}
                        disabled={repairing && repairDeviceId === device.id}
                        title={device.pairedAt ? 'Re-pair device' : 'Generate pairing code'}
                        className="p-1.5 rounded-md transition-all text-text-dim hover:text-cyan hover:bg-cyan/10"
                      >
                        <Icon name={device.pairedAt ? 'refresh' : 'vpn_key'} className="text-sm" />
                      </button>
                      <button
                        onClick={() => copyToClipboard(device.id)}
                        title="Copy device ID"
                        className={`p-1.5 rounded-md transition-all ${
                          copiedId === device.id ? 'bg-cyan/10 text-cyan' : 'text-text-dim hover:text-text-prime hover:bg-plate'
                        }`}
                      >
                        <Icon name={copiedId === device.id ? 'done' : 'content_copy'} className="text-sm" />
                      </button>
                      <button
                        onClick={() => handleDelete(device.id)}
                        title="Delete device"
                        className="aether-btn-icon alert !w-7 !h-7"
                      >
                        <Icon name="delete" className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={isCentralAdmin ? 5 : 4}>
                    <div className="aether-empty">
                      <Icon name="devices" className="text-3xl text-text-dim" />
                      <span className="aether-empty-text">No devices registered</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <AnimatePresence>
        {showRepairModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowRepairModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="aether-card max-w-sm w-full mx-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-cyan/10 flex items-center justify-center">
                  <Icon name="vpn_key" className="text-cyan" />
                </div>
                <div>
                  <h3 className="text-text-prime font-semibold text-sm">{codeType === 'repair' ? 'Repair Code' : 'Pairing Code'}</h3>
                  <p className="text-text-dim text-xs">{repairDeviceName || 'Give this code to the TV operator'}</p>
                </div>
              </div>

              {isCentralAdmin && (
                <div className="mb-4">
                  <label className="aether-label text-xs">Subcenter (optional — change if moving TV)</label>
                  <Select
                    value={repairSubcenterId}
                    onChange={(val) => {
                      setRepairSubcenterId(val);
                      if (repairDeviceId && val !== repairSubcenterId) {
                        const device = devices.find(d => d.id === repairDeviceId);
                        if (device?.pairedAt) {
                          handleRepairCode(repairDeviceId, val);
                        } else {
                          handleGenerateCode(repairDeviceId, val);
                        }
                      }
                    }}
                    options={subcenters.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Keep current subcenter"
                  />
                </div>
              )}

              <div className="bg-plate rounded-xl p-6 text-center mb-4">
                <div className="text-4xl font-bold text-cyan tracking-[0.5em] font-data">{repairCode}</div>
              </div>
              <p className="text-text-dim text-xs mb-4">
                The TV operator should select <span className="text-text-prime font-medium">{codeType === 'repair' ? '"Re-pair"' : '"Pair Device"'}</span> on the player screen and enter this code. Valid for 5 minutes.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(repairCode); }}
                  className="aether-btn flex-1 !bg-cyan/10 !text-cyan !border-cyan/20"
                >
                  <Icon name="content_copy" className="text-sm" />
                  Copy Code
                </button>
                <button onClick={() => setShowRepairModal(false)} className="aether-btn flex-1">
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="aether-card !bg-cyan/3 border-l-2 border-l-cyan/30">
        <h4 className="aether-label text-cyan mb-3">Getting Started</h4>
        <div className="grid md:grid-cols-2 gap-6 text-xs text-text-dim leading-relaxed">
          <div>
            <p className="mb-1"><span className="text-text-prime font-bold">Step 1:</span> Open the TV player on your display screen.</p>
            <p className="mb-1">
              <span className="text-text-prime font-bold">Player URL:</span>{' '}
              <a 
                href={window.location.hostname.includes('localhost') ? `http://${window.location.hostname}:3002` : `https://tv.${window.location.hostname.replace(/^dash\./, '')}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-cyan font-data underline hover:text-cyan/80"
              >
                {window.location.hostname.includes('localhost') ? `http://${window.location.hostname}:3002` : `https://tv.${window.location.hostname.replace(/^dash\./, '')}`}
              </a>
            </p>
          </div>
          <div>
            <p className="mb-1"><span className="text-text-prime font-bold">Step 2:</span> Click the <Icon name="vpn_key" className="text-xs inline align-text-bottom" /> icon next to a device above to generate a <span className="text-cyan">6-digit pairing code</span>.</p>
            <p><span className="text-text-prime font-bold">Step 3:</span> The TV operator enters this code on the player screen to pair the device.</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-cyan/10 text-xs text-text-dim">
          <span className="text-text-prime font-bold">Re-pairing:</span> If a device needs to be moved to a different location, click the <Icon name="refresh" className="text-xs inline align-text-bottom" /> icon to generate a repair code. The TV operator can use either the pairing or repair flow.
        </div>
      </motion.div>
    </motion.div>
  );
}
