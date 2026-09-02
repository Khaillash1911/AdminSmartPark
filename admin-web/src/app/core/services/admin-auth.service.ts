import { Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword, user } from '@angular/fire/auth';
import type { UserCredential } from 'firebase/auth';
import { Firestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

const LOGIN_TIMEOUT_MS = 10_000;

export interface AdminUser {
  uid: string;
  name: string;
  email: string;
  role: 'super_admin' | 'staff';
  created_at?: any;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  adminUser$: Observable<AdminUser | null>;

  constructor(private auth: Auth, private firestore: Firestore) {
    this.adminUser$ = user(this.auth).pipe(
      switchMap(u => {
        if (!u) return of(null);
        return from(getDoc(doc(this.firestore, `admins/${u.uid}`))).pipe(
          map(snap => snap.exists() ? ({ uid: u.uid, ...snap.data() } as AdminUser) : null)
        );
      })
    );
  }

  async adminLogin(email: string, password: string): Promise<AdminUser> {
    let timedOut = false;
    let timeoutId: number | undefined;
    const signInRequest = signInWithEmailAndPassword(this.auth, email, password);
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        timedOut = true;
        const error = new Error('Authentication request timed out.');
        Object.assign(error, { code: 'auth/request-timeout' });
        reject(error);
      }, LOGIN_TIMEOUT_MS);
    });

    signInRequest.then(() => {
      if (timedOut) void signOut(this.auth);
    }).catch(() => undefined);

    let cred: UserCredential;
    try {
      cred = await Promise.race([signInRequest, timeout]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
    const snap = await getDoc(doc(this.firestore, `admins/${cred.user.uid}`));
    if (!snap.exists()) {
      await signOut(this.auth);
      throw new Error('NOT_AN_ADMIN: Access denied.');
    }
    return { uid: cred.user.uid, ...snap.data() } as AdminUser;
  }

  async adminLogout() {
    return signOut(this.auth);
  }

  async authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) throw new Error('Administrator session is not available.');
    const token = await currentUser.getIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(180_000)
    });
  }

  getAdminName(): Observable<string | null> {
    return this.adminUser$.pipe(map(user => user ? user.name : null));
  }

  getAdminRole(): Observable<string | null> {
    return this.adminUser$.pipe(map(user => user ? user.role : null));
  }

  async resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  async getCurrentAdmin(): Promise<AdminUser | null> {
    const u = this.auth.currentUser;
    if (!u) return null;
    const snap = await getDoc(doc(this.firestore, `admins/${u.uid}`));
    return snap.exists() ? ({ uid: u.uid, ...snap.data() } as AdminUser) : null;
  }

  async createStaffAdmin(email: string, password: string, name: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await setDoc(doc(this.firestore, `admins/${cred.user.uid}`), {
      uid: cred.user.uid, name, email, role: 'staff', created_at: serverTimestamp()
    });
  }

  async getAllAdmins(): Promise<AdminUser[]> {
    const snap = await getDocs(collection(this.firestore, 'admins'));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() } as AdminUser));
  }
}
