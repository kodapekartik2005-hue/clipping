import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { syncUserProfileToFirestore, testConnection } from '../lib/firestore.ts';
import type { ClipItem, ProjectItem, UserProfile } from '../types/app.ts';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  idToken: string | null;
  isDemoMode: boolean;
  loadingAuth: boolean;
  authError: string | null;
  demoProjects: ProjectItem[];
  loadingDemo: boolean;
  signInWithGoogle: () => Promise<boolean>;
  enterDemoMode: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateDemoClipLocal: (clipId: number, patch: Partial<ClipItem>) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_PROFILE: UserProfile = {
  id: 0,
  uid: 'demo-studio-user',
  email: 'creator@clipgenius.ai',
  displayName: 'Maya Lin (Studio Demo)',
  avatarUrl: '/src/assets/images/avatar_creator_profile_1795270019068.jpg',
  role: 'admin',
  plan: 'pro',
  creditsMinutes: 540,
  defaultLanguage: 'en',
  defaultAspectRatio: '9:16',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [demoProjects, setDemoProjects] = useState<ProjectItem[]>([]);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const loadDemoWorkspace = useCallback(async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch('/api/demo/workspace');
      if (res.ok) {
        const data = (await res.json()) as { projects: ProjectItem[] };
        const normalized = (data.projects || []).map((p) => ({
          ...p,
          clipCount: p.clips?.length || 0,
          clips: (p.clips || []).map((c) => ({
            ...c,
            captionsJson: c.captionsJson || c.captions || [],
          })),
        }));
        setDemoProjects(normalized);
      }
    } catch (err) {
      console.error('Failed to load demo workspace:', err);
    } finally {
      setLoadingDemo(false);
    }
  }, []);

  const fetchMe = useCallback(async (token: string) => {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { user: UserProfile };
      setProfile(data.user);
      syncUserProfileToFirestore(data.user).catch((err) => {
        console.error('Firestore profile sync skipped:', err);
      });
    }
  }, []);

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          setIsDemoMode(false);
          await fetchMe(token);
        } catch (err) {
          console.error('Error syncing authenticated user:', err);
        }
      } else {
        setIdToken(null);
      }
      setLoadingAuth(false);
    });
    return () => unsub();
  }, [fetchMe]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
      setIsDemoMode(false);
      await fetchMe(token);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google Sign-In could not be completed.';
      setAuthError(message);
      return false;
    }
  }, [fetchMe]);

  const enterDemoMode = useCallback(async () => {
    setAuthError(null);
    setIsDemoMode(true);
    setProfile(DEMO_PROFILE);
    await loadDemoWorkspace();
  }, [loadDemoWorkspace]);

  const signOut = useCallback(async () => {
    setIsDemoMode(false);
    setProfile(null);
    setIdToken(null);
    if (auth.currentUser) {
      await fbSignOut(auth);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (firebaseUser) {
      const token = await firebaseUser.getIdToken();
      setIdToken(token);
      await fetchMe(token);
    }
  }, [firebaseUser, fetchMe]);

  const updateDemoClipLocal = useCallback((clipId: number, patch: Partial<ClipItem>) => {
    setDemoProjects((prev) =>
      prev.map((proj) => ({
        ...proj,
        clips: (proj.clips || []).map((c) =>
          c.id === clipId
            ? {
                ...c,
                ...patch,
                duration:
                  typeof patch.startTime === 'number' || typeof patch.endTime === 'number'
                    ? Number(
                        (
                          (patch.endTime ?? c.endTime) - (patch.startTime ?? c.startTime)
                        ).toFixed(2)
                      )
                    : c.duration,
              }
            : c
        ),
      }))
    );
  }, []);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      if (firebaseUser) {
        const freshToken = await firebaseUser.getIdToken();
        headers.set('Authorization', `Bearer ${freshToken}`);
      } else if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`);
      }
      return fetch(url, { ...init, headers });
    },
    [firebaseUser, idToken]
  );

  useEffect(() => {
    // Preload demo showcase clips on mount if needed
    loadDemoWorkspace();
  }, [loadDemoWorkspace]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        idToken,
        isDemoMode,
        loadingAuth,
        authError,
        demoProjects,
        loadingDemo,
        signInWithGoogle,
        enterDemoMode,
        signOut,
        refreshProfile,
        updateDemoClipLocal,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
