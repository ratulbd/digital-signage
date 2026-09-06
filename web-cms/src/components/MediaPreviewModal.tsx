import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Icon } from './Icon';
import type { MediaItem } from '../types';

interface MediaPreviewModalProps {
  item: MediaItem | null;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  const h = Math.floor(m / 60);
  const remM = m % 60;

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }
  return `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

export function MediaPreviewModal({ item, onClose }: MediaPreviewModalProps) {
  if (!item) return null;

  // Video State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(true); // Default muted to allow safe autoplay
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scrubber Hover State
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // Image State
  const [imageScale, setImageScale] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Text & Doc State
  const [textContent, setTextContent] = useState<string>('');
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const isPdf = item.type === 'DOCUMENT' && (item.filename?.toLowerCase().endsWith('.pdf') || item.url?.toLowerCase().endsWith('.pdf'));

  // Reset states on item change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setImageScale(1);
    setImageRotation(0);
    setVideoDimensions(null);
    setImageDimensions(null);
    setTextContent('');

    if (item.type === 'TEXT') {
      setIsLoadingText(true);
      fetch(item.url)
        .then(res => res.text())
        .then(text => setTextContent(text))
        .catch(() => setTextContent('Unable to load text document contents.'))
        .finally(() => setIsLoadingText(false));
    }
  }, [item]);

  // Video Autoplay & events
  useEffect(() => {
    const video = videoRef.current;
    if (!video || item.type !== 'VIDEO') return;

    video.volume = volume;
    video.muted = isMuted;
    video.playbackRate = playbackRate;
    video.loop = isLooping;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      // Attempt safe autoplay
      video.play().catch(() => {
        // Autoplay policy prevented playback, keep paused
        setIsPlaying(false);
      });
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [item, isMuted, volume, playbackRate, isLooping]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls auto-hide logic on player movement
  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 2600);
    }
  }, [isPlaying]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
        return;
      }

      if (item.type === 'VIDEO') {
        if (e.code === 'Space' || e.key === 'k') {
          e.preventDefault();
          togglePlayPause();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          skip(-5);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          skip(5);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isPlaying, isMuted, volume, onClose]);

  // Video Actions
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
    resetControlsTimeout();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const newMute = !isMuted;
    setIsMuted(newMute);
    video.muted = newMute;
    if (newMute === false && volume === 0) {
      setVolume(0.5);
      video.volume = 0.5;
    }
  };

  const changeVolume = (val: number) => {
    const video = videoRef.current;
    if (!video) return;
    setVolume(val);
    video.volume = val;
    if (val > 0 && isMuted) {
      setIsMuted(false);
      video.muted = false;
    } else if (val === 0) {
      setIsMuted(true);
      video.muted = true;
    }
  };

  const skip = (secs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + secs, duration));
    resetControlsTimeout();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pos * duration;
    setCurrentTime(pos * duration);
    resetControlsTimeout();
  };

  const handleMouseMoveProgress = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const handleMouseLeaveProgress = () => {
    setHoverPosition(null);
    setHoverTime(null);
  };

  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const copyUrlToClipboard = () => {
    const fullUrl = item.url.startsWith('http') ? item.url : `${window.location.origin}${item.url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  const copyTextToClipboard = () => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  // Type Badges
  const typeBadgeClasses: Record<string, string> = {
    VIDEO: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    IMAGE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    DOCUMENT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    TEXT: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="aether-modal-overlay !p-2 sm:!p-4 md:!p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="aether-card !p-0 max-w-5xl w-full flex flex-col max-h-[94vh] shadow-2xl rounded-2xl overflow-hidden border border-edge bg-abyss"
      >
        {/* Modal Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between gap-3 bg-plate/40 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center text-cyan shrink-0">
              <Icon
                name={
                  item.type === 'VIDEO'
                    ? 'movie'
                    : item.type === 'IMAGE'
                    ? 'image'
                    : item.type === 'DOCUMENT'
                    ? 'description'
                    : 'text_snippet'
                }
                className="text-xl"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-text-prime font-semibold text-sm truncate max-w-md sm:max-w-xl">
                  {item.contentName || item.filename}
                </h3>
                <span className={`text-[10px] font-data font-medium px-2 py-0.5 rounded-md border ${typeBadgeClasses[item.type] || ''}`}>
                  {item.type}
                </span>
                {item.category && (
                  <span className="text-[10px] font-data text-text-dim px-2 py-0.5 rounded-md bg-plate border border-edge">
                    {item.category.name}
                  </span>
                )}
                {item.contentType && (
                  <span className="text-[10px] font-data text-cyan px-2 py-0.5 rounded-md bg-cyan/5 border border-cyan/15">
                    {item.contentType.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-data text-text-dim truncate mt-0.5">
                {item.filename} • {formatFileSize(item.size)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={copyUrlToClipboard}
              className="aether-btn-icon !w-8 !h-8 text-text-dim hover:text-text-prime relative"
              title="Copy Direct URL"
            >
              <Icon name={copiedUrl ? 'check' : 'link'} className="text-base" />
              {copiedUrl && (
                <span className="absolute -bottom-7 right-0 text-[10px] font-data bg-slate-900 text-white px-2 py-0.5 rounded shadow whitespace-nowrap z-50">
                  Copied!
                </span>
              )}
            </button>
            <a
              href={`${item.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="aether-btn-icon !w-8 !h-8 text-text-dim hover:text-text-prime"
              title="Open in New Tab"
            >
              <Icon name="open_in_new" className="text-base" />
            </a>
            <a
              href={`${item.url}`}
              download
              className="aether-btn-icon !w-8 !h-8 text-text-dim hover:text-text-prime"
              title="Download Media"
            >
              <Icon name="download" className="text-base" />
            </a>
            <div className="w-[1px] h-5 bg-edge mx-1" />
            <button
              onClick={onClose}
              className="aether-btn-icon !w-8 !h-8 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
              title="Close (Esc)"
            >
              <Icon name="close" className="text-base" />
            </button>
          </div>
        </div>

        {/* Scrollable Container (Cinema Stage + Inspection Details) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar-visible flex flex-col">
          {/* Cinema Media Stage */}
          <div
            ref={playerContainerRef}
            onMouseMove={resetControlsTimeout}
            onMouseEnter={() => setIsControlsVisible(true)}
            className="relative w-full h-[52vh] min-h-[300px] max-h-[580px] bg-slate-950 flex items-center justify-center overflow-hidden select-none group border-b border-edge/60"
          >
            {/* Subtle stage ambient glow */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/80 via-slate-950 to-slate-950 pointer-events-none" />

            {/* VIDEO PLAYER */}
            {item.type === 'VIDEO' && (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={`${item.url}`}
                  playsInline
                  onClick={togglePlayPause}
                  className="max-w-full max-h-full w-auto h-auto object-contain cursor-pointer transition-transform"
                />

                {/* Big Center Play/Pause Ripple Overlay */}
                <button
                  onClick={togglePlayPause}
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                    !isPlaying ? 'opacity-100 bg-black/35' : 'opacity-0 hover:opacity-100'
                  }`}
                >
                  <div className="w-16 h-16 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all">
                    <Icon name={isPlaying ? 'pause' : 'play_arrow'} className="text-3xl ml-0.5 text-slate-950" />
                  </div>
                </button>

                {/* Buffering Spinner */}
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 border-4 border-cyan/30 border-t-cyan rounded-full animate-spin" />
                  </div>
                )}

                {/* Professional Video Control Bar (Auto-hides on inactivity) */}
                <div
                  className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pt-8 pb-3 transition-opacity duration-300 flex flex-col gap-2 z-20 ${
                    isControlsVisible || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {/* Interactive Timeline Progress Bar */}
                  <div
                    ref={progressBarRef}
                    onClick={handleSeek}
                    onMouseMove={handleMouseMoveProgress}
                    onMouseLeave={handleMouseLeaveProgress}
                    className="relative h-2 w-full bg-white/20 hover:h-3 rounded-full cursor-pointer transition-all flex items-center group/scrubber"
                  >
                    {/* Buffered Progress */}
                    {duration > 0 && (
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full"
                        style={{ width: `${(buffered / duration) * 100}%` }}
                      />
                    )}

                    {/* Current Played Progress */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan to-indigo-500 rounded-full flex items-center justify-end"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    >
                      <div className="w-3.5 h-3.5 bg-white rounded-full shadow-lg scale-0 group-hover/scrubber:scale-100 transition-transform -mr-1.5" />
                    </div>

                    {/* Hover Timestamp Tooltip */}
                    {hoverPosition !== null && hoverTime !== null && (
                      <div
                        className="absolute -top-8 -translate-x-1/2 bg-slate-900/90 text-white font-data text-[11px] px-2 py-0.5 rounded shadow-lg border border-white/10 pointer-events-none"
                        style={{ left: `${hoverPosition}%` }}
                      >
                        {formatTime(hoverTime)}
                      </div>
                    )}
                  </div>

                  {/* Controls Row */}
                  <div className="flex items-center justify-between gap-2 text-white">
                    {/* Left: Play/Pause, Skips, Timecode */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={togglePlayPause}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white transition-colors"
                        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                      >
                        <Icon name={isPlaying ? 'pause' : 'play_arrow'} className="text-xl" />
                      </button>

                      <button
                        onClick={() => skip(-10)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/90 hover:text-white transition-colors"
                        title="Replay 10s (Left Arrow)"
                      >
                        <Icon name="replay_10" className="text-lg" />
                      </button>

                      <button
                        onClick={() => skip(10)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/90 hover:text-white transition-colors"
                        title="Forward 10s (Right Arrow)"
                      >
                        <Icon name="forward_10" className="text-lg" />
                      </button>

                      <div className="text-xs font-data text-white/90 ml-1 select-none">
                        <span>{formatTime(currentTime)}</span>
                        <span className="text-white/40 mx-1">/</span>
                        <span className="text-white/60">{formatTime(duration)}</span>
                      </div>
                    </div>

                    {/* Right: Volume, Speed, Loop, PiP, Fullscreen */}
                    <div className="flex items-center gap-1.5">
                      {/* Volume Slider Group */}
                      <div className="flex items-center gap-1 group/volume">
                        <button
                          onClick={toggleMute}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/90 hover:text-white transition-colors"
                          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                        >
                          <Icon
                            name={
                              isMuted || volume === 0
                                ? 'volume_off'
                                : volume < 0.5
                                ? 'volume_down'
                                : 'volume_up'
                            }
                            className="text-lg"
                          />
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => changeVolume(parseFloat(e.target.value))}
                          className="w-16 sm:w-20 h-1.5 bg-white/25 hover:bg-white/40 accent-cyan rounded-lg cursor-pointer transition-all"
                          title="Volume"
                        />
                      </div>

                      {/* Playback Speed */}
                      <button
                        onClick={cyclePlaybackRate}
                        className="h-8 px-2 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/90 hover:text-white text-xs font-data transition-colors"
                        title="Playback Rate"
                      >
                        {playbackRate}x
                      </button>

                      {/* Loop Toggle */}
                      <button
                        onClick={() => setIsLooping(!isLooping)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 transition-colors ${
                          isLooping ? 'text-cyan bg-cyan/20' : 'text-white/80 hover:text-white'
                        }`}
                        title={isLooping ? 'Disable Loop' : 'Loop Playback'}
                      >
                        <Icon name="repeat" className="text-lg" />
                      </button>

                      {/* Picture-in-Picture */}
                      {document.pictureInPictureEnabled && (
                        <button
                          onClick={togglePiP}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/80 hover:text-white transition-colors"
                          title="Picture-in-Picture"
                        >
                          <Icon name="picture_in_picture_alt" className="text-lg" />
                        </button>
                      )}

                      {/* Fullscreen */}
                      <button
                        onClick={toggleFullscreen}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/90 hover:text-white transition-colors"
                        title="Fullscreen (F)"
                      >
                        <Icon name={isFullscreen ? 'fullscreen_exit' : 'fullscreen'} className="text-xl" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* IMAGE VIEWER */}
            {item.type === 'IMAGE' && (
              <div className="relative w-full h-full flex items-center justify-center p-4">
                <div
                  className="transition-transform duration-200 flex items-center justify-center"
                  style={{
                    transform: `scale(${imageScale}) rotate(${imageRotation}deg)`,
                  }}
                >
                  <img
                    src={`${item.url}`}
                    alt={item.filename}
                    onLoad={(e) => {
                      setImageDimensions({
                        width: e.currentTarget.naturalWidth,
                        height: e.currentTarget.naturalHeight,
                      });
                    }}
                    className="max-w-full max-h-[46vh] w-auto h-auto object-contain rounded shadow-lg select-none pointer-events-none"
                  />
                </div>

                {/* Image Toolbar Floating Overlay */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 flex items-center gap-2 text-white shadow-xl z-20">
                  <button
                    onClick={() => setImageScale((s) => Math.max(0.25, s - 0.25))}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors"
                    title="Zoom Out"
                  >
                    <Icon name="zoom_out" className="text-base" />
                  </button>
                  <span className="text-xs font-data min-w-[45px] text-center">
                    {Math.round(imageScale * 100)}%
                  </span>
                  <button
                    onClick={() => setImageScale((s) => Math.min(3, s + 0.25))}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors"
                    title="Zoom In"
                  >
                    <Icon name="zoom_in" className="text-base" />
                  </button>
                  <div className="w-[1px] h-4 bg-white/20 mx-1" />
                  <button
                    onClick={() => {
                      setImageScale(1);
                      setImageRotation(0);
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors"
                    title="Reset View"
                  >
                    <Icon name="fit_screen" className="text-base" />
                  </button>
                  <button
                    onClick={() => setImageRotation((r) => (r + 90) % 360)}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 text-white transition-colors"
                    title="Rotate 90°"
                  >
                    <Icon name="rotate_right" className="text-base" />
                  </button>
                </div>
              </div>
            )}

            {/* DOCUMENT / PDF VIEWER */}
            {item.type === 'DOCUMENT' && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-plate/40">
                {isPdf ? (
                  <iframe
                    src={`${item.url}#toolbar=1&navpanes=0`}
                    title="PDF Preview"
                    className="w-full h-full border-0 bg-white"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                      <Icon name="description" className="text-5xl" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-text-prime font-semibold">{item.filename}</h4>
                      <p className="text-xs text-text-dim max-w-sm">
                        Direct in-browser viewer not supported for this document format ({item.filename.split('.').pop()?.toUpperCase()}). Download to inspect locally.
                      </p>
                    </div>
                    <a href={`${item.url}`} download className="aether-btn py-2 px-4 shadow-md">
                      <Icon name="download" className="text-sm" />
                      Download Document ({formatFileSize(item.size)})
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* TEXT VIEWER */}
            {item.type === 'TEXT' && (
              <div className="w-full h-full p-4 overflow-hidden flex flex-col bg-slate-950 text-slate-100 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
                  <span className="text-slate-400 font-data text-[11px]">
                    Plain Text Preview ({textContent ? textContent.split('\n').length : 0} lines)
                  </span>
                  <button
                    onClick={copyTextToClipboard}
                    className="flex items-center gap-1 text-[11px] text-cyan hover:underline bg-white/5 hover:bg-white/10 px-2 py-1 rounded"
                  >
                    <Icon name={copiedText ? 'check' : 'content_copy'} className="text-sm" />
                    {copiedText ? 'Copied!' : 'Copy Text'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar-visible pr-2">
                  {isLoadingText ? (
                    <div className="flex items-center justify-center h-full text-slate-500">
                      Loading text preview...
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap leading-relaxed select-text font-mono">
                      {textContent || 'Empty document'}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Details & Inspection Footer */}
          <div className="p-4 sm:p-5 bg-plate/20 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Resolution / Dimensions */}
              <div className="p-3 rounded-xl bg-plate/60 border border-edge/80">
                <div className="text-[10px] uppercase font-data tracking-wider text-text-ghost flex items-center gap-1 mb-1">
                  <Icon name="aspect_ratio" className="text-xs text-text-dim" />
                  Dimensions
                </div>
                <div className="text-xs font-semibold font-data text-text-prime">
                  {videoDimensions
                    ? `${videoDimensions.width} × ${videoDimensions.height}`
                    : imageDimensions
                    ? `${imageDimensions.width} × ${imageDimensions.height}`
                    : isPdf
                    ? 'Standard PDF'
                    : 'N/A'}
                </div>
              </div>

              {/* Duration / Pages */}
              <div className="p-3 rounded-xl bg-plate/60 border border-edge/80">
                <div className="text-[10px] uppercase font-data tracking-wider text-text-ghost flex items-center gap-1 mb-1">
                  <Icon name="timer" className="text-xs text-text-dim" />
                  Duration
                </div>
                <div className="text-xs font-semibold font-data text-text-prime">
                  {item.type === 'VIDEO'
                    ? duration > 0
                      ? formatTime(duration)
                      : 'Detecting...'
                    : 'Static Asset'}
                </div>
              </div>

              {/* File Size */}
              <div className="p-3 rounded-xl bg-plate/60 border border-edge/80">
                <div className="text-[10px] uppercase font-data tracking-wider text-text-ghost flex items-center gap-1 mb-1">
                  <Icon name="folder_zip" className="text-xs text-text-dim" />
                  File Size
                </div>
                <div className="text-xs font-semibold font-data text-text-prime">
                  {formatFileSize(item.size)}
                </div>
              </div>

              {/* Upload Date */}
              <div className="p-3 rounded-xl bg-plate/60 border border-edge/80">
                <div className="text-[10px] uppercase font-data tracking-wider text-text-ghost flex items-center gap-1 mb-1">
                  <Icon name="calendar_today" className="text-xs text-text-dim" />
                  Uploaded
                </div>
                <div className="text-xs font-semibold font-data text-text-prime truncate">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'}
                </div>
              </div>
            </div>

            {/* Additional Tags & Shortcuts Tip */}
            <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-text-dim pt-1 border-t border-edge">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-data text-[11px] text-text-ghost">Tags:</span>
                {item.category?.name && (
                  <span className="px-2 py-0.5 rounded bg-plate text-text-prime border border-edge font-data text-[11px]">
                    Category: {item.category.name}
                  </span>
                )}
                {item.contentType?.name && (
                  <span className="px-2 py-0.5 rounded bg-cyan/5 text-cyan border border-cyan/15 font-data text-[11px]">
                    Type: {item.contentType.name}
                  </span>
                )}
                {item.uploader?.email && (
                  <span className="px-2 py-0.5 rounded bg-plate text-text-dim border border-edge font-data text-[11px]">
                    Uploader: {item.uploader.name || item.uploader.email}
                  </span>
                )}
              </div>

              {item.type === 'VIDEO' && (
                <div className="hidden md:flex items-center gap-3 text-[11px] font-data text-text-ghost">
                  <span><kbd className="px-1 py-0.5 bg-plate rounded border border-edge text-text-dim">Space</kbd> Play/Pause</span>
                  <span><kbd className="px-1 py-0.5 bg-plate rounded border border-edge text-text-dim">M</kbd> Mute</span>
                  <span><kbd className="px-1 py-0.5 bg-plate rounded border border-edge text-text-dim">F</kbd> Fullscreen</span>
                  <span><kbd className="px-1 py-0.5 bg-plate rounded border border-edge text-text-dim">&larr;/&rarr;</kbd> Seek &plusmn;5s</span>
                  <span><kbd className="px-1 py-0.5 bg-plate rounded border border-edge text-text-dim">Esc</kbd> Close</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
