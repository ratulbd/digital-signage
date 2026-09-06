import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import api from '../services/api';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot / Reset State
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      setSuccess(res.data.message || 'Reset code sent to your email.');
      setMode('reset');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to request password reset');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePerformReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email: forgotEmail,
        code: resetCode,
        newPassword
      });
      setSuccess(res.data.message || 'Password reset successfully! Please sign in.');
      setPassword('');
      setEmail(forgotEmail);
      setMode('login');
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-void">
      {/* Left Showcase Brand Panel */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 relative z-10 border-r border-edge bg-gradient-to-b from-white/60 to-surface-secondary/40">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full"
        >
          <div className="flex items-center gap-4 mb-10 py-3 px-2">
            <img 
              src="/logo.png" 
              alt="Metal Innovation Logo" 
              className="h-14 w-auto object-contain shrink-0" 
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-prime leading-none">Metal Innovation</h1>
              <p className="text-xs font-data font-semibold text-text-dim tracking-widest uppercase mt-1">Digital Signage Platform</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-4xl font-bold text-text-prime tracking-tight leading-tight mb-4">
              Enterprise Display & <br /><span className="text-cyan">Signage Intelligence</span>
            </h2>
            <p className="text-sm text-text-dim font-medium leading-relaxed">
              Centrally broadcast corporate communications, real-time emergency overrides, and schedule high-definition media across all display centers.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="mt-12 flex items-center gap-6"
          >
            {[
              { icon: 'verified_user', label: 'Secure' },
              { icon: 'schedule', label: 'Real-time' },
              { icon: 'devices', label: 'Multi-display' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-text-dim font-data tracking-wider">
                <Icon name={item.icon} className="text-sm text-cyan" />
                {item.label}
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Right Auth Panel */}
      <div className="w-full lg:w-[500px] flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="aether-card">
            {/* Logo and Headings */}
            <div className="mb-6 text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                <img src="/logo.png" alt="Metal Innovation" className="h-10 w-auto object-contain" />
                <div className="text-left">
                  <h3 className="text-base font-bold text-text-prime leading-none">Metal Innovation</h3>
                  <p className="text-[10px] font-data text-text-dim font-semibold uppercase tracking-wider mt-0.5">Digital Signage</p>
                </div>
              </div>

              {mode === 'login' && (
                <div>
                  <span className="aether-label text-cyan">Welcome Back</span>
                  <h2 className="text-2xl font-semibold text-text-prime tracking-tight mt-1">Sign In</h2>
                </div>
              )}

              {mode === 'forgot' && (
                <div>
                  <span className="aether-label text-cyan">Password Recovery</span>
                  <h2 className="text-2xl font-semibold text-text-prime tracking-tight mt-1">Forgot Password</h2>
                  <p className="text-xs text-text-dim mt-1.5">Enter your registered email address to receive a 6-digit reset code.</p>
                </div>
              )}

              {mode === 'reset' && (
                <div>
                  <span className="aether-label text-cyan">Security Verification</span>
                  <h2 className="text-2xl font-semibold text-text-prime tracking-tight mt-1">Set New Password</h2>
                  <p className="text-xs text-text-dim mt-1.5">Enter the 6-digit code sent to <strong className="text-cyan">{forgotEmail}</strong></p>
                </div>
              )}
            </div>

            {/* Error Notification */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="aether-error mb-6"
              >
                <Icon name="error" className="text-base shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Success Notification */}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium flex items-center gap-2"
              >
                <Icon name="check_circle" className="text-base shrink-0 text-emerald-600" />
                <span>{success}</span>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {/* 1. SIGN IN FORM */}
              {mode === 'login' && (
                <motion.form
                  key="login-form"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="email" className="aether-label">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="aether-input"
                      placeholder="you@metalbd.biz"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="aether-label">Password</label>
                      <button
                        type="button"
                        onClick={() => { setError(''); setSuccess(''); setForgotEmail(email); setMode('forgot'); }}
                        className="text-xs text-cyan hover:underline font-medium cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="aether-input pr-11"
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-cyan transition-colors"
                      >
                        <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-lg" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="aether-btn w-full justify-center py-3.5 mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="aether-spinner !w-4 !h-4 !border-2" />
                        Signing in...
                      </span>
                    ) : (
                      <>
                        <Icon name="login" className="text-sm" />
                        Sign In
                      </>
                    )}
                  </button>
                </motion.form>
              )}

              {/* 2. FORGOT PASSWORD REQUEST FORM */}
              {mode === 'forgot' && (
                <motion.form
                  key="forgot-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handleRequestReset}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="forgotEmail" className="aether-label">Registered Email</label>
                    <input
                      id="forgotEmail"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="aether-input"
                      placeholder="you@metalbd.biz"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="aether-btn w-full justify-center py-3.5 mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="aether-spinner !w-4 !h-4 !border-2" />
                        Sending Code...
                      </span>
                    ) : (
                      <>
                        <Icon name="send" className="text-sm" />
                        Send Reset Code
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => { setError(''); setSuccess(''); setMode('login'); }}
                      className="text-xs text-text-dim hover:text-text-prime font-semibold cursor-pointer transition-colors"
                    >
                      &larr; Back to Sign In
                    </button>
                  </div>
                </motion.form>
              )}

              {/* 3. RESET PASSWORD CONFIRM FORM */}
              {mode === 'reset' && (
                <motion.form
                  key="reset-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handlePerformReset}
                  className="space-y-4"
                >
                  <div>
                    <label className="aether-label">6-Digit Verification Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="aether-input text-center text-xl tracking-[0.4em] font-black"
                      placeholder="000000"
                    />
                  </div>

                  <div>
                    <label className="aether-label">New Password (Min. 8 characters)</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="aether-input pr-11"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-cyan transition-colors"
                      >
                        <Icon name={showNewPassword ? 'visibility_off' : 'visibility'} className="text-lg" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="aether-label">Confirm New Password</label>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="aether-input"
                      placeholder="••••••••"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="aether-btn w-full justify-center py-3.5 mt-2"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="aether-spinner !w-4 !h-4 !border-2" />
                        Resetting Password...
                      </span>
                    ) : (
                      <>
                        <Icon name="lock_reset" className="text-sm" />
                        Reset Password & Continue
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-2">
                    <button
                      type="button"
                      onClick={handleRequestReset}
                      disabled={isLoading}
                      className="text-cyan hover:underline font-medium cursor-pointer"
                    >
                      Didn't get code? Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => { setError(''); setSuccess(''); setMode('login'); }}
                      className="text-text-dim hover:text-text-prime font-semibold cursor-pointer"
                    >
                      &larr; Sign In
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 text-center"
          >
            <p className="text-xs font-data text-text-ghost tracking-wider">
              Metal Innovation &bull; Digital Signage v3.2.0
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
