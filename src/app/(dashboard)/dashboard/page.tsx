'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  Wallet, TrendingUp, Users, Activity, CheckCircle, XCircle,
  DollarSign, ArrowUpRight, RefreshCw, AlertTriangle, Info,
  BarChart3, ArrowDownRight, ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

interface Investor { totalPaid: number; shareCount: number; status: string; userId?: string; }
interface Investment { entryAmount: number; currentValue: number; status: string; closingAmount?: number; name: string; closingDate?: Date; dividends?: { amount: number }[]; }
interface Expense { amount: number; status: string; }
interface Distribution { totalAmount: number; status: string; affectsCash: boolean; }

function calcCash(inv: Investor[], invst: Investment[], exp: Expense[], dist: Distribution[]) {
  const capitalIn   = inv.reduce((s, i) => s + (i.totalPaid || 0), 0);
  const activeOut   = invst.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0);
  const closedIn    = invst.filter(i => i.status === 'closed').reduce((s, i) => s + (i.closingAmount || 0), 0);
  const closedOut   = invst.filter(i => i.status === 'closed').reduce((s, i) => s + i.entryAmount, 0);
  const divs        = invst.reduce((s, i) => s + (i.dividends || []).reduce((ss, d) => ss + d.amount, 0), 0);
  const expOut      = exp.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const distOut     = dist.filter(d => d.status === 'approved' && d.affectsCash).reduce((s, d) => s + d.totalAmount, 0);
  return capitalIn - activeOut + closedIn - closedOut + divs - expOut - distOut;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [a, b, c, d] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'distributions')),
      ]);
      setInvestors(a.docs.map(d => d.data() as Investor));
      setInvestments(b.docs.map(d => ({ ...d.data(), dividends: d.data().dividends || [], closingDate: d.data().closingDate ? toDate(d.data().closingDate) : undefined } as Investment)));
      setExpenses(c.docs.map(d => d.data() as Expense));
      setDistributions(d.docs.map(d => d.data() as Distribution));
    } catch(e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const cash = calcCash(investors, investments, expenses, distributions);
  const activeInvs    = investments.filter(i => i.status === 'active');
  const closedInvs    = investments.filter(i => i.status === 'closed');
  const distressInvs  = investments.filter(i => i.status === 'distressed');
  const totalCapital  = investors.reduce((s, i) => s + (i.totalPaid || 0), 0);
  const totalShares   = investors.reduce((s, i) => s + (i.shareCount || 0), 0);
  const sharePrice    = totalShares > 0 ? totalCapital / totalShares : 0;
  const totalCurrentV = activeInvs.reduce((s, i) => s + i.currentValue, 0);
  const totalDivs     = investments.reduce((s, i) => s + (i.dividends||[]).reduce((ss,d)=>ss+d.amount,0), 0);
  const totalExp      = expenses.filter(e => e.status==='approved').reduce((s,e)=>s+e.amount,0);
  const unrealized    = totalCurrentV - activeInvs.reduce((s,i)=>s+i.entryAmount,0);
  const noAccount     = investors.filter(i => !i.userId).length;
  const soon          = new Date(Date.now() + 30*86400000);
  const closingSoon   = activeInvs.filter(i => i.closingDate && i.closingDate <= soon);

  const alerts = [
    ...distressInvs.map(i => ({ type: 'danger' as const, msg: `استثمار متعثر: ${i.name}` })),
    ...closingSoon.map(i => ({ type: 'warning' as const, msg: `يقترب موعد إغلاق: ${i.name}` })),
    ...(noAccount > 0 ? [{ type: 'info' as const, msg: `${noAccount} مستثمر بدون حساب` }] : []),
  ];

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40,height:40,border:'3px solid #e2e8f0',borderTopColor:'var(--navy)',borderRadius:'50%',margin:'0 auto 12px',animation:'spin 0.7s linear infinite' }} />
        <p style={{ color:'var(--muted)',fontSize:'0.85rem' }}>جاري التحميل...</p>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:'1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <button onClick={load} className="btn-secondary" style={{padding:'0.5rem 0.75rem'}}>
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Alerts */}
      {alerts.map((a,i) => (
        <div key={i} className={`alert-${a.type}`} style={{fontSize:'0.85rem'}}>
          {a.type==='danger'?<XCircle size={16}/>:a.type==='warning'?<AlertTriangle size={16}/>:<Info size={16}/>}
          <span>{a.msg}</span>
        </div>
      ))}

      {/* CASH HERO CARD */}
      <div style={{
        borderRadius:'20px', padding:'1.5rem',
        background: cash>=0 ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
        color:'#fff', boxShadow: cash>=0 ? '0 8px 32px rgba(5,150,105,.35)' : '0 8px 32px rgba(220,38,38,.35)',
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute',top:'-30%',left:'-10%',width:'200px',height:'200px',borderRadius:'50%',background:'rgba(255,255,255,.08)',pointerEvents:'none' }} />
        <div style={{ position:'absolute',bottom:'-20%',right:'5%',width:'150px',height:'150px',borderRadius:'50%',background:'rgba(255,255,255,.06)',pointerEvents:'none' }} />
        <div style={{ position:'relative',zIndex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'0.5rem',opacity:.8 }}>
            <Wallet size={16} />
            <span style={{ fontSize:'0.8rem',fontWeight:600 }}>الكاش المتوفر الآن</span>
          </div>
          <p style={{ fontSize:'2.25rem',fontWeight:900,lineHeight:1,marginBottom:'1.25rem' }}>{formatCurrency(cash)}</p>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1rem' }}>
            {[
              ['رأس المال',formatCurrency(totalCapital)],
              ['سعر الحصة',formatCurrency(sharePrice)],
              ['إجمالي الحصص',formatNumber(totalShares,0)],
            ].map(([k,v])=>(
              <div key={k}>
                <p style={{ fontSize:'0.68rem',opacity:.7,marginBottom:'2px' }}>{k}</p>
                <p style={{ fontSize:'0.9rem',fontWeight:700 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats — 2x2 on mobile */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.875rem' }}>
        {[
          { label:'رأس المال', value:formatCurrency(totalCapital), icon:<DollarSign size={20}/>, accent:'#2563eb', bg:'#eff6ff' },
          { label:'المستثمرون', value:String(investors.length), icon:<Users size={20}/>, accent:'#7c3aed', bg:'#f5f3ff' },
          { label:'استثمارات قائمة', value:String(activeInvs.length), icon:<Activity size={20}/>, accent:'#059669', bg:'#f0fdf4' },
          { label:'مغلقة', value:String(closedInvs.length), icon:<CheckCircle size={20}/>, accent:'#0284c7', bg:'#f0f9ff' },
          { label:'متعثرة', value:String(distressInvs.length), icon:<XCircle size={20}/>, accent:'#dc2626', bg:'#fef2f2' },
          { label:'أرباح موزعة', value:formatCurrency(totalDivs), icon:<ArrowUpRight size={20}/>, accent:'#d97706', bg:'#fffbeb' },
          { label:'ربح تراكمي', value:formatCurrency(unrealized), icon:<TrendingUp size={20}/>, accent:'#0891b2', bg:'#ecfeff' },
          { label:'المصاريف', value:formatCurrency(totalExp), icon:<ArrowDownRight size={20}/>, accent:'#dc2626', bg:'#fef2f2' },
        ].map(card=>(
          <div key={card.label} className="stat-card">
            <div style={{ width:40,height:40,borderRadius:12,background:card.bg,display:'flex',alignItems:'center',justifyContent:'center',color:card.accent,marginBottom:'0.75rem' }}>
              {card.icon}
            </div>
            <p style={{ fontSize:'1.125rem',fontWeight:800,color:'var(--navy)',lineHeight:1.1 }}>{card.value}</p>
            <p style={{ fontSize:'0.72rem',color:'var(--muted)',marginTop:'3px' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="card" style={{ padding:'1.25rem' }}>
        <h3 className="section-title">روابط سريعة</h3>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.75rem' }}>
          {[
            { href:'/investments', label:'الاستثمارات', icon:<TrendingUp size={18}/>, color:'var(--navy)' },
            { href:'/investors',   label:'المستثمرون',  icon:<Users size={18}/>,       color:'#7c3aed' },
            { href:'/expenses',    label:'المصاريف',    icon:<ArrowDownRight size={18}/>,color:'#dc2626' },
            { href:'/reports',     label:'التقارير',    icon:<BarChart3 size={18}/>,    color:'#0891b2' },
          ].map(link=>(
            <Link key={link.href} href={link.href} style={{
              display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'0.875rem 1rem',borderRadius:'14px',
              background:'#f8fafc',border:'1.5px solid #e2e8f0',
              textDecoration:'none',color:link.color,
              transition:'all 0.15s',
            }}>
              <div style={{ display:'flex',alignItems:'center',gap:'0.5rem' }}>
                {link.icon}
                <span style={{ fontWeight:600,fontSize:'0.85rem' }}>{link.label}</span>
              </div>
              <ChevronLeft size={16} style={{ opacity:.5 }} />
            </Link>
          ))}
        </div>
      </div>

      {/* Cash breakdown */}
      <div className="card" style={{ padding:'1.25rem' }}>
        <h3 className="section-title">تفصيل الكاش</h3>
        <div style={{ display:'flex',flexDirection:'column',gap:'0' }}>
          {[
            { label:'رأس المال الداخل', value:totalCapital, plus:true },
            { label:'مستثمر في صفقات قائمة', value:-activeInvs.reduce((s,i)=>s+i.entryAmount,0), plus:false },
            { label:'عوائد صفقات مغلقة', value:closedInvs.reduce((s,i)=>s+(i.closingAmount||0),0), plus:true },
            { label:'رأس مال صفقات مغلقة', value:-closedInvs.reduce((s,i)=>s+i.entryAmount,0), plus:false },
            { label:'أرباح موزعة مستلمة', value:totalDivs, plus:true },
            { label:'مصاريف معتمدة', value:-totalExp, plus:false },
          ].map((row,i)=>(
            <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.625rem 0',borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:'0.8rem',color:'#475569' }}>{row.label}</span>
              <span style={{ fontSize:'0.85rem',fontWeight:600,color:row.plus?'#059669':'#dc2626' }}>
                {row.plus?'+':''}{formatCurrency(row.value)}
              </span>
            </div>
          ))}
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.875rem 0 0' }}>
            <span style={{ fontWeight:700,color:'var(--navy)' }}>الكاش المتوفر</span>
            <span style={{ fontWeight:900,fontSize:'1.1rem',color:cash>=0?'#059669':'#dc2626' }}>{formatCurrency(cash)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
