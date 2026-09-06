import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from './Icon';

export function UserProtocols() {
  const { user, logout } = useAuth();
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user) return null;

  const showVerify = !user.emailVerified;
  const showPassChange = user.mustChangePassword;

  if (!showVerify && !showPassChange) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/verify', { code });
      setSuccess('Email verified! Please reload or wait...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally { setLoading(false); }
  };

  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) { setError('Passwords do not match'); return; }
    if (newPass.length < 8) { setError('Password too short'); return; }
    
    setLoading(true); setError('');
    try {
      await api.post('/auth/change-password', { newPassword: newPass });
      setSuccess('Password updated!');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-void/80 backdrop-blur-xl p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md aether-card tactical-corners !bg-abyss shadow-2xl"
      >
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-edge">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan/20">
              <Icon name="security" className="text-cyan text-xl" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-text-prime">Security Protocol</h3>
              <p className="text-[10px] text-text-dim font-bold opacity-60">ACTION REQUIRED</p>
            </div>
          </div>
          <button onClick={logout} className="aether-btn-icon alert" title="Logout">
            <Icon name="logout" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-alert/5 border border-alert/20 rounded-xl text-alert text-xs font-medium flex items-center gap-2">
            <Icon name="error" /> {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-primary/10 border border-cyan/20 rounded-xl text-cyan text-xs font-medium flex items-center gap-2">
            <Icon name="check_circle" /> {success}
          </div>
        )}

        <AnimatePresence mode="wait">
          {showVerify ? (
            <motion.div key="verify" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}>
              <div className="space-y-4">
                <div className="p-4 bg-cyan/5 rounded-2xl border border-cyan/10">
                  <p className="text-xs text-text-dim leading-relaxed">
                    A 6-digit verification code has been sent to <span className="text-cyan font-bold">{user.email}</span>. 
                    Please enter it below to activate your account.
                  </p>
                </div>
                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label className="aether-label">Verification Code</label>
                    <input 
                      type="text" 
                      maxLength={6}
                      required 
                      value={code} 
                      onChange={e => setCode(e.target.value)}
                      className="aether-input w-full text-center text-2xl tracking-[0.5em] font-black" 
                      placeholder="000000"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="aether-btn w-full">
                    {loading ? 'Verifying...' : 'Verify Email'}
                  </button>
                </form>
              </div>
            </motion.div>
          ) : showPassChange ? (
            <motion.div key="pass" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}>
              <div className="space-y-4">
                <div className="p-4 bg-cyan/5 rounded-2xl border border-cyan/10">
                  <p className="text-xs text-text-dim leading-relaxed">
                    This is your first login. For security, you must <span className="text-cyan font-bold">change your password</span> before proceeding to the dashboard.
                  </p>
                </div>
                <form onSubmit={handleChangePass} className="space-y-4">
                  <div>
                    <label className="aether-label">New Password</label>
                    <input 
                      type="password" 
                      required 
                      value={newPass} 
                      onChange={e => setNewPass(e.target.value)}
                      className="aether-input w-full" 
                      placeholder="••••••••"
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="aether-label">Confirm Password</label>
                    <input 
                      type="password" 
                      required 
                      value={confirmPass} 
                      onChange={e => setConfirmPass(e.target.value)}
                      className="aether-input w-full" 
                      placeholder="••••••••"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="aether-btn w-full">
                    {loading ? 'Updating...' : 'Update & Continue'}
                  </button>
                </form>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
