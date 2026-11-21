import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { JobRecord, ProjectItem } from '../types/app.ts';
import { formatDurationCompact } from '../utils/clipLogic.ts';

interface AdminOverviewData {
  metrics: {
    totalUsers: number;
    totalProjects: number;
    totalClips: number;
    activeJobs: number;
  };
  recentJobs: JobRecord[];
  recentProjects: ProjectItem[];
}

export function AdminPage() {
  const { firebaseUser, isDemoMode, demoProjects, authFetch } = useAuth();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = async () => {
    setLoading(true);
    setError(null);
    if (!firebaseUser) {
      // Demo mode preview data derived from live demo workspace
      const totalClips = demoProjects.reduce((s, p) => s + (p.clips?.length || 0), 0);
      setData({
        metrics: {
          totalUsers: 1,
          totalProjects: demoProjects.length,
          totalClips,
          activeJobs: 0,
        },
        recentJobs: demoProjects.map((p, idx) => ({
          id: 500 + idx,
          projectId: p.id,
          jobType: 'auto_clip',
          status: p.status,
          progress: p.progress,
          logsJson: [
            `Probed ${p.width}x${p.height} (${p.durationSeconds}s)`,
            `Generated ${p.clips?.length || 0} smart-cropped clips`,
          ],
          createdAt: p.createdAt,
          completedAt: p.createdAt,
        })),
        recentProjects: demoProjects,
      });
      setLoading(false);
      return;
    }

    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Failed to load admin telemetry.');
      const json = (await res.json()) as AdminOverviewData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch admin overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, demoProjects.length]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Admin & Processing Queue
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor active video clipping workers, PostgreSQL project volume, and FFmpeg job logs.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAdmin}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0B0F1A] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.06] cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {isDemoMode && !firebaseUser && (
        <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-xs text-indigo-200">
          Viewing demo workspace queue summary. Sign in with Google to inspect live PostgreSQL platform records.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-24 rounded-xl border border-white/[0.06] bg-[#0B0F1A] animate-pulse"
            />
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Accounts', value: data.metrics.totalUsers },
                { label: 'Total Projects', value: data.metrics.totalProjects },
                { label: 'Generated Clips', value: data.metrics.totalClips },
                { label: 'Active Queue Jobs', value: data.metrics.activeJobs },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] px-5 py-4"
                >
                  <p className="text-xs text-slate-400">{m.label}</p>
                  <p className="font-display text-2xl font-bold text-white mt-1 tabular-nums">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] overflow-hidden">
              <div className="border-b border-white/[0.08] px-5 py-4">
                <h2 className="font-display text-base font-semibold text-white">
                  Background Processing Queue
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Job ID</th>
                      <th className="px-5 py-3 font-medium">Project</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium text-right">Progress</th>
                      <th className="px-5 py-3 font-medium">Latest Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-slate-300">
                    {data.recentJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-mono tabular-nums">#{job.id}</td>
                        <td className="px-5 py-3 font-mono tabular-nums">#{job.projectId}</td>
                        <td className="px-5 py-3">{job.jobType}</td>
                        <td className="px-5 py-3 capitalize">{job.status}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {job.progress}%
                        </td>
                        <td className="px-5 py-3 max-w-xs truncate text-slate-400">
                          {job.logsJson?.[job.logsJson.length - 1] || '—'}
                        </td>
                      </tr>
                    ))}
                    {data.recentJobs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          No background jobs recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0B0F1A] overflow-hidden">
              <div className="border-b border-white/[0.08] px-5 py-4">
                <h2 className="font-display text-base font-semibold text-white">
                  Recent Video Projects
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Title</th>
                      <th className="px-5 py-3 font-medium">Source</th>
                      <th className="px-5 py-3 font-medium">Format</th>
                      <th className="px-5 py-3 font-medium text-right">Duration</th>
                      <th className="px-5 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-slate-300">
                    {data.recentProjects.map((proj) => (
                      <tr key={proj.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 font-medium text-white max-w-xs truncate">
                          {proj.title}
                        </td>
                        <td className="px-5 py-3 uppercase">{proj.sourceType}</td>
                        <td className="px-5 py-3 font-mono">{proj.outputFormat}</td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums">
                          {formatDurationCompact(proj.durationSeconds)}
                        </td>
                        <td className="px-5 py-3 text-right capitalize">{proj.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
