import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../components/Select';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { User, UserRole, Company, Circle, Subcenter } from '../types';
import { ROLE_LABELS, ROLE_POWER } from '../types';

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

const ROLE_BADGES = {
  CENTRAL_ADMIN: 'aether-badge-red',
  COMPANY_ADMIN: 'aether-badge-cyan',
  CIRCLE_ADMIN: 'aether-badge-amber',
  SUBCENTER_ADMIN: 'aether-badge-ghost',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const myPower = ROLE_POWER[me?.role as UserRole] ?? 0;

  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [subcenters, setSubcenters] = useState<Subcenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SUBCENTER_ADMIN');
  const [selCompanyId, setSelCompanyId] = useState('');
  const [selCircleId, setSelCircleId] = useState('');
  const [selSubcenterId, setSelSubcenterId] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const filteredCircles = selCompanyId ? circles.filter(c => c.companyId === selCompanyId) : [];
  const filteredSubcenters = selCircleId ? subcenters.filter(s => s.circleId === selCircleId) : [];

  const creatableRoles: UserRole[] = (
    ['CENTRAL_ADMIN', 'COMPANY_ADMIN', 'CIRCLE_ADMIN', 'SUBCENTER_ADMIN'] as UserRole[]
  ).filter(r => me?.role === 'CENTRAL_ADMIN' || ROLE_POWER[r] < myPower);

  const canAddUser = myPower >= ROLE_POWER['COMPANY_ADMIN'];

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get('/users').then(r => setUsers(r.data)),
      api.get('/companies').then(r => setCompanies(r.data)),
      api.get('/circles').then(r => setCircles(r.data)),
      api.get('/subcenters').then(r => setSubcenters(r.data)),
    ]).catch(() => setError('User registry link failure')).finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (editingId) {
        await api.post('/users/' + editingId + '/update', { name, email, password: password || undefined });
      } else {
        await api.post('/users', {
          name, email, password, role,
          companyId: selCompanyId || me?.companyId || null,
          circleId: selCircleId || me?.circleId || null,
          subcenterId: selSubcenterId || null,
        });
      }
      resetForm();
      setShowForm(false); fetchData();
    } catch (err: any) { setError(err.response?.data?.error || 'Operation failed'); }
    finally { setSaving(false); }
  };

  const resetForm = () => {
    setName(''); setEmail(''); setPassword('');
    setRole('SUBCENTER_ADMIN');
    setSelCompanyId(''); setSelCircleId(''); setSelSubcenterId('');
    setEditingId(null);
    setShowPassword(false);
  };

  const handleEdit = (u: User) => {
    setEditingId(u.id);
    setName(u.name || '');
    setEmail(u.email);
    setPassword('');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently purge user identity?')) return;
    try { await api.post('/users/' + id + '/delete'); fetchData(); }
    catch { setError('Delete failed'); }
  };

  if (isLoading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="aether-spinner !w-8 !h-8 !border-[3px]" />
    </div>
  );

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
          <h2 className="aether-header-title">Users</h2>
          <p className="aether-header-sub">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        {canAddUser && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="aether-btn">
            <Icon name="person_add" className="text-sm" />
            Add User
          </button>
        )}
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
              <div className="aether-form-header-icon"><Icon name="manage_accounts" className="text-lg" /></div>
              <span className="aether-label !mb-0">{editingId ? 'Edit User' : 'New User'}</span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="aether-label">Full Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="aether-input" required />
                </div>
                <div>
                  <label className="aether-label">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="aether-input" required disabled={!canAddUser && editingId === me?.id} />
                </div>
                <div>
                  <label className="aether-label">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="aether-input pr-10" placeholder={editingId ? 'Leave blank to keep current' : ''} required={!editingId} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-prime">
                      <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-base" />
                    </button>
                  </div>
                </div>
              </div>

              {!editingId && (
                <div className="space-y-4">
                  <div>
                    <label className="aether-label">Role</label>
                    <Select
                      value={role}
                      onChange={(v) => setRole(v as UserRole)}
                      options={creatableRoles.map(r => ({ value: r, label: ROLE_LABELS[r] }))}
                    />
                  </div>
                  {role !== 'CENTRAL_ADMIN' && me?.role === 'CENTRAL_ADMIN' && (
                    <div>
                      <label className="aether-label">Company</label>
                      <Select
                        value={selCompanyId}
                        onChange={setSelCompanyId}
                        options={companies.map(c => ({ value: c.id, label: c.name }))}
                        placeholder="Select company"
                      />
                    </div>
                  )}
                  {(role === 'CIRCLE_ADMIN' || role === 'SUBCENTER_ADMIN') && (
                    <div>
                      <label className="aether-label">Circle</label>
                      <Select
                        value={selCircleId}
                        onChange={setSelCircleId}
                        options={(me?.role === 'CENTRAL_ADMIN' ? filteredCircles : circles).map(c => ({ value: c.id, label: c.name }))}
                        placeholder="Select circle"
                      />
                    </div>
                  )}
                  {role === 'SUBCENTER_ADMIN' && (
                    <div>
                      <label className="aether-label">Subcenter</label>
                      <Select
                        value={selSubcenterId}
                        onChange={setSelSubcenterId}
                        options={(me?.role === 'CENTRAL_ADMIN' || me?.role === 'COMPANY_ADMIN' ? filteredSubcenters : subcenters).map(s => ({ value: s.id, label: s.name }))}
                        placeholder="Select subcenter"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="aether-btn-ghost px-4 py-2">Cancel</button>
              <button type="submit" disabled={saving} className="aether-btn px-10">
                {saving ? 'Saving...' : editingId ? 'Update User' : 'Create User'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} className="aether-card !p-0 overflow-hidden">
        <table className="aether-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Location</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="aether-avatar">{(u.name || u.email)[0].toUpperCase()}</div>
                    <div>
                      <div className="text-sm font-medium text-text-prime leading-tight">{u.name}</div>
                      <div className="text-xs font-data text-text-dim truncate max-w-[150px]">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={'aether-badge ' + ROLE_BADGES[u.role]}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="text-text-dim text-xs font-data">
                  {u.subcenter?.name || u.circle?.name || u.company?.name || 'Global'}
                </td>
                <td>
                  <div className="flex items-center gap-2 text-xs font-data font-medium text-signal">
                    <div className="aether-status aether-status-online" />
                    ACTIVE
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {(canAddUser ? (me?.role === 'CENTRAL_ADMIN' || ROLE_POWER[u.role] < myPower || u.id === me?.id) : u.id === me?.id) && (
                      <>
                        <button onClick={() => handleEdit(u)} className="aether-btn-icon !w-7 !h-7"><Icon name="edit" className="text-sm" /></button>
                        {u.id !== me?.id && canAddUser && (
                          <button onClick={() => handleDelete(u.id)} className="aether-btn-icon alert !w-7 !h-7"><Icon name="delete" className="text-sm" /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="aether-empty">
                    <Icon name="admin_panel_settings" className="text-3xl text-text-dim" />
                    <span className="aether-empty-text">No users registered</span>
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
