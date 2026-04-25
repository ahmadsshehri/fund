'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  calcPortfolioSnapshot,
  migrateMissingData,
  type PortfolioSnapshot,
} from '@/lib/accounting';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import {
  Wallet, TrendingUp, Users, Activity, CheckCircle, XCircle,
  DollarSign, ArrowUpRight, RefreshCw, AlertTriangle,
  BarChart3, ArrowDownRight, ChevronLeft, AlertCircle, Database,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState('');
  const [investorCount, setInvestorCount] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [snap, invSnap] = await Promise.all([
        calcPortfolioSnapshot(),
        getDocs(collection(db, 'investors')),
      ]);
      setSnapshot(snap);
      setInvestorCount(invSnap.size);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFixMissingData = async () => {
    if (!user) {
      alert('الرجاء تسجيل الدخول أولاً');
      return;
    }
    if (!confirm('سيتم إضافة جميع حركات الاستثمارات والمصاريف الناقصة إلى ledger. هل تريد المتابعة؟')) return;
    setMigrating(true);
    try {
      const result = await migrateMissingData(user.id);
      alert(`✅ تمت الإضافة بنجاح!\nتم إنشاء ${result.created} حركة.\n${result.errors.length > 0 ? 'أخطاء: ' + result.errors.join(', ') : 'لا توجد أخطاء.'}`);
      await load();
    } catch (err) {
      alert('خطأ أثناء الإضافة: ' + err);
    } finally {
      setMigrating(false);
    }
  };

  const handleCheckLedger = async () => {
    try {
      const ledgerQuery = query(collection(db, 'ledger'), orderBy('date', 'asc'));
      const snap = await getDocs(ledgerQuery);
      let total = 0;
      const details: string[] = [];
      snap.docs.forEach(doc => {
        const data = doc.data();
        const cash = data.cashEffect || 0;
        total += cash;
        const date = data.date?.toDate?.()?.toISOString().slice(0,10) || 'بدون تاريخ';
        details.push(`${date} | ${data.type || '?'} | ${cash} | المجموع التراكمي: ${total.toFixed(2)}`);
      });
      alert(`إجمالي النقد من ledger: ${total.toFixed(2)}\n\nالتفاصيل:\n${details.join('\n')}`);
    } catch (err) {
      alert('خطأ في قراءة ledger: ' + err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري حساب المؤشرات...</p>
        </div>
      </div>
    );
  }

  const s = snapshot;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handleFixMissingData} className="btn-primary" style={{ padding: '0.5rem 0.75rem' }} disabled={migrating}>
            {migrating ? 'جاري...' : 'ترحيل البيانات الناقصة'}
          </button>
          <button onClick={handleCheckLedger} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
            فحص Ledger
          </button>
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }} disabled={loading}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-danger">
          <AlertCircle size={16} />
          <span style={{ fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      {s && (
        <>
          {/* النقد */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div
              style={{
                borderRadius: '20px',
                padding: '1.25rem',
                background: s.availableCash >= 0 ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
                color: '#fff',
                gridColumn: 'span 2',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem', opacity: 0.8 }}>
                <Wallet size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>النقد المتوفر</span>
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1, marginBottom: '1rem' }}>{formatCurrency(s.availableCash)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: '0.875rem' }}>
                {[
                  ['رأس مال الملاك', formatCurrency(s.ownerCapitalIn)],
                  ['صافي قيمة المحفظة', formatCurrency(s.netPortfolioValue)],
                  ['المستثمرون', String(investorCount)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '2px' }}>{k}</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* بطاقات سريعة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.875rem' }}>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={18} style={{ color: '#2563eb' }} />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>رأس المال</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--navy)' }}>{formatCurrency(s.ownerCapitalIn)}</p>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChart3 size={18} style={{ color: '#7c3aed' }} />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>NAV</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--navy)' }}>{formatCurrency(s.netPortfolioValue)}</p>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={18} style={{ color: '#059669' }} />
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 8px', borderRadius: '8px' }}>{s.activeCount} استثمار</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--navy)' }}>{formatCurrency(s.activeCurrentValue)}</p>
              <div style={{ marginTop: '6px', display: 'flex', gap: '8px', fontSize: '0.68rem' }}>
                <span style={{ color: '#64748b' }}>تكلفة: {formatCurrency(s.activeTotalCost)}</span>
              </div>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: s.unrealizedProfit >= 0 ? '#f0fdf4' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} style={{ color: s.unrealizedProfit >= 0 ? '#059669' : '#dc2626' }} />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>غير محقق</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: s.unrealizedProfit >= 0 ? '#059669' : '#dc2626' }}>
                {s.unrealizedProfit >= 0 ? '+' : ''}{formatCurrency(s.unrealizedProfit)}
              </p>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={18} style={{ color: '#d97706' }} />
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: '8px' }}>{s.closedCount} مغلقة</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: s.realizedProfit >= 0 ? '#059669' : '#dc2626' }}>
                {s.realizedProfit >= 0 ? '+' : ''}{formatCurrency(s.realizedProfit)}
              </p>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowUpRight size={18} style={{ color: '#c2410c' }} />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--muted)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>توزيعات</span>
              </div>
              <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#c2410c' }}>{formatCurrency(s.dividendsReceived)}</p>
            </div>

            <div className="stat-card" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowDownRight size={18} style={{ color: '#dc2626' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(s.totalExpenses)}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>المصروفات المعتمدة</p>
                  </div>
                </div>
                {s.distressedCount > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '6px 12px' }}>
                    <XCircle size={14} style={{ color: '#dc2626' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{s.distressedCount} متعثرة</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* روابط سريعة */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 className="section-title">الأقسام</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
              {[
                { href: '/investments', label: 'الاستثمارات', sub: `${s.activeCount} قائمة`, icon: <TrendingUp size={18} />, color: 'var(--navy)', bg: '#eff6ff' },
                { href: '/investors', label: 'المستثمرون', sub: `${investorCount} مستثمر`, icon: <Users size={18} />, color: '#7c3aed', bg: '#f5f3ff' },
                { href: '/expenses', label: 'المصاريف', sub: formatCurrency(s.totalExpenses), icon: <ArrowDownRight size={18} />, color: '#dc2626', bg: '#fef2f2' },
                { href: '/reports', label: 'التقارير', sub: 'تدفقات نقدية وأداء', icon: <BarChart3 size={18} />, color: '#0891b2', bg: '#ecfeff' },
              ].map((link) => (
                <Link key={link.href} href={link.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem', borderRadius: '14px', background: link.bg, textDecoration: 'none', color: link.color }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {link.icon}
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2 }}>{link.label}</p>
                      <p style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '2px' }}>{link.sub}</p>
                    </div>
                  </div>
                  <ChevronLeft size={15} style={{ opacity: 0.5 }} />
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
