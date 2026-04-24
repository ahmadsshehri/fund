/**
 * =========================================================
 * ACCOUNTING ENGINE — نظام المحاسبة الصحيح
 * =========================================================
 *
 * المبدأ الأساسي:
 * كل رقم يُحسب من سجل الحركات (investment_transactions + cash_ledger)
 * وليس من حقول مباشرة في الشاشة.
 *
 * المعادلات المعتمدة:
 *
 * النقد المتوفر =
 *   رأس مال داخل
 *   + متحصلات تخارج
 *   + توزيعات نقدية مستلمة
 *   + دخل تشغيلي
 *   - تمويل استثمارات جديدة
 *   - زيادات على استثمارات قائمة
 *   - مصروفات معتمدة
 *   - سحوبات
 *
 * القيمة الدفترية للاستثمار =
 *   التكلفة الأصلية
 *   + الزيادات
 *   - حصة التخارجات الجزئية من القيمة الدفترية
 *   - الشطب
 *
 * الربح المحقق =
 *   متحصلات التخارج - القيمة الدفترية المتخارج منها - رسوم التخارج
 *
 * الربح غير المحقق =
 *   القيمة الحالية - القيمة الدفترية المتبقية  (للاستثمارات القائمة فقط)
 *
 * صافي قيمة المحفظة =
 *   النقد المتوفر + القيمة الحالية للاستثمارات القائمة
 */

import {
  collection, getDocs, addDoc, query,
  orderBy, where, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TxType =
  | 'capital_in'          // إيداع رأس مال من مالك/مستثمر
  | 'capital_out'         // سحب من مالك/مستثمر
  | 'invest_funding'      // تمويل استثمار جديد
  | 'invest_topup'        // زيادة على استثمار قائم
  | 'invest_dividend'     // توزيع نقدي مستلم من استثمار
  | 'invest_partial_exit' // تخارج جزئي من استثمار
  | 'invest_full_exit'    // تخارج كامل من استثمار
  | 'invest_valuation'    // إعادة تقييم (لا تأثير على الكاش)
  | 'invest_impairment'   // هبوط قيمة / شطب جزئي
  | 'invest_writeoff'     // شطب كامل
  | 'expense'             // مصروف معتمد
  | 'expense_refund'      // استرداد مصروف
  | 'operating_income';   // دخل تشغيلي (إيجار، عمولة، ...)

export interface LedgerTransaction {
  id?: string;
  date: Date;
  type: TxType;
  description: string;
  // أثر على الكاش: موجب = داخل، سالب = خارج، 0 = لا أثر
  cashEffect: number;
  // أثر على القيمة الدفترية للاستثمار
  bookValueEffect?: number;
  // أثر على الربح المحقق
  realizedProfitEffect?: number;
  // أثر على القيمة الحالية (التقييم)
  currentValueEffect?: number;
  // المراجع
  investmentId?: string;
  investorId?: string;
  expenseId?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
}

export interface InvestmentFinancials {
  investmentId: string;
  // التكاليف
  originalCost: number;        // التكلفة الأصلية
  topups: number;              // الزيادات
  totalCost: number;           // إجمالي التكلفة التاريخية
  // التخارجات
  partialExitProceeds: number; // متحصلات تخارج جزئي
  fullExitProceeds: number;    // متحصلات التخارج الكامل
  totalExitProceeds: number;   // إجمالي المتحصلات
  // القيمة الدفترية
  bookValueReduction: number;  // القيمة الدفترية للأجزاء المتخارج منها
  writeoffs: number;           // الشطب
  remainingBookValue: number;  // القيمة الدفترية المتبقية
  // القيمة الحالية (من آخر تقييم)
  currentValue: number;
  // التوزيعات
  dividendsReceived: number;   // توزيعات نقدية مستلمة
  // الأرباح
  realizedProfit: number;      // ربح محقق = متحصلات - قيمة دفترية متخارج منها
  unrealizedProfit: number;    // ربح غير محقق = قيمة حالية - قيمة دفترية متبقية
  totalReturn: number;         // إجمالي العائد = محقق + غير محقق + توزيعات
  returnPct: number;           // نسبة العائد على إجمالي التكلفة
  annualReturnPct: number;     // العائد السنوي
  durationDays: number;
}

export interface PortfolioSnapshot {
  asOfDate: Date;
  // رأس المال
  ownerCapitalIn: number;         // رأس مال الملاك الداخل
  ownerCapitalOut: number;        // سحوبات الملاك
  netOwnerCapital: number;        // صافي رأس مال الملاك
  // النقد
  availableCash: number;          // النقد المتوفر
  // الاستثمارات القائمة فقط
  activeTotalCost: number;        // إجمالي تكلفة الاستثمارات القائمة
  activeCurrentValue: number;     // القيمة الحالية للاستثمارات القائمة
  activeBookValue: number;        // القيمة الدفترية للاستثمارات القائمة
  // الأرباح
  realizedProfit: number;         // أرباح محققة (من تخارجات) = مبلغ الإغلاق - التكلفة
  unrealizedProfit: number;       // أرباح غير محققة (من تقييمات)
  dividendsReceived: number;      // توزيعات نقدية مستلمة
  exitProceeds: number;           // إجمالي مبالغ الإغلاق المستلمة (متحصلات التخارج)
  closedTotalCost: number;        // تكلفة الاستثمارات المغلقة
  // المصروفات
  totalExpenses: number;
  // صافي قيمة المحفظة
  netPortfolioValue: number;      // نقد + قيمة حالية القائمة
  // إحصائيات
  activeCount: number;
  closedCount: number;
  distressedCount: number;
}

// ─── Cash Ledger ─────────────────────────────────────────────────────────────

export async function addLedgerEntry(tx: LedgerTransaction): Promise<string> {
  const ref = await addDoc(collection(db, 'ledger'), {
    ...tx,
    date: Timestamp.fromDate(tx.date),
    createdAt: Timestamp.fromDate(new Date()),
  });
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
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    date: d.data().date?.toDate?.() ?? new Date(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
  } as LedgerTransaction));
}

