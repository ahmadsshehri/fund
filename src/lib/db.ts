// ==================== USERS (إصلاح createUser) ====================
// استبدل الدوال التالية فقط في src/lib/db.ts

import {
  doc, getDoc, setDoc, updateDoc, getDocs,
  collection, query, orderBy, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import type { User } from '@/types';

export async function getUsers(): Promise<User[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    lastLogin: d.data().lastLogin?.toDate?.() ?? undefined,
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as User));
}

export async function getUser(id: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id, ...d,
    lastLogin: d.lastLogin?.toDate?.() ?? undefined,
    createdAt: d.createdAt?.toDate?.() ?? new Date(),
  } as User;
}

// ✅ إصلاح createUser: تُنشئ Firebase Auth user + Firestore doc بشكل صحيح وتُرجع الـ uid
export async function createUser(
  data: Omit<User, 'id' | 'createdAt' | 'lastLogin'> & { password: string }
): Promise<string> {
  const { password, ...userData } = data;

  // إنشاء حساب Firebase Authentication
  const credential = await createUserWithEmailAndPassword(auth, userData.email, password);
  const uid = credential.user.uid;

  // ✅ حفظ بيانات المستخدم في Firestore مباشرةً بـ setDoc (وليس updateDoc)
  await setDoc(doc(db, 'users', uid), {
    ...userData,
    createdAt: serverTimestamp(),
    lastLogin: null,
  });

  return uid;
}

export async function updateUser(id: string, data: Partial<User>): Promise<void> {
  // تحويل Date objects إلى Timestamps
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      const { Timestamp } = await import('firebase/firestore');
      serialized[key] = Timestamp.fromDate(value);
    } else {
      serialized[key] = value;
    }
  }
  await updateDoc(doc(db, 'users', id), {
    ...serialized,
    updatedAt: serverTimestamp(),
  });
}

export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}
