'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
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

  const fetchUserData = async (fbUser: FirebaseUser) => {
    const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      setUser({
        id: fbUser.uid,
        ...data,
        lastLogin: data.lastLogin?.toDate(),
        createdAt: data.createdAt?.toDate(),
      } as User);
      // Update last login
      await updateDoc(doc(db, 'users', fbUser.uid), { lastLogin: new Date() });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchUserData(fbUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
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
