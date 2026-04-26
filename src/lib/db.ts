import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
  setDoc,
  type QueryConstraint,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import type {
  User, Investor, Investment, Expense, Distribution,
  CashFlow, ActivityLog, FundSnapshot, DashboardStats,
  InvestorHistory, UserPermissions,
} from '@/types';

// ==================== HELPERS ====================

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

function serializeForFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value instanceof Date) result[key] = Timestamp.fromDate(value);
    else if (value !== null && typeof value === 'object' && !Array.isArray(value))
      result[key] = serializeForFirestore(value as Record<string, unknown>);
    else result[key] = value;
  }
  return result;
}

// ==================== ACTIVITY LOG ====================

export async function logActivity(
  userId: string,
  userName: string,
  action: string,
  entity: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      userId, userName, action, entity, entityId, details,
      timestamp: serverTimestamp(),
    });
  } catch { /* silent */ }
}

// ==================== USERS ====================

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

// ✅ إنشاء مستخدم عبر Firebase REST API
// لا يمس جلسة المدير الحالية إطلاقاً
export async function createUser(
  data: Omit<User, 'id' | 'createdAt' | 'lastLogin'> & { password: string }
): Promise<string> {
  const { password, ...userData } = data;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY غير موجود في ملف .env');

  // ① إنشاء حساب Firebase Auth عبر REST API
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userData.email,
        password: password,
        returnSecureToken: false,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.localId) {
    const code = result?.error?.message || 'UNKNOWN_ERROR';
    if (code.includes('EMAIL_EXISTS')) throw new Error('هذا البريد الإلكتروني مستخدم بالفعل');
    if (code.includes('WEAK_PASSWORD')) throw new Error('كلمة المرور ضعيفة — 6 أحرف على الأقل');
    if (code.includes('INVALID_EMAIL')) throw new Error('البريد الإلكتروني غير صالح');
    if (code.includes('TOO_MANY_ATTEMPTS')) throw new Error('محاولات كثيرة — حاول لاحقاً');
    throw new Error(`فشل إنشاء الحساب: ${code}`);
  }

  const uid: string = result.localId;

  // ✅ حذف أي حقل undefined قبل الحفظ — Firestore لا يقبلها
  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(userData)) {
    if (value !== undefined) cleanData[key] = value;
  }

  // ② حفظ بيانات المستخدم في Firestore
  await setDoc(doc(db, 'users', uid), {
    ...cleanData,
    createdAt: serverTimestamp(),
    lastLogin: null,
  });

  return uid;
}

