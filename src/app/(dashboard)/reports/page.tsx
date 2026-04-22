'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import {
  BarChart3, Download, TrendingUp, Users, Receipt,
  RefreshCw, DollarSign, Filter, ArrowUpRight, ArrowDownRight,
  PieChart as PieIcon, Activity, CheckCircle, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Investor {
  id: string; name: string; email: string; investorNumber: string;
  totalPaid: number; shareCount: number; ownershipPercentage: number;
  status: string; joinDate: Date;
}
interface Investment {
  id: string; name: string; entity: string; invType: string;
  entryAmount: number; currentValue: number; closingAmount?: number;
  totalProfit: number; annualReturn: number; trueReturn: number;
  status: string; entryDate: Date; closingDate?: Date;
  dividends: { amount: number; date: Date }[];
}
interface Expense {
  id: string; type: string; description: string;
  amount: number; status: string; date: Date;
  investmentName?: string;
}
interface Distribution {
  id: string; type: string; totalAmount: number;
  status: string; affectsCash: boolean; date: Date;
  investorId?: string; investorName?: string;
}

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

const pct = (n: number) => `${(n || 0).toFixed(2)}%`;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  zakat: 'زكاة', bank_fees: 'رسوم بنكية', admin: 'إدارية',
  legal: 'قانونية', other: 'أخرى',
};

// ─── Return helpers ──────────────────────────────────────────────────────────
function calcInvReturns(inv: Investment) {
  const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
  const capitalGain = inv.status === 'closed'
    ? (inv.closingAmount || 0) - inv.entryAmount
    : inv.currentValue - inv.entryAmount;
  const totalProfit = totalDividends + capitalGain;
  const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
  const days = Math.max(1, Math.round(
    ((inv.closingDate || new Date()).getTime() - inv.entryDate.getTime()) / 86400000
  ));
  const annualReturn = (days / 365) > 0 ? trueReturn / (days / 365) : 0;
  return { totalDividends, capitalGain, totalProfit, trueReturn, annualReturn };
}

// ─── Cash calculation ────────────────────────────────────────────────────────
function calcCash(
  investors: Investor[], investments: Investment[],
  expenses: Expense[], distributions: Distribution[]
) {
  const capitalIn   = investors.reduce((s, i) => s + i.totalPaid, 0);
  const activeOut   = investments.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0);
  const closedIn    = investments.filter(i => i.status === 'closed').reduce((s, i) => s + (i.closingAmount || 0), 0);
  const closedOut   = investments.filter(i => i.status === 'closed').reduce((s, i) => s + i.entryAmount, 0);
  const dividendsIn = investments.reduce((s, i) => s + i.dividends.reduce((ss, d) => ss + d.amount, 0), 0);
  const expOut      = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const distOut     = distributions.filter(d => d.status === 'approved' && d.affectsCash).reduce((s, d) => s + d.totalAmount, 0);
  return capitalIn - activeOut + closedIn - closedOut + dividendsIn - expOut - distOut;
}

