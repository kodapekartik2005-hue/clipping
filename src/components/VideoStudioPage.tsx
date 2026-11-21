import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  Palette,
  Pause,
  Play,
  Save,
  Sliders,
  Type as TypeIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CaptionSegment, CaptionStyleConfig } from '../db/schema.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { ClipItem } from '../types/app.ts';
import {
  calculateWordTimings,
  DEFAULT_CAPTION_STYLE,
  formatTimecode,
} from '../utils/clipLogic.ts';

interface VideoStudioPageProps {
  clip: ClipItem;
  sourceDuration: number;
  onClipSaved: (updated: ClipItem) => void;
  onBack: () => void;
}

const CAPTION_TEMPLATES: Array<{
  id: CaptionStyleConfig['template'];
  name: string;
  desc: string;
  preset: Partial<CaptionStyleConfig>;
}> = [
  {
    id: 'kinetic_pop',
    name: 'Kinetic Pop',
    desc: 'Bold active-word scale with dark scrim',
    preset: {
      template: 'kinetic_pop',
      primaryColor: '#FFFFFF',
      highlightColor: '#60A5FA',
      backgroundColor: '#090D16',
      backgroundOpacity: 0.72,
    },
  },
  {
    id: 'bold_highlight',
    name: 'Bold Highlight',
    desc: 'Violet keyword emphasis for hooks',
    preset: {
      template: 'bold_highlight',
      primaryColor: '#F8FAFC',
      highlightColor: '#A78BFA',
      backgroundColor: '#0F172A',
      backgroundOpacity: 0.85,
    },
  },
  {
    id: 'minimal_broadcast',
    name: 'Minimal Broadcast',
    desc: 'Crisp drop-shadow type without box',
    preset: {
      template: 'minimal_broadcast',
      primaryColor: '#FFFFFF',
      highlightColor: '#38BDF8',
      backgroundColor: '#000000',
      backgroundOpacity: 0,
    },
  },
  {
    id: 'clean_editorial',
    name: 'Clean Editorial',
    desc: 'High-contrast card pill for muted feeds',
    preset: {
      template: 'clean_editorial',
      primaryColor: '#F1F5F9',
      highlightColor: '#FBBF24',
      backgroundColor: '#020617',
      backgroundOpacity: 0.88,
    },
  },
];

const EXPORT_PRESETS = [
  { label: 'YouTube Shorts (9:16)', ratio: '9:16' as const },
  { label: 'Instagram Reels (9:16)', ratio: '9:16' as const },
  { label: 'TikTok Vertical (9:16)', ratio: '9:16' as const },
  { label: 'YouTube Landscape (16:9)', ratio: '16:9' as const },
  { label: 'LinkedIn / Feed Square (1:1)', ratio: '1:1' as const },
];

