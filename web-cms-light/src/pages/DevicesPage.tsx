import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Device, Subcenter } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { y: 10, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export default function DevicesPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [subcenters, setSubcenters] = useState<Subcenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [deviceName, setDeviceName] = useState('');
  const [subcenterId, setSubcenterId] = useState('');
  const [networkInfo, setNetworkInfo] = useState<{ apiUrl: string; addresses: any[] } | null>(null);

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

  useEffect(() => {
    fetch('/health/network')
      .then((res) => res.json())
      .then((data) => setNetworkInfo(data))
      .catch(() => {});
  }, []);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    });
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
          <h2 className="aether-header-title">Network Nodes</h2>
          <p className="aether-header-sub">{devices.length} Active Endpoints</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="aether-btn">
          <Icon name={showForm ? 'close' : 'add'} className="text-sm" />
          {showForm ? 'Cancel' : 'Register Node'}
        </button>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleCreate}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="aether-card tactical-corners"
          >
            <div className="aether-form-header">
              <div className="aether-form-header-icon"><Icon name="settings_input_component" className="text-lg" /></div>
              <span className="aether-label !mb-0">Configure Hardware Endpoint</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Identification String</label>
                <input type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="aether-input" placeholder="e.g. Terminal-ALPHA-01" required />
              </div>
              <div>
                <label className="aether-label">Operational Zone</label>
                {isCentralAdmin ? (
                  <select value={subcenterId} onChange={(e) => setSubcenterId(e.target.value)} className="aether-select" required>
                    <option value="">Select Subcenter</option>
                    {subcenters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input type="text" value={user?.subcenterId ? 'Assigned Subcenter' : 'N/A'} disabled className="aether-input opacity-40 cursor-not-allowed" />
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="submit" disabled={saving} className="aether-btn px-8">
                {saving ? 'Processing...' : 'Deploy Node'}
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
                <th>Hardware Node</th>
                {isCentralAdmin && <th>Zone</th>}
                <th>Status</th>
                <th>Heartbeat</th>
                <th>Protocol ID</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`aether-status ${device.isOnline ? 'aether-status-online' : 'aether-status-offline'}`} />
                      <span className="font-medium text-text-prime">{device.name}</span>
                    </div>
                  </td>
                  {isCentralAdmin && <td className="text-text-dim text-xs">{device.subcenter?.name || '—'}</td>}
                  <td>
                    <span className={`aether-badge ${device.isOnline ? 'aether-badge-signal' : 'aether-badge-ghost'}`}>
                      {device.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="text-text-dim text-xs font-data">
                    {device.lastHeartbeat ? new Date(device.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                  </td>
                  <td>
                    <button
                      onClick={() => copyToClipboard(device.id)}
                      className={`flex items-center gap-2 font-data text-[10px] transition-all px-2.5 py-1 rounded-md border ${
                        copiedId === device.id ? 'bg-cyan/10 border-cyan/30 text-cyan' : 'border-edge hover:bg-plate text-text-dim'
                      }`}
                    >
                      <span className="max-w-[100px] truncate">{device.id.slice(0, 8)}...</span>
                      <Icon name={copiedId === device.id ? 'done' : 'content_copy'} className="text-[11px]" />
                    </button>
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={isCentralAdmin ? 5 : 4}>
                    <div className="aether-empty">
                      <Icon name="devices" className="text-3xl text-text-dim" />
                      <span className="aether-empty-text">No active hardware detected</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="aether-card !bg-cyan/3 border-l-2 border-l-cyan/30">
        <h4 className="aether-label text-cyan mb-3">Endpoint Integration Protocol</h4>
        <div className="grid md:grid-cols-2 gap-6 text-[11px] text-text-dim leading-relaxed">
          <div>
            <p className="mb-1"><span className="text-text-prime font-bold">Step 01:</span> Deploy the hardware player on the target screen.</p>
            <p><span className="text-text-prime font-bold">Step 02:</span> Authenticate using the <span className="text-cyan">Protocol ID</span> generated above.</p>
          </div>
          <div>
            <p className="mb-1"><span className="text-text-prime font-bold">Step 03:</span> Verify bidirectional heartbeat in the Node Registry.</p>
            <p className="mb-1"><span className="text-text-prime font-bold">Target URL (this PC):</span> <code className="text-cyan font-data">http://{window.location.hostname}:3002</code></p>
            {networkInfo?.apiUrl && !networkInfo.apiUrl.includes('localhost') && (
              <p><span className="text-text-prime font-bold">Target URL (external/TV):</span> <code className="text-cyan font-data">{networkInfo.apiUrl.replace(':3001', ':3002')}</code></p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
