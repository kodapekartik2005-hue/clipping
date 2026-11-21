import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { JobRecord, ProjectItem } from '../types/app.ts';

interface ProcessingPageProps {
  projectId: number;
  onCompleted: (project: ProjectItem) => void;
  onBackToDashboard: () => void;
}

const PIPELINE_STAGES = [
  { key: 'ingesting', label: '01. Media Ingestion & Probe', minPct: 10 },
  { key: 'transcribing', label: '02. Audio Extraction & Speech-to-Text', minPct: 35 },
  { key: 'analyzing', label: '03. AI Transcript & Highlight Selection', minPct: 56 },
  { key: 'rendering', label: '04. FFmpeg 9:16 Cut & Animated Subtitles', minPct: 72 },
];

export function ProcessingPage({
  projectId,
  onCompleted,
  onBackToDashboard,
}: ProcessingPageProps) {
  const { authFetch } = useAuth();
  const [project, setProject] = useState<ProjectItem | null>(null);
  const [latestJob, setLatestJob] = useState<JobRecord | null>(null);
  const [eventsUrl, setEventsUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const res = await authFetch(`/api/projects/${projectId}`);
    if (!res.ok) {
      throw new Error('Could not load project processing status.');
    }
    const data = (await res.json()) as {
      project: ProjectItem;
      latestJob: JobRecord | null;
      eventsStreamUrl?: string | null;
    };
    setProject(data.project);
    setLatestJob(data.latestJob);
    if (data.eventsStreamUrl) setEventsUrl(data.eventsStreamUrl);
    setFetchError(null);
    return data.project;
  }, [projectId, authFetch]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const proj = await loadSnapshot();
        if (!active) return;
        if (proj.status !== 'completed' && proj.status !== 'failed') {
          timer = setTimeout(poll, 2200);
        }
      } catch (err) {
        if (!active) return;
        setFetchError(err instanceof Error ? err.message : 'Status polling error.');
      }
    };

    poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [loadSnapshot]);

  // Subscribe to Server-Sent Events for real-time stage updates
  useEffect(() => {
    if (!eventsUrl) return;
    if (project?.status === 'completed' || project?.status === 'failed') return;

    const es = new EventSource(eventsUrl);
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data) as {
          status: string;
          progress: number;
          stageMessage: string;
          errorMessage?: string | null;
          logLine?: string;
        };
        setProject((prev) =>
          prev
            ? {
                ...prev,
                status: payload.status,
                progress: payload.progress,
                stageMessage: payload.stageMessage,
                errorMessage: payload.errorMessage ?? prev.errorMessage,
              }
            : prev
        );
        if (payload.logLine) {
          setLatestJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: payload.status,
                  progress: payload.progress,
                  logsJson: prev.logsJson.includes(payload.logLine!)
                    ? prev.logsJson
                    : [...prev.logsJson, payload.logLine!],
                }
              : prev
          );
        }
        if (payload.status === 'completed' || payload.status === 'failed') {
          loadSnapshot().catch(() => {});
          es.close();
        }
      } catch {
        // Ignore malformed SSE frames
      }
    };

    return () => {
      es.close();
    };
  }, [eventsUrl, project?.status, loadSnapshot]);

  const handleRetry = async () => {
    setRetrying(true);
    setFetchError(null);
    try {
      const res = await authFetch(`/api/projects/${projectId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        project?: ProjectItem;
        job?: JobRecord;
        error?: string;
      };
      if (!res.ok || !data.project) {
        throw new Error(data.error || 'Failed to retry processing job.');
      }
      setProject(data.project);
      if (data.job) setLatestJob(data.job);
      await loadSnapshot();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unable to retry processing.');
    } finally {
      setRetrying(false);
    }
  };

  const isFailed = project?.status === 'failed';
  const isDone = project?.status === 'completed';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={onBackToDashboard}
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Dashboard</span>
      </button>

      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0F1A] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
              {project?.title || 'AI Video Processing Pipeline'}
            </h1>
            <p className="text-sm text-slate-400">
              {project?.stageMessage || 'Connecting to background processing queue...'}
            </p>
          </div>
          <div className="font-mono text-2xl font-bold text-indigo-400 tabular-nums shrink-0">
            {project?.progress ?? 0}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={`h-full transition-all duration-500 ${
              isFailed
                ? 'bg-red-500'
                : isDone
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500'
            }`}
            style={{ width: `${Math.max(4, project?.progress ?? 5)}%` }}
          />
        </div>

        {/* Error Message + Retry Action */}
        {(isFailed || fetchError) && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/35 bg-red-500/10 p-5 space-y-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-200">
                  Video Processing Stopped
                </p>
                <p className="text-xs text-red-200/85 leading-relaxed">
                  {project?.errorMessage || fetchError}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {isFailed && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{retrying ? 'Re-queuing...' : 'Retry Processing'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onBackToDashboard}
                className="rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.12] cursor-pointer"
              >
                Upload Video File Instead
              </button>
            </div>
          </div>
        )}

        {/* Stage Checklist */}
        <div className="space-y-3 pt-2">
          {PIPELINE_STAGES.map((stage) => {
            const pct = project?.progress ?? 0;
            const completedStage = isDone || pct > stage.minPct + 18;
            const currentStage = !isDone && !isFailed && pct >= stage.minPct && !completedStage;

            return (
              <div
                key={stage.key}
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#07090F] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {completedStage ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : currentStage ? (
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      completedStage || currentStage ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                <span className="text-xs text-slate-400 tabular-nums">
                  {completedStage ? 'Complete' : currentStage ? 'Running' : 'Pending'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Worker Logs */}
        {latestJob && latestJob.logsJson && latestJob.logsJson.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-[#07090F] p-4 space-y-2">
            <p className="text-xs font-medium text-slate-400">Queue Activity Log</p>
            <div className="font-mono text-xs text-slate-300 space-y-1 max-h-40 overflow-y-auto">
              {latestJob.logsJson.map((line, i) => (
                <p key={i} className="leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {isDone && project && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => onCompleted(project)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 cursor-pointer"
            >
              <span>View Generated Clips</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