export function VideoStudioPage({
  clip,
  sourceDuration,
  onClipSaved,
  onBack,
}: VideoStudioPageProps) {
  const { firebaseUser, authFetch, updateDemoClipLocal } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [title, setTitle] = useState(clip.title);
  const [hookText, setHookText] = useState(clip.hookText || '');
  const [startTime, setStartTime] = useState(clip.startTime);
  const [endTime, setEndTime] = useState(clip.endTime);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>(
    (clip.aspectRatio as '9:16' | '16:9' | '1:1') || '9:16'
  );
  const [speakerFocusX, setSpeakerFocusX] = useState(clip.speakerFocusX ?? 0.5);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleConfig>(
    clip.captionStyle || DEFAULT_CAPTION_STYLE
  );
  const [captions, setCaptions] = useState<CaptionSegment[]>(
    clip.captionsJson || clip.captions || []
  );
  const [exportQuality, setExportQuality] = useState(clip.exportQuality || '1080p');
  const [selectedPlatform, setSelectedPlatform] = useState('YouTube Shorts (9:16)');

  const [activeTab, setActiveTab] = useState<'captions' | 'style' | 'export'>('captions');
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip.startTime);

  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadResult, setDownloadResult] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  const maxTimeline = Math.max(sourceDuration || 60, endTime + 1);
  const clipDuration = Math.max(2, Number((endTime - startTime).toFixed(2)));
  const videoSrc = clip.sourceVideoUrl || clip.previewVideoPath || clip.previewVideoUrl || '';

  useEffect(() => {
    setTitle(clip.title);
    setHookText(clip.hookText || '');
    setStartTime(clip.startTime);
    setEndTime(clip.endTime);
    setAspectRatio((clip.aspectRatio as '9:16' | '16:9' | '1:1') || '9:16');
    setSpeakerFocusX(clip.speakerFocusX ?? 0.5);
    setCaptionStyle(clip.captionStyle || DEFAULT_CAPTION_STYLE);
    setCaptions(clip.captionsJson || clip.captions || []);
    setCurrentTime(clip.startTime);
    setDownloadResult(null);
  }, [clip]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.currentTime < startTime || vid.currentTime > endTime) {
      vid.currentTime = startTime;
    }
  }, [startTime, endTime]);

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.currentTime >= endTime) {
      vid.currentTime = startTime;
      setCurrentTime(startTime);
    } else {
      setCurrentTime(vid.currentTime);
    }
  };

  const togglePlayback = async () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      if (vid.currentTime < startTime || vid.currentTime >= endTime) {
        vid.currentTime = startTime;
      }
      try {
        await vid.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (t: number) => {
    const clamped = Math.min(endTime, Math.max(startTime, t));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const activeCaptionSegment = useMemo(() => {
    return (
      captions.find((seg) => currentTime >= seg.start && currentTime <= seg.end) ||
      captions.find((seg) => currentTime < seg.start) ||
      captions[0] ||
      null
    );
  }, [captions, currentTime]);

  const handleSegmentTextChange = (segId: string, newText: string) => {
    setCaptions((prev) =>
      prev.map((seg) =>
        seg.id === segId
          ? {
              ...seg,
              text: newText,
              words: calculateWordTimings(newText, seg.start, seg.end),
            }
          : seg
      )
    );
  };

  const handleSaveChanges = async () => {
    setSaveNotice(null);
    const updatedPayload: Partial<ClipItem> = {
      title,
      hookText,
      startTime,
      endTime,
      duration: clipDuration,
      aspectRatio,
      speakerFocusX,
      captionStyle,
      captionsJson: captions,
      exportQuality,
    };

    if (!firebaseUser) {
      updateDemoClipLocal(clip.id, updatedPayload);
      onClipSaved({ ...clip, ...updatedPayload });
      setSaveNotice('Studio edits applied to session preview.');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload),
      });
      const data = (await res.json()) as { clip?: ClipItem; error?: string };
      if (!res.ok || !data.clip) {
        throw new Error(data.error || 'Could not save clip.');
      }
      onClipSaved(data.clip);
      setSaveNotice('Changes saved to PostgreSQL.');
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportMp4 = async () => {
    setExportError(null);
    setDownloadResult(null);
    setExporting(true);

    try {
      const endpoint = firebaseUser
        ? `/api/clips/${clip.id}/export`
        : `/api/demo/clips/${clip.id}/export`;
      const fetchFn = firebaseUser ? authFetch : fetch;

      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime,
          endTime,
          aspectRatio,
          quality: exportQuality,
          speakerFocusX,
          captions,
          captionStyle,
        }),
      });

      const data = (await res.json()) as {
        downloadUrl?: string;
        filename?: string;
        error?: string;
      };
      if (!res.ok || !data.downloadUrl) {
        throw new Error(data.error || 'FFmpeg export failed.');
      }

      setDownloadResult({
        url: data.downloadUrl,
        filename: data.filename || `clipgenius_${clip.id}.mp4`,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'MP4 rendering failed.');
    } finally {
      setExporting(false);
    }
  };

  const progressRatio = Math.min(
    1,
    Math.max(0, (currentTime - startTime) / Math.max(0.5, clipDuration))
  );

  const previewFrameClass =
    aspectRatio === '9:16'
      ? 'w-[270px] sm:w-[300px] aspect-[9/16]'
      : aspectRatio === '1:1'
        ? 'w-[340px] sm:w-[380px] aspect-square'
        : 'w-full max-w-[560px] aspect-video';

  return (
    <div className="mx-auto max-w-[1320px] space-y-6">
      {/* Studio Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="space-y-1 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Clip Results</span>
          </button>
          <h1 className="font-display text-xl font-bold text-white truncate">{title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#0B0F1A] p-0.5">
            {(['9:16', '16:9', '1:1'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`rounded-md px-3 py-1.5 text-xs font-mono font-medium cursor-pointer ${
                  aspectRatio === ratio
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveChanges}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.09] cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving...' : 'Save Edits'}</span>
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportMp4}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{exporting ? 'Rendering MP4...' : 'Export MP4'}</span>
          </button>
        </div>
      </div>

      {saveNotice && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs text-blue-100">
          {saveNotice}
        </div>
      )}

      {exportError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200"
        >
          {exportError}
        </div>
      )}

      {downloadResult && (
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm text-emerald-200">
            <Check className="h-4 w-4 text-emerald-400" />
            <span>
              MP4 rendered with burned-in captions ({aspectRatio} · {exportQuality}).
            </span>
          </div>
          <a
            href={downloadResult.url}
            download={downloadResult.filename}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download {downloadResult.filename}</span>
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Video Canvas + Interactive Timeline */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] p-5 sm:p-6 flex flex-col items-center justify-center">
            <div
              className={`relative overflow-hidden rounded-xl border border-white/15 bg-black ${previewFrameClass}`}
            >
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  poster={
                    videoSrc.includes('podcast')
                      ? '/src/assets/images/creator_podcast_thumb_1795270019943.jpg'
                      : '/src/assets/images/creator_tech_keynote_1795270018985.jpg'
                  }
                  preload="auto"
                  muted={muted}
                  playsInline
                  onLoadedData={(e) => {
                    const el = e.currentTarget;
                    if (el.currentTime < startTime) {
                      el.currentTime = startTime + 0.1;
                    }
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: `${Math.round(speakerFocusX * 100)}% center` }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                  Source video unavailable
                </div>
              )}

              {/* Optional Opening Hook Banner */}
              {captionStyle.showHookTitle && hookText && currentTime - startTime <= 4.0 && (
                <div className="pointer-events-none absolute inset-x-4 top-6 text-center">
                  <span className="inline-block rounded-lg bg-black/80 border border-white/15 px-3 py-1.5 font-display text-xs font-bold text-white">
                    {hookText}
                  </span>
                </div>
              )}

              {/* Live Synchronized Animated Captions Overlay */}
              {activeCaptionSegment && (
                <div
                  className={`pointer-events-none absolute inset-x-4 flex justify-center ${
                    captionStyle.position === 'top'
                      ? 'top-8'
                      : captionStyle.position === 'center'
                        ? 'top-1/2 -translate-y-1/2'
                        : 'bottom-8'
                  }`}
                >
                  <div
                    className="max-w-full rounded-lg px-3 py-1.5 text-center leading-snug font-display font-bold transition-all"
                    style={{
                      fontSize: `${Math.max(14, Math.round(captionStyle.fontSize * 0.65))}px`,
                      backgroundColor: `rgba(${parseInt(
                        captionStyle.backgroundColor.slice(1, 3) || '09',
                        16
                      )}, ${parseInt(
                        captionStyle.backgroundColor.slice(3, 5) || '0D',
                        16
                      )}, ${parseInt(
                        captionStyle.backgroundColor.slice(5, 7) || '16',
                        16
                      )}, ${captionStyle.backgroundOpacity})`,
                      textShadow:
                        captionStyle.backgroundOpacity < 0.2
                          ? '0 2px 8px rgba(0,0,0,0.95)'
                          : 'none',
                    }}
                  >
                    {activeCaptionSegment.words && activeCaptionSegment.words.length > 0 ? (
                      <span className="inline-flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
                        {activeCaptionSegment.words.map((w, wIdx) => {
                          const isWordActive =
                            currentTime >= w.start && currentTime <= w.end;
                          const isHighlighted = isWordActive || w.emphasis;
                          return (
                            <span
                              key={`${w.word}-${wIdx}`}
                              className="inline-block transition-transform duration-100"
                              style={{
                                color: isHighlighted
                                  ? captionStyle.highlightColor
                                  : captionStyle.primaryColor,
                                transform:
                                  isWordActive && captionStyle.template === 'kinetic_pop'
                                    ? 'scale(1.08)'
                                    : 'scale(1)',
                              }}
                            >
                              {w.word}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span style={{ color: captionStyle.primaryColor }}>
                        {activeCaptionSegment.text}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Optional Progress Bar */}
              {captionStyle.showProgressBar && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-white/15">
                  <div
                    className="h-full bg-blue-400 transition-all duration-100"
                    style={{ width: `${Math.round(progressRatio * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Playback Bar */}
            <div className="mt-5 w-full flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                  onClick={togglePlayback}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                  onClick={() => setMuted((m) => !m)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>

              <div className="font-mono text-xs text-slate-300 tabular-nums">
                {formatTimecode(currentTime)} / {formatTimecode(endTime)} · Clip{' '}
                {clipDuration.toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Interactive Timeline & Trim Panel */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-white">
                Clip Timeline & Trim
              </h2>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {formatTimecode(startTime)} – {formatTimecode(endTime)}
              </span>
            </div>

            {/* Seek Scrubber */}
            <div className="space-y-2">
              <label htmlFor="timeline-seek" className="sr-only">
                Clip playhead position
              </label>
              <input
                id="timeline-seek"
                type="range"
                min={startTime}
                max={endTime}
                step={0.1}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />

              {/* Caption Segment Markers */}
              <div className="flex flex-wrap gap-1.5">
                {captions.map((seg, i) => (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => seekTo(seg.start)}
                    className={`rounded border px-2 py-1 text-[11px] font-mono tabular-nums cursor-pointer ${
                      activeCaptionSegment?.id === seg.id
                        ? 'border-indigo-500/50 bg-indigo-500/20 text-white'
                        : 'border-white/10 bg-[#07090F] text-slate-400 hover:text-white'
                    }`}
                  >
                    #{i + 1} {formatTimecode(seg.start)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
              <div className="space-y-1">
                <label htmlFor="trim-start" className="block text-xs text-slate-400">
                  Start Time (sec)
                </label>
                <input
                  id="trim-start"
                  type="number"
                  min={0}
                  max={Math.max(0, endTime - 2)}
                  step={0.5}
                  value={startTime}
                  onChange={(e) =>
                    setStartTime(
                      Math.min(endTime - 2, Math.max(0, Number(e.target.value) || 0))
                    )
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 font-mono text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="trim-end" className="block text-xs text-slate-400">
                  End Time (sec)
                </label>
                <input
                  id="trim-end"
                  type="number"
                  min={startTime + 2}
                  max={maxTimeline}
                  step={0.5}
                  value={endTime}
                  onChange={(e) =>
                    setEndTime(
                      Math.min(maxTimeline, Math.max(startTime + 2, Number(e.target.value) || 15))
                    )
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 font-mono text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Inspector Tabs (Captions / Style / Export) */}
        <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0B0F1A] overflow-hidden">
          <div className="grid grid-cols-3 border-b border-white/[0.08] bg-[#07090F]">
            {[
              { id: 'captions' as const, label: 'Captions', icon: <TypeIcon className="h-3.5 w-3.5" /> },
              { id: 'style' as const, label: 'Style', icon: <Palette className="h-3.5 w-3.5" /> },
              { id: 'export' as const, label: 'Export', icon: <Sliders className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-b-2 border-indigo-500 bg-[#0B0F1A] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-6 space-y-5 max-h-[680px] overflow-y-auto">
            {activeTab === 'captions' && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="studio-clip-title" className="block text-xs font-medium text-slate-300">
                    Clip Title
                  </label>
                  <input
                    id="studio-clip-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="studio-hook-text" className="block text-xs font-medium text-slate-300">
                    Opening Hook Overlay
                  </label>
                  <input
                    id="studio-hook-text"
                    type="text"
                    value={hookText}
                    onChange={(e) => setHookText(e.target.value)}
                    placeholder="Optional 4-8 word opening hook"
                    className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                  <p className="text-xs font-medium text-slate-300">
                    Edit Synchronized Caption Words
                  </p>
                  {captions.map((seg, idx) => (
                    <div
                      key={seg.id}
                      className="rounded-xl border border-white/[0.07] bg-[#07090F] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                        <button
                          type="button"
                          onClick={() => seekTo(seg.start)}
                          className="hover:text-indigo-400 cursor-pointer"
                        >
                          Segment {idx + 1} · {formatTimecode(seg.start)} – {formatTimecode(seg.end)}
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        aria-label={`Edit caption segment ${idx + 1}`}
                        value={seg.text}
                        onChange={(e) => handleSegmentTextChange(seg.id, e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0B0F1A] px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'style' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">Caption Template</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {CAPTION_TEMPLATES.map((tpl) => {
                      const active = captionStyle.template === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() =>
                            setCaptionStyle((prev) => ({
                              ...prev,
                              ...tpl.preset,
                            }))
                          }
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-indigo-500 bg-indigo-500/15'
                              : 'border-white/10 bg-[#07090F] hover:border-white/25'
                          }`}
                        >
                          <p className="text-xs font-semibold text-white">{tpl.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{tpl.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="font-size-range" className="text-slate-300">
                      Font Size
                    </label>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {captionStyle.fontSize}px
                    </span>
                  </div>
                  <input
                    id="font-size-range"
                    type="range"
                    min={18}
                    max={44}
                    value={captionStyle.fontSize}
                    onChange={(e) =>
                      setCaptionStyle((prev) => ({
                        ...prev,
                        fontSize: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="primary-color" className="block text-xs text-slate-300">
                      Text Color
                    </label>
                    <input
                      id="primary-color"
                      type="color"
                      value={captionStyle.primaryColor}
                      onChange={(e) =>
                        setCaptionStyle((prev) => ({
                          ...prev,
                          primaryColor: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded border border-white/10 bg-[#07090F] p-1 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="highlight-color" className="block text-xs text-slate-300">
                      Keyword Highlight
                    </label>
                    <input
                      id="highlight-color"
                      type="color"
                      value={captionStyle.highlightColor}
                      onChange={(e) =>
                        setCaptionStyle((prev) => ({
                          ...prev,
                          highlightColor: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded border border-white/10 bg-[#07090F] p-1 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="bg-opacity-range" className="text-slate-300">
                      Caption Box Opacity
                    </label>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {Math.round(captionStyle.backgroundOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    id="bg-opacity-range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={captionStyle.backgroundOpacity}
                    onChange={(e) =>
                      setCaptionStyle((prev) => ({
                        ...prev,
                        backgroundOpacity: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">Caption Position</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['top', 'center', 'bottom'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() =>
                          setCaptionStyle((prev) => ({ ...prev, position: pos }))
                        }
                        className={`rounded-lg border py-2 text-xs font-medium capitalize cursor-pointer ${
                          captionStyle.position === pos
                            ? 'border-indigo-500 bg-indigo-500/15 text-white'
                            : 'border-white/10 bg-[#07090F] text-slate-400 hover:text-white'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="speaker-focus-range" className="text-slate-300">
                      Smart Crop Horizontal Speaker Focus
                    </label>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {Math.round(speakerFocusX * 100)}%
                    </span>
                  </div>
                  <input
                    id="speaker-focus-range"
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.02}
                    value={speakerFocusX}
                    onChange={(e) => setSpeakerFocusX(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="space-y-2.5 pt-2 border-t border-white/[0.08] text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captionStyle.showProgressBar}
                      onChange={(e) =>
                        setCaptionStyle((prev) => ({
                          ...prev,
                          showProgressBar: e.target.checked,
                        }))
                      }
                      className="rounded border-white/20 bg-[#07090F] text-indigo-600"
                    />
                    <span>Show bottom playback progress bar</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={captionStyle.showHookTitle}
                      onChange={(e) =>
                        setCaptionStyle((prev) => ({
                          ...prev,
                          showHookTitle: e.target.checked,
                        }))
                      }
                      className="rounded border-white/20 bg-[#07090F] text-indigo-600"
                    />
                    <span>Display opening hook title overlay (first 4s)</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">Target Platform Preset</p>
                  <div className="space-y-2">
                    {EXPORT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setSelectedPlatform(preset.label);
                          setAspectRatio(preset.ratio);
                        }}
                        className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium cursor-pointer ${
                          selectedPlatform === preset.label
                            ? 'border-indigo-500 bg-indigo-500/15 text-white'
                            : 'border-white/10 bg-[#07090F] text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="font-mono text-slate-400">{preset.ratio}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="export-quality" className="block text-xs font-medium text-slate-300">
                    MP4 Resolution & Quality
                  </label>
                  <select
                    id="export-quality"
                    value={exportQuality}
                    onChange={(e) => setExportQuality(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="720p">720p HD (Fast Render)</option>
                    <option value="1080p">1080p Full HD (Recommended)</option>
                    <option value="4k">4K Ultra HD (High Bitrate)</option>
                  </select>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#07090F] p-4 text-xs text-slate-400 space-y-1">
                  <p className="text-slate-200 font-medium">Render Output Summary</p>
                  <p className="tabular-nums">
                    Format: MP4 (H.264 / AAC) · {aspectRatio} · {exportQuality} ·{' '}
                    {clipDuration.toFixed(1)}s
                  </p>
                  <p>
                    Includes smart speaker crop, burned-in {captionStyle.template.replace('_', ' ')} captions
                    {captionStyle.showProgressBar ? ', and progress bar' : ''}.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={exporting}
                  onClick={handleExportMp4}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>{exporting ? 'Rendering MP4 via FFmpeg...' : 'Render & Download MP4'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
