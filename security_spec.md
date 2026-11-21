# Firestore Security Specification (`ClipGenius AI`)

## 1. Data Invariants
1. User profiles (`/users/{userId}`) are strictly private to the verified owner (`request.auth.uid == userId` and `email_verified == true`) or verified admin.
2. User project mirrors (`/users/{userId}/projects/{projectId}`) cannot exist without a valid parent `/users/{userId}` document belonging to the same UID.
3. No unauthenticated or unverified-email client may read or write any document.
4. `uid`, `userId`, `projectId`, and `createdAt` are immutable once created.
5. `createdAt` and `updatedAt` must strictly equal `request.time`.
6. Once a project reaches terminal `status == 'completed'`, non-admin clients cannot mutate its state.
7. RBAC privileges (`role`, `creditsMinutes`, `/admins/{uid}`) cannot be self-assigned or altered from the client SDK.

## 2. Adversarial "Dirty Dozen" Payloads
1. Unauthenticated write to `/users/u1` -> `PERMISSION_DENIED`.
2. Unverified email (`email_verified: false`) attempting `/users/u1` create -> `PERMISSION_DENIED`.
3. Cross-user `get` on `/users/u2` as `u1` (PII leak test) -> `PERMISSION_DENIED`.
4. Blanket `list` on `/users` as `u1` -> `PERMISSION_DENIED`.
5. Shadow field (`{ isAdmin: true }`, `{ role: 'admin' }`) in `/users/u1` create/update -> `PERMISSION_DENIED`.
6. Identity spoofing (`uid: 'victim'`) in `/users/u1` -> `PERMISSION_DENIED`.
7. Poisoned oversized ID (`'a'.repeat(300)`) or invalid characters (`../evil`) -> `PERMISSION_DENIED`.
8. Backdated/client-forged `createdAt` timestamp -> `PERMISSION_DENIED`.
9. Orphaned project mirror write in `/users/u1/projects/p1` without parent `/users/u1` doc -> `PERMISSION_DENIED`.
10. Value poisoning (`title: 12345` or `'x'.repeat(500)`) on update -> `PERMISSION_DENIED`.
11. Mutating an immutable field (`projectId` or `userId`) during project update -> `PERMISSION_DENIED`.
12. Overwriting a completed project (`status: 'completed'`) back to `'queued'` -> `PERMISSION_DENIED`.
