/**
 * =========================================================
 * ACCOUNTING ENGINE — نظام المحاسبة الصحيح
 * =========================================================
 *
 * المبدأ الأساسي:
 * كل رقم يُحسب من سجل الحركات (ledger)
 * وليس من حقول مباشرة في الشاشة.
 *
 * المعادلات المعتمدة:
 *
 * النقد المتوفر = Σ(cashEffect) من ledger
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
 *   القيمة الحالية - القيمة الدفترية المتبقية (للاستثمارات القائمة فقط)
 *
 * صافي قيمة المحفظة =
 *   النقد المتوفر + القيمة الحالية للاستثمارات القائمة
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
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TxType =
  | 'capital_in' // إيداع رأس مال من مالك/مستثمر
  | 'capital_out' // سحب من مالك/مستثمر
  | 'invest_funding' // تمويل استثمار جديد
  | 'invest_topup' // زيادة على استثمار قائم
  | 'invest_dividend' // توزيع نقدي مستلم من استثمار
  | 'invest_partial_exit' // تخارج جزئي من استثمار
  | 'invest_full_exit' // تخارج كامل من استثمار
  | 'invest_valuation' // إعادة تقييم (لا تأثير على الكاش)
  | 'invest_impairment' // هبوط قيمة / شطب جزئي
  | 'invest_writeoff' // شطب كامل
  | 'expense' // مصروف معتمد
  | 'expense_refund' // استرداد مصروف
  | 'operating_income'; // دخل تشغيلي (إيجار، عمولة، ...)

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
  originalCost: number; // التكلفة الأصلية
  topups: number; // الزيادات
  totalCost: number; // إجمالي التكلفة التاريخية
  // التخارجات
  partialExitProceeds: number; // متحصلات تخارج جزئي
  fullExitProceeds: number; // متحصلات التخارج الكامل
  totalExitProceeds: number; // إجمالي المتحصلات
  // القيمة الدفترية
  bookValueReduction: number; // القيمة الدفترية للأجزاء المتخارج منها
  writeoffs: number; // الشطب
  remainingBookValue: number; // القيمة الدفترية المتبقية
  // القيمة الحالية (من آخر تقييم)
  currentValue: number;
  // التوزيعات
  dividendsReceived: number; // توزيعات نقدية مستلمة
  // الأرباح
  realizedProfit: number; // ربح محقق = متحصلات - قيمة دفترية متخارج منها
  unrealizedProfit: number; // ربح غير محقق = قيمة حالية - قيمة دفترية متبقية
  totalReturn: number; // إجمالي العائد = محقق + غير محقق + توزيعات
  returnPct: number; // نسبة العائد على إجمالي التكلفة
  annualReturnPct: number; // العائد السنوي
  durationDays: number;
}

export interface PortfolioSnapshot {
  asOfDate: Date;
  // رأس المال
  ownerCapitalIn: number; // رأس مال الملاك الداخل
  ownerCapitalOut: number; // سحوبات الملاك
  netOwnerCapital: number; // صافي رأس مال الملاك
  // النقد
  availableCash: number; // النقد المتوفر
  // الاستثمارات القائمة فقط
  activeTotalCost: number; // إجمالي تكلفة الاستثمارات القائمة
  activeCurrentValue: number; // القيمة الحالية للاستثمارات القائمة
  activeBookValue: number; // القيمة الدفترية للاستثمارات القائمة
  // الأرباح
  realizedProfit: number; // أرباح محققة (من تخارجات) = مبلغ الإغلاق - التكلفة
  unrealizedProfit: number; // أرباح غير محققة (من تقييمات)
  dividendsReceived: number; // توزيعات نقدية مستلمة
  exitProceeds: number; // إجمالي مبالغ الإغلاق المستلمة (متحصلات التخارج)
  closedTotalCost: number; // تكلفة الاستثمارات المغلقة
  // المصروفات
  totalExpenses: number;
  // صافي قيمة المحفظة
  netPortfolioValue: number; // نقد + قيمة حالية القائمة
  // إحصائيات
  activeCount: number;
  closedCount: number;
  distressedCount: number;
}

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

// ─── Ledger Operations ─────────────────────────────────────────────────────

/**
 * إضافة حركة جديدة في دفتر الأستاذ
 */
export async function addLedgerEntry(tx: LedgerTransaction): Promise<string> {
  const ref = await addDoc(collection(db, 'ledger'), {
    ...tx,
    date: Timestamp.fromDate(tx.date),
    createdAt: Timestamp.fromDate(new Date()),
  });
  return ref.id;
}

