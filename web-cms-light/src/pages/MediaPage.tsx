import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import type { MediaItem } from '../types';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { y: 10, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

type Tab = 'own' | 'public';

export default function MediaPage() {
  const { user } = useAuth();
  const canPublish = user?.role === 'CENTRAL_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'CIRCLE_ADMIN';

  const [ownMedia, setOwnMedia] = useState<MediaItem[]>([]);
  const [publicMedia, setPublicMedia] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('own');
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayedMedia = activeTab === 'own' ? ownMedia : publicMedia;

  const fetchMedia = () => {
    api.get('/media')
      .then((res) => {
        const data = res.data;
        if (data.own !== undefined) {
          setOwnMedia(data.own);
          setPublicMedia(data.public || []);
        } else {
          setOwnMedia(Array.isArray(data) ? data : []);
          setPublicMedia([]);
        }
      })
      .catch(() => setError('Asset synchronization failure'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchMedia(); }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      fetchMedia();
    } catch { setError('Upload protocol interrupted'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Confirm asset deletion?')) return;
    try { await api.delete(`/media/${id}`); fetchMedia(); }
    catch { setError('Defragmentation failure'); }
  };

  const handlePublish = async (item: MediaItem, publish: boolean) => {
    try {
      await api.patch(`/media/${item.id}/publish`, { isPublic: publish });
      fetchMedia();
    } catch (err: any) { setError(err.response?.data?.error || 'Broadcast authorization failed'); }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
          <h2 className="aether-header-title">Asset Library</h2>
          <p className="aether-header-sub">{ownMedia.length + publicMedia.length} Resources</p>
        </div>
        <label className={`aether-btn cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Icon name={uploading ? 'sync' : 'upload_file'} className={`text-sm ${uploading ? 'animate-spin' : ''}`} />
          <span>{uploading ? 'Processing...' : 'Upload Asset'}</span>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,video/*" />
        </label>
      </motion.div>

      <motion.div variants={itemVariants} className="aether-tabs">
        {(['own', 'public'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`aether-tab ${activeTab === tab ? 'aether-tab-active' : ''}`}
          >
            {tab === 'own' ? 'Local Vault' : 'Public Broadcasts'}
          </button>
        ))}
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <AnimatePresence mode="popLayout">
          {displayedMedia.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="aether-card !p-0 group overflow-hidden flex flex-col"
            >
              <div className="aspect-video relative overflow-hidden bg-void">
                {item.type === 'IMAGE' ? (
                  <img src={`http://localhost:3001${item.url}`} alt={item.filename} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="movie" className="text-3xl text-text-ghost" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => setPreviewItem(item)} className="aether-btn-icon !bg-white/10 !border-white/10 !text-white hover:!bg-cyan hover:!text-void">
                    <Icon name="visibility" className="text-sm" />
                  </button>
                  {activeTab === 'own' && (
                    <button onClick={() => handleDelete(item.id)} className="aether-btn-icon alert !bg-white/10 !border-white/10 !text-white">
                      <Icon name="delete" className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="text-[11px] font-medium text-text-prime truncate mb-1">{item.filename}</div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[9px] font-data text-text-dim">{formatFileSize(item.size)}</span>
                  {canPublish && activeTab === 'own' && (
                    <button
                      onClick={() => handlePublish(item, !item.isPublic)}
                      className={`text-[9px] font-data font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${item.isPublic ? 'border-cyan text-cyan bg-cyan/5' : 'border-edge text-text-dim hover:text-text-prime'}`}
                    >
                      {item.isPublic ? 'Public' : 'Private'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {previewItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="aether-modal-overlay">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="aether-card max-w-4xl w-full p-3 relative">
              <button onClick={() => setPreviewItem(null)} className="absolute -top-10 right-0 text-text-prime flex items-center gap-2 hover:text-cyan transition-colors">
                <span className="text-[10px] font-data uppercase tracking-widest">Close</span>
                <Icon name="close" />
              </button>
              {previewItem.type === 'IMAGE' ? (
                <img src={`http://localhost:3001${previewItem.url}`} className="w-full h-auto rounded-md" alt="Preview" />
              ) : (
                <video src={`http://localhost:3001${previewItem.url}`} controls autoPlay className="w-full h-auto rounded-md" />
              )}
              <div className="mt-4 flex items-center justify-between px-2">
                <div>
                  <h3 className="text-text-prime font-medium text-sm">{previewItem.filename}</h3>
                  <p className="text-[10px] font-data text-text-dim mt-1">{previewItem.type} • {formatFileSize(previewItem.size)}</p>
                </div>
                <a href={`http://localhost:3001${previewItem.url}`} download className="aether-btn py-2">
                  <Icon name="download" className="text-sm" />
                  Download
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
