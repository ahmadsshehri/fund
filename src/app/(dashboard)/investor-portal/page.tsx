'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestor, getInvestors, getInvestments, getDistributions, getInvestorHistory } from '@/lib/db';
import { formatCurrency, formatDate, formatPercent, formatNumber } from '@/lib/utils';
import type { Investor, Investment, Distribution, InvestorHistory } from '@/types';
import { User, TrendingUp, DollarSign, Layers, Download, BarChart3 } from 'lucide-react';

export default function InvestorPortalPage() {
  const { user } = useAuth();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [history, setHistory] = useState<InvestorHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);
      try {
        let investorId = user.investorId;

        // ✅ إذا لم يكن investorId موجوداً في الـ session،
        // ابحث عن المستثمر عبر userId في collection investors
        if (!investorId) {
          const allInvestors = await getInvestors();
          const matched = allInvestors.find(i => i.userId === user.id);
          if (matched) {
            investorId = matched.id;
          } else {
            // ليس مرتبطاً بأي مستثمر
            setNotLinked(true);
            setLoading(false);
            return;
          }
        }

        const [inv, invs, dists, hist] = await Promise.all([
          getInvestor(investorId),
          getInvestments(),
          getDistributions(),
          getInvestorHistory(investorId),
        ]);

        if (!inv) {
          setNotLinked(true);
          setLoading(false);
          return;
        }

        setInvestor(inv);
        setInvestments(invs);

        const myDists = dists.filter(d =>
          d.status === 'approved' &&
          (d.investorId === investorId || d.details?.some(det => det.investorId === investorId))
        );
        setDistributions(myDists);
        setHistory(hist);
      } catch (e) {
        console.error('[InvestorPortal] Error:', e);
        setNotLinked(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  // ── Loading ──
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري تحميل بياناتك...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── غير مرتبط ──
  if (notLinked || !investor) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <div style={{ width: 72, height: 72, borderRadius: '20px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
        <User size={32} color="#94a3b8" />
      </div>
      <h2 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '0.5rem' }}>لم يتم ربط حسابك بعد</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: 320, margin: '0 auto' }}>
        حسابك لم يُربط بمستثمر حتى الآن. يرجى التواصل مع المدير لإتمام الربط.
      </p>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '1rem' }}>
        البريد الإلكتروني: {user?.email}
      </p>
    </div>
  );

  // ── البيانات ──
  const totalReceived = distributions.reduce((s, d) => {
    if (d.investorId === investor.id) return s + d.totalAmount;
    const det = d.details?.find(det => det.investorId === investor.id);
    return s + (det?.amount || 0);
  }, 0);

  const totalReturn = investor.totalPaid > 0 ? (totalReceived / investor.totalPaid) * 100 : 0;

  const investmentShares = investments.filter(i => i.status === 'active').map(inv => ({
    ...inv,
    myShare: inv.entryAmount * (investor.ownershipPercentage / 100),
    myProfit: ((inv as any).receivedProfits || 0) * (investor.ownershipPercentage / 100),
  }));

  const totalMyShare = investmentShares.reduce((s, i) => s + i.myShare, 0);

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
    const a = document.createElement('a');
    a.href = url;
    a.download = `كشف-${investor.name}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">مرحباً، {investor.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">بوابة المستثمر الخاصة بك</p>
        </div>
        <button onClick={handleExportCSV} className="btn-secondary">
          <Download size={16} />تصدير
        </button>
      </div>

      {/* البطاقة الرئيسية */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #0f1729)', borderRadius: 20, padding: '1.5rem', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem', opacity: 0.7 }}>
          <User size={15} />
          <span style={{ fontSize: '0.8rem' }}>المستثمر رقم {investor.investorNumber}</span>
          <span style={{ marginRight: 8, background: investor.status === 'active' ? 'rgba(16,185,129,.2)' : 'rgba(148,163,184,.2)', color: investor.status === 'active' ? '#6ee7b7' : '#94a3b8', fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20 }}>
            {investor.status === 'active' ? 'نشط' : 'غير نشط'}
          </span>
        </div>
        <p style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '0.25rem' }}>{formatCurrency(investor.totalPaid)}</p>
        <p style={{ fontSize: '0.78rem', opacity: 0.6, marginBottom: '1.25rem' }}>إجمالي رأس المال المدفوع</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: '1rem' }}>
          {[
            { label: 'نسبة الملكية', value: formatPercent(investor.ownershipPercentage) },
            { label: 'عدد الحصص', value: formatNumber(investor.shareCount, 0) },
            { label: 'تاريخ الانضمام', value: formatDate(investor.joinDate) },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.65rem', opacity: 0.6, marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontWeight: 700, fontSize: '1rem' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'التوزيعات المستلمة', value: formatCurrency(totalReceived), icon: <DollarSign size={16} />, color: '#059669', bg: '#f0fdf4' },
          { label: 'العائد الإجمالي', value: formatPercent(totalReturn), icon: <TrendingUp size={16} />, color: '#2563eb', bg: '#eff6ff' },
          { label: 'نصيبك من الاستثمارات', value: formatCurrency(totalMyShare), icon: <Layers size={16} />, color: '#7c3aed', bg: '#f3e8ff' },
          { label: 'عدد التوزيعات', value: String(distributions.length), icon: <BarChart3 size={16} />, color: '#d97706', bg: '#fffbeb' },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <div style={{ width: 32, height: 32, borderRadius: 10, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: card.color }}>
              {card.icon}
            </div>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: card.color }}>{card.value}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* نصيبك من الاستثمارات */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 className="section-title">نصيبك من الاستثمارات القائمة</h3>
        {investmentShares.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            لا توجد استثمارات قائمة حالياً
          </div>
        ) : (
          <div className="space-y-2">
            {investmentShares.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#f8fafc', borderRadius: 12 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.name}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{inv.entity}</p>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.875rem' }}>{formatCurrency(inv.myShare)}</p>
                  {inv.myProfit > 0 && <p style={{ fontSize: '0.7rem', color: '#059669' }}>+{formatCurrency(inv.myProfit)} أرباح</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* سجل التوزيعات */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 className="section-title">سجل التوزيعات المستلمة</h3>
        {distributions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            لا توجد توزيعات بعد
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 280, overflowY: 'auto' }}>
            {distributions.map(dist => {
              const myAmount = dist.investorId === investor.id
                ? dist.totalAmount
                : dist.details?.find(det => det.investorId === investor.id)?.amount || 0;
              return (
                <div key={dist.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>{formatDate(dist.date)}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{dist.notes || 'توزيع أرباح'}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.875rem' }}>{formatCurrency(myAmount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* سجل التغييرات */}
      {history.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="section-title">سجل التغييرات على حسابك</h3>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {history.map(h => (
              <div key={h.id} style={{ background: '#f8fafc', borderRadius: 12, padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{formatDate(h.date)}</span>
                  <span className="badge-blue" style={{ fontSize: '0.65rem' }}>{h.type}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span>حصص: {formatNumber(h.sharesBefore, 0)} ← {formatNumber(h.sharesAfter, 0)}</span>
                  <span>ملكية: {formatPercent(h.ownershipBefore)} ← {formatPercent(h.ownershipAfter)}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block table-container">
            <table className="table">
              <thead>
                <tr><th>التاريخ</th><th>نوع العملية</th><th>حصص قبل</th><th>حصص بعد</th><th>ملكية قبل</th><th>ملكية بعد</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td className="text-slate-600 text-sm">{formatDate(h.date)}</td>
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