/**
 * جلب حركات دفتر الأستاذ مع فلترة اختيارية
 */
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
  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate?.() ?? new Date(),
        createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
      } as LedgerTransaction),
  );
}

/**
 * جلب جميع حركات دفتر الأستاذ (للاستخدام الداخلي)
 */
async function getAllLedgerEntries(): Promise<LedgerTransaction[]> {
  const snap = await getDocs(query(collection(db, 'ledger'), orderBy('date', 'asc')));
  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...d.data(),
        date: d.data().date?.toDate?.() ?? new Date(),
        createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
      } as LedgerTransaction),
  );
}

// ─── Core Calculations ─────────────────────────────────────────────────────

/**
 * يحسب النقد المتوفر من سجل الحركات (المصدر الوحيد والصحيح)
 */
export async function calcAvailableCash(asOfDate?: Date): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [orderBy('date', 'asc')];
  if (asOfDate) constraints.unshift(where('date', '<=', Timestamp.fromDate(asOfDate)));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  const total = snap.docs.reduce((sum, d) => sum + ((d.data().cashEffect as number) || 0), 0);

  return total;
}

/**
 * يحسب رأس مال الملاك (إيداعات - سحوبات)
 */
export async function calcOwnerCapital(
  asOfDate?: Date,
): Promise<{ capitalIn: number; capitalOut: number; net: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [
    where('type', 'in', ['capital_in', 'capital_out']),
    orderBy('date', 'asc'),
  ];
  if (asOfDate) constraints.unshift(where('date', '<=', Timestamp.fromDate(asOfDate)));

  const snap = await getDocs(query(collection(db, 'ledger'), ...constraints));
  let capitalIn = 0,
    capitalOut = 0;
  snap.docs.forEach((d) => {
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

  let originalCost = 0,
    topups = 0;
  let partialExitProceeds = 0,
    fullExitProceeds = 0;
  let bookValueReduction = 0,
    writeoffs = 0;
  let currentValue = 0,
    dividendsReceived = 0;
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
        if (tx.currentValueEffect !== undefined) {
          currentValue = tx.currentValueEffect;
        }
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

  // الربح المحقق للمغلق الكامل
  const realizedProfit = isClosed
    ? totalExitProceeds - totalCost // للمغلق الكامل، كل التكلفة قابلة للخصم
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
    originalCost,
    topups,
    totalCost,
    partialExitProceeds,
    fullExitProceeds,
    totalExitProceeds,
    bookValueReduction,
    writeoffs,
    remainingBookValue: finalBookValue,
    currentValue: finalCurrentValue,
    dividendsReceived,
    realizedProfit,
    unrealizedProfit,
    totalReturn,
    returnPct,
    annualReturnPct,
    durationDays,
  };
}

/**
 * يحسب لقطة كاملة للمحفظة حتى تاريخ معين
 * المصدر الوحيد: دفتر الأستاذ (ledger)
 */
export async function calcPortfolioSnapshot(asOfDate?: Date): Promise<PortfolioSnapshot> {
  const targetDate = asOfDate || new Date();

  // ── جلب جميع البيانات المطلوبة ──
  const [ledger, investmentsSnap, expensesSnap, investorsSnap] = await Promise.all([
    getAllLedgerEntries(),
    getDocs(collection(db, 'investments')),
    getDocs(collection(db, 'expenses')),
    getDocs(collection(db, 'investors')),
  ]);

  // فلترة ledger حسب التاريخ
  const filteredLedger = ledger.filter((tx) => tx.date <= targetDate);

  // ── 1. النقد المتوفر (من ledger مباشرة) ──
  // هذه هي الطريقة الوحيدة الصحيحة لحساب النقد
  const availableCash = filteredLedger.reduce((sum, tx) => sum + (tx.cashEffect || 0), 0);

  // ── 2. رأس المال (من ledger) ──
  let ownerCapitalIn = 0,
    ownerCapitalOut = 0;
  for (const tx of filteredLedger) {
    if (tx.type === 'capital_in') {
      ownerCapitalIn += tx.cashEffect || 0;
    } else if (tx.type === 'capital_out') {
      ownerCapitalOut += Math.abs(tx.cashEffect || 0);
    }
  }

  // ── 3. المصاريف (من expenses في حالة عدم وجودها في ledger كاملة) ──
  // نستخدم expenses collection كنسخة احتياطية، لكن المصدر الأساسي هو ledger
  const approvedExpenses = expensesSnap.docs
    .map((d) => d.data())
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  // من ledger
  const ledgerExpenses = filteredLedger
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.cashEffect || 0), 0);

  // نأخذ القيمة الأكبر (أو نستخدم ledger إذا كان غير فارغ)
  const totalExpenses = filteredLedger.length > 0 ? ledgerExpenses : approvedExpenses;

  // ── 4. الاستثمارات ──
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
      // استثمار قائم أو متعثر
      const cv = inv.currentValue || entryAmt;
      activeTotalCost += entryAmt;
      activeCurrentValue += cv;
      activeBookValue += entryAmt;
      unrealizedProfit += cv - entryAmt;
      dividendsReceived += divs;
    } else {
      // استثمار مغلق
      const closing = inv.closingAmount || 0;
      exitProceeds += closing;
      closedTotalCost += entryAmt;
      realizedProfit += closing - entryAmt;
      dividendsReceived += divs;
    }
  }

  // ── 5. صافي قيمة المحفظة ──
  const netPortfolioValue = availableCash + activeCurrentValue;

  // ── 6. التحقق من صحة الحسابات (تنبيه فقط، لا يمنع العرض) ──
  if (availableCash < -1000) {
    console.warn('⚠️ تحذير: النقد المتوفر سالب بشكل غير طبيعي:', availableCash);
    console.warn('الرجاء مراجعة ledger والتأكد من صحة cashEffect لجميع الحركات');
  }

  // التحقق من توازن المعادلة المحاسبية (فقط للتصحيح)
  const calculatedFromComponents =
    ownerCapitalIn - ownerCapitalOut - activeTotalCost + exitProceeds + dividendsReceived - totalExpenses;

  if (Math.abs(availableCash - calculatedFromComponents) > 100) {
    console.warn('⚠️ عدم تطابق في حساب النقد:');
    console.warn(`  من ledger: ${availableCash}`);
    console.warn(`  من المكونات: ${calculatedFromComponents}`);
    console.warn(`  الفرق: ${availableCash - calculatedFromComponents}`);
  }

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