// ─── Core Calculations ────────────────────────────────────────────────────────

/**
 * يحسب النقد المتوفر من سجل الحركات حتى تاريخ معين
 */
export async function calcAvailableCash(asOfDate?: Date): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [orderBy('date', 'asc')];
  if (asOfDate) constraints.unshift(where('date', '<=', Timestamp.fromDate(asOfDate)));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  return snap.docs.reduce((sum, d) => sum + ((d.data().cashEffect as number) || 0), 0);
}

/**
 * يحسب رأس مال الملاك الداخل فقط (إيداعات - سحوبات)
 */
export async function calcOwnerCapital(asOfDate?: Date): Promise<{ capitalIn: number; capitalOut: number; net: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('type', 'in', ['capital_in', 'capital_out']),
    orderBy('date', 'asc'),
  ];
  if (asOfDate) constraints.unshift(where('date', '<=', Timestamp.fromDate(asOfDate)));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  let capitalIn = 0, capitalOut = 0;
  snap.docs.forEach(d => {
    const tx = d.data();
    if (tx.type === 'capital_in') capitalIn += tx.cashEffect || 0;
    else capitalOut += Math.abs(tx.cashEffect || 0);
  });
  return { capitalIn, capitalOut, net: capitalIn - capitalOut };
}

/**
 * يحسب الملخص المالي لاستثمار واحد من سجل حركاته
 */
