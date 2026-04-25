/**
 * =========================================================
 * ACCOUNTING ENGINE — نظام المحاسبة الصحيح (النسخة النهائية)
 * =========================================================
 */

import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TxType =
  | 'capital_in'
  | 'capital_out'
  | 'invest_funding'
  | 'invest_topup'
  | 'invest_dividend'
  | 'invest_partial_exit'
  | 'invest_full_exit'
  | 'invest_valuation'
  | 'invest_impairment'
  | 'invest_writeoff'
  | 'expense'
  | 'expense_refund'
  | 'operating_income';

export interface LedgerTransaction {
  id?: string;
  date: Date;
  type: TxType;
  description: string;
  cashEffect: number;
  bookValueEffect?: number;
  realizedProfitEffect?: number;
  currentValueEffect?: number;
  investmentId?: string;
  investorId?: string;
  expenseId?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
}

export interface PortfolioSnapshot {
  asOfDate: Date;
  ownerCapitalIn: number;
  ownerCapitalOut: number;
  netOwnerCapital: number;
  availableCash: number;
  activeTotalCost: number;
  activeCurrentValue: number;
  activeBookValue: number;
  realizedProfit: number;
  unrealizedProfit: number;
  dividendsReceived: number;
  exitProceeds: number;
  closedTotalCost: number;
  totalExpenses: number;
  netPortfolioValue: number;
  activeCount: number;
  closedCount: number;
  distressedCount: number;
}

// ─── Helper: إزالة undefined من الكائن ─────────────────────────────────────
function cleanObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}

// ─── Ledger Operations ─────────────────────────────────────────────────────

export async function addLedgerEntry(tx: LedgerTransaction): Promise<string> {
  const data = cleanObject({
    date: Timestamp.fromDate(tx.date),
    type: tx.type,
    description: tx.description,
    cashEffect: tx.cashEffect,
    bookValueEffect: tx.bookValueEffect,
    realizedProfitEffect: tx.realizedProfitEffect,
    currentValueEffect: tx.currentValueEffect,
    investmentId: tx.investmentId,
    investorId: tx.investorId,
    expenseId: tx.expenseId,
    notes: tx.notes,
    createdBy: tx.createdBy,
    createdAt: Timestamp.fromDate(new Date()),
  });
  const ref = await addDoc(collection(db, 'ledger'), data);
  return ref.id;
}

export async function getLedgerEntries(
  investmentId?: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<LedgerTransaction[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [];
  if (investmentId) constraints.push(where('investmentId', '==', investmentId));
  if (fromDate) constraints.push(where('date', '>=', Timestamp.fromDate(fromDate)));
  if (toDate) constraints.push(where('date', '<=', Timestamp.fromDate(toDate)));
  constraints.push(orderBy('date', 'asc'));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    date: d.data().date?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as LedgerTransaction));
}

async function getAllLedgerEntries(): Promise<LedgerTransaction[]> {
  const snap = await getDocs(query(collection(db, 'ledger'), orderBy('date', 'asc')));
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    date: d.data().date?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as LedgerTransaction));
}

// ─── Core Calculations ─────────────────────────────────────────────────────

export async function calcAvailableCash(asOfDate?: Date): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [orderBy('date', 'asc')];
  if (asOfDate) constraints.unshift(where('date', '<=', Timestamp.fromDate(asOfDate)));
  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  return snap.docs.reduce((sum, d) => sum + ((d.data().cashEffect as number) || 0), 0);
}

