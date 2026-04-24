'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCashFlowStatement, calcPortfolioSnapshot, type CashFlowStatement, type PortfolioSnapshot } from '@/lib/accounting';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import {
  BarChart3, Download, TrendingUp, Users, Receipt,
  RefreshCw, DollarSign, Filter, ArrowUpRight, ArrowDownRight,
  XCircle, CheckCircle, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const pct = (n: number) => `${(n || 0).toFixed(2)}%`;

interface Investment {
  id: string; name: string; entity: string; invType: string;
  entryAmount: number; currentValue: number; closingAmount?: number;
  status: string; entryDate: Date; closingDate?: Date;
  dividends: { amount: number; date: Date }[];
  valueUpdates?: { newValue: number; date: Date }[];
}
interface Investor {
  id: string; name: string; email: string; investorNumber: string;
  totalPaid: number; shareCount: number; ownershipPercentage: number; status: string; joinDate: Date;
}
interface Expense {
  id: string; type: string; description: string; amount: number; status: string; date: Date; investmentName?: string;
}

const toDate = (v: unknown): Date => v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

const EXPENSE_LABELS: Record<string,string> = { zakat:'زكاة', bank_fees:'رسوم بنكية', admin:'إدارية', legal:'قانونية', other:'أخرى' };

function calcInvReturns(inv: Investment) {
  const isClosed = inv.status === 'closed';
  const totalDividends = inv.dividends.reduce((s,d)=>s+d.amount,0);

  // قاعدة: المغلق → قيمة حالية = 0، قيمة دفترية = 0
  const currentValue   = isClosed ? 0 : (inv.currentValue || inv.entryAmount);
  const bookValue      = isClosed ? 0 : inv.entryAmount;

  // الربح المحقق: من التخارج فقط
  const realizedProfit = isClosed
    ? ((inv.closingAmount || 0) - inv.entryAmount)
    : 0;

  // الربح غير المحقق: من التقييم — للقائمة فقط
  const unrealizedProfit = isClosed ? 0 : (currentValue - bookValue);

  // العائد الكلي = محقق + غير محقق + توزيعات
  const totalReturn = realizedProfit + unrealizedProfit + totalDividends;
  const returnPct = inv.entryAmount > 0 ? (totalReturn / inv.entryAmount) * 100 : 0;

  const days = Math.max(1, Math.round(
    ((inv.closingDate || new Date()).getTime() - inv.entryDate.getTime()) / 86400000
  ));
  const annualReturn = days > 0 ? returnPct / (days / 365) : 0;

  return { totalDividends, currentValue, bookValue, realizedProfit, unrealizedProfit, totalReturn, returnPct, annualReturn, days };
}