export async function calcInvestmentFinancials(
  investmentId: string,
  entryDate: Date,
  closingDate?: Date,
  status?: string,
): Promise<InvestmentFinancials> {
  const txs = await getLedgerEntries(investmentId);

  let originalCost = 0, topups = 0;
  let partialExitProceeds = 0, fullExitProceeds = 0;
  let bookValueReduction = 0, writeoffs = 0;
  let currentValue = 0, dividendsReceived = 0;
  let realizedProfitEffect = 0;

  for (const tx of txs) {
    switch (tx.type) {
      case 'invest_funding':
        originalCost += Math.abs(tx.cashEffect || 0);
        break;
      case 'invest_topup':
        topups += Math.abs(tx.cashEffect || 0);
        break;
      case 'invest_dividend':
        dividendsReceived += tx.cashEffect || 0;
        break;
      case 'invest_partial_exit':
        partialExitProceeds += tx.cashEffect || 0;
        bookValueReduction += Math.abs(tx.bookValueEffect || 0);
        realizedProfitEffect += tx.realizedProfitEffect || 0;
        break;
      case 'invest_full_exit':
        fullExitProceeds += tx.cashEffect || 0;
        bookValueReduction += Math.abs(tx.bookValueEffect || 0);
        realizedProfitEffect += tx.realizedProfitEffect || 0;
        break;
      case 'invest_impairment':
        writeoffs += Math.abs(tx.bookValueEffect || 0);
        currentValue += tx.currentValueEffect || 0;
        break;
      case 'invest_writeoff':
        writeoffs += Math.abs(tx.bookValueEffect || 0);
        currentValue = 0;
        break;
      case 'invest_valuation':
        // آخر تقييم يحدد القيمة الحالية
        if (tx.currentValueEffect !== undefined) {
          currentValue = tx.currentValueEffect;
        }
        break;
    }
  }

  const totalCost = originalCost + topups;
  const totalExitProceeds = partialExitProceeds + fullExitProceeds;
  const remainingBookValue = totalCost - bookValueReduction - writeoffs;

  // الصفقة المغلقة: القيمة الحالية = 0، القيمة الدفترية = 0
  const isClosed = status === 'closed';
  const finalCurrentValue = isClosed ? 0 : Math.max(0, currentValue || remainingBookValue);
  const finalBookValue = isClosed ? 0 : Math.max(0, remainingBookValue);

  const realizedProfit = isClosed
    ? totalExitProceeds - (totalCost - writeoffs) // للمغلق الكامل
    : realizedProfitEffect; // للجزئي

  const unrealizedProfit = isClosed ? 0 : finalCurrentValue - finalBookValue;

  const totalReturn = realizedProfit + unrealizedProfit + dividendsReceived;

  // المدة والعائد السنوي
  const endDate = closingDate || new Date();
  const durationDays = Math.max(1, Math.round((endDate.getTime() - entryDate.getTime()) / 86400000));
  const returnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
  const annualReturnPct = durationDays > 0 ? returnPct / (durationDays / 365) : 0;

  return {
    investmentId,
    originalCost, topups, totalCost,
    partialExitProceeds, fullExitProceeds, totalExitProceeds,
    bookValueReduction, writeoffs, remainingBookValue: finalBookValue,
    currentValue: finalCurrentValue,
    dividendsReceived,
    realizedProfit, unrealizedProfit, totalReturn,
    returnPct, annualReturnPct, durationDays,
  };
}

/**
 * يحسب لقطة كاملة للمحفظة حتى تاريخ معين
 * يحسب دائماً من البيانات المباشرة للدقة
 */
