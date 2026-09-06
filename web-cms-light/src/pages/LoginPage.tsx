import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-void">
      <div className="aether-bg" />
      <div className="aether-scanlines" />

      <div className="relative z-10 hidden flex-1 items-center justify-center p-12 lg:flex">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-xl"
        >
          <div className="mb-10 flex items-center gap-3 rounded-3xl border border-white/70 bg-white/72 px-5 py-4 shadow-[0_20px_50px_rgba(31,57,91,0.12)] backdrop-blur-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2.5 shadow-sm">
              <img src="http://localhost:3001/uploads/logo.png" alt="Desh-IT" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-text-prime">Desh-IT Dash</h1>
              <p className="mt-1 text-sm text-text-dim">Modern digital signage administration</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="mb-4 text-5xl font-semibold tracking-tight text-text-prime leading-[1.02]">
              Calm control for
              <br />
              <span className="bg-[linear-gradient(135deg,#2563eb,#0f9f8f)] bg-clip-text text-transparent">
                every screen.
              </span>
            </h2>
            <p className="max-w-lg text-base leading-7 text-text-dim">
              Track devices, publish content, and coordinate updates from one clean workspace designed for daily operations.
            </p>
          </motion.div>

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: 'Live player sync', value: '< 1 sec', icon: 'bolt' },
              { label: 'Content levels', value: '3 tiers', icon: 'layers' },
              { label: 'Admin coverage', value: 'Role-based', icon: 'shield' },
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + index * 0.12, duration: 0.45 }}
                className="aether-card-compact"
              >
                <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name={item.icon} className="text-[18px]" />
                </div>
                <div className="text-2xl font-semibold text-text-prime">{item.value}</div>
                <div className="mt-2 text-sm leading-6 text-text-dim">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="relative z-10 flex w-full flex-col items-center justify-center p-6 lg:w-[520px]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="aether-card">
            <div className="mb-8">
              <span className="aether-label text-primary">Welcome back</span>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text-prime">Sign in to your workspace</h2>
              <p className="mt-3 text-sm leading-6 text-text-dim">
                Use your admin credentials to manage devices, content, schedules, and analytics.
              </p>
            </div>

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

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="aether-label">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="aether-input"
                  placeholder="email@domain.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="aether-label">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="aether-input pr-11"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim transition-colors hover:text-primary"
                  >
                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-lg" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input type="checkbox" id="remember" className="aether-checkbox" />
                <label htmlFor="remember" className="cursor-pointer text-[12px] font-medium text-text-dim">
                  Keep me signed in on this device
                </label>
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
                    Enter dashboard
                  </>
                )}
              </button>
            </form>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-6 text-center"
          >
            <p className="text-[11px] text-text-ghost">
              Light redesign preview for Desh-IT Dash
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
