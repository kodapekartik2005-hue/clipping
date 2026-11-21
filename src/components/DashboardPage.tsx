import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Film,
  Link2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { ProjectItem } from '../types/app.ts';
import { formatDurationCompact, parseYouTubeUrl } from '../utils/clipLogic.ts';

interface ServerCapabilities {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  activeDefaultEngine: 'openai' | 'gemini' | 'none';
}

interface DashboardPageProps {
  projects: ProjectItem[];
  loadingProjects: boolean;
  onProjectCreated: (projectId: number) => void;
  onOpenProject: (project: ProjectItem) => void;
  onDeleteProject: (projectId: number) => Promise<void>;
  onRequireAuth: () => void;
}

export function DashboardPage({
  projects,
  loadingProjects,
  onProjectCreated,
  onOpenProject,
  onDeleteProject,
  onRequireAuth,
}: DashboardPageProps) {
  const { profile, firebaseUser, isDemoMode, authFetch } = useAuth();
  const [intakeTab, setIntakeTab] = useState<'youtube' | 'upload' | 'sample'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [targetDuration, setTargetDuration] = useState('30-60');
  const [outputFormat, setOutputFormat] = useState(profile?.defaultAspectRatio || '9:16');
  const [language, setLanguage] = useState(profile?.defaultLanguage || 'auto');
  const [removeSilences, setRemoveSilences] = useState(true);
  const [smartCrop, setSmartCrop] = useState(true);
  const [authorizedRights, setAuthorizedRights] = useState(false);
  const [aiEngine, setAiEngine] = useState<'auto' | 'openai' | 'gemini'>('auto');
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const intakeSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerCapabilities | null) => {
        if (data) setCapabilities(data);
      })
      .catch(() => {});
  }, []);

  const metrics = useMemo(() => {
    const totalVideos = projects.length;
    const totalClips = projects.reduce(
      (sum, p) => sum + (p.clipCount ?? p.clips?.length ?? 0),
      0
    );
    const activeJobs = projects.filter(
      (p) => p.status !== 'completed' && p.status !== 'failed'
    ).length;
    const avgDuration =
      projects.length > 0
        ? Math.round(
            projects.reduce((s, p) => s + (p.durationSeconds || 0), 0) / projects.length
          )
        : 0;
    return { totalVideos, totalClips, activeJobs, avgDuration };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && p.status === 'completed') ||
        (statusFilter === 'active' &&
          p.status !== 'completed' &&
          p.status !== 'failed');
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const handleYouTubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = parseYouTubeUrl(youtubeUrl);
    if (!parsed.valid) {
      setFormError(parsed.error || 'Please enter a valid YouTube URL.');
      return;
    }
    if (!authorizedRights) {
      setFormError(
        'Please confirm that you own or have explicit permission to process this video source.'
      );
      return;
    }

    if (!firebaseUser) {
      setFormError(
        'Sign in with Google to run background cloud ingestion on external YouTube URLs, or preview an instant Studio Sample below.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/projects/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl,
          targetClipDuration: targetDuration,
          outputFormat,
          language,
          removeSilences,
          smartCrop,
          authorizedRights,
          aiEngine,
        }),
      });
      const data = (await res.json()) as { project?: ProjectItem; error?: string };
      if (!res.ok || !data.project) {
        setFormError(data.error || 'Failed to queue YouTube video.');
        return;
      }
      setYoutubeUrl('');
      onProjectCreated(data.project.id);
    } catch {
      setFormError('Network error while starting YouTube job.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedFile) {
      setFormError('Please choose an MP4, MOV, or WebM video file to upload.');
      return;
    }
    if (!authorizedRights) {
      setFormError(
        'Please confirm that you own or have explicit permission to process this video file.'
      );
      return;
    }

    if (!firebaseUser) {
      setFormError(
        'Sign in with Google to upload custom video files to your cloud workspace.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('video', selectedFile);
      if (projectTitle.trim()) fd.append('title', projectTitle.trim());
      fd.append('targetClipDuration', targetDuration);
      fd.append('outputFormat', outputFormat);
      fd.append('language', language);
      fd.append('removeSilences', String(removeSilences));
      fd.append('smartCrop', String(smartCrop));
      fd.append('authorizedRights', String(authorizedRights));
      fd.append('aiEngine', aiEngine);

      const res = await authFetch('/api/projects/upload', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as { project?: ProjectItem; error?: string };
      if (!res.ok || !data.project) {
        setFormError(data.error || 'Failed to upload video.');
        return;
      }
      setSelectedFile(null);
      setProjectTitle('');
      onProjectCreated(data.project.id);
    } catch {
      setFormError('Network error while uploading video.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunSample = async (sampleId: string) => {
    setFormError(null);
    if (!firebaseUser) {
      const existingDemo = projects.find((p) =>
        sampleId === 'sample-podcast'
          ? p.title.toLowerCase().includes('podcast')
          : p.title.toLowerCase().includes('keynote')
      );
      if (existingDemo) {
        onOpenProject(existingDemo);
      } else if (projects[0]) {
        onOpenProject(projects[0]);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/projects/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId,
          targetClipDuration: targetDuration,
          outputFormat,
          language: 'en',
          aiEngine,
        }),
      });
      const data = (await res.json()) as { project?: ProjectItem; error?: string };
      if (!res.ok || !data.project) {
        setFormError(data.error || 'Failed to launch sample processing.');
        return;
      }
      onProjectCreated(data.project.id);
    } catch {
      setFormError('Failed to start AI sample pipeline.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Creator Workspace
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload long-form footage or paste a YouTube link to generate captioned 9:16 shorts.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            intakeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Clips</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Videos Processed', value: String(metrics.totalVideos) },
          { label: 'Clips Generated', value: String(metrics.totalClips) },
          {
            label: 'Processing Status',
            value: metrics.activeJobs > 0 ? `${metrics.activeJobs} Active` : 'Idle',
          },
          {
            label: 'Credits Remaining',
            value: `${profile?.creditsMinutes ?? 60} min`,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] px-5 py-4"
          >
            <p className="text-xs text-slate-400">{stat.label}</p>
            <p className="font-display text-2xl font-bold text-white mt-1 tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Create New Clips Intake Panel */}
      <section
        ref={intakeSectionRef}
        className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] p-6 sm:p-7 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              New AI Clipping Job
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose a video source, target clip length, and output aspect ratio.
            </p>
          </div>

          <div className="flex flex-wrap sm:inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#07090F] p-1 w-full sm:w-auto self-start">
            <button
              type="button"
              onClick={() => {
                setIntakeTab('youtube');
                setFormError(null);
              }}
              className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                intakeTab === 'youtube'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span>YouTube URL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIntakeTab('upload');
                setFormError(null);
              }}
              className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                intakeTab === 'upload'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>Upload Video</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIntakeTab('sample');
                setFormError(null);
              }}
              className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                intakeTab === 'sample'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Studio Samples</span>
            </button>
          </div>
        </div>

        {/* Shared AI Optimization Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="clip-duration" className="block text-xs font-medium text-slate-300">
              Clip Duration Range
            </label>
            <select
              id="clip-duration"
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="15-30">15–30 seconds (Punchy Hooks)</option>
              <option value="30-60">30–60 seconds (Story Arcs)</option>
              <option value="auto">Auto (15–60s sentence-matched)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="output-format" className="block text-xs font-medium text-slate-300">
              Output Format
            </label>
            <select
              id="output-format"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="9:16">9:16 Vertical (Shorts / Reels / TikTok)</option>
              <option value="16:9">16:9 Landscape (YouTube)</option>
              <option value="1:1">1:1 Square (LinkedIn / Feed)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="caption-lang" className="block text-xs font-medium text-slate-300">
              Caption Language
            </label>
            <select
              id="caption-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="auto">Auto-detect spoken language</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="hi">Hindi</option>
              <option value="ja">Japanese</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-engine" className="block text-xs font-medium text-slate-300">
              AI Analysis Engine
            </label>
            <select
              id="ai-engine"
              value={aiEngine}
              onChange={(e) => setAiEngine(e.target.value as 'auto' | 'openai' | 'gemini')}
              className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="auto">
                Auto ({capabilities?.activeDefaultEngine === 'openai' ? 'OpenAI Active' : capabilities?.geminiConfigured ? 'Gemini AI Active' : 'Server Key'})
              </option>
              <option value="openai">
                OpenAI Whisper + GPT-4o-mini {capabilities?.openaiConfigured ? '(Ready)' : '(Needs OPENAI_API_KEY)'}
              </option>
              <option value="gemini">
                Gemini 3.5 + 4 Hydrogen {capabilities?.geminiConfigured ? '(Ready)' : '(Needs GEMINI_API_KEY)'}
              </option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smartCrop}
              onChange={(e) => setSmartCrop(e.target.checked)}
              className="rounded border-white/20 bg-[#07090F] text-indigo-600 focus:ring-indigo-500"
            />
            <span>Active speaker detection & smart framing</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={removeSilences}
              onChange={(e) => setRemoveSilences(e.target.checked)}
              className="rounded border-white/20 bg-[#07090F] text-indigo-600 focus:ring-indigo-500"
            />
            <span>Trim unnecessary silent pauses</span>
          </label>
          {intakeTab !== 'sample' && (
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200">
              <input
                type="checkbox"
                checked={authorizedRights}
                onChange={(e) => setAuthorizedRights(e.target.checked)}
                className="rounded border-white/20 bg-[#07090F] text-indigo-600 focus:ring-indigo-500"
              />
              <span>I own or am authorized to process this video source</span>
            </label>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200 flex flex-wrap items-center justify-between gap-3"
          >
            <span>{formError}</span>
            {isDemoMode && !firebaseUser && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="underline font-semibold text-white hover:text-indigo-200 cursor-pointer"
              >
                Sign In with Google
              </button>
            )}
          </div>
        )}

        {intakeTab === 'youtube' && (
          <form onSubmit={handleYouTubeSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="youtube-url-input" className="sr-only">
                YouTube Video URL
              </label>
              <input
                id="youtube-url-input"
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg border border-white/15 bg-[#07090F] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{submitting ? 'Queuing...' : 'Generate Clips'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {intakeTab === 'upload' && (
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="upload-title" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Project Title (Optional)
                </label>
                <input
                  id="upload-title"
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g., Founder Interview Episode 14"
                  className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="video-file-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Video File (MP4, MOV, WebM up to 250MB)
                </label>
                <input
                  ref={fileInputRef}
                  id="video-file-input"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.mkv"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-white/10 bg-[#07090F] px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-200 hover:file:bg-indigo-600/30"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-slate-400">
                {selectedFile
                  ? `Selected: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)`
                  : 'Only upload footage you own or have permission to clip.'}
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                <span>{submitting ? 'Uploading...' : 'Upload & Clip'}</span>
              </button>
            </div>
          </form>
        )}

        {intakeTab === 'sample' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                id: 'sample-keynote',
                title: 'Product Launch Keynote: Scaling AI Video Workflows',
                meta: '0:48 · 16:9 Source · 3 Highlights',
                img: '/src/assets/images/creator_tech_keynote_1795270018985.jpg',
              },
              {
                id: 'sample-podcast',
                title: 'Studio Founders Podcast: Distribution Beats Production',
                meta: '0:52 · Dual Speaker · 3 Highlights',
                img: '/src/assets/images/creator_podcast_thumb_1795270019943.jpg',
              },
            ].map((sample) => (
              <div
                key={sample.id}
                className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-[#07090F] p-3.5"
              >
                <img
                  src={sample.img}
                  alt={sample.title}
                  referrerPolicy="no-referrer"
                  className="h-20 w-28 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-white line-clamp-2">{sample.title}</p>
                  <p className="text-xs text-slate-400 tabular-nums">{sample.meta}</p>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRunSample(sample.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                  >
                    <span>
                      {firebaseUser
                        ? submitting
                          ? 'Starting AI Pipeline...'
                          : 'Run Real AI Pipeline'
                        : 'Open Generated Clips'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Projects List */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-white">Recent Projects</h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="rounded-lg border border-white/10 bg-[#0B0F1A] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#0B0F1A] p-0.5">
              {(['all', 'completed', 'active'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadingProjects ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-20 rounded-xl border border-white/[0.06] bg-[#0B0F1A] animate-pulse"
              />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] p-10 text-center space-y-3">
            <Film className="h-8 w-8 text-slate-500 mx-auto" />
            <p className="text-sm font-medium text-white">No video projects found</p>
            <p className="text-xs text-slate-400">
              Upload a video, paste a YouTube link, or launch a Studio Sample above to generate your first clips.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-[#0B0F1A] overflow-hidden">
            {filteredProjects.map((proj) => {
              const clipTotal = proj.clipCount ?? proj.clips?.length ?? 0;
              return (
                <div
                  key={proj.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenProject(proj)}
                        className="font-display text-sm font-semibold text-white hover:text-blue-400 text-left truncate cursor-pointer"
                      >
                        {proj.title}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 tabular-nums">
                      {proj.sourceType.toUpperCase()} · {formatDurationCompact(proj.durationSeconds)} ·{' '}
                      {proj.outputFormat} · {clipTotal} clips ·{' '}
                      <span
                        className={
                          proj.status === 'completed'
                            ? 'text-emerald-400'
                            : proj.status === 'failed'
                              ? 'text-red-400'
                              : 'text-blue-400'
                        }
                      >
                        {proj.status === 'completed'
                          ? 'Completed'
                          : proj.status === 'failed'
                            ? 'Failed'
                            : `${proj.progress}% ${proj.status}`}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.09] whitespace-nowrap cursor-pointer"
                    >
                      <span>
                        {proj.status === 'completed' ? 'View Clips' : 'Inspect Progress'}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    {firebaseUser && (
                      <button
                        type="button"
                        aria-label={`Delete project ${proj.title}`}
                        onClick={() => onDeleteProject(proj.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