export default function ReportsPage() {
  const [investors, setInvestors]       = useState<Investor[]>([]);
  const [investments, setInvestments]   = useState<Investment[]>([]);
  const [expenses, setExpenses]         = useState<Expense[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [activeTab, setActiveTab]       = useState<'investors' | 'investments' | 'expenses' | 'financial'>('investors');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [invSnap, invstSnap, expSnap, distSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'distributions')),
      ]);

      setInvestors(invSnap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, joinDate: toDate(v.joinDate) } as Investor;
      }));

      setInvestments(invstSnap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id, ...v,
          entryDate: toDate(v.entryDate),
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          dividends: (v.dividends || []).map((dv: Record<string, unknown>) => ({
            amount: dv.amount as number, date: toDate(dv.date),
          })),
        } as Investment;
      }));

      setExpenses(expSnap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, date: toDate(v.date) } as Expense;
      }));

      setDistributions(distSnap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, date: toDate(v.date) } as Distribution;
      }));
    } catch (e) {
      console.error(e); setError(String(e));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ─── Filtered data ──────────────────────────────────────────────────────────
  const inDateRange = (d: Date) => {
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo)) return false;
    return true;
  };

  const filteredInv  = investors.filter(i => inDateRange(i.joinDate));
  const filteredInvst = investments.filter(i => inDateRange(i.entryDate));
  const filteredExp  = expenses.filter(e => inDateRange(e.date));
  const filteredDist = distributions.filter(d => inDateRange(d.date));

  // ─── Aggregate metrics ──────────────────────────────────────────────────────
  const totalCapital      = investors.reduce((s, i) => s + i.totalPaid, 0);
  const availableCash     = calcCash(investors, investments, expenses, distributions);
  const totalDividendsAll = investments.reduce((s, i) => s + i.dividends.reduce((ss, d) => ss + d.amount, 0), 0);
  const totalExpensesAmt  = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const totalDistAmt      = distributions.filter(d => d.status === 'approved' && d.affectsCash).reduce((s, d) => s + d.totalAmount, 0);

  // Portfolio-level return
  const totalProfitAll = investments.reduce((s, i) => {
    const r = calcInvReturns(i);
    return s + r.totalProfit;
  }, 0);
  const portfolioReturn = totalCapital > 0 ? (totalProfitAll / totalCapital) * 100 : 0;

  // ─── Chart data ─────────────────────────────────────────────────────────────
  const invStatusChart = [
    { name: 'قائمة', value: investments.filter(i => i.status === 'active').length },
    { name: 'مغلقة', value: investments.filter(i => i.status === 'closed').length },
    { name: 'متعثرة', value: investments.filter(i => i.status === 'distressed').length },
  ].filter(s => s.value > 0);

  const expByTypeChart = Object.entries(EXPENSE_TYPE_LABELS).map(([key, label]) => ({
    name: label,
    value: expenses.filter(e => e.type === key && e.status === 'approved').reduce((s, e) => s + e.amount, 0),
  })).filter(e => e.value > 0);

  // Monthly cash flow (from investment + expense + distribution data)
  const monthlyData: Record<string, { month: string; in: number; out: number }> = {};
  investments.forEach(inv => {
    if (inv.status === 'closed' && inv.closingDate) {
      const k = inv.closingDate.toISOString().slice(0, 7);
      if (!monthlyData[k]) monthlyData[k] = { month: k, in: 0, out: 0 };
      monthlyData[k].in += inv.closingAmount || 0;
    }
    inv.dividends.forEach(d => {
      const k = d.date.toISOString().slice(0, 7);
      if (!monthlyData[k]) monthlyData[k] = { month: k, in: 0, out: 0 };
      monthlyData[k].in += d.amount;
    });
    const k = inv.entryDate.toISOString().slice(0, 7);
    if (!monthlyData[k]) monthlyData[k] = { month: k, in: 0, out: 0 };
    monthlyData[k].out += inv.entryAmount;
  });
  expenses.filter(e => e.status === 'approved').forEach(e => {
    const k = e.date.toISOString().slice(0, 7);
    if (!monthlyData[k]) monthlyData[k] = { month: k, in: 0, out: 0 };
    monthlyData[k].out += e.amount;
  });
  const monthlyChart = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

  // ─── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = (data: Record<string, unknown>[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'investors',    label: 'المستثمرون',   icon: <Users size={16} /> },
    { id: 'investments',  label: 'الاستثمارات',  icon: <TrendingUp size={16} /> },
    { id: 'expenses',     label: 'المصاريف',     icon: <Receipt size={16} /> },
    { id: 'financial',   label: 'المالية',       icon: <BarChart3 size={16} /> },
  ] as const;

  // ─── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">جاري تحميل التقارير...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg mx-auto">
        <XCircle size={40} className="text-red-500 mx-auto mb-3" />
        <p className="text-red-700 font-semibold mb-2">خطأ في تحميل التقارير</p>
        <p className="text-red-600 text-xs font-mono bg-red-100 p-2 rounded text-left break-all">{error}</p>
        <button onClick={load} className="mt-4 btn-primary mx-auto"><RefreshCw size={16} />إعادة المحاولة</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="text-slate-500 text-sm mt-0.5">{investments.length} استثمار — {investors.length} مستثمر</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} />تحديث</button>
      </div>

      {/* Portfolio summary banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="p-2 bg-blue-50 rounded-lg w-fit mb-3"><DollarSign size={18} className="text-blue-600" /></div>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalCapital)}</p>
          <p className="text-xs text-slate-500">إجمالي رأس المال</p>
        </div>
        <div className="stat-card">
          <div className="p-2 bg-green-50 rounded-lg w-fit mb-3"><ArrowUpRight size={18} className="text-green-600" /></div>
          <p className={`text-xl font-bold ${availableCash >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(availableCash)}</p>
          <p className="text-xs text-slate-500">الكاش المتوفر</p>
        </div>
        <div className="stat-card">
          <div className="p-2 bg-purple-50 rounded-lg w-fit mb-3"><TrendingUp size={18} className="text-purple-600" /></div>
          <p className={`text-xl font-bold ${totalProfitAll >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(totalProfitAll)}</p>
          <p className="text-xs text-slate-500">صافي الأرباح الكلي</p>
        </div>
        <div className="stat-card">
          <div className="p-2 bg-yellow-50 rounded-lg w-fit mb-3"><BarChart3 size={18} className="text-yellow-600" /></div>
          <p className={`text-xl font-bold ${portfolioReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>{pct(portfolioReturn)}</p>
          <p className="text-xs text-slate-500">عائد المحفظة الكلي</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-end">
        <Filter size={16} className="text-slate-400 mb-2 hidden sm:block" />
        <div><label className="label text-xs">من تاريخ</label><input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><label className="label text-xs">إلى تاريخ</label><input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary">مسح الفلتر</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Investors Report ───────────────────────────────────────────────────── */}
      {activeTab === 'investors' && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0">تقرير المستثمرين ({filteredInv.length})</h3>
            <button onClick={() => exportCSV(
              filteredInv.map(i => ({
                'رقم المستثمر': i.investorNumber, 'الاسم': i.name, 'البريد': i.email,
                'رأس المال': i.totalPaid, 'الحصص': i.shareCount,
                'الملكية%': i.ownershipPercentage?.toFixed(2),
                'تاريخ الانضمام': formatDate(i.joinDate), 'الحالة': i.status,
              })), 'investors-report'
            )} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>المستثمر</th><th>رأس المال</th><th>الحصص</th>
                  <th>نسبة الملكية</th><th>تاريخ الانضمام</th><th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredInv.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <p className="font-medium">{inv.name}</p>
                      <p className="text-xs text-slate-400">{inv.email}</p>
                    </td>
                    <td className="text-blue-700 font-semibold">{formatCurrency(inv.totalPaid)}</td>
                    <td>{formatNumber(inv.shareCount, 0)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(inv.ownershipPercentage || 0, 100)}%` }} />
                        </div>
                        <span className="text-sm font-medium">{pct(inv.ownershipPercentage || 0)}</span>
                      </div>
                    </td>
                    <td className="text-slate-600">{formatDate(inv.joinDate)}</td>
                    <td><span className={inv.status === 'active' ? 'badge-green' : 'badge-gray'}>{inv.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#eff6ff', fontWeight: 700 }}>
                  <td>الإجمالي</td>
                  <td className="text-blue-700">{formatCurrency(filteredInv.reduce((s, i) => s + i.totalPaid, 0))}</td>
                  <td>{formatNumber(filteredInv.reduce((s, i) => s + i.shareCount, 0), 0)}</td>
                  <td>100%</td><td>—</td><td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Investments Report ─────────────────────────────────────────────────── */}
      {activeTab === 'investments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Status chart */}
            <div className="card p-6">
              <h3 className="section-title">توزيع الاستثمارات</h3>
              {invStatusChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={invStatusChart} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                      label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                      {invStatusChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-slate-400 py-12 text-sm">لا توجد بيانات</p>}
            </div>

            {/* Summary */}
            <div className="card p-6">
              <h3 className="section-title">ملخص الاستثمارات</h3>
              <div className="space-y-3">
                {[
                  ['إجمالي رأس المال المستثمر', formatCurrency(investments.reduce((s, i) => s + i.entryAmount, 0))],
                  ['القيمة الحالية (قائمة)', formatCurrency(investments.filter(i => i.status === 'active').reduce((s, i) => s + i.currentValue, 0))],
                  ['إجمالي الأرباح الموزعة', formatCurrency(totalDividendsAll)],
                  ['صافي الأرباح الكلي', formatCurrency(totalProfitAll)],
                  ['عائد المحفظة', pct(portfolioReturn)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                    <span className="text-slate-600">{k}</span>
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Investments detail table */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">تفاصيل الاستثمارات ({filteredInvst.length})</h3>
              <button onClick={() => exportCSV(
                filteredInvst.map(i => {
                  const r = calcInvReturns(i);
                  return {
                    'الاسم': i.name, 'الجهة': i.entity, 'النوع': i.invType,
                    'رأس المال': i.entryAmount,
                    'الأرباح الموزعة': r.totalDividends,
                    'مكسب رأس المال': r.capitalGain,
                    'صافي الربح': r.totalProfit,
                    'العائد الحقيقي%': r.trueReturn.toFixed(2),
                    'العائد السنوي%': r.annualReturn.toFixed(2),
                    'الحالة': i.status,
                  };
                }), 'investments-report'
              )} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>الاسم</th><th>الجهة</th><th>النوع</th>
                    <th>رأس المال</th><th>أرباح موزعة</th><th>مكسب رأس المال</th>
                    <th>صافي الربح</th><th>العائد الحقيقي</th><th>العائد السنوي</th><th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvst.map(inv => {
                    const r = calcInvReturns(inv);
                    return (
                      <tr key={inv.id}>
                        <td className="font-medium">{inv.name}</td>
                        <td className="text-slate-500 text-sm">{inv.entity}</td>
                        <td><span className={inv.invType === 'dividend' ? 'badge-orange' : 'badge-purple'}>{inv.invType === 'dividend' ? 'يوزع أرباح' : 'تراكمي'}</span></td>
                        <td className="text-blue-700 font-semibold">{formatCurrency(inv.entryAmount)}</td>
                        <td className="text-orange-600">{r.totalDividends > 0 ? formatCurrency(r.totalDividends) : '—'}</td>
                        <td className={r.capitalGain >= 0 ? 'text-green-700' : 'text-red-600'}>{r.capitalGain >= 0 ? '+' : ''}{formatCurrency(r.capitalGain)}</td>
                        <td className={`font-semibold ${r.totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {r.totalProfit >= 0 ? '+' : ''}{formatCurrency(r.totalProfit)}
                        </td>
                        <td className={`font-semibold ${r.trueReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {r.trueReturn >= 0 ? '+' : ''}{pct(r.trueReturn)}
                        </td>
                        <td className={r.annualReturn >= 0 ? 'text-green-700' : 'text-red-600'}>
                          {pct(r.annualReturn)}
                        </td>
                        <td>
                          <span className={inv.status === 'active' ? 'badge-green' : inv.status === 'closed' ? 'badge-blue' : 'badge-red'}>
                            {inv.status === 'active' ? 'قائم' : inv.status === 'closed' ? 'مغلق' : 'متعثر'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvst.length > 0 && (() => {
                    const totals = filteredInvst.reduce((acc, inv) => {
                      const r = calcInvReturns(inv);
                      return {
                        entry: acc.entry + inv.entryAmount,
                        dividends: acc.dividends + r.totalDividends,
                        capGain: acc.capGain + r.capitalGain,
                        profit: acc.profit + r.totalProfit,
                      };
                    }, { entry: 0, dividends: 0, capGain: 0, profit: 0 });
                    const totalReturn = totals.entry > 0 ? (totals.profit / totals.entry) * 100 : 0;
                    return (
                      <tr style={{ backgroundColor: '#eff6ff', fontWeight: 700 }}>
                        <td colSpan={3}>الإجمالي</td>
                        <td className="text-blue-700">{formatCurrency(totals.entry)}</td>
                        <td className="text-orange-600">{formatCurrency(totals.dividends)}</td>
                        <td className={totals.capGain >= 0 ? 'text-green-700' : 'text-red-600'}>{formatCurrency(totals.capGain)}</td>
                        <td className={totals.profit >= 0 ? 'text-green-700' : 'text-red-600'}>{formatCurrency(totals.profit)}</td>
                        <td className={totalReturn >= 0 ? 'text-green-700' : 'text-red-600'}>{pct(totalReturn)}</td>
                        <td>—</td><td>—</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Expenses Report ────────────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <h3 className="section-title">المصاريف حسب النوع</h3>
              {expByTypeChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={expByTypeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-slate-400 py-12 text-sm">لا توجد مصاريف معتمدة</p>}
            </div>
            <div className="card p-6">
              <h3 className="section-title">ملخص المصاريف</h3>
              <div className="space-y-3">
                {Object.entries(EXPENSE_TYPE_LABELS).map(([key, label]) => {
                  const total = expenses.filter(e => e.type === key && e.status === 'approved').reduce((s, e) => s + e.amount, 0);
                  if (!total) return null;
                  return (
                    <div key={key} className="flex justify-between py-2 border-b border-slate-100 text-sm">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-semibold text-red-700">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between py-2 font-bold text-sm border-t-2 border-slate-300">
                  <span>الإجمالي المعتمد</span>
                  <span className="text-red-700">{formatCurrency(totalExpensesAmt)}</span>
                </div>
                <div className="flex justify-between py-2 text-sm">
                  <span className="text-slate-500">في انتظار الاعتماد</span>
                  <span className="text-yellow-700">{formatCurrency(expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">تفاصيل المصاريف ({filteredExp.length})</h3>
              <button onClick={() => exportCSV(
                filteredExp.map(e => ({ 'النوع': e.type, 'الوصف': e.description, 'التاريخ': formatDate(e.date), 'المبلغ': e.amount, 'الاستثمار': e.investmentName || '', 'الحالة': e.status })),
                'expenses-report'
              )} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>النوع</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>الاستثمار</th><th>الحالة</th></tr></thead>
                <tbody>
                  {filteredExp.map(exp => (
                    <tr key={exp.id}>
                      <td><span className="badge-blue">{EXPENSE_TYPE_LABELS[exp.type] || exp.type}</span></td>
                      <td className="font-medium">{exp.description}</td>
                      <td className="text-slate-600">{formatDate(exp.date)}</td>
                      <td className="text-red-700 font-semibold">{formatCurrency(exp.amount)}</td>
                      <td className="text-slate-500 text-sm">{exp.investmentName || '—'}</td>
                      <td><span className={exp.status === 'approved' ? 'badge-green' : 'badge-yellow'}>{exp.status === 'approved' ? 'معتمد' : 'انتظار'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Financial Report ───────────────────────────────────────────────────── */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {/* Financial position */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <h3 className="section-title">ملخص المركز المالي</h3>
              <div className="space-y-3">
                {[
                  { label: 'رأس المال الكلي من المستثمرين', value: totalCapital, color: 'text-blue-700', sign: '' },
                  { label: 'رأس المال في استثمارات قائمة', value: -investments.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0), color: 'text-red-600', sign: '-' },
                  { label: 'عوائد الصفقات المغلقة', value: investments.filter(i => i.status === 'closed').reduce((s, i) => s + (i.closingAmount || 0), 0), color: 'text-green-700', sign: '+' },
                  { label: 'أرباح موزعة مستلمة', value: totalDividendsAll, color: 'text-orange-600', sign: '+' },
                  { label: 'مصاريف معتمدة', value: -totalExpensesAmt, color: 'text-red-600', sign: '-' },
                  { label: 'توزيعات للمستثمرين', value: -totalDistAmt, color: 'text-red-600', sign: '-' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                    <span className="text-slate-600">{row.label}</span>
                    <span className={`font-semibold ${row.color}`}>{row.sign}{formatCurrency(Math.abs(row.value))}</span>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-slate-300">
                  <span className="font-bold text-slate-800">الكاش المتوفر</span>
                  <span className={`text-lg font-bold ${availableCash >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(availableCash)}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="section-title">تحليل العوائد</h3>
              <div className="space-y-3">
                {[
                  { label: 'صافي الأرباح الكلي', value: formatCurrency(totalProfitAll), color: totalProfitAll >= 0 ? 'text-green-700' : 'text-red-600' },
                  { label: 'عائد المحفظة الكلي', value: pct(portfolioReturn), color: portfolioReturn >= 0 ? 'text-green-700' : 'text-red-600' },
                  { label: 'أفضل استثمار عائداً', value: (() => {
                    const best = investments.filter(i => i.status === 'closed' || i.status === 'active')
                      .map(i => ({ name: i.name, r: calcInvReturns(i).trueReturn }))
                      .sort((a, b) => b.r - a.r)[0];
                    return best ? `${best.name} (${pct(best.r)})` : '—';
                  })(), color: 'text-blue-700' },
                  { label: 'عدد استثمارات رابحة', value: String(investments.filter(i => calcInvReturns(i).totalProfit > 0).length), color: 'text-green-700' },
                  { label: 'عدد استثمارات خاسرة', value: String(investments.filter(i => calcInvReturns(i).totalProfit < 0).length), color: 'text-red-600' },
                  { label: 'متوسط مدة الاستثمار', value: (() => {
                    const days = investments.filter(i => i.status === 'closed').map(i =>
                      Math.round(((i.closingDate || new Date()).getTime() - i.entryDate.getTime()) / 86400000)
                    );
                    return days.length > 0 ? `${Math.round(days.reduce((s, d) => s + d, 0) / days.length)} يوم` : '—';
                  })(), color: 'text-slate-700' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                    <span className="text-slate-600">{row.label}</span>
                    <span className={`font-semibold ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly cash flow chart */}
          {monthlyChart.length > 0 && (
            <div className="card p-6">
              <h3 className="section-title">حركة الأموال الشهرية (آخر 12 شهر)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                  <Bar dataKey="in" name="دخول" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="out" name="خروج" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Distributions table */}
          {filteredDist.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title mb-0">التوزيعات والملكية ({filteredDist.length})</h3>
                <button onClick={() => exportCSV(
                  filteredDist.map(d => ({ 'النوع': d.type, 'التاريخ': formatDate(d.date), 'المبلغ': d.totalAmount, 'المستثمر': d.investorName || 'الكل', 'الحالة': d.status })),
                  'distributions-report'
                )} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>النوع</th><th>التاريخ</th><th>المبلغ</th><th>المستثمر</th><th>يؤثر على الكاش</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {filteredDist.map(d => (
                      <tr key={d.id}>
                        <td><span className="badge-blue text-xs">{d.type}</span></td>
                        <td className="text-slate-600">{formatDate(d.date)}</td>
                        <td className="font-semibold text-blue-700">{formatCurrency(d.totalAmount)}</td>
                        <td className="text-slate-600 text-sm">{d.investorName || 'جميع المستثمرين'}</td>
                        <td>{d.affectsCash ? <span className="badge-green">نعم</span> : <span className="badge-gray">لا</span>}</td>
                        <td><span className={d.status === 'approved' ? 'badge-green' : 'badge-yellow'}>{d.status === 'approved' ? 'معتمد' : 'انتظار'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
