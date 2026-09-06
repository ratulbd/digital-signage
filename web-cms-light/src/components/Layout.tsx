import { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';
import { ROLE_POWER, type UserRole } from '../types';

const navItems = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/devices', label: 'Network', icon: 'devices' },
  { to: '/media', label: 'Assets', icon: 'perm_media' },
  { to: '/schedules', label: 'Directives', icon: 'schedule' },
  { to: '/analytics', label: 'Forensics', icon: 'analytics' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const userPower = useMemo(() => {
    return user ? ROLE_POWER[user.role as UserRole] : 0;
  }, [user]);

  const commandItems = [
    { to: '/companies', label: 'Companies', icon: 'business', minPower: ROLE_POWER.CENTRAL_ADMIN },
    { to: '/circles', label: 'Circles', icon: 'hub', minPower: ROLE_POWER.COMPANY_ADMIN },
    { to: '/subcenters', label: 'Nodes', icon: 'location_on', minPower: ROLE_POWER.CIRCLE_ADMIN },
    { to: '/users', label: 'Identities', icon: 'admin_panel_settings', minPower: ROLE_POWER.SUBCENTER_ADMIN },
  ].filter(item => userPower >= item.minPower);

  return (
    <div className="relative min-h-screen font-ui text-text-prime bg-void overflow-hidden">
      <div className="aether-bg" />
      <div className="aether-scanlines" />

      <div className="relative z-10 flex min-h-screen">
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-[280px] transition-transform duration-300 ease-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            lg:sticky lg:top-0 lg:h-screen
          `}
        >
          <div className="m-4 flex h-[calc(100vh-2rem)] flex-col rounded-[28px] border border-white/70 bg-white/78 p-5 shadow-[0_28px_70px_rgba(33,56,91,0.14)] backdrop-blur-xl">
            <div className="mb-8 flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
                <img src="http://localhost:3001/uploads/logo.png" alt="Desh-IT" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-[16px] font-semibold tracking-tight text-text-prime leading-none">Desh-IT Dash</h1>
                <p className="mt-1 text-[11px] text-text-dim">Digital signage control center</p>
              </div>
            </div>

            <div className="mb-5 rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(15,159,143,0.08))] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Network health</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-2xl font-semibold text-text-prime">Stable</div>
                  <div className="mt-1 text-sm text-text-dim">CMS, API, and player connected</div>
                </div>
                <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-primary shadow-sm">Live</div>
              </div>
            </div>

            <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto pr-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `aether-nav ${isActive ? 'aether-nav-active' : ''}`}
                >
                  <Icon name={item.icon} className="text-[18px]" />
                  <span>{item.label}</span>
                </NavLink>
              ))}

              {commandItems.length > 0 && (
                <div className="mt-5 border-t border-edge pt-5">
                  <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-ghost">Administration</div>
                  {commandItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `aether-nav ${isActive ? 'aether-nav-active' : ''}`}
                    >
                      <Icon name={item.icon} className="text-[18px]" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </nav>

            <div className="mt-5 border-t border-edge pt-4">
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="aether-avatar shrink-0">
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold leading-tight text-text-prime">{user?.name || user?.email}</div>
                    <div className="mt-0.5 truncate text-[11px] text-text-dim">{user?.role.replaceAll('_', ' ')}</div>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="aether-btn-icon"
                  title="Sign out"
                >
                  <Icon name="logout" className="text-[16px]" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-40 bg-slate-900/20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 mx-4 mt-4 flex h-16 items-center justify-between rounded-[26px] border border-white/70 bg-white/72 px-5 shadow-[0_18px_50px_rgba(33,56,91,0.1)] backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="aether-btn-icon lg:hidden"
              >
                <Icon name={sidebarOpen ? 'close' : 'menu'} className="text-[20px]" />
              </button>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-ghost">Workspace</div>
                <div className="mt-0.5 text-lg font-semibold text-text-prime">
                  {location.pathname === '/' ? 'Overview' : location.pathname.slice(1).replace('/', ' / ')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 md:flex">
                <div className="aether-status aether-status-online" />
                <span className="text-[12px] font-medium text-emerald-700">All services healthy</span>
              </div>
              <button className="aether-btn-icon">
                <Icon name="search" className="text-[18px]" />
              </button>
              <button className="aether-btn-icon relative">
                <Icon name="notifications" className="text-[18px]" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
              </button>
            </div>
          </header>

          <main className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-5 lg:px-6 lg:pb-8">
            <div className="mx-auto max-w-7xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