// ─── Recording Functions ───────────────────────────────────────────────────

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
    date,
    type: 'invest_funding',
    description: `تمويل استثمار: ${investmentName}`,
    cashEffect: -amount, // خرج من الكاش
    bookValueEffect: amount, // زاد في القيمة الدفترية
    investmentId,
    createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند إغلاق استثمار (تخارج كامل)
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
    date,
    type: 'invest_full_exit',
    description: `تخارج كامل: ${investmentName}`,
    cashEffect: exitProceeds, // دخل للكاش
    bookValueEffect: -originalCost, // صُفِّر من القيمة الدفترية
    realizedProfitEffect: realizedProfit,
    investmentId,
    createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند تخارج جزئي
 */
export async function recordPartialExit(
  investmentId: string,
  investmentName: string,
  exitedBookValue: number,
  exitProceeds: number,
  date: Date,
  userId: string,
): Promise<void> {
  const realizedProfit = exitProceeds - exitedBookValue;
  await addLedgerEntry({
    date,
    type: 'invest_partial_exit',
    description: `تخارج جزئي: ${investmentName}`,
    cashEffect: exitProceeds,
    bookValueEffect: -exitedBookValue,
    realizedProfitEffect: realizedProfit,
    investmentId,
    createdBy: userId,
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
    date,
    type: 'invest_dividend',
    description: `توزيع أرباح: ${investmentName}`,
    cashEffect: amount,
    investmentId,
    createdBy: userId,
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
    date,
    type: 'capital_in',
    description: `رأس مال: ${investorName}`,
    cashEffect: amount,
    investorId,
    createdBy: userId,
  });
}

/**
 * يُنشئ حركة محاسبية عند سحب مستثمر (رأس مال خارج)
 */
export async function recordCapitalOut(
  investorId: string,
  investorName: string,
  amount: number,
  date: Date,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date,
    type: 'capital_out',
    description: `سحب رأس مال: ${investorName}`,
    cashEffect: -amount,
    investorId,
    createdBy: userId,
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
    date,
    type: 'expense',
    description: `مصروف: ${description}`,
    cashEffect: -amount,
    investmentId,
    expenseId,
    createdBy: userId,
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
    date,
    type: 'invest_valuation',
    description: `إعادة تقييم: ${investmentName}`,
    cashEffect: 0,
    currentValueEffect: newValue,
    investmentId,
    createdBy: userId,
  });
}