export async function calcPortfolioSnapshot(asOfDate?: Date): Promise<PortfolioSnapshot> {
  const targetDate = asOfDate || new Date();
  const [ledger, investmentsSnap, expensesSnap] = await Promise.all([
    getAllLedgerEntries(),
    getDocs(collection(db, 'investments')),
    getDocs(collection(db, 'expenses')),
  ]);

  const filteredLedger = ledger.filter((tx) => tx.date <= targetDate);
  const availableCash = filteredLedger.reduce((sum, tx) => sum + (tx.cashEffect || 0), 0);

  let ownerCapitalIn = 0,
    ownerCapitalOut = 0;
  for (const tx of filteredLedger) {
    if (tx.type === 'capital_in') ownerCapitalIn += tx.cashEffect || 0;
    else if (tx.type === 'capital_out') ownerCapitalOut += Math.abs(tx.cashEffect || 0);
  }

  const ledgerExpenses = filteredLedger
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.cashEffect || 0), 0);
  const approvedExpenses = expensesSnap.docs
    .map((d) => d.data())
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExpenses = filteredLedger.length > 0 ? ledgerExpenses : approvedExpenses;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const investments: any[] = investmentsSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    entryDate: d.data().entryDate?.toDate?.(),
    closingDate: d.data().closingDate?.toDate?.(),
  }));

  const active = investments.filter((i) => i.status === 'active');
  const closed = investments.filter((i) => i.status === 'closed');
  const distressed = investments.filter((i) => i.status === 'distressed');

  let activeTotalCost = 0,
    activeCurrentValue = 0,
    activeBookValue = 0;
  let realizedProfit = 0,
    unrealizedProfit = 0,
    dividendsReceived = 0;
  let exitProceeds = 0,
    closedTotalCost = 0;

  for (const inv of investments) {
    const isClosed = inv.status === 'closed';
    const entryAmt = inv.entryAmount || 0;
    const divs = (inv.dividends || []).reduce((s: number, d: { amount: number }) => s + d.amount, 0);

    if (!isClosed) {
      const cv = inv.currentValue || entryAmt;
      activeTotalCost += entryAmt;
      activeCurrentValue += cv;
      activeBookValue += entryAmt;
      unrealizedProfit += cv - entryAmt;
      dividendsReceived += divs;
    } else {
      const closing = inv.closingAmount || 0;
      exitProceeds += closing;
      closedTotalCost += entryAmt;
      realizedProfit += closing - entryAmt;
      dividendsReceived += divs;
    }
  }

  const netPortfolioValue = availableCash + activeCurrentValue;

  return {
    asOfDate: targetDate,
    ownerCapitalIn,
    ownerCapitalOut,
    netOwnerCapital: ownerCapitalIn - ownerCapitalOut,
    availableCash,
    activeTotalCost,
    activeCurrentValue,
    activeBookValue,
    realizedProfit,
    unrealizedProfit,
    dividendsReceived,
    exitProceeds,
    closedTotalCost,
    totalExpenses,
    netPortfolioValue,
    activeCount: active.length,
    closedCount: closed.length,
    distressedCount: distressed.length,
  };
}

// ─── Migration Helpers ─────────────────────────────────────────────────────

/**
 * التحقق مما إذا كانت البيانات الأساسية (الاستثمارات والمصاريف) موجودة في ledger
 */
export async function needsInvestmentMigration(): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'ledger'), where('type', 'in', ['invest_funding', 'invest_dividend', 'expense']))
  );
  return snap.empty;
}

/**
 * ترحيل البيانات القديمة إلى ledger (يمكن استخدامه يدوياً)
 */
export async function migrateMissingData(userId: string): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  // جلب البيانات الحالية في ledger لتجنب التكرار
  const existingInvestments = new Set<string>();
  const existingExpenses = new Set<string>();
  const ledgerSnap = await getDocs(collection(db, 'ledger'));
  ledgerSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.investmentId) existingInvestments.add(data.investmentId);
    if (data.expenseId) existingExpenses.add(data.expenseId);
  });

  // 1. ترحيل الاستثمارات
  const invSnap = await getDocs(collection(db, 'investments'));
  for (const d of invSnap.docs) {
    const inv = d.data();
    const invId = d.id;
    if (existingInvestments.has(invId)) continue;

    // تمويل الدخول
    if (inv.entryAmount && inv.entryAmount > 0) {
      await addLedgerEntry({
        date: inv.entryDate?.toDate?.() ?? new Date(),
        type: 'invest_funding',
        description: `تمويل استثمار: ${inv.name || 'بدون اسم'}`,
        cashEffect: -inv.entryAmount,
        bookValueEffect: inv.entryAmount,
        investmentId: invId,
        createdBy: userId,
      });
      created++;
    }

    // أرباح موزعة
    for (const div of inv.dividends || []) {
      await addLedgerEntry({
        date: div.date?.toDate?.() ?? new Date(),
        type: 'invest_dividend',
        description: `توزيع أرباح: ${inv.name || 'بدون اسم'}`,
        cashEffect: div.amount,
        investmentId: invId,
        createdBy: userId,
      });
      created++;
    }

    // إغلاق الاستثمار
    if (inv.status === 'closed' && inv.closingAmount && inv.closingAmount > 0) {
      await addLedgerEntry({
        date: inv.closingDate?.toDate?.() ?? new Date(),
        type: 'invest_full_exit',
        description: `إغلاق استثمار: ${inv.name || 'بدون اسم'}`,
        cashEffect: inv.closingAmount,
        bookValueEffect: -inv.entryAmount,
        realizedProfitEffect: inv.closingAmount - inv.entryAmount,
        investmentId: invId,
        createdBy: userId,
      });
      created++;
    }
  }

  // 2. ترحيل المصاريف
  const expSnap = await getDocs(collection(db, 'expenses'));
  for (const d of expSnap.docs) {
    const exp = d.data();
    const expId = d.id;
    if (existingExpenses.has(expId)) continue;
    if (exp.status === 'approved' && exp.amount && exp.amount > 0) {
      await addLedgerEntry({
        date: exp.date?.toDate?.() ?? new Date(),
        type: 'expense',
        description: `مصروف: ${exp.description || 'بدون وصف'}`,
        cashEffect: -exp.amount,
        expenseId: expId,
        investmentId: exp.investmentId || undefined,
        createdBy: userId,
      });
      created++;
    }
  }

  return { created, errors };
}
