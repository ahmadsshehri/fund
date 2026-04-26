'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  calcPortfolioSnapshot,
  type PortfolioSnapshot,
} from '@/lib/accounting';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import {
  Wallet, TrendingUp, Users, RefreshCw,
  BarChart3, ArrowDownRight, ChevronLeft,
  Award, PieChart, Zap, Target, Shield,
} from 'lucide-react';
import Link from 'next/link';

interface SimpleInvestment {
  id: string;
  name: string;
  entryAmount: number;
  currentValue: number;
  totalProfit: number;
  trueReturn: number;
  status: string;
  invType: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState('');
  const [investorCount, setInvestorCount] = useState(0);
  const [investmentsList, setInvestmentsList] = useState<SimpleInvestment[]>([]);
  const [ownerCapital, setOwnerCapital] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [snap, invSnap, investmentsSnap] = await Promise.all([
        calcPortfolioSnapshot(),
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
      ]);
      setSnapshot(snap);
      setInvestorCount(invSnap.size);
      setOwnerCapital(invSnap.docs.reduce((s, d) => s + (d.data().totalPaid || 0), 0));

      const investments: SimpleInvestment[] = investmentsSnap.docs.map(doc => {
        const inv = doc.data();
        const entry = inv.entryAmount || 0;
        const current = inv.currentValue || entry;
        const totalProfit = inv.totalProfit || 0;
        const trueReturn = entry > 0 ? (totalProfit / entry) * 100 : 0;
        return {
          id: doc.id,
          name: inv.name || 'بدون اسم',
          entryAmount: entry,
          currentValue: current,
          totalProfit,
          trueReturn,
          status: inv.status || 'active',
          invType: inv.invType || 'accumulative',
        };
      });
      setInvestmentsList(investments);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري تحميل المؤشرات...</p>
        </div>
      </div>
    );
  }

  const s = snapshot;
  if (!s) return null;

  const isInvestor = user?.role === 'investor';

  // تحليل الاستثمارات
  const activeInvestments = investmentsList.filter(i => i.status === 'active');
  const sortedByReturn = [...activeInvestments].sort((a, b) => b.trueReturn - a.trueReturn);
  const bestThree = sortedByReturn.slice(0, 3);
  const worstThree = sortedByReturn.slice(-3).reverse();

  const cashPercent = s.netPortfolioValue > 0 ? (s.availableCash / s.netPortfolioValue) * 100 : 0;
  const unrealizedPercent = s.netPortfolioValue > 0 ? (s.unrealizedProfit / s.netPortfolioValue) * 100 : 0;
  const avgAnnualReturn = s.netOwnerCapital > 0 ? (s.realizedProfit / s.netOwnerCapital) * 100 : 0;

  const recommendations: string[] = [];
  if (!isInvestor) {
    if (cashPercent > 30) recommendations.push('🔹 نسبة النقد مرتفعة (أكثر من 30%)، يُوصى بتوزيع جزء في استثمارات جديدة.');
    if (cashPercent < 10) recommendations.push('🔹 نسبة النقد منخفضة جداً، احتفظ بصندوق طوارئ.');
    if (s.unrealizedProfit > s.realizedProfit && s.unrealizedProfit > 100000)
      recommendations.push('📈 الأرباح غير المحققة كبيرة، قد يكون وقتاً مناسباً لتصفية جزء من الاستثمارات ذات العائد المرتفع.');
    if (s.realizedProfit < 0) recommendations.push('📉 المحفظة تحقق خسائر محققة، يُوصى بإعادة تقييم استراتيجية التخارج.');
    if (bestThree.length > 0 && bestThree[0].trueReturn > 50)
      recommendations.push(`⭐ الاستثمار "${bestThree[0].name}" حقق عائداً ممتازاً (${bestThree[0].trueReturn.toFixed(1)}%)، قد يكون وقت البيع الجزئي.`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .recommendation-item {
          background: #fefce8;
          border-right: 4px solid #eab308;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
        }
        .stat-card-highlight {
          background: linear-gradient(145deg, #ffffff, #f8fafc);
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          transition: all 0.2s;
          border-radius: 16px;
          border: 1px solid var(--border);
          padding: 1.25rem;
        }
        .stat-card-highlight:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isInvestor ? `مرحباً، ${user?.name}` : 'لوحة التحكم'}
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {!isInvestor && (
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* ── للمدير: بطاقة النقد الرئيسية ── */}
      {!isInvestor && (
        <div
          style={{
            borderRadius: '20px',
            padding: '1.25rem',
            background: s.availableCash >= 0
              ? 'linear-gradient(135deg,#059669,#10b981)'
              : 'linear-gradient(135deg,#dc2626,#ef4444)',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem', opacity: 0.8 }}>
            <Wallet size={16} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>النقد المتوفر</span>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1, marginBottom: '1rem' }}>
            {formatCurrency(s.availableCash)}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: '0.875rem' }}>
            <div><p style={{ fontSize: '0.65rem', opacity: 0.7 }}>رأس المال</p><p style={{ fontWeight: 700 }}>{formatCurrency(s.ownerCapitalIn)}</p></div>
            <div><p style={{ fontSize: '0.65rem', opacity: 0.7 }}>صافي قيمة المحفظة</p><p style={{ fontWeight: 700 }}>{formatCurrency(s.netPortfolioValue)}</p></div>
            <div><p style={{ fontSize: '0.65rem', opacity: 0.7 }}>المستثمرون</p><p style={{ fontWeight: 700 }}>{investorCount}</p></div>
          </div>
        </div>
      )}

      {/* ── للمستثمر: بطاقة مبسطة ── */}
      {isInvestor && (
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #0f1729)', borderRadius: 20, padding: '1.25rem', color: '#fff' }}>
          <p style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: 8 }}>صافي قيمة المحفظة</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 900 }}>{formatCurrency(s.netPortfolioValue)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,.15)', paddingTop: '0.875rem', marginTop: '0.875rem' }}>
            <div><p style={{ fontSize: '0.65rem', opacity: 0.6 }}>أرباح محققة</p><p style={{ fontWeight: 700, color: '#6ee7b7' }}>{formatCurrency(s.realizedProfit)}</p></div>
            <div><p style={{ fontSize: '0.65rem', opacity: 0.6 }}>استثمارات قائمة</p><p style={{ fontWeight: 700 }}>{s.activeCount}</p></div>
          </div>
        </div>
      )}

      {/* ── مؤشرات الأداء — للمدير فقط ── */}
      {!isInvestor && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.875rem' }}>
          <div className="stat-card-highlight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={16} style={{ color: '#0284c7' }} />
              </div>
              <span className="badge-gray">عائد المحفظة</span>
            </div>
            <p className="text-xl font-bold" style={{ color: s.realizedProfit >= 0 ? '#059669' : '#dc2626' }}>
              {s.netOwnerCapital > 0 ? ((s.realizedProfit / s.netOwnerCapital) * 100).toFixed(1) : 0}%
            </p>
            <p className="text-sm text-slate-500">العائد على رأس المال</p>
          </div>

          <div className="stat-card-highlight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} style={{ color: '#ca8a04' }} />
              </div>
              <span className="badge-gray">العائد السنوي</span>
            </div>
            <p className="text-xl font-bold">{avgAnnualReturn.toFixed(1)}%</p>
            <p className="text-sm text-slate-500">متوسط سنوي (تقريبي)</p>
          </div>

          <div className="stat-card-highlight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PieChart size={16} style={{ color: '#059669' }} />
              </div>
              <span className="badge-gray">توزيع الأصول</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <div className="flex justify-between text-sm"><span>نقد</span><span>{cashPercent.toFixed(1)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${Math.min(cashPercent, 100)}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-2"><span>استثمارات قائمة</span><span>{(100 - cashPercent).toFixed(1)}%</span></div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(100 - cashPercent, 100)}%` }} />
              </div>
            </div>
          </div>

          <div className="stat-card-highlight">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={16} style={{ color: '#475569' }} />
              </div>
              <span className="badge-gray">أرباح غير محققة</span>
            </div>
            <p className="text-xl font-bold">{unrealizedPercent.toFixed(1)}%</p>
            <p className="text-sm text-slate-500">من صافي قيمة المحفظة</p>
          </div>
        </div>
      )}

      {/* ── أفضل وأسوأ الاستثمارات — للمدير فقط ── */}
      {!isInvestor && (
        <div className="card" style={{ padding: '1.2rem' }}>
          <h3 className="section-title" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} /> أفضل وأسوأ 3 استثمارات (قائمة)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold text-green-700 mb-2">🏆 أفضل العوائد</p>
              {bestThree.length === 0 && <p className="text-sm text-slate-400">لا توجد استثمارات قائمة</p>}
              {bestThree.map(inv => (
                <div key={inv.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <div>
                    <span className="font-medium text-sm">{inv.name}</span>
                    <span className="text-xs text-slate-400 mr-1">({inv.invType === 'dividend' ? 'يوزع' : 'تراكمي'})</span>
                  </div>
                  <span className="text-green-600 font-bold text-sm">{inv.trueReturn.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold text-red-700 mb-2">📉 أقل العوائد</p>
              {worstThree.length === 0 && <p className="text-sm text-slate-400">لا توجد استثمارات قائمة</p>}
              {worstThree.map(inv => (
                <div key={inv.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                  <div>
                    <span className="font-medium text-sm">{inv.name}</span>
                    <span className="text-xs text-slate-400 mr-1">({inv.invType === 'dividend' ? 'يوزع' : 'تراكمي'})</span>
                  </div>
                  <span className={`font-bold text-sm ${inv.trueReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {inv.trueReturn.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── توصيات ذكية — للمدير فقط ── */}
      {!isInvestor && recommendations.length > 0 && (
        <div className="card" style={{ background: '#fefce8', border: '1px solid #fde047' }}>
          <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#854d0e' }}>
            <TrendingUp size={18} /> توصيات ذكية
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {recommendations.map((rec, idx) => (
              <div key={idx} className="recommendation-item">
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── مؤشرات أساسية — للمدير فقط ── */}
      {!isInvestor && (
        <div className="card" style={{ padding: '1.2rem' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-slate-500 text-sm">إجمالي الأرباح المحققة</p>
              <p className="text-lg font-bold">{formatCurrency(s.realizedProfit)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">إجمالي التوزيعات النقدية</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(s.dividendsReceived)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">إجمالي المصاريف</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(s.totalExpenses)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">عدد الاستثمارات النشطة</p>
              <p className="text-lg font-bold">{s.activeCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── روابط سريعة — للمدير والإداري فقط ── */}
      {!isInvestor && (
        <div className="card" style={{ padding: '1.2rem' }}>
          <h3 className="section-title">الأقسام الرئيسية</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
            <Link href="/investments" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
              <div className="flex items-center gap-2"><TrendingUp size={18} /><span>الاستثمارات</span></div>
              <ChevronLeft size={16} />
            </Link>
            <Link href="/investors" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
              <div className="flex items-center gap-2"><Users size={18} /><span>المستثمرون</span></div>
              <ChevronLeft size={16} />
            </Link>
            <Link href="/expenses" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
              <div className="flex items-center gap-2"><ArrowDownRight size={18} /><span>المصاريف</span></div>
              <ChevronLeft size={16} />
            </Link>
            <Link href="/reports" className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition">
              <div className="flex items-center gap-2"><BarChart3 size={18} /><span>التقارير</span></div>
              <ChevronLeft size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* ── للمستثمر: رابط لبوابته ── */}
      {isInvestor && (
        <Link href="/investor-portal" className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition">
          <div className="flex items-center gap-2">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#fff" />
            </div>
            <div>
              <p className="font-bold text-blue-800">بوابة المستثمر</p>
              <p className="text-xs text-blue-600">اعرض محفظتك وتوزيعاتك</p>
            </div>
          </div>
          <ChevronLeft size={18} className="text-blue-600" />
        </Link>
      )}
    </div>
  );
}