export async function updateUser(id: string, data: Partial<User>): Promise<void> {
  await updateDoc(doc(db, 'users', id), {
    ...serializeForFirestore(data as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

export async function resetUserPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ==================== INVESTORS ====================

function mapInvestor(snap: { id: string; data: () => Record<string, unknown> }): Investor {
  const d = snap.data();
  return {
    id: snap.id, ...d,
    joinDate: toDate(d.joinDate),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as Investor;
}

export async function getInvestors(): Promise<Investor[]> {
  const snap = await getDocs(query(collection(db, 'investors'), orderBy('createdAt', 'desc')));
  return snap.docs.map(mapInvestor);
}

export async function getInvestor(id: string): Promise<Investor | null> {
  const snap = await getDoc(doc(db, 'investors', id));
  if (!snap.exists()) return null;
  return mapInvestor({ id: snap.id, data: () => snap.data() });
}

// ✅ دالة مساعدة: إعادة حساب نسب الملكية لجميع المستثمرين النشطين
async function recalcAllOwnership(): Promise<void> {
  const snap = await getDocs(collection(db, 'investors'));
  const allInvestors = snap.docs.map(d => ({ id: d.id, ...d.data() })) as (Investor & { id: string })[];
  
  // إجمالي الحصص لجميع المستثمرين النشطين
  const totalShares = allInvestors
    .filter(i => i.status === 'active' || i.status === 'inactive')
    .reduce((s, i) => s + (i.shareCount || 0), 0);

  if (totalShares === 0) return;

  const batch = writeBatch(db);
  for (const inv of allInvestors) {
    const ownership = totalShares > 0 ? ((inv.shareCount || 0) / totalShares) * 100 : 0;
    batch.update(doc(db, 'investors', inv.id), {
      ownershipPercentage: ownership,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function createInvestor(
  data: Omit<Investor, 'id' | 'createdAt' | 'updatedAt'>,
  creatorName: string
) {
  const ref = await addDoc(collection(db, 'investors'), {
    ...serializeForFirestore(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // ✅ إعادة حساب نسب الملكية لجميع المستثمرين بعد الإضافة
  await recalcAllOwnership();

  await addCashFlow({
    type: 'capital_in',
    date: data.joinDate,
    amount: data.totalPaid,
    referenceId: ref.id,
    referenceType: 'investor',
    description: `رأس مال مستثمر جديد: ${data.name}`,
    createdBy: data.createdBy,
  });
  await logActivity(data.createdBy, creatorName, 'create', 'investor', ref.id, { name: data.name });
  return ref.id;
}

export async function updateInvestor(
  id: string,
  data: Partial<Investor>,
  userId: string,
  userName: string
) {
  await updateDoc(doc(db, 'investors', id), {
    ...serializeForFirestore(data as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });

  // ✅ إذا تغيرت الحصص، أعد حساب نسب الملكية الكلية
  if (data.shareCount !== undefined) {
    await recalcAllOwnership();
  }

  await logActivity(userId, userName, 'update', 'investor', id, data as Record<string, unknown>);
}

export async function getInvestorHistory(investorId: string): Promise<InvestorHistory[]> {
  // ✅ بدون orderBy لتجنب الحاجة لـ Composite Index — نرتب يدوياً
  const snap = await getDocs(query(
    collection(db, 'investorHistory'),
    where('investorId', '==', investorId),
  ));
  const results = snap.docs.map(d => ({
    id: d.id, ...d.data(),
    date: toDate(d.data().date),
    createdAt: toDate(d.data().createdAt),
  } as InvestorHistory));
  // ترتيب تنازلي حسب التاريخ
  return results.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ==================== INVESTMENTS ====================

function mapInvestment(snap: { id: string; data: () => Record<string, unknown> }): Investment {
  const d = snap.data();
  return {
    id: snap.id, ...d,
    entryDate: toDate(d.entryDate),
    closingDate: d.closingDate ? toDate(d.closingDate) : undefined,
    lastProfitUpdate: d.lastProfitUpdate ? toDate(d.lastProfitUpdate) : undefined,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as Investment;
}

export async function getInvestments(statusFilter?: string): Promise<Investment[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (statusFilter) constraints.unshift(where('status', '==', statusFilter));
  const snap = await getDocs(query(collection(db, 'investments'), ...constraints));
  return snap.docs.map(mapInvestment);
}

export async function getInvestment(id: string): Promise<Investment | null> {
  const snap = await getDoc(doc(db, 'investments', id));
  if (!snap.exists()) return null;
  return mapInvestment({ id: snap.id, data: () => snap.data() });
}

export async function createInvestment(
  data: Omit<Investment, 'id' | 'createdAt' | 'updatedAt'>,
  creatorName: string
) {
  const ref = await addDoc(collection(db, 'investments'), {
    ...serializeForFirestore(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addCashFlow({
    type: 'investment_out',
    date: data.entryDate,
    amount: -data.entryAmount,
    referenceId: ref.id,
    referenceType: 'investment',
    description: `دخول استثمار: ${data.name}`,
    createdBy: data.createdBy,
  });
  await logActivity(data.createdBy, creatorName, 'create', 'investment', ref.id, { name: data.name });
  return ref.id;
}

export async function updateInvestment(
  id: string,
  data: Partial<Investment>,
  userId: string,
  userName: string
) {
  await updateDoc(doc(db, 'investments', id), {
    ...serializeForFirestore(data as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
  await logActivity(userId, userName, 'update', 'investment', id, data as Record<string, unknown>);
}

export async function closeInvestment(
  id: string,
  closingDate: Date,
  closingAmount: number,
  userId: string,
  userName: string
) {
  const inv = await getInvestment(id);
  if (!inv) throw new Error('Investment not found');
  const durationDays = Math.round((closingDate.getTime() - inv.entryDate.getTime()) / 86400000);
  const receivedProfits = inv.receivedProfits || 0;
  const totalProfit = closingAmount + receivedProfits - inv.entryAmount;
  const annualReturn = totalProfit / inv.entryAmount / (durationDays / 365);

  await updateDoc(doc(db, 'investments', id), {
    status: 'closed',
    closingDate: Timestamp.fromDate(closingDate),
    closingAmount,
    totalProfit,
    annualReturn,
    durationDays,
    updatedAt: serverTimestamp(),
  });
  await addCashFlow({
    type: 'investment_return',
    date: closingDate,
    amount: closingAmount,
    referenceId: id,
    referenceType: 'investment',
    description: `إغلاق استثمار: ${inv.name}`,
    createdBy: userId,
  });
  await logActivity(userId, userName, 'close', 'investment', id, { closingAmount, totalProfit });
}

// ==================== EXPENSES ====================

function mapExpense(snap: { id: string; data: () => Record<string, unknown> }): Expense {
  const d = snap.data();
  return {
    id: snap.id, ...d,
    date: toDate(d.date),
    approvedAt: d.approvedAt ? toDate(d.approvedAt) : undefined,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as Expense;
}

export async function getExpenses(): Promise<Expense[]> {
  const snap = await getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc')));
  return snap.docs.map(mapExpense);
}

export async function createExpense(
  data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>,
  creatorName: string
) {
  const ref = await addDoc(collection(db, 'expenses'), {
    ...serializeForFirestore(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logActivity(
    data.createdBy, creatorName, 'create', 'expense', ref.id,
    { amount: data.amount, type: data.type }
  );
  return ref.id;
}

export async function approveExpense(id: string, userId: string, userName: string) {
  const snap = await getDoc(doc(db, 'expenses', id));
  const expense = snap.data() as Expense;
  await updateDoc(doc(db, 'expenses', id), {
    status: 'approved',
    approvedBy: userId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addCashFlow({
    type: 'expense_out',
    date: expense.date,
    amount: -expense.amount,
    referenceId: id,
    referenceType: 'expense',
    description: `مصروف: ${expense.description}`,
    createdBy: userId,
  });
  await logActivity(userId, userName, 'approve', 'expense', id, { amount: expense.amount });
}

export async function updateExpense(
  id: string,
  data: Partial<Expense>,
  userId: string,
  userName: string
) {
  await updateDoc(doc(db, 'expenses', id), {
    ...serializeForFirestore(data as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
  await logActivity(userId, userName, 'update', 'expense', id);
}

export async function deleteExpense(id: string, userId: string, userName: string) {
  const snap = await getDoc(doc(db, 'expenses', id));
  const data = snap.data() as Expense;
  if (data.status !== 'pending') throw new Error('يمكن حذف المصاريف غير المعتمدة فقط');
  await deleteDoc(doc(db, 'expenses', id));
  await logActivity(userId, userName, 'delete', 'expense', id);
}

// ==================== DISTRIBUTIONS ====================

function mapDistribution(snap: { id: string; data: () => Record<string, unknown> }): Distribution {
  const d = snap.data();
  return {
    id: snap.id, ...d,
    date: toDate(d.date),
    approvedAt: d.approvedAt ? toDate(d.approvedAt) : undefined,
    createdAt: toDate(d.createdAt),
  } as Distribution;
}

export async function getDistributions(): Promise<Distribution[]> {
  const snap = await getDocs(query(collection(db, 'distributions'), orderBy('date', 'desc')));
  return snap.docs.map(mapDistribution);
}

export async function createDistribution(
  data: Omit<Distribution, 'id' | 'createdAt'>,
  creatorName: string
) {
  const ref = await addDoc(collection(db, 'distributions'), {
    ...serializeForFirestore(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  });
  await logActivity(
    data.createdBy, creatorName, 'create', 'distribution', ref.id,
    { type: data.type, amount: data.totalAmount }
  );
  return ref.id;
}

export async function approveDistribution(id: string, userId: string, userName: string) {
  const snap = await getDoc(doc(db, 'distributions', id));
  const d = snap.data() as Distribution;
  await updateDoc(doc(db, 'distributions', id), {
    status: 'approved',
    approvedBy: userId,
    approvedAt: serverTimestamp(),
  });
  if (d.affectsCash) {
    await addCashFlow({
      type: 'distribution_out',
      date: d.date,
      amount: -d.totalAmount,
      referenceId: id,
      referenceType: 'distribution',
      description: `توزيع: ${d.type}`,
      createdBy: userId,
    });
  }
  if (d.details && d.details.length > 0) {
    const batch = writeBatch(db);
    for (const detail of d.details) {
      if (detail.sharesAfter !== detail.sharesBefore) {
        batch.update(doc(db, 'investors', detail.investorId), {
          shareCount: detail.sharesAfter,
          ownershipPercentage: detail.ownershipPercentage,
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }
  await logActivity(userId, userName, 'approve', 'distribution', id);
}

// ==================== CASH FLOW ====================

export async function addCashFlow(data: Omit<CashFlow, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'cashFlows'), {
    ...serializeForFirestore(data as Record<string, unknown>),
    createdAt: serverTimestamp(),
  });
}

export async function getCashFlows(): Promise<CashFlow[]> {
  const snap = await getDocs(query(collection(db, 'cashFlows'), orderBy('date', 'desc')));
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    date: toDate(d.data().date),
    createdAt: toDate(d.data().createdAt),
  } as CashFlow));
}

export async function calculateCash(): Promise<{ available: number; frozen: number }> {
  const flows = await getCashFlows();
  const available = flows.reduce((sum, f) => sum + f.amount, 0);
  const investments = await getInvestments('active');
  const frozen = investments.reduce((sum, i) => {
    if (i.type === 'frozen') return sum + i.entryAmount;
    return sum;
  }, 0);
  return { available, frozen };
}

// ==================== DASHBOARD ====================

export async function getDashboardStats(): Promise<DashboardStats> {
  const [investors, investments, expenses, distributions, cash] = await Promise.all([
    getInvestors(),
    getInvestments(),
    getExpenses(),
    getDistributions(),
    calculateCash(),
  ]);

  const activeInv = investments.filter(i => i.status === 'active');
  const closedInv = investments.filter(i => i.status === 'closed');
  const distressedInv = investments.filter(i => i.status === 'distressed');

  const totalShares = investors.reduce((s, i) => s + i.shareCount, 0);
  const totalCapital = investors.reduce((s, i) => s + i.totalPaid, 0);

  const activeInvValue = activeInv.reduce((s, i) => s + i.entryAmount, 0);
  const nav = cash.available + activeInvValue;
  const sharePrice = totalShares > 0 ? nav / totalShares : 1;

  const realizedProfits = closedInv.reduce((s, i) => s + (i.totalProfit || 0), 0);
  const unrealizedProfits = activeInv.reduce((s, i) => s + (i.cumulativeProfits || i.receivedProfits || 0), 0);
  const totalExpenses = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const totalDistributions = distributions.filter(d => d.status === 'approved').reduce((s, d) => s + d.totalAmount, 0);

  const alerts = [];
  for (const inv of distressedInv) {
    alerts.push({ type: 'danger' as const, message: `استثمار متعثر: ${inv.name}`, entityId: inv.id, entityType: 'investment' });
  }
  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 86400000);
  for (const inv of activeInv) {
    if (inv.closingDate && inv.closingDate <= soon) {
      alerts.push({ type: 'warning' as const, message: `استثمار يقترب موعد إغلاقه: ${inv.name}`, entityId: inv.id, entityType: 'investment' });
    }
  }
  const investorsWithoutAccounts = investors.filter(i => !i.userId).length;
  if (investorsWithoutAccounts > 0) {
    alerts.push({ type: 'info' as const, message: `${investorsWithoutAccounts} مستثمر بدون حساب دخول` });
  }

  return {
    availableCash: cash.available,
    frozenCash: cash.frozen,
    expectedCashIn: 0,
    expectedCashOut: 0,
    totalCapital,
    totalInvestors: investors.length,
    totalShares,
    currentSharePrice: sharePrice,
    activeInvestments: activeInv.length,
    closedInvestments: closedInv.length,
    distressedInvestments: distressedInv.length,
    realizedProfits,
    unrealizedProfits,
    totalExpenses,
    totalDistributions,
    alerts,
  };
}

// ==================== INVESTOR STATEMENT ====================

export async function getInvestorStatement(investorId: string, from?: Date, to?: Date) {
  const investor = await getInvestor(investorId);
  if (!investor) return null;

  const [history, distributions] = await Promise.all([
    getInvestorHistory(investorId),
    getDocs(query(
      collection(db, 'distributions'),
      where('investorId', '==', investorId),
      orderBy('date', 'desc')
    )),
  ]);

  let filteredHistory = history;
  if (from) filteredHistory = filteredHistory.filter(h => h.date >= from);
  if (to) filteredHistory = filteredHistory.filter(h => h.date <= to);

  return {
    investor,
    history: filteredHistory,
    distributions: distributions.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

// ==================== REPORTS ====================

export async function getInvestorReport() {
  const investors = await getInvestors();
  const distributions = await getDistributions();

  return investors.map(inv => {
    const invDists = distributions.filter(d =>
      d.status === 'approved' &&
      (d.investorId === inv.id || d.details?.some(det => det.investorId === inv.id))
    );
    const totalReceived = invDists.reduce((s, d) => {
      if (d.investorId === inv.id) return s + d.totalAmount;
      const detail = d.details?.find(det => det.investorId === inv.id);
      return s + (detail?.amount || 0);
    }, 0);
    return { ...inv, totalDistributions: totalReceived };
  });
}

export async function getActivityLogs(limitCount = 50): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(limitCount))
  );
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    timestamp: toDate(d.data().timestamp),
  } as ActivityLog));
}