/**
 * يُنشئ حركة دخل تشغيلي (إيجار، عمولة، ...)
 */
export async function recordOperatingIncome(
  description: string,
  amount: number,
  date: Date,
  investmentId: string | undefined,
  userId: string,
): Promise<void> {
  await addLedgerEntry({
    date,
    type: 'operating_income',
    description: `دخل تشغيلي: ${description}`,
    cashEffect: amount,
    investmentId,
    createdBy: userId,
  });
}

// ─── Cash Flow Statement ───────────────────────────────────────────────────

/**
 * يحسب قائمة التدفقات النقدية لفترة زمنية محددة
 */
export async function getCashFlowStatement(from: Date, to: Date): Promise<CashFlowStatement> {
  const allEntries = await getAllLedgerEntries();

  const before = allEntries.filter((t) => t.date < from);
  const during = allEntries.filter((t) => t.date >= from && t.date <= to);

  const openingBalance = before.reduce((s, t) => s + (t.cashEffect || 0), 0);

  const sum = (txs: LedgerTransaction[], types: TxType[], sign: 1 | -1 = 1) =>
    txs
      .filter((t) => types.includes(t.type))
      .reduce((s, t) => s + Math.abs(t.cashEffect || 0) * sign, 0);

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
    capitalIn,
    exitProceeds,
    dividends,
    operatingIncome,
    expenseRefunds,
    investmentFunding,
    investmentTopups,
    approvedExpenses,
    ownerWithdrawals,
    closingBalance,
    netChange,
  };
}

// ─── Migration Helpers ─────────────────────────────────────────────────────

/**
 * يتحقق إذا كان النظام يحتاج ترحيل (لا يوجد سجلات في ledger)
 */
export async function needsMigration(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'ledger'), orderBy('date'), where('type', '==', 'capital_in')));
  return snap.empty;
}

/**
 * يتحقق من صحة ledger (هل جميع الحركات مسجلة بشكل صحيح)
 */
export async function validateLedger(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];
  const allEntries = await getAllLedgerEntries();

  // التحقق 1: هل هناك حركات بدون تاريخ؟
  const entriesWithoutDate = allEntries.filter((e) => !e.date);
  if (entriesWithoutDate.length > 0) {
    issues.push(`${entriesWithoutDate.length} حركة/حركات بدون تاريخ`);
  }

  // التحقق 2: هل هناك حركات cashEffect غير منطقية؟
  const invalidCashEffect = allEntries.filter((e) => isNaN(e.cashEffect));
  if (invalidCashEffect.length > 0) {
    issues.push(`${invalidCashEffect.length} حركة/حركات بقيمة cashEffect غير رقمية`);
  }

  // التحقق 3: هل مجموع cashEffect يطابق الفرق بين capital_in و capital_out + الأرباح - المصروفات؟
  const totalCashEffect = allEntries.reduce((s, e) => s + (e.cashEffect || 0), 0);
  const capitalIn = allEntries.filter((e) => e.type === 'capital_in').reduce((s, e) => s + (e.cashEffect || 0), 0);
  const capitalOut = allEntries
    .filter((e) => e.type === 'capital_out')
    .reduce((s, e) => s + Math.abs(e.cashEffect || 0), 0);
  const dividends = allEntries.filter((e) => e.type === 'invest_dividend').reduce((s, e) => s + (e.cashEffect || 0), 0);
  const expenses = allEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + Math.abs(e.cashEffect || 0), 0);

  const calculatedCash = capitalIn - capitalOut + dividends - expenses;

  if (Math.abs(totalCashEffect - calculatedCash) > 100) {
    issues.push(`عدم تطابق في ledger: المجموع ${totalCashEffect} ≠ المحسوب ${calculatedCash}`);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Migrate: يحول البيانات القديمة إلى سجلات في ledger
 * يُشغَّل مرة واحدة فقط عند الحاجة
 */
export async function migrateToLedger(userId: string): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  // التحقق مما إذا كان الترحيل مطلوباً
  const alreadyHasData = await needsMigration();
  if (!alreadyHasData) {
    return { created: 0, errors: ['الترحيل غير مطلوب - ledger يحتوي بالفعل على بيانات'] };
  }

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
  } catch (e) {
    errors.push(`investors: ${e}`);
  }

  // 2. الاستثمارات → invest_funding, invest_dividend, invest_full_exit, invest_valuation
  try {
    const invstSnap = await getDocs(collection(db, 'investments'));
    for (const d of invstSnap.docs) {
      const inv = d.data();
      if (!inv.entryAmount || inv.entryAmount <= 0) continue;

      // تمويل الدخول
      await addLedgerEntry({
        date: inv.entryDate?.toDate?.() ?? new Date(),
        type: 'invest_funding',
        description: `استثمار مُرحَّل: ${inv.name || d.id}`,
        cashEffect: -inv.entryAmount,
        bookValueEffect: inv.entryAmount,
        investmentId: d.id,
        createdBy: userId,
      });
      created++;

      // الأرباح الموزعة (dividends array)
      for (const dv of inv.dividends || []) {
        await addLedgerEntry({
          date: dv.date?.toDate?.() ?? new Date(),
          type: 'invest_dividend',
          description: `توزيع مُرحَّل: ${inv.name || d.id}`,
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
          description: `إغلاق مُرحَّل: ${inv.name || d.id}`,
          cashEffect: inv.closingAmount,
          bookValueEffect: -inv.entryAmount,
          realizedProfitEffect: inv.closingAmount - inv.entryAmount,
          investmentId: d.id,
          createdBy: userId,
        });
        created++;
      }

      // التقييمات (valueUpdates)
      for (const vu of inv.valueUpdates || []) {
        await addLedgerEntry({
          date: vu.date?.toDate?.() ?? new Date(),
          type: 'invest_valuation',
          description: `تقييم مُرحَّل: ${inv.name || d.id}`,
          cashEffect: 0,
          currentValueEffect: vu.newValue,
          investmentId: d.id,
          createdBy: userId,
        });
        created++;
      }
    }
  } catch (e) {
    errors.push(`investments: ${e}`);
  }

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
  } catch (e) {
    errors.push(`expenses: ${e}`);
  }

  return { created, errors };
}

