import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Icon } from '../components/Icon';
import { Select } from '../components/Select';
import { MediaPreviewModal } from '../components/MediaPreviewModal';
import type { MediaItem, MediaCategory, MediaContentType } from '../types';
import { ROLE_POWER } from '../types';

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

type Tab = 'own' | 'public';

const getMediaIcon = (type: string) => {
  switch (type) {
    case 'IMAGE': return 'image';
    case 'VIDEO': return 'movie';
    case 'DOCUMENT': return 'description';
    case 'TEXT': return 'article';
    default: return 'insert_drive_file';
  }
};

const detectFileTypeLabel = (file: File) => {
  const type = file.type;
  if (type.startsWith('image/')) return 'IMAGE';
  if (type.startsWith('video/')) return 'VIDEO';
  if (type.startsWith('text/')) return 'TEXT';
  if (type.includes('pdf') || type.includes('document') || type.includes('sheet') || type.includes('presentation')) return 'DOCUMENT';
  return 'UNKNOWN';
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function MediaPage() {
  const { user } = useAuth();
  const canPublish = user?.role === 'CENTRAL_ADMIN' || user?.role === 'COMPANY_ADMIN' || user?.role === 'CIRCLE_ADMIN';
  const canManageCategories = user ? ROLE_POWER[user.role] >= 3 : false;

  // ── Media data ──
  const [ownMedia, setOwnMedia] = useState<MediaItem[]>([]);
  const [publicMedia, setPublicMedia] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('own');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // ── Filters ──
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');

  // ── Upload modal ──
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategoryId, setUploadCategoryId] = useState('');
  const [uploadTypeId, setUploadTypeId] = useState('');
  const [uploadContentName, setUploadContentName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadState, setUploadState] = useState<{
    progress: number;
    loaded: number;
    total: number;
    speed: string;
    eta: string;
    stage: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  }>({
    progress: 0,
    loaded: 0,
    total: 0,
    speed: '',
    eta: '',
    stage: 'idle',
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastLoadedRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // ── Category management modal ──
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newTypeInputs, setNewTypeInputs] = useState<Record<string, string>>({});
  const [categoryLoading, setCategoryLoading] = useState(false);

  // ── Delete confirmation modal ──
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    item: MediaItem | null;
    forceMode: boolean;
    forceMessage: string;
    deleting: boolean;
  }>({ open: false, item: null, forceMode: false, forceMessage: '', deleting: false });

  const displayedMedia = activeTab === 'own' ? ownMedia : publicMedia;

  const filteredMedia = displayedMedia.filter((item) => {
    if (filterCategoryId && item.categoryId !== filterCategoryId) return false;
    if (filterTypeId && item.contentTypeId !== filterTypeId) return false;
    return true;
  });

  const fetchMedia = useCallback(() => {
    setIsLoading(true);
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
      .catch(() => setError('Failed to load media'))
      .finally(() => setIsLoading(false));
  }, []);

  const fetchCategories = useCallback(() => {
    api.get('/media/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // Reset type filter when category filter changes
  useEffect(() => {
    setFilterTypeId('');
  }, [filterCategoryId]);

  // Reset upload type when category changes
  useEffect(() => {
    setUploadTypeId('');
  }, [uploadCategoryId]);



  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const typeOptions = [
    { value: '', label: 'All Types' },
    ...(categories
      .find((c) => c.id === filterCategoryId)
      ?.types?.map((t) => ({ value: t.id, label: t.name })) || []),
  ];

  const uploadCategoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const uploadTypeOptions = (categories
    .find((c) => c.id === uploadCategoryId)
    ?.types?.map((t) => ({ value: t.id, label: t.name })) || []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadFile(file);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    if (!uploadCategoryId) { setError('Please select a category'); return; }
    if (!uploadTypeId) { setError('Please select a type'); return; }

    setUploading(true);
    setError('');
    const totalBytes = uploadFile.size || 1;
    setUploadState({
      progress: 0,
      loaded: 0,
      total: totalBytes,
      speed: 'Starting...',
      eta: 'Estimating...',
      stage: 'uploading',
    });

    lastLoadedRef.current = 0;
    lastTimeRef.current = performance.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('categoryId', uploadCategoryId);
    formData.append('contentTypeId', uploadTypeId);
    if (uploadContentName.trim()) formData.append('contentName', uploadContentName.trim());

    try {
      await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          const loaded = progressEvent.loaded || 0;
          const total = progressEvent.total || totalBytes;
          const pct = Math.min(Math.round((loaded * 100) / total), 100);

          const now = performance.now();
          const timeDiff = (now - lastTimeRef.current) / 1000;

          let speedStr = '';
          let etaStr = '';

          if (timeDiff >= 0.3 || loaded === total) {
            const bytesDiff = loaded - lastLoadedRef.current;
            const bytesPerSec = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            speedStr = bytesPerSec > 0 ? `${formatFileSize(bytesPerSec)}/s` : '';

            const remainingBytes = Math.max(0, total - loaded);
            if (bytesPerSec > 0 && remainingBytes > 0) {
              const remainingSec = Math.ceil(remainingBytes / bytesPerSec);
              etaStr = remainingSec < 60 ? `~${remainingSec}s left` : `~${Math.ceil(remainingSec / 60)}m left`;
            } else if (pct >= 100) {
              etaStr = 'Finalizing...';
            }

            lastLoadedRef.current = loaded;
            lastTimeRef.current = now;
          }

          setUploadState((prev) => ({
            progress: pct,
            loaded,
            total,
            speed: speedStr || prev.speed,
            eta: etaStr || prev.eta,
            stage: pct >= 100 ? 'processing' : 'uploading',
          }));
        },
      });

      setUploadState((prev) => ({
        ...prev,
        progress: 100,
        stage: 'success',
        speed: '',
        eta: 'Completed',
      }));

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadCategoryId('');
        setUploadTypeId('');
        setUploadContentName('');
        setUploadState({ progress: 0, loaded: 0, total: 0, speed: '', eta: '', stage: 'idle' });
        setUploading(false);
        fetchMedia();
      }, 700);
    } catch (err: any) {
      if (controller.signal.aborted) {
        setError('Upload cancelled');
      } else {
        setError(err.response?.data?.error || 'Upload failed');
      }
      setUploadState((prev) => ({ ...prev, stage: 'error' }));
      setUploading(false);
    } finally {
      abortControllerRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const openDeleteModal = (item: MediaItem) => {
    setDeleteModal({ open: true, item, forceMode: false, forceMessage: '', deleting: false });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, item: null, forceMode: false, forceMessage: '', deleting: false });
  };

  const handleConfirmDelete = async () => {
    const item = deleteModal.item;
    if (!item) return;

    setDeleteModal((prev) => ({ ...prev, deleting: true }));
    const force = deleteModal.forceMode;

    try {
      await api.post(`/media/${item.id}/delete${force ? '?force=true' : ''}`);
      closeDeleteModal();
      fetchMedia();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Delete failed';
      const canForce = err.response?.data?.canForceDelete;
      if (!force && canForce) {
        setDeleteModal({ open: true, item, forceMode: true, forceMessage: msg, deleting: false });
      } else {
        setDeleteModal((prev) => ({ ...prev, deleting: false }));
        setError(msg);
      }
    }
  };

  const handlePublish = async (item: MediaItem, publish: boolean) => {
    try {
      await api.post(`/media/${item.id}/publish`, { isPublic: publish });
      fetchMedia();
    } catch (err: any) { setError(err.response?.data?.error || 'Publish failed'); }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCategoryLoading(true);
    try {
      await api.post('/media/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      setAddingCategory(false);
      fetchCategories();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if ((cat._count?.media || 0) > 0) {
      setError('Cannot delete category with existing media');
      return;
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await api.post(`/media/categories/${id}/delete`).catch(async () => {
        await api.delete(`/media/categories/${id}`);
      });
      fetchCategories();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete category');
    }
  };

  const handleCreateType = async (categoryId: string) => {
    const name = newTypeInputs[categoryId]?.trim();
    if (!name) return;
    setCategoryLoading(true);
    try {
      await api.post('/media/types', { name, categoryId });
      setNewTypeInputs((prev) => ({ ...prev, [categoryId]: '' }));
      fetchCategories();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create type');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleDeleteType = async (type: MediaContentType) => {
    if ((type._count?.media || 0) > 0) {
      setError('Cannot delete type with existing media');
      return;
    }
    if (!confirm(`Delete type "${type.name}"?`)) return;
    try {
      await api.post(`/media/types/${type.id}/delete`).catch(async () => {
        await api.delete(`/media/types/${type.id}`);
      });
      fetchCategories();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete type');
    }
  };


  const clearFilters = () => {
    setFilterCategoryId('');
    setFilterTypeId('');
  };

  if (isLoading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="aether-spinner !w-8 !h-8 !border-[3px]" />
    </div>
  );

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="aether-error">
            <Icon name="error" className="text-sm shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto opacity-50 hover:opacity-100"><Icon name="close" className="text-sm" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div variants={itemVariants} className="aether-header">
        <div>
          <h2 className="aether-header-title">Media</h2>
          <p className="aether-header-sub">{ownMedia.length + publicMedia.length} file{ownMedia.length + publicMedia.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManageCategories && (
            <button onClick={() => setShowCategoryModal(true)} className="aether-btn-ghost">
              <Icon name="folder" className="text-sm" />
              <span>Categories</span>
            </button>
          )}
          <button onClick={() => setShowUploadModal(true)} className="aether-btn">
            <Icon name="upload_file" className="text-sm" />
            <span>Upload Media</span>
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <Select
          value={filterCategoryId}
          onChange={setFilterCategoryId}
          options={categoryOptions}
          placeholder="All Categories"
          className="w-52"
        />
        <Select
          value={filterTypeId}
          onChange={setFilterTypeId}
          options={typeOptions}
          placeholder="All Types"
          disabled={!filterCategoryId}
          className="w-52"
        />
        {(filterCategoryId || filterTypeId) && (
          <button onClick={clearFilters} className="aether-btn-ghost !border-none !shadow-none !px-2 hover:!bg-transparent text-sm text-text-dim hover:text-text-prime flex items-center gap-1 transition-colors">
            <Icon name="filter_alt_off" className="text-sm" />
            Clear
          </button>
        )}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants} className="aether-tabs">
        {(['own', 'public'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`aether-tab ${activeTab === tab ? 'aether-tab-active' : ''}`}
          >
            {tab === 'own' ? 'My Media' : 'Public Media'}
          </button>
        ))}
      </motion.div>

      {/* Grid */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredMedia.map((item) => (
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
                  <img src={`${item.url}`} alt={item.filename} className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500" />
                ) : item.type === 'VIDEO' ? (
                  <div className="w-full h-full relative bg-black">
                    <video src={`${item.url}`} preload="metadata" muted className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                        <Icon name="play_arrow" className="text-xl text-text-prime ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-plate gap-2">
                    <Icon name={getMediaIcon(item.type)} className="text-4xl text-text-ghost" />
                    <span className="text-xs font-data uppercase tracking-wider text-text-ghost">{item.type}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => setPreviewItem(item)} className="aether-btn-icon !bg-white/10 !border-white/10 !text-white hover:!bg-cyan hover:!text-void">
                    <Icon name="visibility" className="text-sm" />
                  </button>
                  {activeTab === 'own' && (
                    <button onClick={() => openDeleteModal(item)} className="aether-btn-icon alert !bg-white/10 !border-white/10 !text-white">
                      <Icon name="delete" className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1.5">
                <div className="text-sm font-medium text-text-prime truncate">{item.contentName || item.filename}</div>
                <div className="text-[10px] font-data text-text-dim truncate">{item.filename}</div>
                <div className="flex flex-wrap gap-1">
                  {item.category && (
                    <span className="text-[10px] font-data uppercase tracking-wider px-1.5 py-0.5 rounded bg-plate text-text-dim border border-edge">
                      {item.category.name}
                    </span>
                  )}
                  {item.contentType && (
                    <span className="text-[10px] font-data uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan/5 text-cyan border border-cyan/10">
                      {item.contentType.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-xs font-data text-text-dim">{formatFileSize(item.size)}</span>
                  {canPublish && activeTab === 'own' && (
                    <button
                      onClick={() => handlePublish(item, !item.isPublic)}
                      className={`text-xs font-data font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${item.isPublic ? 'border-cyan text-cyan bg-cyan/5' : 'border-edge text-text-dim hover:text-text-prime'}`}
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

      {filteredMedia.length === 0 && displayedMedia.length > 0 && (
        <motion.div variants={itemVariants} className="text-center py-16 text-text-dim">
          <Icon name="filter_alt" className="text-4xl mx-auto mb-3 opacity-30" />
          <p className="text-sm">No media matches the selected filters.</p>
          <button onClick={clearFilters} className="text-cyan text-sm mt-2 hover:underline">Clear filters</button>
        </motion.div>
      )}

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="aether-modal-overlay">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="aether-card max-w-lg w-full p-6 relative">
              <button
                onClick={() => {
                  if (uploading) return;
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadCategoryId('');
                  setUploadTypeId('');
                  setUploadContentName('');
                }}
                disabled={uploading}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-plate/80 hover:bg-edge text-text-dim hover:text-text-prime transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Icon name="close" className="text-lg" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-cyan/10 flex items-center justify-center text-cyan">
                  <Icon name="cloud_upload" className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-text-prime leading-tight">Upload Media</h3>
                  <p className="text-xs text-text-dim mt-0.5">Upload new content to schedule across display devices.</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Step 1: Category & Type */}
                <div className={`space-y-4 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div>
                    <label className="block text-xs font-medium text-text-dim uppercase tracking-wider mb-1.5">Content Category</label>
                    <Select value={uploadCategoryId} onChange={setUploadCategoryId} options={uploadCategoryOptions} placeholder="Select category..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-dim uppercase tracking-wider mb-1.5">Content Type</label>
                    <Select value={uploadTypeId} onChange={setUploadTypeId} options={uploadTypeOptions} placeholder={uploadCategoryId ? 'Select type...' : 'Select category first'} disabled={!uploadCategoryId} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-dim uppercase tracking-wider mb-1.5">Content Name</label>
                    <input
                      type="text"
                      value={uploadContentName}
                      onChange={(e) => setUploadContentName(e.target.value)}
                      placeholder="e.g. March Safety Briefing"
                      className="w-full px-3 py-2 rounded-lg border border-edge bg-surface text-text-prime text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-cyan transition-colors"
                    />
                  </div>
                </div>

                {/* Step 2: File Selection & Progress Card */}
                {!uploadFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
                    className="border-2 border-dashed border-edge hover:border-cyan rounded-xl p-8 text-center cursor-pointer transition-colors"
                  >
                    <Icon name="cloud_upload" className="text-3xl text-text-ghost mb-2 mx-auto" />
                    <p className="text-sm text-text-dim mb-0.5">Click or drag & drop to upload</p>
                    <p className="text-xs text-text-ghost">Images, Videos, Documents, Text</p>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-plate rounded-lg border border-edge">
                      <Icon name={getMediaIcon(detectFileTypeLabel(uploadFile).toUpperCase())} className="text-2xl text-cyan" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-prime truncate font-medium">{uploadFile.name}</p>
                        <p className="text-xs text-text-dim">{detectFileTypeLabel(uploadFile)} • {formatFileSize(uploadFile.size)}</p>
                      </div>
                      {!uploading && (
                        <button onClick={() => setUploadFile(null)} className="text-text-dim hover:text-red-500 transition-colors">
                          <Icon name="close" className="text-sm" />
                        </button>
                      )}
                    </div>

                    {/* Dedicated Live Upload Progress Card */}
                    {uploading && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl border border-edge bg-plate/80 space-y-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {uploadState.stage === 'uploading' && (
                              <>
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan"></span>
                                </span>
                                <span className="text-xs font-semibold text-text-prime">Uploading to cloud...</span>
                              </>
                            )}
                            {uploadState.stage === 'processing' && (
                              <>
                                <Icon name="sync" className="text-sm text-amber-500 animate-spin" />
                                <span className="text-xs font-semibold text-amber-600">Processing on server...</span>
                              </>
                            )}
                            {uploadState.stage === 'success' && (
                              <>
                                <Icon name="check_circle" className="text-sm text-emerald-500" />
                                <span className="text-xs font-semibold text-emerald-600">Upload complete!</span>
                              </>
                            )}
                            {uploadState.stage === 'error' && (
                              <>
                                <Icon name="error" className="text-sm text-red-500" />
                                <span className="text-xs font-semibold text-red-600">Upload interrupted</span>
                              </>
                            )}
                          </div>
                          <span className="text-sm font-data font-bold text-cyan">
                            {uploadState.progress}%
                          </span>
                        </div>

                        {/* Visual Progress Bar Track & Fill */}
                        <div className="w-full h-2.5 bg-plate-hover rounded-full overflow-hidden border border-edge relative">
                          <motion.div
                            className={`h-full rounded-full transition-all duration-200 ${
                              uploadState.stage === 'success'
                                ? 'bg-emerald-500'
                                : uploadState.stage === 'processing'
                                ? 'bg-amber-500'
                                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan'
                            }`}
                            style={{ width: `${uploadState.progress}%` }}
                          />
                        </div>

                        {/* Realtime Transfer Metrics */}
                        <div className="flex items-center justify-between text-xs text-text-dim font-data">
                          <span>
                            {formatFileSize(uploadState.loaded)} / {formatFileSize(uploadState.total || uploadFile.size)}
                          </span>
                          <span>
                            {[uploadState.speed, uploadState.eta].filter(Boolean).join(' • ')}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  {uploading ? (
                    <button
                      onClick={handleCancelUpload}
                      className="aether-btn-ghost flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      <Icon name="cancel" className="text-sm" />
                      <span>Cancel Upload</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setShowUploadModal(false);
                          setUploadFile(null);
                          setUploadCategoryId('');
                          setUploadTypeId('');
                          setUploadContentName('');
                        }}
                        className="aether-btn-ghost flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={!uploadCategoryId || !uploadTypeId || !uploadFile}
                        className="aether-btn flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Icon name="upload_file" className="text-sm" />
                        <span>Upload</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Management Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="aether-modal-overlay">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="aether-card max-w-xl w-full p-6 relative max-h-[85vh] flex flex-col">
              <button onClick={() => setShowCategoryModal(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-plate/80 hover:bg-edge text-text-dim hover:text-text-prime transition-all">
                <Icon name="close" className="text-lg" />
              </button>
              <h3 className="text-lg font-medium text-text-prime mb-1">Manage Categories</h3>
              <p className="text-xs text-text-dim mb-5">Categories and types with existing media cannot be deleted.</p>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {categories.map((cat) => (
                  <div key={cat.id} className="border border-edge rounded-lg overflow-hidden">
                    <div
                      onClick={() => setExpandedCategoryId(expandedCategoryId === cat.id ? null : cat.id)}
                      className="w-full flex items-center gap-3 p-3 bg-plate/30 hover:bg-plate/60 transition-colors text-left cursor-pointer"
                    >
                      <motion.span animate={{ rotate: expandedCategoryId === cat.id ? 90 : 0 }} transition={{ duration: 0.15 }}>
                        <Icon name="chevron_right" className="text-sm text-text-dim" />
                      </motion.span>
                      <span className="text-sm font-medium text-text-prime flex-1">{cat.name}</span>
                      <span className="text-xs text-text-ghost font-data">{cat._count?.types || 0} types</span>
                      <span className="text-xs text-text-ghost font-data">{cat._count?.media || 0} media</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                        disabled={(cat._count?.media || 0) > 0}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--alert-dim)] text-text-dim hover:text-[var(--alert)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={(cat._count?.media || 0) > 0 ? 'Category has media' : 'Delete category'}
                      >
                        <Icon name="delete" className="text-xs" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {expandedCategoryId === cat.id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="p-3 space-y-2 bg-white">
                            {cat.types?.map((type) => (
                              <div key={type.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-plate/40">
                                <span className="text-sm text-text-prime">{type.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-text-ghost font-data">{type._count?.media || 0}</span>
                                  <button
                                    onClick={() => handleDeleteType(type)}
                                    disabled={(type._count?.media || 0) > 0}
                                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--alert-dim)] text-text-dim hover:text-[var(--alert)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={(type._count?.media || 0) > 0 ? 'Type has media' : 'Delete type'}
                                  >
                                    <Icon name="delete" className="text-xs" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Add type inline */}
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={newTypeInputs[cat.id] || ''}
                                onChange={(e) => setNewTypeInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                                placeholder="New type name..."
                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-edge bg-white focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/10"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateType(cat.id); }}
                              />
                              <button
                                onClick={() => handleCreateType(cat.id)}
                                disabled={!newTypeInputs[cat.id]?.trim() || categoryLoading}
                                className="aether-btn py-2 px-3"
                              >
                                <Icon name="add" className="text-sm" />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {/* Add category */}
              <div className="mt-4 pt-4 border-t border-edge">
                {addingCategory ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name..."
                      className="flex-1 px-3 py-2.5 text-sm rounded-lg border border-edge bg-white focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/10"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
                      autoFocus
                    />
                    <button onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} className="aether-btn-ghost py-2.5 px-3">
                      <Icon name="close" className="text-sm" />
                    </button>
                    <button onClick={handleCreateCategory} disabled={!newCategoryName.trim() || categoryLoading} className="aether-btn py-2.5 px-3">
                      <Icon name="check" className="text-sm" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAddingCategory(true)} className="aether-btn-ghost w-full">
                    <Icon name="add" className="text-sm" />
                    <span>Add Category</span>
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewItem && (
          <MediaPreviewModal
            item={previewItem}
            onClose={() => setPreviewItem(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.open && deleteModal.item && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="aether-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="aether-card max-w-md w-full p-6 relative"
            >
              <div className="flex flex-col items-center text-center gap-4">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${deleteModal.forceMode ? 'bg-alert/10' : 'bg-amber/10'}`}>
                  <Icon
                    name={deleteModal.forceMode ? 'error_outline' : 'warning_amber'}
                    className={`text-2xl ${deleteModal.forceMode ? 'text-alert' : 'text-amber'}`}
                  />
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <h3 className="text-text-prime font-semibold text-lg">
                    {deleteModal.forceMode ? 'Media in Use' : 'Delete Media'}
                  </h3>
                  <p className="text-sm text-text-dim">
                    {deleteModal.item.contentName || deleteModal.item.filename}
                  </p>
                </div>

                {/* Message */}
                <div className={`w-full rounded-lg p-3 text-left text-sm ${deleteModal.forceMode ? 'bg-alert/5 border border-alert/10 text-alert' : 'bg-amber/5 border border-amber/10 text-text-dim'}`}>
                  {deleteModal.forceMode ? (
                    <div className="flex items-start gap-2">
                      <Icon name="info" className="text-alert mt-0.5 flex-shrink-0 text-base" />
                      <div className="space-y-1">
                        <p className="font-medium">{deleteModal.forceMessage}</p>
                        <p className="text-alert/80">Force deleting will permanently remove this media from all schedules and cannot be undone.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Icon name="info" className="text-amber mt-0.5 flex-shrink-0 text-base" />
                      <p>This media will be permanently deleted. This action cannot be undone.</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 w-full pt-2">
                  <button
                    onClick={closeDeleteModal}
                    disabled={deleteModal.deleting}
                    className="aether-btn-ghost flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleteModal.deleting}
                    className={`flex-1 ${deleteModal.forceMode ? 'aether-btn-alert' : 'aether-btn-amber'}`}
                  >
                    {deleteModal.deleting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deleting...
                      </span>
                    ) : deleteModal.forceMode ? (
                      'Remove from Schedules & Delete'
                    ) : (
                      'Delete Media'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Upload Progress Widget (when modal is closed or minimized) */}
      <AnimatePresence>
        {uploading && !showUploadModal && uploadFile && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            onClick={() => setShowUploadModal(true)}
            className="fixed bottom-6 right-6 z-50 bg-white border border-edge shadow-2xl rounded-2xl p-4 w-84 space-y-2 cursor-pointer hover:border-cyan transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name={getMediaIcon(detectFileTypeLabel(uploadFile).toUpperCase())} className="text-cyan text-lg shrink-0" />
                <span className="text-xs font-medium text-text-prime truncate">{uploadFile.name}</span>
              </div>
              <span className="text-xs font-data font-bold text-cyan ml-2 shrink-0">{uploadState.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-plate rounded-full overflow-hidden border border-edge">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan rounded-full transition-all duration-200"
                style={{ width: `${uploadState.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-text-dim font-data">
              <span>{uploadState.stage === 'processing' ? 'Processing on server...' : uploadState.speed || 'Uploading...'}</span>
              <span>{uploadState.eta}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
