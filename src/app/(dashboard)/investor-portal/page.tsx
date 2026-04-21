'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestor, getInvestments, getDistributions, getInvestorHistory } from '@/lib/db';
import { formatCurrency, formatDate, formatPercent, formatNumber, INVESTMENT_STATUSES } from '@/lib/utils';
import type { Investor, Investment, Distribution, InvestorHistory } from '@/types';
import {
  User, TrendingUp, DollarSign, Layers, Calendar, Download,
  FileText, Activity, CheckCircle, XCircle, PauseCircle, BarChart3,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function InvestorPortalPage() {
  const { user } = useAuth();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [history, setHistory] = useState<InvestorHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user?.investorId) return;
      const [inv, invs, dists, hist] = await Promise.all([
        getInvestor(user.investorId),
        getInvestments(),
        getDistributions(),
        getInvestorHistory(user.investorId),
      ]);
      setInvestor(inv);
      setInvestments(invs);
      // Only this investor's distributions
      const myDists = dists.filter(d => d.status === 'approved' && (d.investorId === user.investorId || d.details?.some(det => det.investorId === user.investorId)));
      setDistributions(myDists);
      setHistory(hist);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!investor) return (
    <div className="text-center py-20 text-slate-500">
      <User size={48} className="mx-auto mb-4 text-slate-300" />
      <p>لم يتم ربط حسابك بمستثمر بعد. يرجى التواصل مع المدير.</p>
    </div>
  );

  const totalReceived = distributions.reduce((s, d) => {
    if (d.investorId === investor.id) return s + d.totalAmount;
    const det = d.details?.find(det => det.investorId === investor.id);
    return s + (det?.amount || 0);
  }, 0);

  const totalReturn = investor.totalPaid > 0 ? (totalReceived / investor.totalPaid) * 100 : 0;

  // Estimated share in each investment by ownership %
  const investmentShares = investments.filter(i => i.status === 'active').map(inv => ({
    ...inv,
    myShare: inv.entryAmount * (investor.ownershipPercentage / 100),
    myProfit: (inv.receivedProfits || 0) * (investor.ownershipPercentage / 100),
  }));

  const totalMyShare = investmentShares.reduce((s, i) => s + i.myShare, 0);
  const totalMyProfit = investmentShares.reduce((s, i) => s + i.myProfit, 0);

  // Chart data from history
  const chartData = history.slice(0, 12).reverse().map(h => ({
    date: formatDate(h.date, 'MM/yy'),
    value: h.sharesAfter,
  }));

  const handleExportCSV = () => {
    const rows = [
      ['البيان', 'القيمة'],
      ['الاسم', investor.name],
      ['تاريخ الانضمام', formatDate(investor.joinDate)],
      ['إجمالي المدفوع', investor.totalPaid],
      ['عدد الحصص', investor.shareCount],
      ['نسبة الملكية', investor.ownershipPercentage.toFixed(2) + '%'],
      ['إجمالي التوزيعات المستلمة', totalReceived],
      ['إجمالي العائد%', totalReturn.toFixed(2) + '%'],
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `كشف-${investor.name}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">مرحباً، {investor.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">بوابة المستثمر الخاصة بك</p>
        </div>
        <button onClick={handleExportCSV} className="btn-secondary"><Download size={16} />تصدير البيانات</button>
      </div>

      {/* Main Info Card */}
      <div className="bg-gradient-to-l from-blue-700 to-blue-900 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User size={18} className="text-blue-300" />
              <span className="text-blue-200 text-sm">المستثمر رقم {investor.investorNumber}</span>
              <span className={`badge mr-2 ${investor.status === 'active' ? 'bg-green-400/20 text-green-200' : 'bg-gray-400/20 text-gray-200'}`}>
                {investor.status === 'active' ? 'نشط' : 'غير نشط'}
              </span>
            </div>
            <p className="text-3xl font-bold">{formatCurrency(investor.totalPaid)}</p>
            <p className="text-blue-300 text-sm mt-1">إجمالي رأس المال المدفوع</p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-blue-300 text-xs mb-1">نسبة الملكية</p>
              <p className="text-2xl font-bold">{formatPercent(investor.ownershipPercentage)}</p>
            </div>
            <div className="text-center">
              <p className="text-blue-300 text-xs mb-1">عدد الحصص</p>
              <p className="text-2xl font-bold">{formatNumber(investor.shareCount, 0)}</p>
            </div>
            <div className="text-center">
              <p className="text-blue-300 text-xs mb-1">تاريخ الانضمام</p>
              <p className="text-lg font-bold">{formatDate(investor.joinDate)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي التوزيعات المستلمة', value: formatCurrency(totalReceived), icon: <DollarSign size={18} />, color: 'green' },
          { label: 'العائد الإجمالي', value: formatPercent(totalReturn), icon: <TrendingUp size={18} />, color: 'blue' },
          { label: 'نصيبك من الاستثمارات', value: formatCurrency(totalMyShare), icon: <Layers size={18} />, color: 'purple' },
          { label: 'نصيبك من الأرباح', value: formatCurrency(totalMyProfit), icon: <BarChart3 size={18} />, color: 'yellow' },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <div className={`p-2 rounded-lg w-fit mb-3 ${card.color === 'green' ? 'bg-green-50' : card.color === 'blue' ? 'bg-blue-50' : card.color === 'purple' ? 'bg-purple-50' : 'bg-yellow-50'}`}>
              <span className={card.color === 'green' ? 'text-green-600' : card.color === 'blue' ? 'text-blue-600' : card.color === 'purple' ? 'text-purple-600' : 'text-yellow-600'}>
                {card.icon}
              </span>
            </div>
            <p className="text-lg font-bold text-slate-800">{card.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Investment shares */}
        <div className="card p-6">
          <h3 className="section-title">نصيبك من الاستثمارات القائمة</h3>
          {investmentShares.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">لا توجد استثمارات قائمة</p>
          ) : (
            <div className="space-y-3">
              {investmentShares.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{inv.name}</p>
                    <p className="text-xs text-slate-500">{inv.entity}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-blue-700 text-sm">{formatCurrency(inv.myShare)}</p>
                    <p className="text-xs text-green-600">+ {formatCurrency(inv.myProfit)} أرباح</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribution history */}
        <div className="card p-6">
          <h3 className="section-title">سجل التوزيعات المستلمة</h3>
          {distributions.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">لا توجد توزيعات بعد</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {distributions.map(dist => {
                const myAmount = dist.investorId === investor.id
                  ? dist.totalAmount
                  : dist.details?.find(det => det.investorId === investor.id)?.amount || 0;
                return (
                  <div key={dist.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{formatDate(dist.date)}</p>
                      <p className="text-xs text-slate-500">{dist.notes || 'توزيع أرباح'}</p>
                    </div>
                    <span className="font-bold text-green-700 text-sm">{formatCurrency(myAmount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity history */}
      {history.length > 0 && (
        <div className="card p-6">
          <h3 className="section-title">سجل التغييرات على حسابك</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>نوع العملية</th><th>حصص قبل</th><th>حصص بعد</th><th>ملكية قبل</th><th>ملكية بعد</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td className="text-slate-600">{formatDate(h.date)}</td>
                    <td><span className="badge-blue text-xs">{h.type}</span></td>
                    <td>{formatNumber(h.sharesBefore, 0)}</td>
                    <td>{formatNumber(h.sharesAfter, 0)}</td>
                    <td>{formatPercent(h.ownershipBefore)}</td>
                    <td>{formatPercent(h.ownershipAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
