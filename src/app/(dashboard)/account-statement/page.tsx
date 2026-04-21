'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestor, getDistributions, getInvestorHistory } from '@/lib/db';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';
import type { Investor, Distribution, InvestorHistory } from '@/types';
import { FileText, Download, Filter, Calendar, Printer } from 'lucide-react';

export default function AccountStatementPage() {
  const { user } = useAuth();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [history, setHistory] = useState<InvestorHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!user?.investorId) { setLoading(false); return; }
      const [inv, dists, hist] = await Promise.all([
        getInvestor(user.investorId),
        getDistributions(),
        getInvestorHistory(user.investorId),
      ]);
      setInvestor(inv);
      setDistributions(dists.filter(d => d.status === 'approved' && (d.investorId === user.investorId || d.details?.some(det => det.investorId === user.investorId))));
      setHistory(hist);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!investor) return <div className="text-center py-20 text-slate-500">لم يتم ربط حسابك بمستثمر</div>;

  const filterDate = <T extends { date?: Date }>(items: T[]) => items.filter(item => {
    if (!item.date) return true;
    if (dateFrom && item.date < new Date(dateFrom)) return false;
    if (dateTo && item.date > new Date(dateTo)) return false;
    return true;
  });

  const filteredDists = filterDate(distributions);
  const filteredHistory = filterDate(history.map(h => ({ ...h, date: h.date })));

  // Build statement rows
  interface StatementRow { date: Date; type: string; description: string; credit: number; debit: number; balance: number; }
  const rows: StatementRow[] = [];
  let runningBalance = 0;

  // Opening: initial investment
  runningBalance = investor.investedAmount;
  rows.push({ date: investor.joinDate, type: 'رأس المال', description: 'رأس المال الابتدائي', credit: investor.investedAmount, debit: 0, balance: runningBalance });

  // Additional contributions from history
  filteredHistory.forEach(h => {
    if (h.type === 'increase_contribution' || h.type === 'new_investor') {
      const amt = (h.sharesAfter - h.sharesBefore) * investor.sharePrice;
      runningBalance += amt;
      rows.push({ date: h.date, type: 'زيادة مساهمة', description: h.notes || 'زيادة في المساهمة', credit: amt, debit: 0, balance: runningBalance });
    }
    if (h.type === 'decrease_contribution' || h.type === 'investor_exit') {
      const amt = (h.sharesBefore - h.sharesAfter) * investor.sharePrice;
      runningBalance -= amt;
      rows.push({ date: h.date, type: 'تخفيض مساهمة', description: h.notes || 'تخفيض في المساهمة', credit: 0, debit: amt, balance: runningBalance });
    }
  });

  // Distributions
  filteredDists.forEach(d => {
    const myAmount = d.investorId === investor.id ? d.totalAmount : d.details?.find(det => det.investorId === investor.id)?.amount || 0;
    if (!myAmount) return;
    if (d.type === 'profit_distribution') {
      rows.push({ date: d.date, type: 'توزيع أرباح', description: d.notes || 'توزيع أرباح دورية', credit: myAmount, debit: 0, balance: runningBalance });
    } else if (d.type === 'reinvestment') {
      rows.push({ date: d.date, type: 'إعادة استثمار', description: d.notes || 'إعادة استثمار الأرباح', credit: 0, debit: myAmount, balance: runningBalance });
    }
  });

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const openingBalance = rows[0]?.credit || 0;
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const closingBalance = runningBalance;

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const csvRows = [
      ['التاريخ', 'النوع', 'الوصف', 'دائن', 'مدين', 'الرصيد'],
      ...rows.map(r => [formatDate(r.date), r.type, r.description, r.credit || '', r.debit || '', r.balance]),
    ];
    const csv = '\uFEFF' + csvRows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `كشف-حساب-${investor.name}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">كشف حساب المستثمر</h1>
          <p className="text-slate-500 text-sm mt-0.5">{investor.name} — {investor.investorNumber}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary"><Printer size={16} />طباعة</button>
          <button onClick={handleExportCSV} className="btn-secondary"><Download size={16} />تصدير CSV</button>
        </div>
      </div>

      {/* Filters */}
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
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary">إظهار الكل</button>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'الرصيد الافتتاحي', value: formatCurrency(openingBalance), color: 'text-blue-700' },
          { label: 'إجمالي الدائن', value: formatCurrency(totalCredit), color: 'text-green-700' },
          { label: 'إجمالي المدين', value: formatCurrency(totalDebit), color: 'text-red-600' },
          { label: 'الرصيد الختامي', value: formatCurrency(closingBalance), color: 'text-blue-800 font-bold' },
        ].map(item => (
          <div key={item.label} className="stat-card">
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-sm text-slate-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Investor snapshot */}
      <div className="card p-6">
        <h3 className="section-title">بيانات المستثمر</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            ['إجمالي رأس المال المدفوع', formatCurrency(investor.totalPaid)],
            ['عدد الحصص الحالية', investor.shareCount.toLocaleString('ar-SA')],
            ['نسبة الملكية الحالية', formatPercent(investor.ownershipPercentage)],
            ['تاريخ الانضمام', formatDate(investor.joinDate)],
          ].map(([k, v]) => (
            <div key={k}><p className="text-xs text-slate-500 mb-1">{k}</p><p className="text-sm font-semibold text-slate-800">{v}</p></div>
          ))}
        </div>
      </div>

      {/* Statement table */}
      <div className="card p-6">
        <h3 className="section-title">تفاصيل الكشف</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع الحركة</th>
                <th>الوصف</th>
                <th>دائن (+)</th>
                <th>مدين (-)</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="text-slate-600 text-sm">{formatDate(row.date)}</td>
                  <td><span className="badge-blue text-xs">{row.type}</span></td>
                  <td className="text-slate-700">{row.description}</td>
                  <td className="text-green-700 font-semibold">{row.credit > 0 ? formatCurrency(row.credit) : '—'}</td>
                  <td className="text-red-600 font-semibold">{row.debit > 0 ? formatCurrency(row.debit) : '—'}</td>
                  <td className="text-blue-800 font-bold">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد حركات في الفترة المحددة</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-blue-50 font-bold">
                  <td colSpan={3} className="text-right text-blue-800">الإجمالي</td>
                  <td className="text-green-700">{formatCurrency(totalCredit)}</td>
                  <td className="text-red-600">{formatCurrency(totalDebit)}</td>
                  <td className="text-blue-800">{formatCurrency(closingBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
