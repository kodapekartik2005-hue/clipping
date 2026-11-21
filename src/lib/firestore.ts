import {
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import type { ProjectItem, UserProfile } from '../types/app.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function syncUserProfileToFirestore(profile: UserProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !profile.uid || profile.uid === 'demo-studio-user') {
    return;
  }

  const uid = user.uid;
  const userPath = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  const plan =
    profile.plan === 'pro' || profile.plan === 'studio' ? profile.plan : 'starter';
  const defaultAspectRatio =
    profile.defaultAspectRatio === '16:9' || profile.defaultAspectRatio === '1:1'
      ? profile.defaultAspectRatio
      : '9:16';

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        email: (profile.email || user.email || 'user@clipgenius.ai').slice(0, 200),
        displayName: (profile.displayName || user.displayName || 'Creator').slice(0, 120),
        plan,
        defaultLanguage: (profile.defaultLanguage || 'en').slice(0, 16),
        defaultAspectRatio,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: (profile.displayName || user.displayName || 'Creator').slice(0, 120),
        plan,
        defaultLanguage: (profile.defaultLanguage || 'en').slice(0, 16),
        defaultAspectRatio,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncProjectMirrorToFirestore(project: ProjectItem): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !project?.id) return;

  const uid = user.uid;
  const projId = String(project.id);
  const path = `users/${uid}/projects/${projId}`;
  const ref = doc(db, 'users', uid, 'projects', projId);

  const validStatus = [
    'queued',
    'ingesting',
    'transcribing',
    'analyzing',
    'rendering',
    'completed',
    'failed',
  ].includes(project.status)
    ? project.status
    : 'queued';

  const sourceType =
    project.sourceType === 'youtube' || project.sourceType === 'sample'
      ? project.sourceType
      : 'upload';
  const outputFormat =
    project.outputFormat === '16:9' || project.outputFormat === '1:1'
      ? project.outputFormat
      : '9:16';

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        projectId: Math.max(1, Math.round(project.id)),
        userId: uid,
        title: (project.title || 'Untitled Project').slice(0, 200),
        sourceType,
        outputFormat,
        status: validStatus,
        progress: Math.min(100, Math.max(0, Math.round(project.progress || 0))),
        clipCount: Math.min(50, Math.max(0, project.clipCount ?? project.clips?.length ?? 0)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.status !== 'completed') {
      await updateDoc(ref, {
        title: (project.title || 'Untitled Project').slice(0, 200),
        status: validStatus,
        progress: Math.min(100, Math.max(0, Math.round(project.progress || 0))),
        clipCount: Math.min(50, Math.max(0, project.clipCount ?? project.clips?.length ?? 0)),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
