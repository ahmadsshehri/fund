'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestors, getInvestments, getExpenses, getDistributions, getCashFlows } from '@/lib/db';
import { formatCurrency, formatDate, formatPercent, formatNumber, EXPENSE_TYPES, INVESTMENT_STATUSES } from '@/lib/utils';
import type { Investor, Investment, Expense, Distribution, CashFlow } from '@/types';
import {
  BarChart3, Download, Filter, TrendingUp, Users, Receipt,
  GitBranch, DollarSign, RefreshCw, FileText, Table,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ReportsPage() {
  const { user } = useAuth();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [cashFlows, setCashFlows] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'investors' | 'investments' | 'expenses' | 'financial'>('investors');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    const [inv, invest, exp, dist, cash] = await Promise.all([
      getInvestors(), getInvestments(), getExpenses(), getDistributions(), getCashFlows(),
    ]);
    setInvestors(inv); setInvestments(invest); setExpenses(exp);
    setDistributions(dist); setCashFlows(cash); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filterByDate = <T extends { date?: Date; joinDate?: Date }>(items: T[]): T[] => {
    return items.filter(item => {
      const d = (item as { date?: Date }).date || (item as { joinDate?: Date }).joinDate;
      if (!d) return true;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo)) return false;
      return true;
    });
  };

  // Investor report data
  const investorReport = investors.map(inv => {
    const invDists = distributions.filter(d => d.status === 'approved' && (d.investorId === inv.id || d.details?.some(det => det.investorId === inv.id)));
    const totalReceived = invDists.reduce((s, d) => {
      if (d.investorId === inv.id) return s + d.totalAmount;
      const det = d.details?.find(det => det.investorId === inv.id);
      return s + (det?.amount || 0);
    }, 0);
    const returnPct = inv.totalPaid > 0 ? (totalReceived / inv.totalPaid) * 100 : 0;
    return { ...inv, totalDistributions: totalReceived, returnPct };
  });

  // Investment report data
  const investmentsByStatus = [
    { name: 'قائمة', value: investments.filter(i => i.status === 'active').length },
    { name: 'مغلقة', value: investments.filter(i => i.status === 'closed').length },
    { name: 'متعثرة', value: investments.filter(i => i.status === 'distressed').length },
    { name: 'مجمدة', value: investments.filter(i => i.status === 'frozen').length },
  ].filter(s => s.value > 0);

  // Expense by type chart
  const expenseByType = Object.entries(EXPENSE_TYPES).map(([key, label]) => ({
    name: label,
    value: expenses.filter(e => e.type === key && e.status === 'approved').reduce((s, e) => s + e.amount, 0),
  })).filter(e => e.value > 0);

  // Cash flow chart (monthly)
  const cashByMonth: Record<string, number> = {};
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashByMonth[key] = (cashByMonth[key] || 0) + cf.amount;
  });
  const cashChartData = Object.entries(cashByMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, amount]) => ({
    month: month.replace('-', '/'), amount,
  }));

  const handleExportCSV = (data: Record<string, unknown>[], filename: string) => {
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
    { id: 'investors', label: 'تقارير المستثمرين', icon: <Users size={16} /> },
    { id: 'investments', label: 'تقارير الاستثمارات', icon: <TrendingUp size={16} /> },
    { id: 'expenses', label: 'تقارير المصاريف', icon: <Receipt size={16} /> },
    { id: 'financial', label: 'التقارير المالية', icon: <BarChart3 size={16} /> },
  ] as const;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="text-slate-500 text-sm mt-0.5">جميع التقارير والإحصائيات</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} />تحديث</button>
      </div>

      {/* Date filter */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-end">
        <Filter size={16} className="text-slate-400 mb-2 hidden sm:block" />
        <div>
          <label className="label">من تاريخ</label>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">إلى تاريخ</label>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary">مسح الفلتر</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Investors Report */}
      {activeTab === 'investors' && (
        <div className="space-y-4">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">تقرير المستثمرين</h3>
              <button
                onClick={() => handleExportCSV(
                  investorReport.map(i => ({ 'الاسم': i.name, 'رأس المال': i.totalPaid, 'الحصص': i.shareCount, 'الملكية%': i.ownershipPercentage.toFixed(2), 'التوزيعات': i.totalDistributions, 'العائد%': i.returnPct.toFixed(2) })),
                  'investor-report'
                )}
                className="btn-secondary text-xs"
              ><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>المستثمر</th>
                    <th>رأس المال</th>
                    <th>الحصص</th>
                    <th>نسبة الملكية</th>
                    <th>إجمالي التوزيعات</th>
                    <th>العائد</th>
                    <th>تاريخ الانضمام</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {investorReport.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-medium">{inv.name}</td>
                      <td className="text-blue-700 font-semibold">{formatCurrency(inv.totalPaid)}</td>
                      <td>{formatNumber(inv.shareCount, 0)}</td>
                      <td>{formatPercent(inv.ownershipPercentage)}</td>
                      <td className="text-green-700">{formatCurrency(inv.totalDistributions)}</td>
                      <td className={inv.returnPct >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                        {formatPercent(inv.returnPct)}
                      </td>
                      <td className="text-slate-600">{formatDate(inv.joinDate)}</td>
                      <td><span className={inv.status === 'active' ? 'badge-green' : 'badge-gray'}>{inv.status === 'active' ? 'نشط' : 'خرج'}</span></td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 font-bold">
                    <td>الإجمالي</td>
                    <td className="text-blue-700">{formatCurrency(investors.reduce((s, i) => s + i.totalPaid, 0))}</td>
                    <td>{formatNumber(investors.reduce((s, i) => s + i.shareCount, 0), 0)}</td>
                    <td>100%</td>
                    <td className="text-green-700">{formatCurrency(investorReport.reduce((s, i) => s + i.totalDistributions, 0))}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Investments Report */}
      {activeTab === 'investments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <h3 className="section-title">توزيع الاستثمارات حسب الحالة</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={investmentsByStatus} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {investmentsByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-6">
              <h3 className="section-title">ملخص الاستثمارات</h3>
              <div className="space-y-3">
                {[
                  ['إجمالي مبالغ قائمة', formatCurrency(investments.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0))],
                  ['إجمالي أرباح محققة', formatCurrency(investments.filter(i => i.status === 'closed').reduce((s, i) => s + (i.totalProfit || 0), 0))],
                  ['إجمالي أرباح مستلمة', formatCurrency(investments.reduce((s, i) => s + (i.receivedProfits || 0), 0))],
                  ['أفضل عائد سنوي', formatPercent((Math.max(...investments.filter(i => i.annualReturn).map(i => (i.annualReturn || 0) * 100))) || 0)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-sm text-slate-600">{k}</span>
                    <span className="text-sm font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">تفاصيل الاستثمارات</h3>
              <button onClick={() => handleExportCSV(investments.map(i => ({ 'الاسم': i.name, 'النوع': i.type, 'الجهة': i.entity, 'المبلغ': i.entryAmount, 'الحالة': i.status, 'الربح': i.totalProfit || 0, 'العائد السنوي': i.annualReturn ? (i.annualReturn * 100).toFixed(2) : 0 })), 'investments-report')} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>الاسم</th><th>الجهة</th><th>المبلغ</th><th>الأرباح المستلمة</th><th>الربح الإجمالي</th><th>العائد السنوي</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {investments.map(inv => (
                    <tr key={inv.id}>
                      <td className="font-medium">{inv.name}</td>
                      <td className="text-slate-600">{inv.entity}</td>
                      <td className="text-blue-700 font-semibold">{formatCurrency(inv.entryAmount)}</td>
                      <td className="text-green-700">{formatCurrency(inv.receivedProfits || 0)}</td>
                      <td className={(inv.totalProfit || 0) >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                        {inv.totalProfit !== undefined ? formatCurrency(inv.totalProfit) : '—'}
                      </td>
                      <td className={(inv.annualReturn || 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {inv.annualReturn !== undefined ? formatPercent(inv.annualReturn * 100) : '—'}
                      </td>
                      <td><span className={inv.status === 'active' ? 'badge-green' : inv.status === 'closed' ? 'badge-blue' : 'badge-red'}>{INVESTMENT_STATUSES[inv.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Report */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <h3 className="section-title">المصاريف حسب النوع</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={expenseByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-6">
              <h3 className="section-title">ملخص المصاريف</h3>
              <div className="space-y-3">
                {Object.entries(EXPENSE_TYPES).map(([key, label]) => {
                  const total = expenses.filter(e => e.type === key && e.status === 'approved').reduce((s, e) => s + e.amount, 0);
                  if (!total) return null;
                  return (
                    <div key={key} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-600">{label}</span>
                      <span className="text-sm font-semibold text-slate-800">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between py-2 font-bold text-blue-700">
                  <span className="text-sm">الإجمالي</span>
                  <span className="text-sm">{formatCurrency(expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0))}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">تفاصيل المصاريف</h3>
              <button onClick={() => handleExportCSV(expenses.map(e => ({ 'النوع': e.type, 'الوصف': e.description, 'التاريخ': formatDate(e.date), 'المبلغ': e.amount, 'الحالة': e.status })), 'expenses-report')} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>النوع</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>الاستثمار</th><th>الحالة</th></tr></thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id}>
                      <td><span className="badge-blue">{EXPENSE_TYPES[exp.type]}</span></td>
                      <td className="font-medium">{exp.description}</td>
                      <td className="text-slate-600">{formatDate(exp.date)}</td>
                      <td className="text-red-700 font-semibold">{formatCurrency(exp.amount)}</td>
                      <td className="text-slate-600 text-sm">{exp.investmentName || '—'}</td>
                      <td><span className={exp.status === 'approved' ? 'badge-green' : 'badge-yellow'}>{exp.status === 'approved' ? 'معتمد' : 'انتظار'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Financial Report */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {/* Fund position summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <h3 className="section-title">ملخص المركز المالي</h3>
              {[
                ['إجمالي رأس المال المدفوع', formatCurrency(investors.reduce((s, i) => s + i.totalPaid, 0)), 'text-blue-700'],
                ['إجمالي الأرباح المحققة', formatCurrency(investments.filter(i => i.status === 'closed').reduce((s, i) => s + (i.totalProfit || 0), 0)), 'text-green-700'],
                ['إجمالي الأرباح المستلمة', formatCurrency(investments.reduce((s, i) => s + (i.receivedProfits || 0), 0)), 'text-green-700'],
                ['إجمالي المصاريف المعتمدة', formatCurrency(expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0)), 'text-red-600'],
                ['إجمالي التوزيعات المعتمدة', formatCurrency(distributions.filter(d => d.status === 'approved').reduce((s, d) => s + d.totalAmount, 0)), 'text-orange-600'],
                ['صافي الكاش (حركي)', formatCurrency(cashFlows.reduce((s, c) => s + c.amount, 0)), 'text-blue-800 font-bold'],
              ].map(([k, v, color]) => (
                <div key={k} className="flex justify-between py-2.5 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-slate-600">{k}</span>
                  <span className={`text-sm ${color}`}>{v}</span>
                </div>
              ))}
            </div>
            <div className="card p-6">
              <h3 className="section-title">حركة الكاش الشهرية</h3>
              {cashChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cashChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
                    <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">لا توجد بيانات كافية لعرض الرسم البياني</div>
              )}
            </div>
          </div>

          {/* Cash flows table */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title mb-0">سجل الحركات النقدية</h3>
              <button onClick={() => handleExportCSV(cashFlows.map(c => ({ 'النوع': c.type, 'التاريخ': formatDate(c.date), 'المبلغ': c.amount, 'الوصف': c.description })), 'cashflows')} className="btn-secondary text-xs"><Download size={14} />تصدير CSV</button>
            </div>
            <div className="table-container max-h-80 overflow-y-auto">
              <table className="table">
                <thead><tr><th>النوع</th><th>التاريخ</th><th>المبلغ</th><th>الوصف</th></tr></thead>
                <tbody>
                  {cashFlows.slice(0, 50).map(cf => (
                    <tr key={cf.id}>
                      <td><span className={`badge ${cf.amount > 0 ? 'badge-green' : 'badge-red'}`}>{cf.amount > 0 ? 'دخول' : 'خروج'}</span></td>
                      <td className="text-slate-600">{formatDate(cf.date)}</td>
                      <td className={`font-semibold ${cf.amount > 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(cf.amount))}</td>
                      <td className="text-slate-600 text-sm">{cf.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
