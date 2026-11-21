import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { PublicTopBar, WorkspaceShell } from './components/TopNav.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { AuthPage } from './components/AuthPage.tsx';
import { DashboardPage } from './components/DashboardPage.tsx';
import { ProcessingPage } from './components/ProcessingPage.tsx';
import { ClipResultsPage } from './components/ClipResultsPage.tsx';
import { VideoStudioPage } from './components/VideoStudioPage.tsx';
import { PricingPage } from './components/PricingPage.tsx';
import { SettingsPage } from './components/SettingsPage.tsx';
import { AdminPage } from './components/AdminPage.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { syncProjectMirrorToFirestore } from './lib/firestore.ts';
import type { ClipItem, PageRoute, ProjectItem } from './types/app.ts';

function ClipGeniusAppContent() {
  const {
    firebaseUser,
    profile,
    isDemoMode,
    loadingAuth,
    authError,
    demoProjects,
    loadingDemo,
    signInWithGoogle,
    enterDemoMode,
    signOut,
    authFetch,
  } = useAuth();

  const [route, setRoute] = useState<PageRoute>('landing');
  const [userProjects, setUserProjects] = useState<ProjectItem[]>([]);
  const [loadingUserProjects, setLoadingUserProjects] = useState(false);

  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [activeClips, setActiveClips] = useState<ClipItem[]>([]);
  const [activeClip, setActiveClip] = useState<ClipItem | null>(null);

  const isAuthenticated = Boolean(firebaseUser || isDemoMode);
  const effectiveProjects = firebaseUser ? userProjects : demoProjects;

  const fetchUserProjects = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingUserProjects(true);
    try {
      const res = await authFetch('/api/projects');
      if (res.ok) {
        const data = (await res.json()) as { projects: ProjectItem[] };
        const list = data.projects || [];
        setUserProjects(list);
        for (const proj of list.slice(0, 10)) {
          syncProjectMirrorToFirestore(proj).catch(() => {});
        }
      }
    } finally {
      setLoadingUserProjects(false);
    }
  }, [firebaseUser, authFetch]);

  useEffect(() => {
    if (firebaseUser) {
      fetchUserProjects();
    }
  }, [firebaseUser, fetchUserProjects]);

  // Support ?autostart=1 for instant demo workspace entry
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !firebaseUser && !isDemoMode) {
      enterDemoMode().then(() => {
        setRoute('dashboard');
      });
    }
  }, [firebaseUser, isDemoMode, enterDemoMode]);

  useEffect(() => {
    if (route === 'studio' && !activeClip && effectiveProjects.length > 0) {
      const firstProj = effectiveProjects.find((p) => (p.clips?.length || 0) > 0);
      if (firstProj?.clips?.[0]) {
        setActiveProjectId(firstProj.id);
        setActiveClips(firstProj.clips);
        setActiveClip(firstProj.clips[0]);
      }
    }
    if (route === 'results' && activeClips.length === 0 && effectiveProjects.length > 0) {
      const firstProj = effectiveProjects[0];
      if (firstProj) {
        setActiveProjectId(firstProj.id);
        if (firstProj.clips) {
          setActiveClips(firstProj.clips);
          if (!activeClip && firstProj.clips[0]) setActiveClip(firstProj.clips[0]);
        }
      }
    }
  }, [route, activeClip, activeClips.length, effectiveProjects]);

  const openProjectResults = useCallback(
    async (project: ProjectItem) => {
      setActiveProjectId(project.id);
      if (project.status !== 'completed' && firebaseUser) {
        setRoute('processing');
        return;
      }

      if (firebaseUser) {
        const res = await authFetch(`/api/projects/${project.id}`);
        if (res.ok) {
          const data = (await res.json()) as {
            project: ProjectItem;
            clips: ClipItem[];
            sourceMediaUrl?: string | null;
          };
          const enrichedClips = (data.clips || []).map((c) => ({
            ...c,
            sourceVideoUrl: data.sourceMediaUrl || c.previewVideoPath || undefined,
          }));
          setActiveClips(enrichedClips);
          if (enrichedClips[0]) setActiveClip(enrichedClips[0]);
          setRoute('results');
        }
      } else {
        const clipsList = project.clips || [];
        setActiveClips(clipsList);
        if (clipsList[0]) setActiveClip(clipsList[0]);
        setRoute('results');
      }
    },
    [firebaseUser, authFetch]
  );

  const handleNavigate = useCallback(
    async (nextRoute: PageRoute) => {
      if (
        (nextRoute === 'dashboard' ||
          nextRoute === 'results' ||
          nextRoute === 'studio' ||
          nextRoute === 'settings' ||
          nextRoute === 'admin') &&
        !isAuthenticated
      ) {
        if (nextRoute === 'studio') {
          await enterDemoMode();
          const firstProj = demoProjects[0];
          if (firstProj?.clips?.[0]) {
            setActiveProjectId(firstProj.id);
            setActiveClips(firstProj.clips);
            setActiveClip(firstProj.clips[0]);
          }
          setRoute('studio');
          return;
        }
        setRoute('auth');
        return;
      }

      if (nextRoute === 'results' && activeClips.length === 0 && effectiveProjects[0]) {
        await openProjectResults(effectiveProjects[0]);
        return;
      }

      if (nextRoute === 'studio' && !activeClip) {
        const fallbackProj = effectiveProjects.find((p) => (p.clips?.length || 0) > 0);
        if (fallbackProj && fallbackProj.clips && fallbackProj.clips[0]) {
          setActiveProjectId(fallbackProj.id);
          setActiveClips(fallbackProj.clips);
          setActiveClip(fallbackProj.clips[0]);
        }
      }

      setRoute(nextRoute);
    },
    [
      isAuthenticated,
      enterDemoMode,
      demoProjects,
      activeClips.length,
      effectiveProjects,
      openProjectResults,
      activeClip,
    ]
  );

  const handleStartDemo = async () => {
    await enterDemoMode();
    setRoute('dashboard');
  };

  const handleOpenSampleStudio = async () => {
    if (!isAuthenticated) {
      await enterDemoMode();
    }
    const targetProj = effectiveProjects[0] || demoProjects[0];
    if (targetProj && targetProj.clips && targetProj.clips[0]) {
      setActiveProjectId(targetProj.id);
      setActiveClips(targetProj.clips);
      setActiveClip(targetProj.clips[0]);
    }
    setRoute('studio');
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!firebaseUser) return;
    const res = await authFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (res.ok) {
      setUserProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
  };

  const selectedProject =
    effectiveProjects.find((p) => p.id === activeProjectId) || effectiveProjects[0] || null;

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#07090F] flex items-center justify-center text-sm text-slate-400">
        Loading ClipGenius AI...
      </div>
    );
  }

  // Public Pages (Landing, Auth, Public Pricing)
  if (route === 'landing' || route === 'auth' || (route === 'pricing' && !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-[#07090F]">
        <PublicTopBar
          currentRoute={route}
          onNavigate={handleNavigate}
          isAuthenticated={isAuthenticated}
        />
        {route === 'landing' && (
          <LandingPage
            onNavigate={handleNavigate}
            onStartDemo={handleStartDemo}
            onOpenSampleStudio={handleOpenSampleStudio}
            isAuthenticated={isAuthenticated}
          />
        )}
        {route === 'auth' && (
          <AuthPage
            onGoogleSignIn={signInWithGoogle}
            onEnterDemo={enterDemoMode}
            authError={authError}
            onNavigate={handleNavigate}
          />
        )}
        {route === 'pricing' && <PricingPage onNavigate={handleNavigate} />}
      </div>
    );
  }

  const breadcrumbMap: Record<PageRoute, string> = {
    landing: 'Platform',
    auth: 'Sign In',
    dashboard: 'Dashboard / Projects',
    processing: 'AI Processing Queue',
    results: `Clip Results${selectedProject ? ` / ${selectedProject.title}` : ''}`,
    studio: `Editing Studio${activeClip ? ` / ${activeClip.title}` : ''}`,
    pricing: 'Subscription & Billing',
    settings: 'Profile & Settings',
    admin: 'Admin Queue Telemetry',
  };

  return (
    <WorkspaceShell
      currentRoute={route}
      onNavigate={handleNavigate}
      profile={profile}
      isDemoMode={isDemoMode}
      onSignOut={async () => {
        await signOut();
        setRoute('landing');
      }}
      breadcrumb={breadcrumbMap[route]}
      primaryAction={
        route !== 'dashboard' ? (
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap cursor-pointer"
          >
            New Clips
          </button>
        ) : undefined
      }
    >
      {route === 'dashboard' && (
        <DashboardPage
          projects={effectiveProjects}
          loadingProjects={firebaseUser ? loadingUserProjects : loadingDemo}
          onProjectCreated={(newId) => {
            setActiveProjectId(newId);
            fetchUserProjects();
            setRoute('processing');
          }}
          onOpenProject={openProjectResults}
          onDeleteProject={handleDeleteProject}
          onRequireAuth={() => setRoute('auth')}
        />
      )}

      {route === 'processing' && activeProjectId && (
        <ProcessingPage
          projectId={activeProjectId}
          onCompleted={async (proj) => {
            await fetchUserProjects();
            await openProjectResults(proj);
          }}
          onBackToDashboard={() => {
            fetchUserProjects();
            setRoute('dashboard');
          }}
        />
      )}

      {route === 'results' && selectedProject && (
        <ClipResultsPage
          project={selectedProject}
          clips={activeClips.length > 0 ? activeClips : selectedProject.clips || []}
          onEditClip={(clip) => {
            setActiveClip(clip);
            setRoute('studio');
          }}
          onBack={() => setRoute('dashboard')}
        />
      )}

      {route === 'studio' && activeClip && (
        <VideoStudioPage
          clip={activeClip}
          sourceDuration={selectedProject?.durationSeconds || 60}
          onClipSaved={(updated) => {
            setActiveClip(updated);
            setActiveClips((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
          }}
          onBack={() => setRoute('results')}
        />
      )}

      {route === 'pricing' && <PricingPage onNavigate={handleNavigate} />}
      {route === 'settings' && <SettingsPage onNavigate={handleNavigate} />}
      {route === 'admin' && <AdminPage />}
    </WorkspaceShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ClipGeniusAppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