export async function calcPortfolioSnapshot(asOfDate?: Date): Promise<PortfolioSnapshot> {
  const targetDate = asOfDate || new Date();

  // جلب كل البيانات بشكل متوازي
  const [ledgerSnap, investmentsSnap, expensesSnap, investorsSnap] = await Promise.all([
    getDocs(query(collection(db, 'ledger'), orderBy('date', 'asc'))),
    getDocs(collection(db, 'investments')),
    getDocs(collection(db, 'expenses')),
    getDocs(collection(db, 'investors')),
  ]);

  const ledger = ledgerSnap.docs
    .map(d => ({ ...d.data(), date: d.data().date?.toDate?.() ?? new Date() } as LedgerTransaction))
    .filter(tx => tx.date <= targetDate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const investments: any[] = investmentsSnap.docs.map(d => ({
    id: d.id, ...d.data(),
    entryDate: d.data().entryDate?.toDate?.(),
    closingDate: d.data().closingDate?.toDate?.(),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses: any[] = expensesSnap.docs.map(d => d.data());

  // ── رأس المال دائماً من investors مباشرة ──
  const finalOwnerCapitalIn = investorsSnap.docs.reduce((s, d) => s + ((d.data().totalPaid as number) || 0), 0);
  const ownerCapitalOut = 0; // سيُضاف لاحقاً من ledger إذا وُجد

  // ── هل الـ ledger مكتمل (بعد migration كامل)؟ ──
  const ledgerCapitalIn = ledger.filter(t => t.type === 'capital_in').reduce((s, t) => s + (t.cashEffect || 0), 0);
  // نعتبر ledger مكتملاً فقط إذا مجموعه يساوي رأس المال من المستثمرين تقريباً
  const ledgerIsComplete = Math.abs(ledgerCapitalIn - finalOwnerCapitalIn) < 1;

  let availableCash: number;

  // ── الاستثمارات ──
  const active     = investments.filter((i: {status:string}) => i.status === 'active');
  const closed     = investments.filter((i: {status:string}) => i.status === 'closed');
  const distressed = investments.filter((i: {status:string}) => i.status === 'distressed');

  // القاعدة: القيمة الحالية للمغلق = 0
  let activeTotalCost = 0, activeCurrentValue = 0, activeBookValue = 0;
  let realizedProfit = 0, unrealizedProfit = 0, dividendsReceived = 0;
  let exitProceeds = 0; // متحصلات التخارج الفعلية (مبالغ الإغلاق)
  let closedTotalCost = 0; // تكلفة الاستثمارات المغلقة

  for (const inv of investments) {
    const isClosed = inv.status === 'closed';
    const entryAmt = inv.entryAmount || 0;
    // الأرباح الموزعة: فقط من الاستثمارات القائمة (المغلق divs حُسبت في realizedProfit)
    const divs = (inv.dividends || []).reduce((s: number, d: {amount:number}) => s + d.amount, 0);

    if (!isClosed) {
      // قائم أو متعثر: له قيمة حالية، أرباحه الموزعة دخلت الكاش
      const cost = entryAmt;
      const cv = inv.currentValue || entryAmt;
      activeTotalCost    += cost;
      activeCurrentValue += cv;
      activeBookValue    += cost;
      unrealizedProfit   += (cv - cost);
      dividendsReceived  += divs; // أرباح موزعة من القائمة دخلت الكاش
    } else {
      // مغلق: القيمة الحالية = 0
      // ربح التخارج = مبلغ الإغلاق - تكلفة الدخول (بدون الأرباح الموزعة)
      const closing = inv.closingAmount || 0;
      exitProceeds    += closing;
      closedTotalCost += entryAmt;
      // الربح المحقق = فرق التخارج فقط (الأرباح الموزعة من المغلق جزء منفصل)
      realizedProfit  += (closing - entryAmt);
      dividendsReceived += divs; // أرباح الاستثمار المغلق قبل إغلاقه
    }
  }

  const totalExpenses = expenses
    .filter((e: {status:string}) => e.status === 'approved')
    .reduce((s: number, e: {amount:number}) => s + (e.amount || 0), 0);

  // الكاش = رأس المال + متحصلات الإغلاق + توزيعات − تكلفة القائمة − تكلفة المغلقة − مصاريف
  // ملاحظة: closedTotalCost ترجع في exitProceeds فيلغيان بعضهما، المتبقي هو الربح المحقق
  if (ledgerIsComplete) {
    availableCash = ledger.reduce((s, t) => s + (t.cashEffect || 0), 0);
  } else {
    availableCash = finalOwnerCapitalIn
      - ownerCapitalOut
      - activeTotalCost      // تمويل القائمة خرج من الكاش
      + exitProceeds         // مبالغ الإغلاق رجعت للكاش
      - closedTotalCost      // تكلفة المغلقة كانت قد خرجت
      + dividendsReceived    // توزيعات دخلت الكاش
      - totalExpenses;       // مصاريف خرجت
  }

  const finalAvailableCash = availableCash;
  const netPortfolioValue = finalAvailableCash + activeCurrentValue;

  return {
    asOfDate: targetDate,
    ownerCapitalIn: finalOwnerCapitalIn, ownerCapitalOut, netOwnerCapital: finalOwnerCapitalIn - ownerCapitalOut,
    availableCash: finalAvailableCash,
    activeTotalCost, activeCurrentValue, activeBookValue,
    realizedProfit, unrealizedProfit, dividendsReceived,
    exitProceeds, closedTotalCost,
    totalExpenses,
    netPortfolioValue,
    activeCount: active.length,
    closedCount: closed.length,
    distressedCount: distressed.length,
  };
}

/**
 * يُنشئ حركة محاسبية عند إضافة استثمار جديد
 */
export async function recordInvestmentFunding(
  investmentId: string,
  investmentName: string,
  amount: number,
  date: Date,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_funding',
    description: `تمويل استثمار: ${investmentName}`,
    cashEffect: -amount,        // خرج من الكاش
    bookValueEffect: amount,    // زاد في القيمة الدفترية
    investmentId, createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند إغلاق استثمار
 */
export async function recordInvestmentExit(
  investmentId: string,
  investmentName: string,
  originalCost: number,
  exitProceeds: number,
  date: Date,
  userId: string,
): Promise<void> {
  const realizedProfit = exitProceeds - originalCost;
  await addLedgerEntry({
    date, type: 'invest_full_exit',
    description: `تخارج كامل: ${investmentName}`,
    cashEffect: exitProceeds,         // دخل للكاش
    bookValueEffect: -originalCost,   // صُفِّر من القيمة الدفترية
    realizedProfitEffect: realizedProfit,
    investmentId, createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند استلام أرباح موزعة
 */
export async function recordDividend(
  investmentId: string,
  investmentName: string,
  amount: number,
  date: Date,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_dividend',
    description: `توزيع أرباح: ${investmentName}`,
    cashEffect: amount,    // دخل للكاش
    investmentId, createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند إضافة مستثمر (رأس مال داخل)
 */
export async function recordCapitalIn(
  investorId: string,
  investorName: string,
  amount: number,
  date: Date,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'capital_in',
    description: `رأس مال: ${investorName}`,
    cashEffect: amount,
    investorId, createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند إضافة مصروف
 */
export async function recordExpense(
  expenseId: string,
  description: string,
  amount: number,
  date: Date,
  investmentId: string | undefined,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'expense',
    description: `مصروف: ${description}`,
    cashEffect: -amount,
    investmentId, expenseId, createdBy: userId,
  });
}

/**
 * يُنشئ حركة إعادة تقييم (لا تأثير على الكاش)
 */
export async function recordValuation(
  investmentId: string,
  investmentName: string,
  newValue: number,
  date: Date,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date, type: 'invest_valuation',
    description: `إعادة تقييم: ${investmentName}`,
    cashEffect: 0,              // لا أثر على الكاش
    currentValueEffect: newValue,
    investmentId, createdBy: userId,
  });
}

// ─── Cash Flow Statement ─────────────────────────────────────────────────────

export interface CashFlowStatement {
  period: { from: Date; to: Date };
  openingBalance: number;
  // داخل
  capitalIn: number;
  exitProceeds: number;
  dividends: number;
  operatingIncome: number;
  expenseRefunds: number;
  // خارج
  investmentFunding: number;
  investmentTopups: number;
  approvedExpenses: number;
  ownerWithdrawals: number;
  // رصيد
  closingBalance: number;
  netChange: number;
}

export async function getCashFlowStatement(from: Date, to: Date): Promise<CashFlowStatement> {
  const allEntries = await getLedgerEntries();

  const before = allEntries.filter(t => t.date < from);
  const during = allEntries.filter(t => t.date >= from && t.date <= to);

  const openingBalance = before.reduce((s, t) => s + (t.cashEffect || 0), 0);

  const sum = (txs: LedgerTransaction[], types: TxType[], sign: 1 | -1 = 1) =>
    txs.filter(t => types.includes(t.type))
       .reduce((s, t) => s + Math.abs(t.cashEffect || 0) * sign, 0);

  const capitalIn       = sum(during, ['capital_in']);
  const exitProceeds    = sum(during, ['invest_partial_exit', 'invest_full_exit']);
  const dividends       = sum(during, ['invest_dividend']);
  const operatingIncome = sum(during, ['operating_income']);
  const expenseRefunds  = sum(during, ['expense_refund']);
  const investmentFunding = sum(during, ['invest_funding']);
  const investmentTopups  = sum(during, ['invest_topup']);
  const approvedExpenses  = sum(during, ['expense']);
  const ownerWithdrawals  = sum(during, ['capital_out']);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * يتحقق إذا كان النظام يحتاج migration (لا يوجد سجلات في ledger)
 */
export async function needsMigration(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'ledger'), orderBy('date'), where('type', '==', 'capital_in')));
  return snap.empty;
}

/**
 * Migrate: يحول البيانات القديمة إلى سجلات في ledger
 * يُشغَّل مرة واحدة فقط
 */
export async function migrateToLedger(userId: string): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  // 1. المستثمرون → capital_in
  try {
    const invSnap = await getDocs(collection(db, 'investors'));
    for (const d of invSnap.docs) {
      const inv = d.data();
      if (!inv.totalPaid || inv.totalPaid <= 0) continue;
      await addLedgerEntry({
        date: inv.joinDate?.toDate?.() ?? new Date(),
        type: 'capital_in',
        description: `رأس مال مُرحَّل: ${inv.name}`,
        cashEffect: inv.totalPaid,
        investorId: d.id,
        createdBy: userId,
      });
      created++;
    }
  } catch(e) { errors.push(`investors: ${e}`); }

  // 2. الاستثمارات → invest_funding
  try {
    const invstSnap = await getDocs(collection(db, 'investments'));
    for (const d of invstSnap.docs) {
      const inv = d.data();
      if (!inv.entryAmount || inv.entryAmount <= 0) continue;

      // تمويل الدخول
      await addLedgerEntry({
        date: inv.entryDate?.toDate?.() ?? new Date(),
        type: 'invest_funding',
        description: `استثمار مُرحَّل: ${inv.name}`,
        cashEffect: -inv.entryAmount,
        bookValueEffect: inv.entryAmount,
        investmentId: d.id,
        createdBy: userId,
      });
      created++;

      // الأرباح الموزعة (dividends array)
      for (const dv of (inv.dividends || [])) {
        await addLedgerEntry({
          date: dv.date?.toDate?.() ?? new Date(),
          type: 'invest_dividend',
          description: `توزيع مُرحَّل: ${inv.name}`,
          cashEffect: dv.amount,
          investmentId: d.id,
          createdBy: userId,
        });
        created++;
      }

      // الإغلاق
      if (inv.status === 'closed' && inv.closingAmount > 0) {
        await addLedgerEntry({
          date: inv.closingDate?.toDate?.() ?? new Date(),
          type: 'invest_full_exit',
          description: `إغلاق مُرحَّل: ${inv.name}`,
          cashEffect: inv.closingAmount,
          bookValueEffect: -inv.entryAmount,
          realizedProfitEffect: inv.closingAmount - inv.entryAmount,
          investmentId: d.id,
          createdBy: userId,
        });
        created++;
      }

      // التقييمات (valueUpdates)
      for (const vu of (inv.valueUpdates || [])) {
        await addLedgerEntry({
          date: vu.date?.toDate?.() ?? new Date(),
          type: 'invest_valuation',
          description: `تقييم مُرحَّل: ${inv.name}`,
          cashEffect: 0,
          currentValueEffect: vu.newValue,
          investmentId: d.id,
          createdBy: userId,
        });
        created++;
      }
    }
  } catch(e) { errors.push(`investments: ${e}`); }

  // 3. المصاريف → expense
  try {
    const expSnap = await getDocs(collection(db, 'expenses'));
    for (const d of expSnap.docs) {
      const exp = d.data();
      if (exp.status !== 'approved' || !exp.amount) continue;
      await addLedgerEntry({
        date: exp.date?.toDate?.() ?? new Date(),
        type: 'expense',
        description: `مصروف مُرحَّل: ${exp.description}`,
        cashEffect: -exp.amount,
        expenseId: d.id,
        investmentId: exp.investmentId,
        createdBy: userId,
      });
      created++;
    }
  } catch(e) { errors.push(`expenses: ${e}`); }

  return { created, errors };
}