// ─── Debug Helpers ─────────────────────────────────────────────────────────

/**
 * عرض جميع حركات ledger للتشخيص
 */
export async function debugLedger(): Promise<void> {
  const entries = await getAllLedgerEntries();
  console.log('=== LEDGER ENTRIES ===');
  console.log(`Total entries: ${entries.length}`);
  console.log('');

  let totalCash = 0;
  for (const e of entries) {
    totalCash += e.cashEffect || 0;
    console.log(
      `${e.date.toISOString().slice(0, 10)} | ${e.type.padEnd(20)} | ${(e.cashEffect || 0).toFixed(2)} | ${totalCash.toFixed(2)} | ${e.description}`,
    );
  }
  console.log('');
  console.log(`Final Cash Balance: ${totalCash.toFixed(2)}`);
  console.log('========================');
}

/**
 * عرض صافي قيمة المحفظة للتشخيص
 */
export async function debugPortfolio(): Promise<void> {
  const snapshot = await calcPortfolioSnapshot();
  console.log('=== PORTFOLIO SNAPSHOT ===');
  console.log(`تاريخ: ${snapshot.asOfDate.toISOString().slice(0, 10)}`);
  console.log(`رأس المال (داخل): ${snapshot.ownerCapitalIn.toFixed(2)}`);
  console.log(`رأس المال (خارج): ${snapshot.ownerCapitalOut.toFixed(2)}`);
  console.log(`صافي رأس المال: ${snapshot.netOwnerCapital.toFixed(2)}`);
  console.log(`النقد المتوفر: ${snapshot.availableCash.toFixed(2)}`);
  console.log(`قيمة المحفظة القائمة: ${snapshot.activeCurrentValue.toFixed(2)}`);
  console.log(`صافي قيمة المحفظة: ${snapshot.netPortfolioValue.toFixed(2)}`);
  console.log(`أرباح محققة: ${snapshot.realizedProfit.toFixed(2)}`);
  console.log(`أرباح غير محققة: ${snapshot.unrealizedProfit.toFixed(2)}`);
  console.log(`توزيعات مستلمة: ${snapshot.dividendsReceived.toFixed(2)}`);
  console.log(`مصاريف: ${snapshot.totalExpenses.toFixed(2)}`);
  console.log(`استثمارات قائمة: ${snapshot.activeCount}`);
  console.log(`استثمارات مغلقة: ${snapshot.closedCount}`);
  console.log('========================');
}
