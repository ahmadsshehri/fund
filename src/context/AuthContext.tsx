'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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
  // ✅ loading يبقى true حتى يكتمل جلب Firestore — لا يُغيَّر للـ false قبل ذلك
  const [loading, setLoading] = useState(true);
  // ✅ منع التعارض بين استدعاءات متزامنة
  const fetchingRef = useRef(false);

  const fetchUserData = async (fbUser: FirebaseUser): Promise<boolean> => {
    // منع استدعاءات متزامنة
    if (fetchingRef.current) return false;
    fetchingRef.current = true;

    try {
      const ref = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
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
        // تحديث lastLogin بشكل صامت
        setDoc(ref, { lastLogin: new Date() }, { merge: true }).catch(() => {});
        return true;
      } else {
        console.warn('[Auth] No user doc for uid:', fbUser.uid);
        setUser(null);
        return false;
      }
    } catch (err) {
      console.error('[Auth] Error fetching user:', err);
      setUser(null);
      return false;
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    // ✅ الـ listener يُبقي loading=true حتى يكتمل كل شيء
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // جلب بيانات المستخدم من Firestore أولاً — ثم نُنهي الـ loading
        await fetchUserData(fbUser);
      } else {
        setUser(null);
      }

      // ✅ loading = false فقط بعد اكتمال كل العمليات
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    // ✅ نُعيد loading=true عند تسجيل الدخول لمنع التوجيه المبكر
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged سيُكمل الباقي ويضع loading=false
    } catch (err) {
      setLoading(false);
      throw err;
    }
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
