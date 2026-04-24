'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calcPortfolioSnapshot, needsMigration, migrateToLedger, type PortfolioSnapshot } from '@/lib/accounting';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  Wallet, TrendingUp, Users, Activity, CheckCircle, XCircle,
  DollarSign, ArrowUpRight, RefreshCw, AlertTriangle, Info,
  BarChart3, ArrowDownRight, ChevronLeft, AlertCircle, Database,
} from 'lucide-react';
import Link from 'next/link';

const pct = (n: number) => `${(n || 0).toFixed(2)}%`;

export default function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading]           = useState(true);
  const [migrating, setMigrating]       = useState(false);
  const [needsMig, setNeedsMig]         = useState(false);
  const [snapshot, setSnapshot]         = useState<PortfolioSnapshot | null>(null);
  const [error, setError]               = useState('');
  const [investorCount, setInvestorCount] = useState(0);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [snap, mig, invSnap] = await Promise.all([
        calcPortfolioSnapshot(),
        needsMigration(),
        getDocs(collection(db, 'investors')),
      ]);
      setSnapshot(snap);
      setNeedsMig(mig);
      setInvestorCount(invSnap.size);
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const handleMigrate = async () => {
    if (!user) return;
    if (!confirm('سيتم تحويل البيانات الموجودة إلى سجل الحركات المحاسبي. هل تريد المتابعة؟')) return;
    setMigrating(true);
    try {
      const result = await migrateToLedger(user.id);
      alert(`تم بنجاح ✅\nسجلات مُنشأة: ${result.created}\n${result.errors.length > 0 ? 'أخطاء: ' + result.errors.join(', ') : ''}`);
      setNeedsMig(false);
      await load();
    } catch(e) { alert('خطأ: ' + e); }
    finally { setMigrating(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40,height:40,border:'3px solid #e2e8f0',borderTopColor:'var(--navy)',borderRadius:'50%',margin:'0 auto 12px',animation:'spin 0.7s linear infinite' }} />
        <p style={{ color:'var(--muted)',fontSize:'0.85rem' }}>جاري حساب المؤشرات...</p>
      </div>
    </div>
  );

  const s = snapshot;

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:'1.25rem' }}>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <button onClick={load} className="btn-secondary" style={{padding:'0.5rem 0.75rem'}} disabled={loading}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Migration notice */}
      {needsMig && (
        <div className="alert-warning">
          <Database size={18} className="shrink-0" />
          <div style={{ flex:1 }}>
            <p style={{ fontWeight:700, marginBottom:4 }}>يلزم تحويل البيانات إلى سجل الحركات المحاسبي</p>
            <p style={{ fontSize:'0.8rem', marginBottom:8 }}>الأرقام الحالية تأتي مباشرة من حقول البيانات. لضمان دقة محاسبية كاملة، حوّل البيانات مرة واحدة.</p>
            <button onClick={handleMigrate} disabled={migrating} className="btn-primary" style={{ fontSize:'0.8rem', padding:'0.4rem 0.875rem' }}>
              {migrating ? 'جاري التحويل...' : 'تحويل البيانات الآن'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-danger"><AlertCircle size={16}/><span style={{fontSize:'0.85rem'}}>{error}</span></div>
      )}

      {s && (<>

        {/* ── CASH & NAV HERO ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem' }}>
          {/* الكاش */}
          <div style={{
            borderRadius:'20px', padding:'1.25rem',
            background: s.availableCash>=0 ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
            color:'#fff', gridColumn: 'span 2',
            boxShadow: s.availableCash>=0 ? '0 8px 32px rgba(5,150,105,.3)' : '0 8px 32px rgba(220,38,38,.3)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'0.5rem', opacity:.8 }}>
              <Wallet size={16} />
              <span style={{ fontSize:'0.75rem', fontWeight:600 }}>النقد المتوفر</span>
              {!needsMig && <span style={{ fontSize:'0.65rem', background:'rgba(255,255,255,.2)', padding:'2px 8px', borderRadius:'8px', marginRight:'auto' }}>من سجل الحركات ✓</span>}
            </div>
            <p style={{ fontSize:'2rem',fontWeight:900,lineHeight:1,marginBottom:'1rem' }}>{formatCurrency(s.availableCash)}</p>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.75rem', borderTop:'1px solid rgba(255,255,255,.2)', paddingTop:'0.875rem' }}>
              {[
                ['رأس مال الملاك', formatCurrency(s.ownerCapitalIn)],
                ['صافي قيمة المحفظة', formatCurrency(s.netPortfolioValue)],
                ['المستثمرون', String(investorCount)],
              ].map(([k,v])=>(
                <div key={k}>
                  <p style={{ fontSize:'0.65rem',opacity:.7,marginBottom:'2px' }}>{k}</p>
                  <p style={{ fontSize:'0.875rem',fontWeight:700 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FINANCIAL CARDS ── */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.875rem' }}>

          {/* رأس المال */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background:'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <DollarSign size={18} style={{ color:'#2563eb' }} />
              </div>
              <span style={{ fontSize:'0.65rem',color:'var(--muted)',background:'#f1f5f9',padding:'2px 8px',borderRadius:'8px' }}>رأس المال</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color:'var(--navy)',lineHeight:1.1 }}>{formatCurrency(s.ownerCapitalIn)}</p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>رأس مال الملاك الداخل فقط</p>
            {s.ownerCapitalOut > 0 && (
              <p style={{ fontSize:'0.68rem',color:'#dc2626',marginTop:'2px' }}>سحوبات: {formatCurrency(s.ownerCapitalOut)}</p>
            )}
          </div>

          {/* صافي قيمة المحفظة */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background:'#f5f3ff',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <BarChart3 size={18} style={{ color:'#7c3aed' }} />
              </div>
              <span style={{ fontSize:'0.65rem',color:'var(--muted)',background:'#f1f5f9',padding:'2px 8px',borderRadius:'8px' }}>NAV</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color:'var(--navy)' }}>{formatCurrency(s.netPortfolioValue)}</p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>نقد + قيمة الاستثمارات القائمة</p>
          </div>

          {/* الاستثمارات القائمة */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background:'#f0fdf4',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <Activity size={18} style={{ color:'#059669' }} />
              </div>
              <span style={{ fontSize:'0.65rem',fontWeight:700,color:'#059669',background:'#dcfce7',padding:'2px 8px',borderRadius:'8px' }}>{s.activeCount} استثمار</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color:'var(--navy)' }}>{formatCurrency(s.activeCurrentValue)}</p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>القيمة الحالية — القائمة فقط</p>
            <div style={{ marginTop:'6px', display:'flex', gap:'8px', fontSize:'0.68rem' }}>
              <span style={{ color:'#64748b' }}>تكلفة: {formatCurrency(s.activeTotalCost)}</span>
            </div>
          </div>

          {/* الأرباح غير المحققة */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background: s.unrealizedProfit>=0?'#f0fdf4':'#fef2f2',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <TrendingUp size={18} style={{ color: s.unrealizedProfit>=0?'#059669':'#dc2626' }} />
              </div>
              <span style={{ fontSize:'0.65rem',color:'var(--muted)',background:'#f1f5f9',padding:'2px 8px',borderRadius:'8px' }}>غير محقق</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color: s.unrealizedProfit>=0?'#059669':'#dc2626' }}>
              {s.unrealizedProfit>=0?'+':''}{formatCurrency(s.unrealizedProfit)}
            </p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>قيمة حالية − قيمة دفترية (قائمة)</p>
          </div>

          {/* الأرباح المحققة */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background:'#fffbeb',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <CheckCircle size={18} style={{ color:'#d97706' }} />
              </div>
              <span style={{ fontSize:'0.65rem',fontWeight:700,color:'#92400e',background:'#fef3c7',padding:'2px 8px',borderRadius:'8px' }}>{s.closedCount} مغلقة</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color: s.realizedProfit>=0?'#059669':'#dc2626' }}>
              {s.realizedProfit>=0?'+':''}{formatCurrency(s.realizedProfit)}
            </p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>أرباح محققة من التخارجات</p>
          </div>

          {/* التوزيعات المستلمة */}
          <div className="stat-card">
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ width:38,height:38,borderRadius:12,background:'#fff7ed',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <ArrowUpRight size={18} style={{ color:'#c2410c' }} />
              </div>
              <span style={{ fontSize:'0.65rem',color:'var(--muted)',background:'#f1f5f9',padding:'2px 8px',borderRadius:'8px' }}>توزيعات</span>
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color:'#c2410c' }}>{formatCurrency(s.dividendsReceived)}</p>
            <p style={{ fontSize:'0.7rem',color:'var(--muted)',marginTop:'3px' }}>أرباح نقدية مستلمة (تدفق داخل)</p>
          </div>

          {/* المصروفات */}
          <div className="stat-card" style={{ gridColumn:'span 2' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem' }}>
              <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
                <div style={{ width:38,height:38,borderRadius:12,background:'#fef2f2',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <ArrowDownRight size={18} style={{ color:'#dc2626' }} />
                </div>
                <div>
                  <p style={{ fontSize:'1.125rem',fontWeight:800,color:'#dc2626' }}>{formatCurrency(s.totalExpenses)}</p>
                  <p style={{ fontSize:'0.7rem',color:'var(--muted)' }}>المصروفات المعتمدة</p>
                </div>
              </div>
              {s.distressedCount > 0 && (
                <div style={{ display:'flex',alignItems:'center',gap:'6px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'6px 12px' }}>
                  <XCircle size={14} style={{ color:'#dc2626' }} />
                  <span style={{ fontSize:'0.75rem',fontWeight:700,color:'#dc2626' }}>{s.distressedCount} متعثرة</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CASH BREAKDOWN ── */}
        <div className="card" style={{ padding:'1.25rem' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem' }}>
            <h3 className="section-title" style={{ marginBottom:0 }}>تفصيل الكاش — تدفقات نقدية</h3>
            <Link href="/reports" style={{ fontSize:'0.75rem',color:'var(--navy)',textDecoration:'none',display:'flex',alignItems:'center',gap:4 }}>
              تفاصيل <ChevronLeft size={14}/>
            </Link>
          </div>

          <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
            {/* داخل */}
            <div style={{ padding:'0.5rem 0', borderBottom:'1px solid #f1f5f9' }}>
              <p style={{ fontSize:'0.7rem',fontWeight:700,color:'var(--muted)',marginBottom:'0.5rem',letterSpacing:'0.05em' }}>تدفقات داخلة ↓</p>
              {[
                { label:'رأس مال الملاك الداخل', value:s.ownerCapitalIn, positive:true },
                { label:'متحصلات التخارجات', value:s.realizedProfit > 0 ? s.activeTotalCost + s.realizedProfit - (s.unrealizedProfit > 0 ? s.unrealizedProfit : 0) : s.activeTotalCost, positive:true, note:'مبالغ الإغلاق المستلمة' },
                { label:'توزيعات وأرباح مستلمة', value:s.dividendsReceived, positive:true },
              ].map(row=>(
                <div key={row.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.375rem 0' }}>
                  <div>
                    <span style={{ fontSize:'0.8rem',color:'#475569' }}>{row.label}</span>
                    {row.note && <span style={{ fontSize:'0.65rem',color:'#94a3b8',marginRight:'6px' }}>({row.note})</span>}
                  </div>
                  <span style={{ fontSize:'0.85rem',fontWeight:600,color:'#059669' }}>+{formatCurrency(row.value)}</span>
                </div>
              ))}
            </div>
            {/* خارج */}
            <div style={{ padding:'0.5rem 0', borderBottom:'2px solid #e2e8f0' }}>
              <p style={{ fontSize:'0.7rem',fontWeight:700,color:'var(--muted)',marginBottom:'0.5rem',letterSpacing:'0.05em' }}>تدفقات خارجة ↑</p>
              {[
                { label:'تمويل الاستثمارات القائمة', value:s.activeTotalCost },
                { label:'المصروفات المعتمدة', value:s.totalExpenses },
                { label:'سحوبات الملاك', value:s.ownerCapitalOut },
              ].map(row=>(
                <div key={row.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.375rem 0' }}>
                  <span style={{ fontSize:'0.8rem',color:'#475569' }}>{row.label}</span>
                  <span style={{ fontSize:'0.85rem',fontWeight:600,color:'#dc2626' }}>-{formatCurrency(row.value)}</span>
                </div>
              ))}
            </div>
            {/* الرصيد */}
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.875rem 0 0' }}>
              <div>
                <span style={{ fontWeight:800,color:'var(--navy)',fontSize:'0.95rem' }}>النقد المتوفر</span>
                <span style={{ fontSize:'0.68rem',color:'var(--muted)',marginRight:'8px' }}>= نقد + لا يشمل الاستثمارات القائمة</span>
              </div>
              <span style={{ fontWeight:900,fontSize:'1.1rem',color:s.availableCash>=0?'#059669':'#dc2626' }}>
                {formatCurrency(s.availableCash)}
              </span>
            </div>
          </div>
        </div>

        {/* ── QUICK LINKS ── */}
        <div className="card" style={{ padding:'1.25rem' }}>
          <h3 className="section-title">الأقسام</h3>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.75rem' }}>
            {[
              { href:'/investments', label:'الاستثمارات', sub:`${s.activeCount} قائمة`, icon:<TrendingUp size={18}/>, color:'var(--navy)', bg:'#eff6ff' },
              { href:'/investors',   label:'المستثمرون',  sub:`${investorCount} مستثمر`, icon:<Users size={18}/>,  color:'#7c3aed', bg:'#f5f3ff' },
              { href:'/expenses',    label:'المصاريف',    sub:formatCurrency(s.totalExpenses), icon:<ArrowDownRight size={18}/>, color:'#dc2626', bg:'#fef2f2' },
              { href:'/reports',     label:'التقارير',    sub:'تدفقات نقدية وأداء', icon:<BarChart3 size={18}/>, color:'#0891b2', bg:'#ecfeff' },
            ].map(link=>(
              <Link key={link.href} href={link.href} style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'0.875rem',borderRadius:'14px',
                background:link.bg,border:'1.5px solid transparent',
                textDecoration:'none',color:link.color,
                transition:'all 0.15s',
              }}>
                <div style={{ display:'flex',alignItems:'center',gap:'0.625rem' }}>
                  {link.icon}
                  <div>
                    <p style={{ fontWeight:700,fontSize:'0.85rem',lineHeight:1.2 }}>{link.label}</p>
                    <p style={{ fontSize:'0.7rem',opacity:.7,marginTop:'2px' }}>{link.sub}</p>
                  </div>
                </div>
                <ChevronLeft size={15} style={{ opacity:.5 }} />
              </Link>
            ))}
          </div>
        </div>

      </>)}
    </div>
  );
}
