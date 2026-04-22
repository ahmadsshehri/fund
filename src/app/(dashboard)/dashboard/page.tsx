'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  Wallet, TrendingUp, Users, Activity, CheckCircle, XCircle,
  DollarSign, ArrowUpRight, ArrowDownRight, RefreshCw, Info,
  AlertTriangle, BarChart3,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
interface Investor { totalPaid: number; shareCount: number; status: string; userId?: string; }
interface Investment { entryAmount: number; currentValue: number; status: string; totalProfit: number; closingAmount?: number; name: string; closingDate?: Date; dividends?: { amount: number }[]; }
interface Expense { amount: number; status: string; }
interface Distribution { totalAmount: number; status: string; affectsCash: boolean; }

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

// ─── Cash Calculation ────────────────────────────────────────────────────────
// الكاش الصحيح = رأس المال الداخل - المستثمر في صفقات قائمة - المصاريف + عوائد الصفقات المغلقة + الأرباح الموزعة - التوزيعات للمستثمرين
function calcCash(
  investors: Investor[],
  investments: Investment[],
  expenses: Expense[],
  distributions: Distribution[],
): number {
  // ➕ رأس المال الكلي الداخل من المستثمرين
  const capitalIn = investors.reduce((s, i) => s + (i.totalPaid || 0), 0);

  // ➖ المبالغ المستثمرة في صفقات قائمة حالياً (خرجت من الكاش)
  const investedInActive = investments
    .filter(i => i.status === 'active')
    .reduce((s, i) => s + (i.entryAmount || 0), 0);

  // ➕ عوائد الصفقات المغلقة (مبلغ الإغلاق المستلم)
  const closingReturns = investments
    .filter(i => i.status === 'closed')
    .reduce((s, i) => s + (i.closingAmount || 0), 0);

  // ➖ رأس مال الصفقات المغلقة (كان قد خرج من الكاش)
  const closedEntries = investments
    .filter(i => i.status === 'closed')
    .reduce((s, i) => s + (i.entryAmount || 0), 0);

  // ➕ أرباح موزعة مستلمة من الاستثمارات (دخلت الكاش)
  const dividendsReceived = investments
    .reduce((s, i) => s + (i.dividends || []).reduce((ss, d) => ss + d.amount, 0), 0);

  // ➖ المصاريف المعتمدة
  const expensesOut = expenses
    .filter(e => e.status === 'approved')
    .reduce((s, e) => s + (e.amount || 0), 0);

  // ➖ التوزيعات المعتمدة التي تؤثر على الكاش
  const distributionsOut = distributions
    .filter(d => d.status === 'approved' && d.affectsCash)
    .reduce((s, d) => s + (d.totalAmount || 0), 0);

  return capitalIn
    - investedInActive
    + closingReturns
    - closedEntries
    + dividendsReceived
    - expensesOut
    - distributionsOut;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Stats
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [invSnap, invstSnap, expSnap, distSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'distributions')),
      ]);

      setInvestors(invSnap.docs.map(d => d.data() as Investor));
      setInvestments(invstSnap.docs.map(d => {
        const v = d.data();
        return {
          ...v,
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          dividends: v.dividends || [],
        } as Investment;
      }));
      setExpenses(expSnap.docs.map(d => d.data() as Expense));
      setDistributions(distSnap.docs.map(d => d.data() as Distribution));
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ─── Derived metrics ───────────────────────────────────────────────────────
  const availableCash = calcCash(investors, investments, expenses, distributions);

  const activeInvs   = investments.filter(i => i.status === 'active');
  const closedInvs   = investments.filter(i => i.status === 'closed');
  const distressInvs = investments.filter(i => i.status === 'distressed');

  const totalCapital     = investors.reduce((s, i) => s + (i.totalPaid || 0), 0);
  const totalShares      = investors.reduce((s, i) => s + (i.shareCount || 0), 0);
  const sharePrice       = totalShares > 0 ? totalCapital / totalShares : 0;

  const totalInvested    = activeInvs.reduce((s, i) => s + i.entryAmount, 0);
  const totalCurrentVal  = activeInvs.reduce((s, i) => s + i.currentValue, 0);
  const unrealizedProfit = totalCurrentVal - totalInvested;

  const totalDividends   = investments.reduce((s, i) => s + (i.dividends || []).reduce((ss, d) => ss + d.amount, 0), 0);

  const realizedProfit   = closedInvs.reduce((s, i) => {
    const capGain = (i.closingAmount || 0) - i.entryAmount;
    const divs = (i.dividends || []).reduce((ss, d) => ss + d.amount, 0);
    return s + capGain + divs;
  }, 0) + activeInvs.reduce((s, i) => s + (i.dividends || []).reduce((ss, d) => ss + d.amount, 0), 0);

  const totalExpenses    = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const totalDistributions = distributions.filter(d => d.status === 'approved' && d.affectsCash).reduce((s, d) => s + d.totalAmount, 0);

  // Alerts
  const alerts: { type: 'danger' | 'warning' | 'info'; msg: string }[] = [];
  if (distressInvs.length > 0) alerts.push({ type: 'danger', msg: `${distressInvs.length} استثمار متعثر يحتاج مراجعة` });
  if (availableCash < 0) alerts.push({ type: 'warning', msg: `الكاش سالب — تحقق من بيانات رأس المال والاستثمارات` });
  const soon = new Date(Date.now() + 30 * 86400000);
  investments.filter(i => i.status === 'active' && i.closingDate && toDate(i.closingDate) <= soon)
    .forEach(i => alerts.push({ type: 'warning', msg: `استثمار يقترب موعد إغلاقه: ${i.name}` }));
  const noAccount = investors.filter(i => !i.userId).length;
  if (noAccount > 0) alerts.push({ type: 'info', msg: `${noAccount} مستثمر بدون حساب دخول` });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg mx-auto">
        <XCircle size={40} className="text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-semibold mb-2">خطأ في تحميل البيانات</p>
        <p className="text-red-600 text-sm font-mono bg-red-100 p-2 rounded text-left">{error}</p>
        <button onClick={load} className="mt-4 btn-primary mx-auto"><RefreshCw size={16} />إعادة المحاولة</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm mt-0.5">آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} />تحديث</button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`alert-${a.type} text-sm`}>
              {a.type === 'danger' ? <XCircle size={16} className="shrink-0" />
                : a.type === 'warning' ? <AlertTriangle size={16} className="shrink-0" />
                : <Info size={16} className="shrink-0" />}
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cash Banner */}
      <div className={`rounded-2xl p-6 text-white shadow-lg ${availableCash >= 0 ? 'bg-gradient-to-l from-green-600 to-emerald-700' : 'bg-gradient-to-l from-red-600 to-red-700'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={20} className="opacity-80" />
              <span className="opacity-80 text-sm font-medium">الكاش المتوفر الآن</span>
            </div>
            <p className="text-4xl font-bold">{formatCurrency(availableCash)}</p>
            <p className="text-xs opacity-60 mt-1">
              رأس المال {formatCurrency(totalCapital)} — مستثمر {formatCurrency(totalInvested)} — مصاريف {formatCurrency(totalExpenses)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="opacity-70 text-xs mb-1">إجمالي رأس المال</p>
              <p className="text-xl font-bold">{formatCurrency(totalCapital)}</p>
            </div>
            <div className="text-center">
              <p className="opacity-70 text-xs mb-1">سعر الحصة</p>
              <p className="text-xl font-bold">{formatCurrency(sharePrice)}</p>
            </div>
            <div className="text-center">
              <p className="opacity-70 text-xs mb-1">إجمالي الحصص</p>
              <p className="text-xl font-bold">{formatNumber(totalShares, 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي رأس المال', value: formatCurrency(totalCapital), icon: <DollarSign size={20} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'عدد المستثمرين', value: String(investors.length), icon: <Users size={20} />, color: 'bg-purple-50 text-purple-600' },
          { label: 'استثمارات قائمة', value: String(activeInvs.length), icon: <Activity size={20} />, color: 'bg-green-50 text-green-600' },
          { label: 'استثمارات مغلقة', value: String(closedInvs.length), icon: <CheckCircle size={20} />, color: 'bg-blue-50 text-blue-600' },
          { label: 'استثمارات متعثرة', value: String(distressInvs.length), icon: <XCircle size={20} />, color: 'bg-red-50 text-red-600' },
          { label: 'أرباح موزعة مستلمة', value: formatCurrency(totalDividends), icon: <ArrowUpRight size={20} />, color: 'bg-orange-50 text-orange-600' },
          { label: 'أرباح تراكمية (غير محققة)', value: formatCurrency(unrealizedProfit), icon: <TrendingUp size={20} />, color: 'bg-yellow-50 text-yellow-600' },
          { label: 'إجمالي الأرباح المحققة', value: formatCurrency(realizedProfit), icon: <BarChart3 size={20} />, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'إجمالي المصاريف', value: formatCurrency(totalExpenses), icon: <ArrowDownRight size={20} />, color: 'bg-red-50 text-red-600' },
          { label: 'التوزيعات للمستثمرين', value: formatCurrency(totalDistributions), icon: <ArrowDownRight size={20} />, color: 'bg-orange-50 text-orange-600' },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <div className={`p-2.5 rounded-xl w-fit mb-3 ${card.color}`}>{card.icon}</div>
            <p className="text-xl font-bold text-slate-800 mb-0.5">{card.value}</p>
            <p className="text-xs text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Two column summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cash breakdown */}
        <div className="card p-6">
          <h3 className="section-title">تفصيل حساب الكاش</h3>
          <div className="space-y-3">
            {[
              { label: 'رأس المال الداخل من المستثمرين', value: totalCapital, positive: true },
              { label: 'مبالغ الاستثمارات القائمة (خارج)', value: -activeInvs.reduce((s, i) => s + i.entryAmount, 0), positive: false },
              { label: 'عوائد الصفقات المغلقة (داخل)', value: closedInvs.reduce((s, i) => s + (i.closingAmount || 0), 0), positive: true },
              { label: 'رأس مال الصفقات المغلقة (خارج)', value: -closedInvs.reduce((s, i) => s + i.entryAmount, 0), positive: false },
              { label: 'أرباح موزعة مستلمة (داخل)', value: totalDividends, positive: true },
              { label: 'المصاريف المعتمدة (خارج)', value: -totalExpenses, positive: false },
              { label: 'التوزيعات للمستثمرين (خارج)', value: -totalDistributions, positive: false },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-xs text-slate-600">{row.label}</span>
                <span className={`text-sm font-semibold ${row.positive ? 'text-green-700' : 'text-red-600'}`}>
                  {row.positive ? '+' : ''}{formatCurrency(row.value)}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t-2 border-slate-300">
              <span className="text-sm font-bold text-slate-800">الكاش المتوفر</span>
              <span className={`text-base font-bold ${availableCash >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(availableCash)}
              </span>
            </div>
          </div>
        </div>

        {/* Investment breakdown */}
        <div className="card p-6">
          <h3 className="section-title">نظرة على الاستثمارات</h3>
          <div className="space-y-4">
            {[
              { label: 'إجمالي رأس المال المستثمر (قائمة)', value: totalInvested, color: 'bg-blue-200', barColor: 'bg-blue-600' },
              { label: 'القيمة الحالية (قائمة)', value: totalCurrentVal, color: 'bg-green-200', barColor: 'bg-green-600' },
              { label: 'إجمالي الأرباح الموزعة', value: totalDividends, color: 'bg-orange-200', barColor: 'bg-orange-500' },
              { label: 'الأرباح التراكمية غير المحققة', value: Math.max(0, unrealizedProfit), color: 'bg-yellow-200', barColor: 'bg-yellow-500' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{row.label}</span>
                  <span className="font-semibold">{formatCurrency(row.value)}</span>
                </div>
                <div className={`w-full ${row.color} rounded-full h-2`}>
                  <div className={`${row.barColor} h-2 rounded-full`}
                    style={{ width: `${totalCapital > 0 ? Math.min((row.value / totalCapital) * 100, 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
