import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../components/Select';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Subcenter, Circle, Company } from '../types';

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

export default function SubcentersPage() {
  const { user } = useAuth();
  const isCentral = user?.role === 'CENTRAL_ADMIN';
  const isCompany = user?.role === 'COMPANY_ADMIN';
  const [subcenters, setSubcenters] = useState<Subcenter[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [circleId, setCircleId] = useState('');
  const [selCompanyId, setSelCompanyId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get('/subcenters').then(r => setSubcenters(r.data)),
      api.get('/circles').then(r => setCircles(r.data)),
      api.get('/companies').then(r => setCompanies(r.data)),
    ]).catch(() => setError('Failed to load data')).finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const filteredCircles = selCompanyId ? circles.filter(c => c.companyId === selCompanyId) : circles;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const targetCircleId = user?.role === 'CIRCLE_ADMIN' ? (user.circleId || circleId) : circleId;
      if (editingId) await api.post(`/subcenters/${editingId}/update`, { name });
      else await api.post('/subcenters', { name, circleId: targetCircleId });
      setName(''); setCircleId(''); setSelCompanyId(''); setEditingId(null); setShowForm(false); fetchData();
    } catch (err: any) { setError(err.response?.data?.error || 'Operation failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = (s: Subcenter) => { setEditingId(s.id); setName(s.name); setShowForm(true); };
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this subcenter?')) return;
    try { await api.post(`/subcenters/${id}/delete`); fetchData(); } catch { setError('Delete failed'); }
  };
  const cancelForm = () => { setShowForm(false); setName(''); setCircleId(''); setSelCompanyId(''); setEditingId(null); };

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
          <h2 className="aether-header-title">Subcenters</h2>
          <p className="aether-header-sub">{subcenters.length} subcenter{subcenters.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { cancelForm(); setShowForm(true); }} className="aether-btn">
          <Icon name="add" className="text-sm" />
          Create Subcenter
        </button>
      </motion.div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="aether-card"
          >
            <div className="aether-form-header">
              <div className="aether-form-header-icon"><Icon name={editingId ? 'edit' : 'location_on'} className="text-lg" /></div>
              <span className="aether-label !mb-0">{editingId ? 'Edit Subcenter' : 'New Subcenter'}</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Subcenter Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="aether-input" placeholder="e.g. DH_North" />
              </div>
              {!editingId && user?.role !== 'CIRCLE_ADMIN' && (
                <>
                  {(isCentral || isCompany) && (
                    <div>
                      <label className="aether-label">Company</label>
                      {isCentral ? (
                        <Select
                          value={selCompanyId}
                          onChange={(v) => { setSelCompanyId(v); setCircleId(''); }}
                          options={[{ value: '', label: 'All Companies' }, ...companies.map(c => ({ value: c.id, label: c.name }))]}
                        />
                      ) : (
                        <input type="text" readOnly value={companies[0]?.name || ''} className="aether-input opacity-50 cursor-not-allowed" />
                      )}
                    </div>
                  )}
                  <div>
                    <label className="aether-label">Circle</label>
                    <Select
                      value={circleId}
                      onChange={setCircleId}
                      options={filteredCircles.map(c => ({ value: c.id, label: c.name + (c.company ? ` (${c.company.name})` : '') }))}
                      placeholder="Select circle"
                    />
                  </div>
                </>
              )}
              {!editingId && user?.role === 'CIRCLE_ADMIN' && (
                <div>
                  <label className="aether-label">Circle</label>
                  <input type="text" readOnly value={circles.find(c => c.id === user.circleId)?.name || 'Your Circle'} className="aether-input opacity-50 cursor-not-allowed" />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={cancelForm} className="aether-btn-ghost px-4 py-2">Cancel</button>
              <button type="submit" disabled={saving} className="aether-btn px-8">
                {saving ? 'Saving...' : editingId ? 'Update Subcenter' : 'Create Subcenter'}
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
                <th>Subcenter</th>
                <th>Circle</th>
                <th>Company</th>
                <th>Users</th>
                <th>Devices</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subcenters.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="aether-avatar !w-9 !h-9 !text-sm">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-text-prime text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-amber">{s.circle?.name || '—'}</span>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-ghost">{s.circle?.company?.name || '—'}</span>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-cyan">{s._count?.users ?? 0}</span>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-signal">{s._count?.devices ?? 0}</span>
                  </td>
                  <td className="text-xs font-data text-text-dim">{new Date(s.createdAt || '').toLocaleDateString()}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(s)} className="aether-btn-icon !w-7 !h-7" title="Edit">
                        <Icon name="edit" className="text-sm" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="aether-btn-icon alert !w-7 !h-7" title="Delete">
                        <Icon name="delete" className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {subcenters.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="aether-empty">
                      <Icon name="location_on" className="text-3xl text-text-dim" />
                      <span className="aether-empty-text">No subcenters registered</span>
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
