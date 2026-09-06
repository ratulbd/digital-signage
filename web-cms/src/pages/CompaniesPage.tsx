import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Company } from '../types';

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

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchCompanies = () => {
    api.get('/companies')
      .then((res) => setCompanies(res.data))
      .catch(() => setError('Failed to load companies'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchCompanies(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.post(`/companies/${editingId}/update`, { name });
      } else {
        await api.post('/companies', { name });
      }
      setName(''); setEditingId(null); setShowForm(false);
      fetchCompanies();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: Company) => {
    setEditingId(c.id);
    setName(c.name);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this company? All circles, subcenters, and users will be removed.')) return;
    try {
      await api.post(`/companies/${id}/delete`);
      fetchCompanies();
    } catch { setError('Delete failed'); }
  };

  const cancelForm = () => { setShowForm(false); setName(''); setEditingId(null); };

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
          <h2 className="aether-header-title">Companies</h2>
          <p className="aether-header-sub">{companies.length} Organization{companies.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { cancelForm(); setShowForm(true); }} className="aether-btn">
          <Icon name="add" className="text-sm" />
          Create Company
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
              <div className="aether-form-header-icon"><Icon name={editingId ? 'edit' : 'business'} className="text-lg" /></div>
              <span className="aether-label !mb-0">{editingId ? 'Edit Company' : 'New Company'}</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="aether-label">Company Name</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className="aether-input" placeholder="e.g. Metal Plus Limited" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={cancelForm} className="aether-btn-ghost px-4 py-2">Cancel</button>
              <button type="submit" disabled={saving} className="aether-btn px-8">
                {saving ? 'Saving...' : editingId ? 'Update Company' : 'Create Company'}
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
                <th>Company</th>
                <th>Circles</th>
                <th>Users</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="aether-avatar !w-9 !h-9 !text-sm">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-text-prime text-sm">{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-cyan">{c._count?.circles ?? 0}</span>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-amber">{c._count?.users ?? 0}</span>
                  </td>
                  <td className="text-xs font-data text-text-dim">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(c)} className="aether-btn-icon !w-7 !h-7" title="Edit">
                        <Icon name="edit" className="text-sm" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="aether-btn-icon alert !w-7 !h-7" title="Delete">
                        <Icon name="delete" className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="aether-empty">
                      <Icon name="business" className="text-3xl text-text-dim" />
                      <span className="aether-empty-text">No companies registered</span>
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
