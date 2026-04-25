/**
 * =========================================================
 * ACCOUNTING ENGINE — نظام المحاسبة
 * تم حذف حالة "distressed" — الاستثمار إما active أو closed
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

export interface CashFlowStatement {
  period: { from: Date; to: Date };
  openingBalance: number;
  capitalIn: number;
  exitProceeds: number;
  dividends: number;
  operatingIncome: number;
  expenseRefunds: number;
  investmentFunding: number;
  investmentTopups: number;
  approvedExpenses: number;
  ownerWithdrawals: number;
  closingBalance: number;
  netChange: number;
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
  // ✅ حذف distressedCount — أصبحت قيمته 0 دائماً للتوافق مع الكود القديم
  distressedCount: number;
}

// ─── Helper ────────────────────────────────────────────────────────────────
function cleanObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined && value !== null) result[key] = value;
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
  const constraints: any[] = [];
  if (investmentId) constraints.push(where('investmentId', '==', investmentId));
  if (fromDate) constraints.push(where('date', '>=', Timestamp.fromDate(fromDate)));
  if (toDate) constraints.push(where('date', '<=', Timestamp.fromDate(toDate)));
  constraints.push(orderBy('date', 'asc'));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    date: d.data().date?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as LedgerTransaction));
}

async function getAllLedgerEntries(): Promise<LedgerTransaction[]> {
  const snap = await getDocs(query(collection(db, 'ledger'), orderBy('date', 'asc')));
  return snap.docs.map(d => ({
    id: d.id, ...d.data(),
    date: d.data().date?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as LedgerTransaction));
}

// ─── Core Calculations ─────────────────────────────────────────────────────

export async function calcAvailableCash(asOfDate?: Date): Promise<number> {
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

  // ✅ النقد يأتي من الـ Ledger حصراً
  const filteredLedger = ledger.filter(tx => tx.date <= targetDate);
  const availableCash = filteredLedger.reduce((sum, tx) => sum + (tx.cashEffect || 0), 0);

  let ownerCapitalIn = 0, ownerCapitalOut = 0;
  for (const tx of filteredLedger) {
    if (tx.type === 'capital_in') ownerCapitalIn += tx.cashEffect || 0;
    else if (tx.type === 'capital_out') ownerCapitalOut += Math.abs(tx.cashEffect || 0);
  }

  // المصاريف: من الـ ledger إن وجد، وإلا من مجموع المصاريف المعتمدة
  const ledgerExpenses = filteredLedger
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.cashEffect || 0), 0);
  const approvedExpenses = expensesSnap.docs
    .map(d => d.data())
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExpenses = filteredLedger.length > 0 ? ledgerExpenses : approvedExpenses;

  const investments: any[] = investmentsSnap.docs.map(d => ({
    id: d.id, ...d.data(),
    entryDate: d.data().entryDate?.toDate?.(),
    closingDate: d.data().closingDate?.toDate?.(),
  }));

  // ✅ تحويل distressed → active (للبيانات القديمة في Firestore)
  const normalizeStatus = (s: string) => s === 'distressed' ? 'active' : s;

  const active = investments.filter(i => normalizeStatus(i.status) === 'active');
  const closed = investments.filter(i => normalizeStatus(i.status) === 'closed');

  let activeTotalCost = 0, activeCurrentValue = 0, activeBookValue = 0;
  let realizedProfit = 0, unrealizedProfit = 0, dividendsReceived = 0;
  let exitProceeds = 0, closedTotalCost = 0;

  for (const inv of investments) {
    const status = normalizeStatus(inv.status);
    const entryAmt = inv.entryAmount || 0;
    const divs = (inv.dividends || []).reduce((s: number, d: { amount: number }) => s + d.amount, 0);

    if (status === 'active') {
      const cv = inv.currentValue || entryAmt;
      activeTotalCost += entryAmt;
      activeCurrentValue += cv;
      activeBookValue += entryAmt;
      unrealizedProfit += cv - entryAmt;
      dividendsReceived += divs;
    } else {
      // مغلق
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
    distressedCount: 0, // ✅ دائماً صفر — تم حذف هذه الحالة
  };
}

// ─── Cash Flow Statement ─────────────────────────────────────────────────

export async function getCashFlowStatement(from: Date, to: Date): Promise<CashFlowStatement> {
  const allEntries = await getAllLedgerEntries();

  const before = allEntries.filter(t => t.date < from);
  const during = allEntries.filter(t => t.date >= from && t.date <= to);

  const openingBalance = before.reduce((s, t) => s + (t.cashEffect || 0), 0);

  const sum = (txs: LedgerTransaction[], types: TxType[]) =>
    txs.filter(t => types.includes(t.type)).reduce((s, t) => s + Math.abs(t.cashEffect || 0), 0);

  const capitalIn = sum(during, ['capital_in']);
  const exitProceeds = sum(during, ['invest_partial_exit', 'invest_full_exit']);
  const dividends = sum(during, ['invest_dividend']);
  const operatingIncome = sum(during, ['operating_income']);
  const expenseRefunds = sum(during, ['expense_refund']);
  const investmentFunding = sum(during, ['invest_funding']);
  const investmentTopups = sum(during, ['invest_topup']);
  const approvedExpenses = sum(during, ['expense']);
  const ownerWithdrawals = sum(during, ['capital_out']);

  const netChange = during.reduce((s, t) => s + (t.cashEffect || 0), 0);
  const closingBalance = openingBalance + netChange;

  return {
    period: { from, to },
    openingBalance,
    capitalIn, exitProceeds, dividends, operatingIncome, expenseRefunds,
    investmentFunding, investmentTopups, approvedExpenses, ownerWithdrawals,
    closingBalance, netChange,
  };
}

// ─── Recording Functions ─────────────────────────────────────────────────

export async function recordImpairment(
  investmentId: string, investmentName: string,
  oldBookValue: number, newCurrentValue: number,
  date: Date, userId: string,
): Promise<void> {
  const impairmentLoss = oldBookValue - newCurrentValue;
  await addLedgerEntry({
    date, type: 'invest_impairment',
    description: `هبوط قيمة الاستثمار: ${investmentName}`,
    cashEffect: 0,
    bookValueEffect: -impairmentLoss,
    currentValueEffect: newCurrentValue,
    investmentId, createdBy: userId,
  });
}

export async function recordInvestmentFunding(
  investmentId: string, investmentName: string,
  amount: number, date: Date, userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_funding',
    description: `تمويل استثمار: ${investmentName}`,
    cashEffect: -amount, bookValueEffect: amount,
    investmentId, createdBy: userId,
  });
}

export async function recordInvestmentExit(
  investmentId: string, investmentName: string,
  originalCost: number, exitProceeds: number,
  date: Date, userId: string,
): Promise<void> {
  const realizedProfit = exitProceeds - originalCost;
  await addLedgerEntry({
    date, type: 'invest_full_exit',
    description: `تخارج كامل: ${investmentName}`,
    cashEffect: exitProceeds,
    bookValueEffect: -originalCost,
    realizedProfitEffect: realizedProfit,
    investmentId, createdBy: userId,
  });
}

export async function recordDividend(
  investmentId: string, investmentName: string,
  amount: number, date: Date, userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_dividend',
    description: `توزيع أرباح: ${investmentName}`,
    cashEffect: amount,
    investmentId, createdBy: userId,
  });
}

export async function recordCapitalIn(
  investorId: string, investorName: string,
  amount: number, date: Date, userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'capital_in',
    description: `رأس مال: ${investorName}`,
    cashEffect: amount,
    investorId, createdBy: userId,
  });
}

export async function recordExpense(
  expenseId: string, description: string, amount: number,
  date: Date, investmentId: string | undefined, userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'expense',
    description: `مصروف: ${description}`,
    cashEffect: -amount,
    investmentId, expenseId, createdBy: userId,
  });
}

export async function recordValuation(
  investmentId: string, investmentName: string,
  newValue: number, date: Date, userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_valuation',
    description: `إعادة تقييم: ${investmentName}`,
    cashEffect: 0, currentValueEffect: newValue,
    investmentId, createdBy: userId,
  });
}

// ─── Migration & Rebuild ─────────────────────────────────────────────────

export async function needsMigration(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'ledger'), where('type', '==', 'capital_in')));
  return snap.empty;
}

export async function rebuildLedgerFromScratch(userId: string): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  try {
    const existing = await getDocs(collection(db, 'ledger'));
    const batch = writeBatch(db);
    existing.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  } catch (e) { errors.push(`فشل حذف ledger: ${e}`); }

  // 1. رأس المال من المستثمرين
  try {
    const invSnap = await getDocs(collection(db, 'investors'));
    for (const d of invSnap.docs) {
      const inv = d.data();
      if (!inv.totalPaid || inv.totalPaid <= 0) continue;
      await addLedgerEntry({
        date: inv.joinDate?.toDate?.() ?? new Date(),
        type: 'capital_in',
        description: `رأس مال: ${inv.name}`,
        cashEffect: inv.totalPaid,
        investorId: d.id, createdBy: userId,
      });
      created++;
    }
  } catch (e) { errors.push(`رأس المال: ${e}`); }

  // 2. الاستثمارات
  try {
    const invstSnap = await getDocs(collection(db, 'investments'));
    for (const d of invstSnap.docs) {
      const inv = d.data();
      const invId = d.id;
      const entryAmount = inv.entryAmount || 0;
      if (entryAmount <= 0) continue;

      // ✅ تمويل الدخول — دائماً خصم من النقد
      await addLedgerEntry({
        date: inv.entryDate?.toDate?.() ?? new Date(),
        type: 'invest_funding',
        description: `تمويل استثمار: ${inv.name || invId}`,
        cashEffect: -entryAmount,
        bookValueEffect: entryAmount,
        investmentId: invId, createdBy: userId,
      });
      created++;

      // الأرباح الموزعة
      for (const div of inv.dividends || []) {
        await addLedgerEntry({
          date: div.date?.toDate?.() ?? new Date(),
          type: 'invest_dividend',
          description: `توزيع أرباح: ${inv.name || invId}`,
          cashEffect: div.amount,
          investmentId: invId, createdBy: userId,
        });
        created++;
      }

      // ✅ إغلاق الاستثمار (closed أو distressed القديمة تُعامل كـ active بدون إضافة حركة)
      const normalStatus = inv.status === 'distressed' ? 'active' : inv.status;
      if (normalStatus === 'closed' && inv.closingAmount && inv.closingAmount > 0) {
        await addLedgerEntry({
          date: inv.closingDate?.toDate?.() ?? new Date(),
          type: 'invest_full_exit',
          description: `إغلاق استثمار: ${inv.name || invId}`,
          cashEffect: inv.closingAmount,
          bookValueEffect: -entryAmount,
          realizedProfitEffect: inv.closingAmount - entryAmount,
          investmentId: invId, createdBy: userId,
        });
        created++;
      }

      // زيادات رأس المال
      for (const add of inv.additionalAmounts || []) {
        if (!add.amount || add.amount <= 0) continue;
        await addLedgerEntry({
          date: add.date?.toDate?.() ?? new Date(),
          type: 'invest_topup',
          description: `زيادة رأس مال: ${inv.name || invId}`,
          cashEffect: -add.amount,
          bookValueEffect: add.amount,
          investmentId: invId, createdBy: userId,
        });
        created++;
      }
    }
  } catch (e) { errors.push(`الاستثمارات: ${e}`); }

  // 3. المصاريف
  try {
    const expSnap = await getDocs(collection(db, 'expenses'));
    for (const d of expSnap.docs) {
      const exp = d.data();
      if (exp.status !== 'approved' || !exp.amount) continue;
      await addLedgerEntry({
        date: exp.date?.toDate?.() ?? new Date(),
        type: 'expense',
        description: `مصروف: ${exp.description}`,
        cashEffect: -exp.amount,
        expenseId: d.id,
        investmentId: exp.investmentId,
        createdBy: userId,
      });
      created++;
    }
  } catch (e) { errors.push(`المصاريف: ${e}`); }

  return { created, errors };
}

export async function migrateToLedger(userId: string): Promise<{ created: number; errors: string[] }> {
  return rebuildLedgerFromScratch(userId);
}

export async function needsInvestmentMigration(): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'ledger'), where('type', 'in', ['invest_funding', 'invest_dividend', 'expense']))
  );
  return snap.empty;
}

export async function migrateMissingData(userId: string): Promise<{ created: number; errors: string[] }> {
  return rebuildLedgerFromScratch(userId);
}

// ─── Validation ─────────────────────────────────────────────────────────

export async function validateLedger(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  const allEntries = await getAllLedgerEntries();

  const entriesWithoutDate = allEntries.filter(e => !e.date);
  if (entriesWithoutDate.length > 0) issues.push(`${entriesWithoutDate.length} حركة بدون تاريخ`);

  const invalidCashEffect = allEntries.filter(e => isNaN(e.cashEffect));
  if (invalidCashEffect.length > 0) issues.push(`${invalidCashEffect.length} حركة بـ cashEffect غير رقمي`);

  return { valid: issues.length === 0, issues };
}

export async function debugLedger(): Promise<void> {
  const entries = await getAllLedgerEntries();
  console.log('=== LEDGER ENTRIES ===', `Total: ${entries.length}`);
  let total = 0;
  for (const e of entries) {
    total += e.cashEffect || 0;
    console.log(`${e.date.toISOString().slice(0, 10)} | ${e.type.padEnd(20)} | ${(e.cashEffect || 0).toFixed(2)} | Bal: ${total.toFixed(2)} | ${e.description}`);
  }
  console.log(`Final Balance: ${total.toFixed(2)}`);
}

export async function debugPortfolio(): Promise<void> {
  const snap = await calcPortfolioSnapshot();
  console.log('=== PORTFOLIO SNAPSHOT ===');
  console.log(`النقد المتوفر: ${snap.availableCash.toFixed(2)}`);
  console.log(`قيمة القائمة: ${snap.activeCurrentValue.toFixed(2)}`);
  console.log(`صافي قيمة المحفظة: ${snap.netPortfolioValue.toFixed(2)}`);
  console.log(`أرباح محققة: ${snap.realizedProfit.toFixed(2)}`);
  console.log(`أرباح غير محققة: ${snap.unrealizedProfit.toFixed(2)}`);
  console.log(`مصاريف: ${snap.totalExpenses.toFixed(2)}`);
}