export default function ReportsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investors,   setInvestors]   = useState<Investor[]>([]);
  const [expenses,    setExpenses]    = useState<Expense[]>([]);
  const [snapshot,    setSnapshot]    = useState<PortfolioSnapshot | null>(null);
  const [cashFlow,    setCashFlow]    = useState<CashFlowStatement | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<'overview'|'investments'|'investors'|'expenses'|'cashflow'>('overview');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [invSnap, invstSnap, expSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
      ]);
      setInvestors(invSnap.docs.map(d => ({ id:d.id,...d.data(),joinDate:toDate(d.data().joinDate) } as Investor)));
      setInvestments(invstSnap.docs.map(d => {
        const v = d.data();
        return { id:d.id,...v, entryDate:toDate(v.entryDate), closingDate:v.closingDate?toDate(v.closingDate):undefined, dividends:(v.dividends||[]).map((dv:Record<string,unknown>)=>({amount:dv.amount,date:toDate(dv.date)})) } as Investment;
      }));
      setExpenses(expSnap.docs.map(d=>({id:d.id,...d.data(),date:toDate(d.data().date)} as Expense)));

      const [snap] = await Promise.all([calcPortfolioSnapshot()]);
      setSnapshot(snap);

      // cash flow for current year
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      const cf = await getCashFlowStatement(from, now).catch(() => null);
      setCashFlow(cf);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = (data: Record<string,unknown>[], filename: string) => {
    if (!data.length) return;
    const h = Object.keys(data[0]);
    const rows = data.map(r => h.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','));
    const csv = '\uFEFF' + [h.join(','),...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download = `${filename}.csv`; a.click();
  };

  const inRange = (d:Date) => {
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo))   return false;
    return true;
  };

  const filteredInvst = investments.filter(i => inRange(i.entryDate));
  const filteredInv   = investors.filter(i => inRange(i.joinDate));
  const filteredExp   = expenses.filter(e => inRange(e.date) && e.status === 'approved');

  // Aggregate returns
  const totalRealizedProfit  = investments.filter(i=>i.status==='closed').reduce((s,i)=>{ const r=calcInvReturns(i); return s+r.realizedProfit+r.totalDividends; },0);
  const totalUnrealizedProfit= investments.filter(i=>i.status!=='closed').reduce((s,i)=>{ const r=calcInvReturns(i); return s+r.unrealizedProfit; },0);
  const totalDividendsAll    = investments.reduce((s,i)=>s+i.dividends.reduce((ss,d)=>ss+d.amount,0),0);

  const tabs = [
    { id:'overview',    label:'ملخص' },
    { id:'investments', label:'الاستثمارات' },
    { id:'investors',   label:'المستثمرون' },
    { id:'expenses',    label:'المصاريف' },
    { id:'cashflow',    label:'التدفقات النقدية' },
  ] as const;

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'50vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:40,height:40,border:'3px solid #e2e8f0',borderTopColor:'var(--navy)',borderRadius:'50%',margin:'0 auto 12px',animation:'spin 0.7s linear infinite'}}/>
        <p style={{color:'var(--muted)',fontSize:'0.85rem'}}>جاري تحميل التقارير...</p>
      </div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
      <div className="page-header">
        <div><h1 className="page-title">التقارير</h1><p className="page-subtitle">المحاسبة والأداء</p></div>
        <button onClick={load} className="btn-secondary" style={{padding:'0.5rem 0.75rem'}}><RefreshCw size={15}/></button>
      </div>

      {/* Date filter */}
      <div className="card" style={{padding:'1rem',display:'flex',flexWrap:'wrap',gap:'0.75rem',alignItems:'flex-end'}}>
        <Filter size={15} style={{color:'var(--muted)',marginBottom:4}}/>
        <div><label className="label" style={{fontSize:'0.72rem'}}>من تاريخ</label><input className="input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:'0.8rem',padding:'0.5rem 0.75rem'}}/></div>
        <div><label className="label" style={{fontSize:'0.72rem'}}>إلى تاريخ</label><input className="input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:'0.8rem',padding:'0.5rem 0.75rem'}}/></div>
        <button onClick={()=>{setDateFrom('');setDateTo('');}} className="btn-secondary" style={{fontSize:'0.8rem',padding:'0.5rem 0.75rem'}}>مسح</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:'4px',background:'#f1f5f9',padding:'4px',borderRadius:'14px',overflowX:'auto'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{padding:'0.5rem 0.875rem',borderRadius:'10px',fontSize:'0.8rem',fontWeight:600,border:'none',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'inherit',
              background:activeTab===t.id?'#fff':'transparent',color:activeTab===t.id?'var(--navy)':'#64748b',
              boxShadow:activeTab===t.id?'0 1px 4px rgba(0,0,0,.1)':'none',transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab==='overview' && snapshot && (
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {/* المركز المالي */}
          <div className="card" style={{padding:'1.25rem'}}>
            <h3 className="section-title">المركز المالي — كتاب الحسابات</h3>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {[
                {label:'رأس مال الملاك الداخل',    value:snapshot.ownerCapitalIn,      sign:'+', color:'#2563eb'},
                {label:'سحوبات الملاك',              value:-snapshot.ownerCapitalOut,    sign:'-', color:'#dc2626'},
                {label:'الأرباح المحققة',            value:totalRealizedProfit,          sign:'+', color:'#059669'},
                {label:'الأرباح غير المحققة',        value:totalUnrealizedProfit,        sign:'+', color:'#0891b2'},
                {label:'التوزيعات المستلمة',         value:totalDividendsAll,            sign:'+', color:'#d97706'},
                {label:'المصروفات المعتمدة',         value:-snapshot.totalExpenses,      sign:'-', color:'#dc2626'},
              ].map((row,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.625rem 0',borderBottom:'1px solid #f1f5f9'}}>
                  <span style={{fontSize:'0.82rem',color:'#475569'}}>{row.label}</span>
                  <span style={{fontSize:'0.88rem',fontWeight:600,color:row.color}}>{row.sign}{formatCurrency(Math.abs(row.value))}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.875rem 0 0',borderTop:'2px solid var(--navy)'}}>
                <div>
                  <p style={{fontWeight:800,color:'var(--navy)'}}>النقد المتوفر</p>
                  <p style={{fontSize:'0.7rem',color:'var(--muted)'}}>= رأس المال + عوائد − استثمارات قائمة − مصاريف</p>
                </div>
                <span style={{fontWeight:900,fontSize:'1.1rem',color:snapshot.availableCash>=0?'#059669':'#dc2626'}}>{formatCurrency(snapshot.availableCash)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.5rem 0',marginTop:'4px'}}>
                <div>
                  <p style={{fontWeight:800,color:'var(--navy)'}}>صافي قيمة المحفظة</p>
                  <p style={{fontSize:'0.7rem',color:'var(--muted)'}}>= نقد + قيمة حالية الاستثمارات القائمة فقط</p>
                </div>
                <span style={{fontWeight:900,fontSize:'1.1rem',color:'#2563eb'}}>{formatCurrency(snapshot.netPortfolioValue)}</span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.75rem'}}>
            {[
              {label:'قائمة',    count:snapshot.activeCount,     color:'#059669',bg:'#f0fdf4'},
              {label:'مغلقة',    count:snapshot.closedCount,     color:'#2563eb',bg:'#eff6ff'},
              {label:'متعثرة',   count:snapshot.distressedCount, color:'#dc2626',bg:'#fef2f2'},
            ].map(c=>(
              <div key={c.label} className="stat-card" style={{textAlign:'center',padding:'1rem'}}>
                <p style={{fontSize:'1.5rem',fontWeight:900,color:c.color}}>{c.count}</p>
                <p style={{fontSize:'0.72rem',color:'var(--muted)'}}>{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INVESTMENTS ── */}
      {activeTab==='investments' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)'}}>
            <h3 style={{fontWeight:700,fontSize:'0.95rem'}}>أداء الاستثمارات ({filteredInvst.length})</h3>
            <button onClick={()=>exportCSV(filteredInvst.map(i=>{const r=calcInvReturns(i);return{'الاسم':i.name,'الحالة':i.status,'التكلفة':i.entryAmount,'القيمة الحالية':r.currentValue,'ربح محقق':r.realizedProfit,'ربح غير محقق':r.unrealizedProfit,'توزيعات':r.totalDividends,'عائد%':r.returnPct.toFixed(2),'عائد سنوي%':r.annualReturn.toFixed(2)};}), 'investments')} className="btn-secondary" style={{fontSize:'0.75rem',padding:'0.4rem 0.75rem'}}><Download size={13}/>CSV</button>
          </div>
          <div className="table-container" style={{borderRadius:0,border:'none'}}>
            <table className="table">
              <thead><tr>
                <th>الاستثمار</th><th>الحالة</th><th>التكلفة</th>
                <th>القيمة الحالية *</th><th>ربح محقق</th><th>ربح غير محقق</th>
                <th>توزيعات</th><th>العائد الكلي</th><th>عائد%</th><th>سنوي%</th>
              </tr></thead>
              <tbody>
                {filteredInvst.map(inv=>{
                  const r = calcInvReturns(inv);
                  const isClosed = inv.status==='closed';
                  return (
                    <tr key={inv.id}>
                      <td><p style={{fontWeight:600,fontSize:'0.85rem'}}>{inv.name}</p><p style={{fontSize:'0.7rem',color:'#94a3b8'}}>{inv.entity}</p></td>
                      <td><span className={isClosed?'badge-blue':inv.status==='distressed'?'badge-red':'badge-green'}>{isClosed?'مغلق':inv.status==='distressed'?'متعثر':'قائم'}</span></td>
                      <td style={{fontWeight:600,color:'#2563eb'}}>{formatCurrency(inv.entryAmount)}</td>
                      <td style={{fontWeight:600,color:isClosed?'#94a3b8':'#1e293b'}}>
                        {isClosed ? <span style={{fontSize:'0.75rem',color:'#94a3b8'}}>0 (مغلق)</span> : formatCurrency(r.currentValue)}
                      </td>
                      <td style={{color:r.realizedProfit>=0?'#059669':'#dc2626',fontWeight:600}}>{r.realizedProfit!==0?`${r.realizedProfit>0?'+':''}${formatCurrency(r.realizedProfit)}`:'—'}</td>
                      <td style={{color:r.unrealizedProfit>=0?'#059669':'#dc2626',fontWeight:600}}>{!isClosed?(r.unrealizedProfit>=0?'+':'')+formatCurrency(r.unrealizedProfit):'—'}</td>
                      <td style={{color:'#d97706'}}>{r.totalDividends>0?formatCurrency(r.totalDividends):'—'}</td>
                      <td style={{color:r.totalReturn>=0?'#059669':'#dc2626',fontWeight:700}}>{r.totalReturn>=0?'+':''}{formatCurrency(r.totalReturn)}</td>
                      <td style={{color:r.returnPct>=0?'#059669':'#dc2626',fontWeight:700}}>{pct(r.returnPct)}</td>
                      <td style={{color:r.annualReturn>=0?'#059669':'#dc2626'}}>{pct(r.annualReturn)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredInvst.length > 0 && (()=>{
                const totals = filteredInvst.reduce((acc,inv)=>{const r=calcInvReturns(inv);return{cost:acc.cost+inv.entryAmount,cv:acc.cv+r.currentValue,rp:acc.rp+r.realizedProfit,up:acc.up+r.unrealizedProfit,div:acc.div+r.totalDividends,ret:acc.ret+r.totalReturn};},{cost:0,cv:0,rp:0,up:0,div:0,ret:0});
                const totalRetPct = totals.cost>0?(totals.ret/totals.cost)*100:0;
                return (<tfoot><tr>
                  <td colSpan={2} style={{fontWeight:700}}>الإجمالي</td>
                  <td style={{fontWeight:700,color:'#2563eb'}}>{formatCurrency(totals.cost)}</td>
                  <td style={{fontWeight:700}}>{formatCurrency(totals.cv)}</td>
                  <td style={{fontWeight:700,color:totals.rp>=0?'#059669':'#dc2626'}}>{totals.rp>=0?'+':''}{formatCurrency(totals.rp)}</td>
                  <td style={{fontWeight:700,color:totals.up>=0?'#059669':'#dc2626'}}>{totals.up>=0?'+':''}{formatCurrency(totals.up)}</td>
                  <td style={{fontWeight:700,color:'#d97706'}}>{formatCurrency(totals.div)}</td>
                  <td style={{fontWeight:700,color:totals.ret>=0?'#059669':'#dc2626'}}>{totals.ret>=0?'+':''}{formatCurrency(totals.ret)}</td>
                  <td style={{fontWeight:700,color:totalRetPct>=0?'#059669':'#dc2626'}}>{pct(totalRetPct)}</td>
                  <td>—</td>
                </tr></tfoot>);
              })()}
            </table>
          </div>
          <div style={{padding:'0.75rem 1rem',background:'#fffbeb',borderTop:'1px solid #fde68a'}}>
            <p style={{fontSize:'0.72rem',color:'#92400e'}}>* القيمة الحالية للاستثمارات <strong>المغلقة = 0</strong> (تُعامل كتاريخ وأداء فقط، وليست أصلاً قائماً)</p>
          </div>
        </div>
      )}

      {/* ── INVESTORS ── */}
      {activeTab==='investors' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'1rem',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)'}}>
            <h3 style={{fontWeight:700,fontSize:'0.95rem'}}>تقرير المستثمرين ({filteredInv.length})</h3>
            <button onClick={()=>exportCSV(filteredInv.map(i=>({'الاسم':i.name,'رأس المال':i.totalPaid,'الحصص':i.shareCount,'الملكية%':(i.ownershipPercentage||0).toFixed(2),'تاريخ الانضمام':formatDate(i.joinDate),'الحالة':i.status})),'investors')} className="btn-secondary" style={{fontSize:'0.75rem',padding:'0.4rem 0.75rem'}}><Download size={13}/>CSV</button>
          </div>
          <div className="table-container" style={{borderRadius:0,border:'none'}}>
            <table className="table">
              <thead><tr><th>المستثمر</th><th>رأس المال</th><th>الحصص</th><th>الملكية</th><th>تاريخ الانضمام</th><th>الحالة</th></tr></thead>
              <tbody>
                {filteredInv.map(inv=>(
                  <tr key={inv.id}>
                    <td><p style={{fontWeight:600}}>{inv.name}</p><p style={{fontSize:'0.7rem',color:'#94a3b8'}}>{inv.email}</p></td>
                    <td style={{fontWeight:600,color:'#2563eb'}}>{formatCurrency(inv.totalPaid)}</td>
                    <td>{(inv.shareCount||0).toLocaleString('ar-SA')}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:48,height:5,background:'#e2e8f0',borderRadius:3,overflow:'hidden'}}>
                          <div style={{width:`${Math.min(inv.ownershipPercentage||0,100)}%`,height:'100%',background:'#2563eb',borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:'0.82rem',fontWeight:600}}>{pct(inv.ownershipPercentage||0)}</span>
                      </div>
                    </td>
                    <td style={{color:'#64748b',fontSize:'0.82rem'}}>{formatDate(inv.joinDate)}</td>
                    <td><span className={inv.status==='active'?'badge-green':'badge-gray'}>{inv.status==='active'?'نشط':'غير نشط'}</span></td>
                  </tr>
                ))}
                <tr style={{background:'#eff6ff',fontWeight:700}}>
                  <td>الإجمالي</td>
                  <td style={{color:'#2563eb'}}>{formatCurrency(filteredInv.reduce((s,i)=>s+i.totalPaid,0))}</td>
                  <td>{filteredInv.reduce((s,i)=>s+i.shareCount,0).toLocaleString('ar-SA')}</td>
                  <td>100%</td><td>—</td><td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EXPENSES ── */}
      {activeTab==='expenses' && (
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.75rem'}}>
            {Object.entries(EXPENSE_LABELS).map(([key,label])=>{
              const total=filteredExp.filter(e=>e.type===key).reduce((s,e)=>s+e.amount,0);
              if(!total) return null;
              return (
                <div key={key} className="stat-card">
                  <p style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:4}}>{label}</p>
                  <p style={{fontSize:'1rem',fontWeight:800,color:'#dc2626'}}>{formatCurrency(total)}</p>
                </div>
              );
            })}
          </div>
          <div className="card" style={{overflow:'hidden'}}>
            <div style={{padding:'1rem',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h3 style={{fontWeight:700,fontSize:'0.95rem'}}>المصروفات المعتمدة ({filteredExp.length})</h3>
              <button onClick={()=>exportCSV(filteredExp.map(e=>({'النوع':e.type,'الوصف':e.description,'التاريخ':formatDate(e.date),'المبلغ':e.amount,'الاستثمار':e.investmentName||''})),'expenses')} className="btn-secondary" style={{fontSize:'0.75rem',padding:'0.4rem 0.75rem'}}><Download size={13}/>CSV</button>
            </div>
            <div className="table-container" style={{borderRadius:0,border:'none'}}>
              <table className="table">
                <thead><tr><th>النوع</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>استثمار مرتبط</th></tr></thead>
                <tbody>
                  {filteredExp.map(exp=>(
                    <tr key={exp.id}>
                      <td><span className="badge-blue" style={{fontSize:'0.7rem'}}>{EXPENSE_LABELS[exp.type]||exp.type}</span></td>
                      <td style={{fontWeight:500,fontSize:'0.85rem'}}>{exp.description}</td>
                      <td style={{color:'#64748b',fontSize:'0.82rem'}}>{formatDate(exp.date)}</td>
                      <td style={{fontWeight:700,color:'#dc2626'}}>{formatCurrency(exp.amount)}</td>
                      <td style={{color:'#94a3b8',fontSize:'0.8rem'}}>{exp.investmentName||'—'}</td>
                    </tr>
                  ))}
                  <tr style={{background:'#fef2f2',fontWeight:700}}>
                    <td colSpan={3}>الإجمالي</td>
                    <td style={{color:'#dc2626'}}>{formatCurrency(filteredExp.reduce((s,e)=>s+e.amount,0))}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CASH FLOW ── */}
      {activeTab==='cashflow' && (
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {cashFlow ? (
            <div className="card" style={{padding:'1.25rem'}}>
              <h3 className="section-title">قائمة التدفقات النقدية — {cashFlow.period.from.getFullYear()}</h3>
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                <div style={{display:'flex',justifyContent:'space-between',padding:'0.625rem 0',borderBottom:'2px solid #e2e8f0'}}>
                  <span style={{fontWeight:700,color:'var(--navy)'}}>رصيد أول المدة</span>
                  <span style={{fontWeight:800}}>{formatCurrency(cashFlow.openingBalance)}</span>
                </div>
                <div style={{padding:'0.5rem 0',borderBottom:'1px dashed #e2e8f0'}}>
                  <p style={{fontSize:'0.7rem',fontWeight:700,color:'#059669',marginBottom:'0.375rem',letterSpacing:'0.05em'}}>تدفقات داخلة</p>
                  {[
                    ['رأس مال داخل', cashFlow.capitalIn],
                    ['متحصلات تخارج', cashFlow.exitProceeds],
                    ['توزيعات وأرباح', cashFlow.dividends],
                    ['دخل تشغيلي', cashFlow.operatingIncome],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'0.3rem 0',paddingRight:'0.75rem'}}>
                      <span style={{fontSize:'0.82rem',color:'#475569'}}>{k}</span>
                      <span style={{fontSize:'0.85rem',fontWeight:600,color:'#059669'}}>+{formatCurrency(v as number)}</span>
                    </div>
                  ))}
                </div>
                <div style={{padding:'0.5rem 0',borderBottom:'2px solid #e2e8f0'}}>
                  <p style={{fontSize:'0.7rem',fontWeight:700,color:'#dc2626',marginBottom:'0.375rem',letterSpacing:'0.05em'}}>تدفقات خارجة</p>
                  {[
                    ['تمويل استثمارات', cashFlow.investmentFunding],
                    ['زيادات استثمارات', cashFlow.investmentTopups],
                    ['المصروفات', cashFlow.approvedExpenses],
                    ['سحوبات الملاك', cashFlow.ownerWithdrawals],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'0.3rem 0',paddingRight:'0.75rem'}}>
                      <span style={{fontSize:'0.82rem',color:'#475569'}}>{k}</span>
                      <span style={{fontSize:'0.85rem',fontWeight:600,color:'#dc2626'}}>-{formatCurrency(v as number)}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'0.875rem 0 0'}}>
                  <span style={{fontWeight:800,color:'var(--navy)'}}>رصيد آخر المدة</span>
                  <span style={{fontWeight:900,fontSize:'1.1rem',color:cashFlow.closingBalance>=0?'#059669':'#dc2626'}}>{formatCurrency(cashFlow.closingBalance)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{padding:'2rem',textAlign:'center'}}>
              <p style={{color:'var(--muted)',fontSize:'0.85rem'}}>قائمة التدفقات النقدية تتطلب تحويل البيانات إلى سجل الحركات أولاً</p>
              <Link href="/dashboard" style={{color:'var(--navy)',fontWeight:600,fontSize:'0.85rem'}}>الذهاب للوحة التحكم →</Link>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
