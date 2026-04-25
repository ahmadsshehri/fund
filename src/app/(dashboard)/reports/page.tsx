'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCashFlowStatement, calcPortfolioSnapshot, type CashFlowStatement, type PortfolioSnapshot } from '@/lib/accounting';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Download, RefreshCw, Filter, TrendingUp, Users, Receipt, BarChart3 } from 'lucide-react';

const pct = (n: number) => `${(n || 0).toFixed(2)}%`;

interface Investment {
  id: string; name: string; entity: string; invType: string;
  entryAmount: number; currentValue: number; closingAmount?: number;
  status: string; entryDate: Date; closingDate?: Date;
  dividends: { amount: number; date: Date }[];
}
interface Investor {
  id: string; name: string; email: string;
  totalPaid: number; shareCount: number; ownershipPercentage: number; status: string; joinDate: Date;
}
interface Expense {
  id: string; type: string; description: string; amount: number; status: string; date: Date; investmentName?: string;
}

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

const EXPENSE_LABELS: Record<string, string> = {
  zakat: 'زكاة', bank_fees: 'رسوم بنكية', admin: 'إدارية', legal: 'قانونية', other: 'أخرى',
};

// ✅ حساب العوائد بدون distressed
function calcInvReturns(inv: Investment) {
  const isClosed = inv.status === 'closed';
  const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
  const currentValue = isClosed ? 0 : (inv.currentValue || inv.entryAmount);

  // الربح المحقق: فقط للمغلقة (تخارج + توزيعاتها)
  const realizedProfit = isClosed
    ? ((inv.closingAmount || 0) - inv.entryAmount) + totalDividends
    : 0;

  // الربح غير المحقق: فقط للقائمة
  const unrealizedProfit = isClosed ? 0 : (currentValue - inv.entryAmount);

  // العائد الكلي
  const totalReturn = isClosed ? realizedProfit : unrealizedProfit + totalDividends;

  const returnPct = inv.entryAmount > 0 ? (totalReturn / inv.entryAmount) * 100 : 0;
  const days = Math.max(1, Math.round(
    ((inv.closingDate || new Date()).getTime() - inv.entryDate.getTime()) / 86400000
  ));
  const annualReturn = days > 0 ? returnPct / (days / 365) : 0;

  return { totalDividends, currentValue, realizedProfit, unrealizedProfit, totalReturn, returnPct, annualReturn };
}

type TabId = 'overview' | 'investments' | 'investors' | 'expenses' | 'cashflow';

