'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { User } from '@/types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (fbUser: FirebaseUser): Promise<boolean> => {
    try {
      console.log('[Auth] Fetching user doc for uid:', fbUser.uid);
      const ref = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        console.log('[Auth] User doc found:', data);
        setUser({
          id: fbUser.uid,
          name: data.name || '',
          email: data.email || fbUser.email || '',
          role: data.role || 'investor',
          status: data.status || 'active',
          investorId: data.investorId,
          permissions: data.permissions,
          lastLogin: data.lastLogin?.toDate?.() ?? undefined,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          createdBy: data.createdBy || '',
        });
        // Update last login silently
        setDoc(ref, { lastLogin: new Date() }, { merge: true }).catch(console.error);
        return true;
      } else {
        console.warn('[Auth] No user doc found in Firestore for uid:', fbUser.uid);
        setUser(null);
        return false;
      }
    } catch (err) {
      console.error('[Auth] Error fetching user doc:', err);
      setUser(null);
      return false;
    }
  };

  useEffect(() => {
    console.log('[Auth] Setting up onAuthStateChanged listener');
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('[Auth] Auth state changed. fbUser:', fbUser?.uid ?? 'null');
      setFirebaseUser(fbUser);

      if (fbUser) {
        const found = await fetchUserData(fbUser);
        console.log('[Auth] fetchUserData result:', found);
      } else {
        setUser(null);
      }

      console.log('[Auth] Setting loading = false');
      setLoading(false);
    });

    return () => {
      console.log('[Auth] Cleaning up listener');
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn called for:', email);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  const changePassword = async (newPassword: string) => {
    if (!firebaseUser) throw new Error('Not authenticated');
    await updatePassword(firebaseUser, newPassword);
  };

  const refreshUser = async () => {
    if (firebaseUser) await fetchUserData(firebaseUser);
  };

  console.log('[Auth] Render state — loading:', loading, '| user:', user?.email ?? 'null');

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, signIn, signOut, changePassword, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
