import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';
import { ROLE_POWER, ROLE_LABELS, type UserRole } from '../types';
import api from '../services/api';

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/devices', label: 'Devices', icon: 'devices' },
  { to: '/media', label: 'Media', icon: 'perm_media' },
  { to: '/schedules', label: 'Schedules', icon: 'schedule' },
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
];

function getRelativeTime(timestamp: string) {
  const ms = Date.now() - new Date(timestamp).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

interface DBNotification {
  id: string;
  text: string;
  type: string;
  timestamp: string;
}

interface UINotification extends DBNotification {
  time: string;
  read: boolean;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('read_notification_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [notifications, setNotifications] = useState<UINotification[]>([]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await api.get('/analytics/notifications');
      const data: DBNotification[] = res.data;
      const uiNotifications: UINotification[] = data.map(n => ({
        ...n,
        time: getRelativeTime(n.timestamp),
        read: readIds.includes(n.id)
      }));
      setNotifications(uiNotifications);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [readIds, user]);

  const markAllRead = () => {
    const allIds = notifications.map(n => n.id);
    localStorage.setItem('read_notification_ids', JSON.stringify(allIds));
    setReadIds(allIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markSingleRead = (id: string) => {
    if (readIds.includes(id)) return;
    const updated = [...readIds, id];
    localStorage.setItem('read_notification_ids', JSON.stringify(updated));
    setReadIds(updated);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const location = useLocation();

  const userPower = useMemo(() => {
    return user ? ROLE_POWER[user.role as UserRole] : 0;
  }, [user]);

  const commandItems = [
    { to: '/companies', label: 'Companies', icon: 'business', minPower: ROLE_POWER.CENTRAL_ADMIN },
    { to: '/circles', label: 'Circles', icon: 'hub', minPower: ROLE_POWER.COMPANY_ADMIN },
    { to: '/subcenters', label: 'Subcenters', icon: 'location_on', minPower: ROLE_POWER.CIRCLE_ADMIN },
    { to: '/users', label: 'Users', icon: 'admin_panel_settings', minPower: ROLE_POWER.SUBCENTER_ADMIN },
  ].filter(item => userPower >= item.minPower);

  return (
    <div className="relative min-h-screen font-ui text-text-prime bg-void overflow-hidden">
      <div className="flex h-screen relative z-10">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:relative z-50 h-full transition-all duration-500 ease-expo
            ${sidebarOpen ? 'w-full translate-x-0' : '-translate-x-full lg:translate-x-0'}
            lg:w-64 lg:block bg-white border-r border-edge shadow-[4px_0_24px_rgba(0,0,0,0.03)]
          `}
        >
          <div className="h-full flex flex-col p-5">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-8 px-2 py-2">
              <img 
                src="/logo.png" 
                alt="Metal Innovation" 
                className="h-10 w-auto max-w-[42px] object-contain shrink-0" 
              />
              <div className="min-w-0">
                <h1 className="text-[14px] font-bold tracking-tight text-text-prime leading-tight truncate">Metal Innovation</h1>
                <p className="text-[11px] font-data font-semibold text-text-dim tracking-wider uppercase opacity-75">Digital Signage</p>
              </div>
            </div>

            {/* Main Nav */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
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
                <div className="pt-6 mt-4 border-t border-edge">
                  <div className="px-3 mb-2 text-xs font-data font-medium text-text-ghost uppercase tracking-wider">Management</div>
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

            {/* Profile */}
            <div className="mt-auto pt-4 border-t border-edge shrink-0">
              <div className="p-3.5 rounded-xl bg-plate/40 hover:bg-plate/70 transition-all duration-300 border border-edge/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Premium Avatar */}
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan to-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm shrink-0 select-none">
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                  {/* User Details */}
                  <div className="min-w-0">
                    <div 
                      className="text-[13px] font-semibold text-text-prime truncate leading-tight font-ui"
                      title={user?.name || user?.email}
                    >
                      {user?.name || user?.email?.split('@')[0]}
                    </div>
                    <div className="text-[11px] text-text-dim font-medium mt-0.5 font-ui">
                      {user ? (ROLE_LABELS[user.role as UserRole] || user.role) : ''}
                    </div>
                  </div>
                </div>
                {/* Logout Button */}
                <button
                  onClick={logout}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-ghost hover:text-alert hover:bg-alert-dim/10 transition-colors border border-edge/10 hover:border-alert/20 shrink-0 cursor-pointer"
                  title="Sign Out"
                >
                  <Icon name="logout" className="text-[16px]" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 h-full">
          {/* Header */}
          <header className="relative z-30 h-14 flex items-center justify-between px-6 border-b border-edge bg-white/80 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden w-8 h-8 flex items-center justify-center text-text-dim hover:text-text-prime transition-colors rounded-lg hover:bg-plate"
              >
                <Icon name={sidebarOpen ? 'close' : 'menu'} className="text-[20px]" />
              </button>
              <div className="flex items-center gap-2">
                <div className="aether-status aether-status-online" />
                <span className="text-xs font-data font-medium text-text-dim uppercase tracking-wider">System Online</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Search Button */}
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowSearch(!showSearch);
                    setShowNotifications(false);
                  }}
                  className={`aether-btn-icon !w-8 !h-8 ${showSearch ? '!bg-plate !text-cyan' : ''} cursor-pointer`}
                  title="Global Search"
                >
                  <Icon name="search" className="text-[18px]" />
                </button>

                {/* Search Dropdown / Command Palette */}
                <AnimatePresence>
                  {showSearch && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40"
                        onClick={() => setShowSearch(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                        className="absolute right-0 mt-2 w-80 bg-white border border-edge rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 p-4"
                      >
                        <div className="relative">
                          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ghost text-sm" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search actions, pages, devices..."
                            className="aether-input !py-2 !pl-9 !pr-4 text-xs font-ui"
                            autoFocus
                          />
                        </div>
                        <div className="mt-3 pt-2 border-t border-edge space-y-1">
                          <div className="px-2 pb-1 text-[10px] font-data font-semibold text-text-ghost uppercase tracking-wider">Quick Navigation</div>
                          {navItems
                            .concat(commandItems)
                            .filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((item) => (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setShowSearch(false)}
                                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-plate/80 text-xs text-text-dim hover:text-text-prime transition-colors cursor-pointer"
                              >
                                <Icon name={item.icon} className="text-sm text-text-ghost" />
                                <span className="font-ui">{item.label}</span>
                              </NavLink>
                            ))}
                          {navItems.concat(commandItems).filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                            <div className="text-center py-4 text-xs text-text-ghost font-ui">No pages found</div>
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Notifications Button */}
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setShowSearch(false);
                  }}
                  className={`aether-btn-icon !w-8 !h-8 relative ${showNotifications ? '!bg-plate !text-cyan' : ''} cursor-pointer`}
                  title="Notifications"
                >
                  <Icon name="notifications" className="text-[18px]" />
                  {notifications.some(n => !n.read) && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                  )}
                </button>

                {/* Notifications Dropdown */}
                <AnimatePresence>
                  {showNotifications && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40"
                        onClick={() => setShowNotifications(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                        className="absolute right-0 mt-2 w-80 bg-white border border-edge rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 p-4"
                      >
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-edge">
                          <span className="text-xs font-semibold text-text-prime font-ui">Notifications</span>
                          {notifications.length > 0 && (
                            <button 
                              onClick={markAllRead}
                              className="text-[10px] text-cyan hover:underline font-ui cursor-pointer"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
                          {notifications.length === 0 ? (
                            <div className="text-center py-6 text-xs text-text-ghost font-ui">No recent activity</div>
                          ) : (
                            notifications.map(n => (
                              <div 
                                key={n.id} 
                                onClick={() => markSingleRead(n.id)}
                                className={`p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 cursor-pointer ${n.read ? 'bg-white border-edge/20 hover:bg-plate/40' : 'bg-cyan-glow/30 border-cyan/10 hover:bg-cyan-glow/40'}`}
                              >
                                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.type === 'success' ? 'bg-signal' : n.type === 'warning' ? 'bg-amber' : 'bg-cyan'}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-text-prime font-ui leading-normal">{n.text}</p>
                                  <span className="text-[10px] text-text-ghost font-data block mt-0.5">{n.time}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 scroll-smooth">
            <div className="max-w-6xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