export default function ReportsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [invSnap, invstSnap, expSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
      ]);
      setInvestors(invSnap.docs.map(d => ({
        id: d.id, ...d.data(), joinDate: toDate(d.data().joinDate),
      } as Investor)));
      setInvestments(invstSnap.docs.map(d => {
        const v = d.data();
        // ✅ تحويل distressed → active (للبيانات القديمة)
        const status = v.status === 'distressed' ? 'active' : (v.status || 'active');
        return {
          id: d.id, ...v, status,
          entryDate: toDate(v.entryDate),
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          dividends: (v.dividends || []).map((dv: Record<string, unknown>) => ({
            amount: dv.amount, date: toDate(dv.date),
          })),
        } as Investment;
      }));
      setExpenses(expSnap.docs.map(d => ({
        id: d.id, ...d.data(), date: toDate(d.data().date),
      } as Expense)));

      const snap = await calcPortfolioSnapshot();
      setSnapshot(snap);

      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      const cf = await getCashFlowStatement(from, now).catch(() => null);
      setCashFlow(cf);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ✅ فلتر التاريخ الدقيق — يقارن yyyy-mm-dd فقط
  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const inRange = (d: Date) => {
    const ymd = toYMD(d);
    if (dateFrom && ymd < dateFrom) return false;
    if (dateTo && ymd > dateTo) return false;
    return true;
  };

  const hasFilter = !!(dateFrom || dateTo);
  const filteredInvst = hasFilter ? investments.filter(i => inRange(i.entryDate)) : investments;
  const filteredInv = hasFilter ? investors.filter(i => inRange(i.joinDate)) : investors;
  const filteredExp = expenses.filter(e => e.status === 'approved' && (hasFilter ? inRange(e.date) : true));

  // الإجماليات
  const totalRealizedProfit = filteredInvst
    .filter(i => i.status === 'closed')
    .reduce((s, i) => s + calcInvReturns(i).realizedProfit, 0);
  const totalUnrealizedProfit = filteredInvst
    .filter(i => i.status !== 'closed')
    .reduce((s, i) => s + calcInvReturns(i).unrealizedProfit, 0);
  const totalDividendsAll = filteredInvst
    .reduce((s, i) => s + i.dividends.reduce((ss, d) => ss + d.amount, 0), 0);

  const exportCSV = (data: Record<string, unknown>[], filename: string) => {
    if (!data.length) return;
    const h = Object.keys(data[0]);
    const rows = data.map(r => h.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [h.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `${filename}.csv`; a.click();
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'ملخص', icon: <BarChart3 size={14} /> },
    { id: 'investments', label: 'الاستثمارات', icon: <TrendingUp size={14} /> },
    { id: 'investors', label: 'المستثمرون', icon: <Users size={14} /> },
    { id: 'expenses', label: 'المصاريف', icon: <Receipt size={14} /> },
    { id: 'cashflow', label: 'التدفقات', icon: <Filter size={14} /> },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-52">
      <div className="text-center">
        <div className="w-9 h-9 border-3 border-slate-200 border-t-blue-700 rounded-full mx-auto mb-3 animate-spin" style={{ borderWidth: 3 }} />
        <p className="text-slate-400 text-sm">جاري تحميل التقارير...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div><h1 className="page-title">التقارير</h1><p className="page-subtitle">المحاسبة والأداء</p></div>
        <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}><RefreshCw size={15} /></button>
      </div>

      {/* ✅ فلتر التاريخ الدقيق */}
      <div className="card p-3 flex flex-wrap gap-2 items-end">
        <Filter size={14} className="text-slate-400 mb-1 hidden sm:block" />
        <div>
          <p className="label text-xs">من</p>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="input text-sm" style={{ padding: '0.375rem 0.625rem' }} />
        </div>
        <div>
          <p className="label text-xs">إلى</p>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="input text-sm" style={{ padding: '0.375rem 0.625rem' }} />
        </div>
        {hasFilter && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary text-xs px-3 py-1.5">مسح الفلتر</button>
        )}
        {hasFilter && (
          <div className="flex items-center gap-3 text-xs text-slate-500 mr-auto">
            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">{filteredInvst.length} استثمار</span>
            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg font-medium">{filteredInv.length} مستثمر</span>
            <span className="bg-red-50 text-red-700 px-2 py-1 rounded-lg font-medium">{filteredExp.length} مصروف</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer whitespace-nowrap transition-all flex-shrink-0"
            style={{
              background: activeTab === t.id ? '#fff' : 'transparent',
              color: activeTab === t.id ? 'var(--navy)' : '#64748b',
              boxShadow: activeTab === t.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              fontFamily: 'inherit',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && snapshot && (
        <div className="space-y-4">
          {/* المركز المالي */}
          <div className="card p-5">
            <h3 className="section-title">المركز المالي</h3>
            <div className="space-y-0">
              {[
                { label: 'رأس مال الملاك الداخل', value: snapshot.ownerCapitalIn, color: '#2563eb', prefix: '+' },
                { label: 'الأرباح المحققة (تخارجات)', value: totalRealizedProfit, color: totalRealizedProfit >= 0 ? '#059669' : '#dc2626', prefix: totalRealizedProfit >= 0 ? '+' : '' },
                { label: 'الأرباح غير المحققة (تقييم قائمة)', value: totalUnrealizedProfit, color: '#0891b2', prefix: totalUnrealizedProfit >= 0 ? '+' : '' },
                { label: 'التوزيعات النقدية المستلمة', value: totalDividendsAll, color: '#d97706', prefix: '+' },
                { label: 'المصروفات المعتمدة', value: snapshot.totalExpenses, color: '#dc2626', prefix: '−' },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{row.label}</span>
                  <span className="text-sm font-semibold" style={{ color: row.color }}>{row.prefix}{formatCurrency(Math.abs(row.value))}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t-2 border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800">النقد المتوفر</p>
                  <p className="text-xs text-slate-400">رأس المال − الاستثمارات + عوائد − مصاريف</p>
                </div>
                <span className="font-black text-lg" style={{ color: snapshot.availableCash >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(snapshot.availableCash)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-700 text-sm">صافي قيمة المحفظة</p>
                  <p className="text-xs text-slate-400">نقد + قيمة الاستثمارات القائمة</p>
                </div>
                <span className="font-black text-base text-blue-700">{formatCurrency(snapshot.netPortfolioValue)}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'استثمارات قائمة', value: snapshot.activeCount, color: '#059669', bg: '#f0fdf4' },
              { label: 'استثمارات مغلقة', value: snapshot.closedCount, color: '#2563eb', bg: '#eff6ff' },
              { label: 'أرباح محققة', value: formatCurrency(totalRealizedProfit), color: '#059669', bg: '#f0fdf4', isText: true },
              { label: 'أرباح غير محققة', value: formatCurrency(totalUnrealizedProfit), color: '#0891b2', bg: '#ecfeff', isText: true },
            ].map((c, i) => (
              <div key={i} className="stat-card text-center py-3">
                <p className="text-lg font-black" style={{ color: c.color }}>{c.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INVESTMENTS ── */}
      {activeTab === 'investments' && (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">أداء الاستثمارات ({filteredInvst.length})</p>
              <button onClick={() => exportCSV(filteredInvst.map(i => { const r = calcInvReturns(i); return { 'الاسم': i.name, 'الحالة': i.status === 'closed' ? 'مغلق' : 'قائم', 'التكلفة': i.entryAmount, 'عائد%': r.returnPct.toFixed(2) }; }), 'investments')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            {filteredInvst.map(inv => {
              const r = calcInvReturns(inv);
              const isClosed = inv.status === 'closed';
              return (
                <div key={inv.id} className="card p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{inv.name}</p>
                      <p className="text-xs text-slate-400">{inv.entity}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isClosed ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {isClosed ? 'مغلق' : 'قائم'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">التكلفة</p><p className="font-bold text-blue-700 text-sm">{formatCurrency(inv.entryAmount)}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">القيمة الحالية</p><p className="font-bold text-sm">{isClosed ? <span className="text-slate-400 text-xs">0 (مغلق)</span> : formatCurrency(r.currentValue)}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">العائد الكلي</p><p className={`font-bold text-sm ${r.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.totalReturn >= 0 ? '+' : ''}{formatCurrency(r.totalReturn)}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">عائد%</p><p className={`font-bold text-sm ${r.returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct(r.returnPct)}</p></div>
                    {r.totalDividends > 0 && <div className="bg-orange-50 rounded-lg p-2 col-span-2"><p className="text-xs text-orange-400">توزيعات</p><p className="font-bold text-orange-600 text-sm">{formatCurrency(r.totalDividends)}</p></div>}
                  </div>
                </div>
              );
            })}
            {/* Mobile totals */}
            {filteredInvst.length > 0 && (() => {
              const totals = filteredInvst.reduce((acc, inv) => { const r = calcInvReturns(inv); return { cost: acc.cost + inv.entryAmount, ret: acc.ret + r.totalReturn }; }, { cost: 0, ret: 0 });
              const totalRetPct = totals.cost > 0 ? (totals.ret / totals.cost) * 100 : 0;
              return (
                <div className="card p-4 bg-slate-50 border-2 border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 mb-2">الإجمالي</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-xs text-slate-400">التكلفة</p><p className="font-bold text-blue-700">{formatCurrency(totals.cost)}</p></div>
                    <div><p className="text-xs text-slate-400">العائد الكلي</p><p className={`font-bold ${totals.ret >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totals.ret >= 0 ? '+' : ''}{formatCurrency(totals.ret)}</p></div>
                    <div><p className="text-xs text-slate-400">عائد%</p><p className={`font-bold ${totalRetPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pct(totalRetPct)}</p></div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-700">أداء الاستثمارات ({filteredInvst.length})</h3>
              <button onClick={() => exportCSV(filteredInvst.map(i => { const r = calcInvReturns(i); return { 'الاسم': i.name, 'الحالة': i.status, 'التكلفة': i.entryAmount, 'القيمة الحالية': r.currentValue, 'ربح محقق': r.realizedProfit, 'ربح غير محقق': r.unrealizedProfit, 'توزيعات': r.totalDividends, 'عائد%': r.returnPct.toFixed(2), 'عائد سنوي%': r.annualReturn.toFixed(2) }; }), 'investments')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>الاستثمار</th><th>الحالة</th><th>التكلفة</th>
                    <th>القيمة الحالية</th><th>ربح محقق</th><th>ربح غير محقق</th>
                    <th>توزيعات</th><th>العائد الكلي</th><th>عائد%</th><th>سنوي%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvst.map(inv => {
                    const r = calcInvReturns(inv);
                    const isClosed = inv.status === 'closed';
                    return (
                      <tr key={inv.id}>
                        <td><p className="font-semibold text-sm">{inv.name}</p><p className="text-xs text-slate-400">{inv.entity}</p></td>
                        <td><span className={isClosed ? 'badge-blue' : 'badge-green'}>{isClosed ? 'مغلق' : 'قائم'}</span></td>
                        <td className="font-semibold text-blue-700">{formatCurrency(inv.entryAmount)}</td>
                        <td className="font-semibold">{isClosed ? <span className="text-slate-400 text-xs">0 (مغلق)</span> : formatCurrency(r.currentValue)}</td>
                        <td style={{ color: r.realizedProfit > 0 ? '#059669' : r.realizedProfit < 0 ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>{r.realizedProfit !== 0 ? `${r.realizedProfit > 0 ? '+' : ''}${formatCurrency(r.realizedProfit)}` : '—'}</td>
                        <td style={{ color: r.unrealizedProfit >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>{!isClosed ? (r.unrealizedProfit >= 0 ? '+' : '') + formatCurrency(r.unrealizedProfit) : '—'}</td>
                        <td className="text-amber-600">{r.totalDividends > 0 ? formatCurrency(r.totalDividends) : '—'}</td>
                        <td style={{ color: r.totalReturn >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>{r.totalReturn >= 0 ? '+' : ''}{formatCurrency(r.totalReturn)}</td>
                        <td style={{ color: r.returnPct >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>{pct(r.returnPct)}</td>
                        <td style={{ color: r.annualReturn >= 0 ? '#059669' : '#dc2626' }}>{pct(r.annualReturn)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredInvst.length > 0 && (() => {
                  const totals = filteredInvst.reduce((acc, inv) => {
                    const r = calcInvReturns(inv);
                    return { cost: acc.cost + inv.entryAmount, cv: acc.cv + r.currentValue, rp: acc.rp + r.realizedProfit, up: acc.up + r.unrealizedProfit, div: acc.div + r.totalDividends, ret: acc.ret + r.totalReturn };
                  }, { cost: 0, cv: 0, rp: 0, up: 0, div: 0, ret: 0 });
                  const totalRetPct = totals.cost > 0 ? (totals.ret / totals.cost) * 100 : 0;
                  return (
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="font-bold">الإجمالي</td>
                        <td className="font-bold text-blue-700">{formatCurrency(totals.cost)}</td>
                        <td className="font-bold">{formatCurrency(totals.cv)}</td>
                        <td className="font-bold" style={{ color: totals.rp >= 0 ? '#059669' : '#dc2626' }}>{totals.rp >= 0 ? '+' : ''}{formatCurrency(totals.rp)}</td>
                        <td className="font-bold" style={{ color: totals.up >= 0 ? '#059669' : '#dc2626' }}>{totals.up >= 0 ? '+' : ''}{formatCurrency(totals.up)}</td>
                        <td className="font-bold text-amber-600">{formatCurrency(totals.div)}</td>
                        <td className="font-bold" style={{ color: totals.ret >= 0 ? '#059669' : '#dc2626' }}>{totals.ret >= 0 ? '+' : ''}{formatCurrency(totals.ret)}</td>
                        <td className="font-bold" style={{ color: totalRetPct >= 0 ? '#059669' : '#dc2626' }}>{pct(totalRetPct)}</td>
                        <td>—</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
              <p className="text-xs text-amber-700">* القيمة الحالية للاستثمارات المغلقة = 0 (خرجت من المحفظة)</p>
            </div>
          </div>
        </div>
      )}

      {/* ── INVESTORS ── */}
      {activeTab === 'investors' && (
        <div className="space-y-3">
          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">المستثمرون ({filteredInv.length})</p>
              <button onClick={() => exportCSV(filteredInv.map(i => ({ 'الاسم': i.name, 'رأس المال': i.totalPaid, 'الملكية%': (i.ownershipPercentage || 0).toFixed(2) })), 'investors')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            {filteredInv.map(inv => (
              <div key={inv.id} className="card p-4">
                <div className="flex justify-between items-start mb-2">
                  <div><p className="font-bold text-slate-800">{inv.name}</p><p className="text-xs text-slate-400">{inv.email}</p></div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{inv.status === 'active' ? 'نشط' : 'غير نشط'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">رأس المال</p><p className="font-bold text-blue-700 text-sm">{formatCurrency(inv.totalPaid)}</p></div>
                  <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">الحصص</p><p className="font-bold text-sm">{(inv.shareCount || 0).toLocaleString('ar-SA')}</p></div>
                  <div className="bg-slate-50 rounded-lg p-2"><p className="text-xs text-slate-400">الملكية</p><p className="font-bold text-sm">{pct(inv.ownershipPercentage || 0)}</p></div>
                </div>
              </div>
            ))}
            {/* Mobile total */}
            <div className="card p-4 bg-blue-50 border-2 border-blue-100">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-700">إجمالي رأس المال</span>
                <span className="font-black text-blue-800">{formatCurrency(filteredInv.reduce((s, i) => s + i.totalPaid, 0))}</span>
              </div>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-700">تقرير المستثمرين ({filteredInv.length})</h3>
              <button onClick={() => exportCSV(filteredInv.map(i => ({ 'الاسم': i.name, 'رأس المال': i.totalPaid, 'الحصص': i.shareCount, 'الملكية%': (i.ownershipPercentage || 0).toFixed(2), 'تاريخ الانضمام': formatDate(i.joinDate), 'الحالة': i.status })), 'investors')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead><tr><th>المستثمر</th><th>رأس المال</th><th>الحصص</th><th>الملكية</th><th>تاريخ الانضمام</th><th>الحالة</th></tr></thead>
                <tbody>
                  {filteredInv.map(inv => (
                    <tr key={inv.id}>
                      <td><p className="font-semibold">{inv.name}</p><p className="text-xs text-slate-400">{inv.email}</p></td>
                      <td className="font-semibold text-blue-700">{formatCurrency(inv.totalPaid)}</td>
                      <td>{(inv.shareCount || 0).toLocaleString('ar-SA')}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div style={{ width: `${Math.min(inv.ownershipPercentage || 0, 100)}%` }} className="h-full bg-blue-600 rounded-full" /></div>
                          <span className="text-sm font-semibold">{pct(inv.ownershipPercentage || 0)}</span>
                        </div>
                      </td>
                      <td className="text-slate-500 text-sm">{formatDate(inv.joinDate)}</td>
                      <td><span className={inv.status === 'active' ? 'badge-green' : 'badge-gray'}>{inv.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-blue-50">
                    <td>الإجمالي</td>
                    <td className="text-blue-700">{formatCurrency(filteredInv.reduce((s, i) => s + i.totalPaid, 0))}</td>
                    <td>{filteredInv.reduce((s, i) => s + i.shareCount, 0).toLocaleString('ar-SA')}</td>
                    <td>100%</td><td>—</td><td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPENSES ── */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          {/* Category summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(EXPENSE_LABELS).map(([key, label]) => {
              const total = filteredExp.filter(e => e.type === key).reduce((s, e) => s + e.amount, 0);
              if (!total) return null;
              return (
                <div key={key} className="stat-card py-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">{label}</p>
                  <p className="font-bold text-red-600">{formatCurrency(total)}</p>
                </div>
              );
            })}
          </div>

          {/* Mobile list */}
          <div className="sm:hidden space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">المصروفات ({filteredExp.length})</p>
              <button onClick={() => exportCSV(filteredExp.map(e => ({ 'النوع': EXPENSE_LABELS[e.type] || e.type, 'الوصف': e.description, 'التاريخ': formatDate(e.date), 'المبلغ': e.amount })), 'expenses')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            {filteredExp.map(exp => (
              <div key={exp.id} className="card p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{exp.description}</p>
                  <p className="text-xs text-slate-400">{formatDate(exp.date)} · <span className="badge-blue text-xs">{EXPENSE_LABELS[exp.type] || exp.type}</span></p>
                </div>
                <span className="font-bold text-red-600 mr-3 flex-shrink-0">{formatCurrency(exp.amount)}</span>
              </div>
            ))}
            <div className="card p-3 bg-red-50 border-2 border-red-100 flex justify-between items-center">
              <span className="text-sm font-semibold text-red-700">الإجمالي</span>
              <span className="font-black text-red-800">{formatCurrency(filteredExp.reduce((s, e) => s + e.amount, 0))}</span>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-700">المصروفات المعتمدة ({filteredExp.length})</h3>
              <button onClick={() => exportCSV(filteredExp.map(e => ({ 'النوع': e.type, 'الوصف': e.description, 'التاريخ': formatDate(e.date), 'المبلغ': e.amount, 'الاستثمار': e.investmentName || '' })), 'expenses')} className="btn-secondary text-xs px-2.5 py-1.5"><Download size={12} />CSV</button>
            </div>
            <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
              <table className="table">
                <thead><tr><th>النوع</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>استثمار مرتبط</th></tr></thead>
                <tbody>
                  {filteredExp.map(exp => (
                    <tr key={exp.id}>
                      <td><span className="badge-blue text-xs">{EXPENSE_LABELS[exp.type] || exp.type}</span></td>
                      <td className="font-medium text-sm">{exp.description}</td>
                      <td className="text-slate-500 text-sm">{formatDate(exp.date)}</td>
                      <td className="font-bold text-red-600">{formatCurrency(exp.amount)}</td>
                      <td className="text-slate-400 text-sm">{exp.investmentName || '—'}</td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-red-50">
                    <td colSpan={3}>الإجمالي</td>
                    <td className="text-red-700">{formatCurrency(filteredExp.reduce((s, e) => s + e.amount, 0))}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CASH FLOW ── */}
      {activeTab === 'cashflow' && (
        <div>
          {cashFlow ? (
            <div className="card p-5">
              <h3 className="section-title">قائمة التدفقات النقدية — {cashFlow.period.from.getFullYear()}</h3>
              <div className="space-y-0">
                <div className="flex justify-between py-3 border-b-2 border-slate-200">
                  <span className="font-bold text-slate-800">رصيد أول المدة</span>
                  <span className="font-black">{formatCurrency(cashFlow.openingBalance)}</span>
                </div>
                <div className="py-3 border-b border-dashed border-slate-200">
                  <p className="text-xs font-bold text-green-700 mb-2 uppercase tracking-wide">تدفقات داخلة</p>
                  {[
                    ['رأس مال داخل', cashFlow.capitalIn],
                    ['متحصلات تخارج', cashFlow.exitProceeds],
                    ['توزيعات وأرباح', cashFlow.dividends],
                    ['دخل تشغيلي', cashFlow.operatingIncome],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between py-1.5 pr-4">
                      <span className="text-sm text-slate-500">{k}</span>
                      <span className="text-sm font-semibold text-green-600">+{formatCurrency(v as number)}</span>
                    </div>
                  ))}
                </div>
                <div className="py-3 border-b-2 border-slate-200">
                  <p className="text-xs font-bold text-red-600 mb-2 uppercase tracking-wide">تدفقات خارجة</p>
                  {[
                    ['تمويل استثمارات', cashFlow.investmentFunding],
                    ['زيادات استثمارات', cashFlow.investmentTopups],
                    ['المصروفات', cashFlow.approvedExpenses],
                    ['سحوبات الملاك', cashFlow.ownerWithdrawals],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between py-1.5 pr-4">
                      <span className="text-sm text-slate-500">{k}</span>
                      <span className="text-sm font-semibold text-red-600">−{formatCurrency(v as number)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-4">
                  <span className="font-black text-slate-800">رصيد آخر المدة</span>
                  <span className="font-black text-lg" style={{ color: cashFlow.closingBalance >= 0 ? '#059669' : '#dc2626' }}>{formatCurrency(cashFlow.closingBalance)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-slate-400 text-sm mb-3">قائمة التدفقات النقدية تتطلب إعداد الـ ledger أولاً</p>
              <a href="/dashboard" className="text-blue-700 font-semibold text-sm">الذهاب للوحة التحكم ←</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
