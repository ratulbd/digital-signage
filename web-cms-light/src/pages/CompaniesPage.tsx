import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { Company } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 120 } },
};

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
        await api.put(`/companies/${editingId}`, { name });
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
      await api.delete(`/companies/${id}`);
      fetchCompanies();
    } catch { setError('Delete failed'); }
  };

  const cancelForm = () => { setShowForm(false); setName(''); setEditingId(null); };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full shadow-[0_0_20px_var(--color-primary-glow)]"
        />
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-10">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-1 w-8 bg-primary rounded-full" />
            <h2 className="text-3xl font-black tracking-tighter uppercase italic">
              Company <span className="text-cyan">Registry</span>
            </h2>
          </div>
          <p className="text-[13px] text-text-dim font-bold uppercase tracking-[.2em] opacity-60">
            Organization Hierarchy • {companies.length} Company{companies.length !== 1 ? 'ies' : ''}
          </p>
        </div>
        <button onClick={() => { cancelForm(); setShowForm(true); }} className="aether-btn tactical-corners group">
          <Icon name="add" className="group-hover:rotate-90 transition-transform" />
          Create Company
        </button>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="aether-card !bg-alert/5 border-alert/20 p-4 text-sm flex items-center gap-3">
            <Icon name="error" className="text-alert" />
            <span className="text-alert font-medium">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }} className="aether-card tactical-corners">
            <div className="flex items-center gap-3 mb-8 pb-5 border-b border-edge">
              <div className="p-2 rounded-lg bg-cyan/20">
                <Icon name={editingId ? 'edit' : 'business'} className="text-cyan text-xl" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-text-dim">
                {editingId ? 'Edit Company' : 'Create New Company'}
              </h3>
            </div>
            <div>
              <label className="aether-label">Company Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className="aether-input w-full" placeholder="e.g. Metal Plus Limited" />
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={cancelForm} className="aether-btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="aether-btn group">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Icon name="check" />
                    {editingId ? 'Update Company' : 'Create Company'}
                  </span>
                )}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Table */}
      <motion.div variants={itemVariants} className="aether-card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="aether-table w-full">
            <thead>
              <tr>
                <th className="min-w-[220px]">Company</th>
                <th className="min-w-[100px]">Circles</th>
                <th className="min-w-[100px]">Users</th>
                <th className="min-w-[140px]">Created</th>
                <th className="text-right min-w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <motion.tr key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--color-primary), #4338ca)' }}>
                        {c.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-text-prime">{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-cyan">{c._count?.circles ?? 0}</span>
                  </td>
                  <td>
                    <span className="aether-badge aether-badge-amber">{c._count?.users ?? 0}</span>
                  </td>
                  <td className="text-sm text-text-dim">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => handleEdit(c)} className="aether-btn-icon" title="Edit">
                        <Icon name="edit" className="text-[16px]" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="aether-btn-icon alert" title="Delete">
                        <Icon name="delete" className="text-[16px]" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-40">
                      <Icon name="business" className="text-4xl" />
                      <p className="text-sm font-bold uppercase tracking-widest">No companies registered</p>
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
