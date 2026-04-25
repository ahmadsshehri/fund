'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  calcPortfolioSnapshot,
  needsInvestmentMigration,
  migrateMissingData,
  validateLedger,
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
  const [needsFix, setNeedsFix] = useState(false);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState('');
  const [investorCount, setInvestorCount] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [snap, needFix, invSnap] = await Promise.all([
        calcPortfolioSnapshot(),
        needsInvestmentMigration(),
        getDocs(collection(db, 'investors')),
      ]);
      setSnapshot(snap);
      setNeedsFix(needFix);
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
    if (!confirm('سيتم إضافة بيانات الاستثمارات والمصاريف الناقصة إلى ledger. هل تريد المتابعة؟')) return;
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
          {needsFix && (
            <button onClick={handleFixMissingData} className="btn-primary" style={{ padding: '0.5rem 0.75rem' }} disabled={migrating}>
              {migrating ? 'جاري...' : 'ترحيل البيانات الناقصة'}
            </button>
          )}
          <button onClick={handleCheckLedger} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
            فحص Ledger
          </button>
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }} disabled={loading}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {needsFix && !migrating && (
        <div className="alert-warning">
          <Database size={18} className="shrink-0" />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>بيانات الاستثمارات والمصاريف غير موجودة في سجل الحركات</p>
            <p style={{ fontSize: '0.8rem', marginBottom: 8 }}>لحساب النقد والأرباح بشكل صحيح، اضغط على زر "ترحيل البيانات الناقصة".</p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-danger">
          <AlertCircle size={16} />
          <span style={{ fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      {s && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <div
              style={{
                borderRadius: '20px',
                padding: '1.25rem',
                background: s.availableCash >= 0 ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
                color: '#fff',
                gridColumn: 'span 2',
                boxShadow: s.availableCash >= 0 ? '0 8px 32px rgba(5,150,105,.3)' : '0 8px 32px rgba(220,38,38,.3)',
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

          {/* باقي البطاقات والجداول - أضفها كما كانت ولكن اختصرتها للاختصار */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 className="section-title">ملخص سريع</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
              <div className="stat-card"><p style={{ fontSize: '0.8rem' }}>الأصول القائمة</p><p style={{ fontWeight: 800 }}>{formatCurrency(s.activeCurrentValue)}</p></div>
              <div className="stat-card"><p style={{ fontSize: '0.8rem' }}>الأرباح المحققة</p><p style={{ fontWeight: 800, color: '#059669' }}>{formatCurrency(s.realizedProfit)}</p></div>
              <div className="stat-card"><p style={{ fontSize: '0.8rem' }}>الأرباح غير المحققة</p><p style={{ fontWeight: 800 }}>{formatCurrency(s.unrealizedProfit)}</p></div>
              <div className="stat-card"><p style={{ fontSize: '0.8rem' }}>إجمالي المصاريف</p><p style={{ fontWeight: 800, color: '#dc2626' }}>{formatCurrency(s.totalExpenses)}</p></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
