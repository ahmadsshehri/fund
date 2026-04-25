'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Download, Scale } from 'lucide-react';

interface TrialEntry {
  account: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
  balanceSide: 'D' | 'C';
  note?: string;
}
interface BalanceCheck { name: string; expected: number; actual: number; pass: boolean; }

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

export default function TrialBalancePage() {
  const [entries, setEntries] = useState<TrialEntry[]>([]);
  const [checks, setChecks] = useState<BalanceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ ownerCapital:0, availableCash:0, activeCurrentValue:0, nav:0, realizedProfit:0, dividends:0, unrealizedProfit:0, totalExpenses:0 });

  const load = async () => {
    setLoading(true);
    try {
      const [invSnap, invstSnap, expSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
      ]);

      const investors   = invSnap.docs.map(d => d.data());
      const investments = invstSnap.docs.map(d => ({ ...d.data(), entryDate: toDate(d.data().entryDate), closingDate: d.data().closingDate ? toDate(d.data().closingDate) : undefined }));
      const expenses    = expSnap.docs.map(d => d.data());

      // رأس مال الملاك
      const ownerCapital = investors.reduce((s: number, i: Record<string,unknown>) => s + ((i.totalPaid as number)||0), 0);

      // الاستثمارات
      const activeInvs = investments.filter((i: Record<string,unknown>) => i.status !== 'closed');
      const closedInvs = investments.filter((i: Record<string,unknown>) => i.status === 'closed');

      const activeTotalCost    = activeInvs.reduce((s: number, i: Record<string,unknown>) => s + ((i.entryAmount as number)||0), 0);
      const activeCurrentValue = activeInvs.reduce((s: number, i: Record<string,unknown>) => s + ((i.currentValue as number)||(i.entryAmount as number)||0), 0);
      const exitProceeds       = closedInvs.reduce((s: number, i: Record<string,unknown>) => s + ((i.closingAmount as number)||0), 0);
      const closedCost         = closedInvs.reduce((s: number, i: Record<string,unknown>) => s + ((i.entryAmount as number)||0), 0);
      const realizedProfit     = exitProceeds - closedCost;
      const unrealizedProfit   = activeCurrentValue - activeTotalCost;

      // التوزيعات
      const dividends = investments.reduce((s: number, i: Record<string,unknown>) =>
        s + ((i.dividends as {amount:number}[])||[]).reduce((ss,d) => ss+d.amount, 0), 0);

      // المصاريف
      const approvedExp = expenses.filter((e: Record<string,unknown>) => e.status === 'approved');
      const totalExpenses = approvedExp.reduce((s: number, e: Record<string,unknown>) => s + ((e.amount as number)||0), 0);
      const zakatExp  = approvedExp.filter((e: Record<string,unknown>) => e.type === 'zakat').reduce((s: number, e: Record<string,unknown>) => s + ((e.amount as number)||0), 0);
      const otherExp  = totalExpenses - zakatExp;

      // النقد
      const availableCash = ownerCapital - activeTotalCost + exitProceeds - closedCost + dividends - totalExpenses;
      const nav = availableCash + activeCurrentValue;

      setSummary({ ownerCapital, availableCash, activeCurrentValue, nav, realizedProfit, dividends, unrealizedProfit, totalExpenses });

      // ── بناء القيود ──
      const e: TrialEntry[] = [
        {
          account:'النقد والسيولة', accountType:'أصل متداول',
          debit: Math.max(0, availableCash), credit: Math.max(0, -availableCash),
          balance: availableCash, balanceSide: (availableCash >= 0 ? 'D' : 'C') as 'D' | 'C',
          note:'رأس المال + عوائد − استثمارات قائمة − مصاريف',
        },
        {
          account:'الاستثمارات القائمة (بالتكلفة)', accountType:'أصل غير متداول',
          debit: activeTotalCost, credit: 0, balance: activeTotalCost, balanceSide:'D' as 'D' | 'C',
          note:`${activeInvs.length} استثمار قائم`,
        },
        ...(unrealizedProfit !== 0 ? [{
          account:'فرق إعادة التقييم', accountType:'أصل / تسوية',
          debit: Math.max(0,unrealizedProfit), credit: Math.max(0,-unrealizedProfit),
          balance: unrealizedProfit, balanceSide:(unrealizedProfit >= 0 ? 'D' : 'C') as 'D'|'C',
          note:'القيمة الحالية − التكلفة الدفترية للقائمة',
        }] : []),
        {
          account:'رأس مال الملاك', accountType:'حقوق ملاك',
          debit: 0, credit: ownerCapital, balance: ownerCapital, balanceSide:'C' as 'D' | 'C',
          note:`${investors.length} مستثمر`,
        },
        ...(realizedProfit !== 0 ? [{
          account:'الأرباح المحققة من التخارجات', accountType:'إيراد محقق',
          debit: Math.max(0,-realizedProfit), credit: Math.max(0,realizedProfit),
          balance: realizedProfit, balanceSide:(realizedProfit >= 0 ? 'C' : 'D') as 'D'|'C',
          note:`متحصلات ${formatCurrency(exitProceeds)} − تكلفة ${formatCurrency(closedCost)}`,
        }] : []),
        ...(dividends > 0 ? [{
          account:'الأرباح الموزعة المستلمة', accountType:'إيراد نقدي',
          debit: 0, credit: dividends, balance: dividends, balanceSide:'C' as 'D'|'C',
          note:'دخلت الكاش — لا تؤثر على قيمة الأصل',
        }] : []),
        ...(unrealizedProfit !== 0 ? [{
          account:'الأرباح غير المحققة (تقييم)', accountType:'إيراد غير محقق',
          debit: Math.max(0,-unrealizedProfit), credit: Math.max(0,unrealizedProfit),
          balance: unrealizedProfit, balanceSide:(unrealizedProfit >= 0 ? 'C' : 'D') as 'D'|'C',
          note:'لا تأثير على الكاش',
        }] : []),
        ...(zakatExp > 0 ? [{
          account:'الزكاة', accountType:'مصروف',
          debit: zakatExp, credit: 0, balance: zakatExp, balanceSide:'D' as 'D'|'C',
          note:'زكاة مدفوعة — تقلل الكاش',
        }] : []),
        ...(otherExp > 0 ? [{
          account:'المصاريف الأخرى', accountType:'مصروف',
          debit: otherExp, credit: 0, balance: otherExp, balanceSide:'D' as 'D'|'C',
          note:'رسوم، إدارية، قانونية',
        }] : []),
      ].filter(e => e.debit > 0 || e.credit > 0);

      setEntries(e);

      const totalD = e.reduce((s,x) => s+x.debit, 0);
      const totalC = e.reduce((s,x) => s+x.credit, 0);
      const totalAssets = e.filter(x => x.accountType.startsWith('أصل')).reduce((s,x) => s+x.balance, 0);
      const totalEquity = e.filter(x => !x.accountType.startsWith('أصل'))
        .reduce((s,x) => s + (x.accountType === 'مصروف' ? -x.balance : x.balance), 0);

      setChecks([
        { name:'توازن القيد المزدوج (مدين = دائن)', expected:totalD, actual:totalC, pass:Math.abs(totalD-totalC)<0.01 },
        { name:'الأصول = حقوق + أرباح − مصاريف', expected:totalAssets, actual:totalEquity, pass:Math.abs(totalAssets-totalEquity)<0.01 },
        { name:'النقد = رأس مال − قائمة + إغلاقات − تكلفة المغلقة + توزيعات − مصاريف',
          expected: availableCash,
          actual: ownerCapital - activeTotalCost + exitProceeds - closedCost + dividends - totalExpenses,
          pass: Math.abs(availableCash - (ownerCapital - activeTotalCost + exitProceeds - closedCost + dividends - totalExpenses)) < 0.01 },
        { name:'صافي قيمة المحفظة = نقد + قيمة القائمة', expected: nav, actual: availableCash + activeCurrentValue, pass: Math.abs(nav - (availableCash + activeCurrentValue)) < 0.01 },
        { name:'الربح المحقق = متحصلات − تكلفة المغلقة', expected: realizedProfit, actual: exitProceeds - closedCost, pass: Math.abs(realizedProfit - (exitProceeds - closedCost)) < 0.01 },
      ]);

    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalDebit  = entries.reduce((s,e) => s+e.debit, 0);
  const totalCredit = entries.reduce((s,e) => s+e.credit, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;
  const passCount   = checks.filter(c => c.pass).length;

  const exportCSV = () => {
    const rows = [
      ['الحساب','التصنيف','مدين','دائن','الرصيد','الجانب','ملاحظات'],
      ...entries.map(e => [e.account,e.accountType,e.debit,e.credit,e.balance,e.balanceSide==='D'?'مدين':'دائن',e.note||'']),
      [],['الإجمالي','',totalDebit,totalCredit,'','',''],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    a.download = `ميزان-مراجعة-${new Date().toLocaleDateString('ar-SA')}.csv`;
    a.click();
  };

  const TYPES = ['أصل متداول','أصل غير متداول','أصل / تسوية','حقوق ملاك','إيراد محقق','إيراد نقدي','إيراد غير محقق','مصروف'];
  const TYPE_LABELS: Record<string,string> = {
    'أصل متداول':'📦 الأصول المتداولة','أصل غير متداول':'🏗️ الأصول غير المتداولة',
    'أصل / تسوية':'⚖️ تسويات التقييم','حقوق ملاك':'👤 حقوق الملاك',
    'إيراد محقق':'✅ الأرباح المحققة','إيراد نقدي':'💰 الإيرادات النقدية',
    'إيراد غير محقق':'📈 الأرباح غير المحققة','مصروف':'📤 المصاريف',
  };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:40,height:40,border:'3px solid #e2e8f0',borderTopColor:'var(--navy)',borderRadius:'50%',margin:'0 auto 12px',animation:'spin 0.7s linear infinite'}}/>
        <p style={{color:'var(--muted)',fontSize:'0.85rem'}}>جاري بناء ميزان المراجعة...</p>
      </div>
    </div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
            <Scale size={22} style={{color:'var(--navy)'}}/>ميزان المراجعة
          </h1>
          <p className="page-subtitle">نظام القيد المزدوج — {new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <div style={{display:'flex',gap:'0.5rem'}}>
          <button onClick={exportCSV} className="btn-secondary" style={{fontSize:'0.82rem'}}><Download size={14}/>تصدير</button>
          <button onClick={load} className="btn-secondary" style={{padding:'0.5rem 0.75rem'}}><RefreshCw size={15}/></button>
        </div>
      </div>

      {/* Balance banner */}
      <div style={{
        padding:'1rem 1.25rem',borderRadius:'16px',color:'#fff',
        background: isBalanced ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
        boxShadow: isBalanced ? '0 4px 16px rgba(5,150,105,.3)' : '0 4px 16px rgba(220,38,38,.3)',
        display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'0.75rem',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
          {isBalanced ? <CheckCircle size={24}/> : <XCircle size={24}/>}
          <div>
            <p style={{fontWeight:800,fontSize:'1rem'}}>{isBalanced ? '✓ الميزان متوازن' : '✗ الميزان غير متوازن'}</p>
            <p style={{fontSize:'0.75rem',opacity:.85}}>
              {isBalanced ? `مدين = دائن = ${formatCurrency(totalDebit)}` : `الفرق = ${formatCurrency(Math.abs(totalDebit-totalCredit))}`}
            </p>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,auto)',gap:'1.5rem',textAlign:'center'}}>
          {[
            ['إجمالي مدين', formatCurrency(totalDebit)],
            ['إجمالي دائن', formatCurrency(totalCredit)],
            [`فحوصات ناجحة`, `${passCount}/${checks.length}`],
          ].map(([k,v]) => (
            <div key={k}><p style={{fontSize:'0.65rem',opacity:.75}}>{k}</p><p style={{fontWeight:800,fontSize:'0.9rem'}}>{v}</p></div>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.75rem'}}>
        {[
          {label:'رأس مال الملاك',    value:summary.ownerCapital,      color:'#2563eb'},
          {label:'النقد المتوفر',      value:summary.availableCash,     color: summary.availableCash>=0?'#059669':'#dc2626'},
          {label:'قيمة القائمة',       value:summary.activeCurrentValue, color:'#0891b2'},
          {label:'صافي قيمة المحفظة', value:summary.nav,               color:'var(--navy)'},
          {label:'أرباح محققة',        value:summary.realizedProfit,    color: summary.realizedProfit>=0?'#059669':'#dc2626'},
          {label:'توزيعات مستلمة',    value:summary.dividends,         color:'#d97706'},
          {label:'ربح غير محقق',      value:summary.unrealizedProfit,  color: summary.unrealizedProfit>=0?'#0891b2':'#dc2626'},
          {label:'إجمالي المصاريف',   value:summary.totalExpenses,     color:'#dc2626'},
        ].map(card => (
          <div key={card.label} className="stat-card" style={{padding:'0.875rem'}}>
            <p style={{fontSize:'1rem',fontWeight:800,color:card.color,fontFamily:'monospace'}}>{formatCurrency(card.value)}</p>
            <p style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:'2px'}}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Trial Balance Table */}
      <div className="card" style={{overflow:'hidden'}}>
        <div style={{padding:'0.875rem 1.25rem',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{fontWeight:700,fontSize:'0.95rem'}}>جدول الحسابات — القيد المزدوج</h3>
          <div style={{fontSize:'0.72rem',color:'var(--muted)',display:'flex',gap:'1rem'}}>
            <span style={{color:'#2563eb',fontWeight:600}}>م = مدين Debit</span>
            <span style={{color:'#059669',fontWeight:600}}>د = دائن Credit</span>
          </div>
        </div>
        <div className="table-container" style={{borderRadius:0,border:'none'}}>
          <table className="table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>التصنيف</th>
                <th style={{textAlign:'center'}}>مدين (م)</th>
                <th style={{textAlign:'center'}}>دائن (د)</th>
                <th style={{textAlign:'center'}}>الرصيد</th>
                <th style={{textAlign:'center'}}>الجانب</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {TYPES.map(type => {
                const typeEntries = entries.filter(e => e.accountType === type);
                if (typeEntries.length === 0) return null;
                return (
                  <>
                    <tr key={`h-${type}`} style={{background:'#f8fafc'}}>
                      <td colSpan={7} style={{padding:'0.4rem 1rem',fontWeight:700,fontSize:'0.72rem',color:'#64748b',letterSpacing:'0.05em',borderBottom:'1px solid #e2e8f0'}}>
                        {TYPE_LABELS[type]}
                      </td>
                    </tr>
                    {typeEntries.map((entry, i) => (
                      <tr key={`${type}-${i}`}>
                        <td style={{fontWeight:600}}>{entry.account}</td>
                        <td><span className="badge-gray" style={{fontSize:'0.65rem'}}>{entry.accountType}</span></td>
                        <td style={{textAlign:'center',fontWeight:600,color:entry.debit>0?'#2563eb':'#94a3b8',fontFamily:'monospace',fontSize:'0.875rem'}}>
                          {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                        </td>
                        <td style={{textAlign:'center',fontWeight:600,color:entry.credit>0?'#059669':'#94a3b8',fontFamily:'monospace',fontSize:'0.875rem'}}>
                          {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                        </td>
                        <td style={{textAlign:'center',fontWeight:700,fontFamily:'monospace',color:entry.balance>=0?'#1e293b':'#dc2626'}}>
                          {formatCurrency(Math.abs(entry.balance))}
                        </td>
                        <td style={{textAlign:'center'}}>
                          <span style={{
                            display:'inline-flex',alignItems:'center',justifyContent:'center',
                            width:28,height:28,borderRadius:8,fontWeight:800,fontSize:'0.75rem',
                            background:entry.balanceSide==='D'?'#dbeafe':'#dcfce7',
                            color:entry.balanceSide==='D'?'#1d4ed8':'#15803d',
                          }}>
                            {entry.balanceSide==='D'?'م':'د'}
                          </span>
                        </td>
                        <td style={{fontSize:'0.72rem',color:'#64748b'}}>{entry.note}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{fontWeight:800,color:'var(--navy)'}}>الإجمالي</td>
                <td>—</td>
                <td style={{textAlign:'center',fontWeight:900,color:'#2563eb',fontFamily:'monospace',fontSize:'0.95rem'}}>{formatCurrency(totalDebit)}</td>
                <td style={{textAlign:'center',fontWeight:900,color:'#059669',fontFamily:'monospace',fontSize:'0.95rem'}}>{formatCurrency(totalCredit)}</td>
                <td style={{textAlign:'center'}}>
                  {isBalanced
                    ? <span style={{color:'#059669',fontWeight:700,fontSize:'0.8rem'}}>✓ متوازن</span>
                    : <span style={{color:'#dc2626',fontWeight:700,fontSize:'0.8rem'}}>✗ {formatCurrency(Math.abs(totalDebit-totalCredit))}</span>
                  }
                </td>
                <td colSpan={2}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Balance Checks */}
      <div className="card" style={{padding:'1.25rem'}}>
        <h3 className="section-title">فحوصات التوازن المحاسبي</h3>
        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
          {checks.map((check, i) => (
            <div key={i} style={{
              display:'flex',alignItems:'flex-start',justifyContent:'space-between',
              padding:'0.75rem 1rem',borderRadius:'12px',gap:'1rem',
              background: check.pass ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${check.pass ? '#bbf7d0' : '#fecaca'}`,
            }}>
              <div style={{display:'flex',alignItems:'flex-start',gap:'0.625rem',flex:1}}>
                {check.pass
                  ? <CheckCircle size={16} style={{color:'#059669',flexShrink:0,marginTop:1}}/>
                  : <XCircle size={16} style={{color:'#dc2626',flexShrink:0,marginTop:1}}/>
                }
                <span style={{fontSize:'0.82rem',fontWeight:600,color:check.pass?'#166534':'#991b1b'}}>
                  {check.name}
                </span>
              </div>
              <div style={{textAlign:'left',whiteSpace:'nowrap',fontSize:'0.78rem',fontFamily:'monospace'}}>
                {check.pass
                  ? <span style={{color:'#059669',fontWeight:700}}>{formatCurrency(check.expected)}</span>
                  : <span style={{color:'#dc2626'}}>
                      متوقع: {formatCurrency(check.expected)} | فعلي: {formatCurrency(check.actual)} | فرق: {formatCurrency(Math.abs(check.expected-check.actual))}
                    </span>
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accounting Equation */}
      <div className="card" style={{padding:'1.25rem'}}>
        <h3 className="section-title">معادلة الميزانية: الأصول = حقوق الملاك + الأرباح − المصاريف</h3>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:'1rem',alignItems:'stretch'}}>
          <div style={{background:'#eff6ff',borderRadius:'14px',padding:'1rem'}}>
            <p style={{fontWeight:700,color:'#1d4ed8',fontSize:'0.8rem',marginBottom:'0.5rem'}}>الأصول</p>
            {entries.filter(e => e.accountType.startsWith('أصل')).map(e => (
              <div key={e.account} style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',padding:'3px 0',borderBottom:'1px solid #dbeafe'}}>
                <span style={{color:'#475569'}}>{e.account}</span>
                <span style={{fontWeight:600,color:'#2563eb',fontFamily:'monospace'}}>{formatCurrency(e.balance)}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'0.5rem 0 0',marginTop:'4px'}}>
              <span style={{fontWeight:800,color:'#1d4ed8'}}>الإجمالي</span>
              <span style={{fontWeight:900,color:'#1d4ed8',fontFamily:'monospace'}}>
                {formatCurrency(entries.filter(e => e.accountType.startsWith('أصل')).reduce((s,e)=>s+e.balance,0))}
              </span>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem',fontWeight:900,color:'var(--navy)'}}>
            =
          </div>

          <div style={{background:'#f0fdf4',borderRadius:'14px',padding:'1rem'}}>
            <p style={{fontWeight:700,color:'#166534',fontSize:'0.8rem',marginBottom:'0.5rem'}}>حقوق + أرباح − مصاريف</p>
            {entries.filter(e => !e.accountType.startsWith('أصل')).map(e => (
              <div key={e.account} style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',padding:'3px 0',borderBottom:'1px solid #bbf7d0'}}>
                <span style={{color:'#475569'}}>{e.account}</span>
                <span style={{fontWeight:600,fontFamily:'monospace',color:e.accountType==='مصروف'?'#dc2626':'#059669'}}>
                  {e.accountType==='مصروف'?'−':'+'}{formatCurrency(Math.abs(e.balance))}
                </span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'0.5rem 0 0',marginTop:'4px'}}>
              <span style={{fontWeight:800,color:'#166534'}}>الإجمالي</span>
              <span style={{fontWeight:900,color:'#166534',fontFamily:'monospace'}}>
                {formatCurrency(entries.filter(e => !e.accountType.startsWith('أصل')).reduce((s,e) => s+(e.accountType==='مصروف'?-e.balance:e.balance), 0))}
              </span>
            </div>
          </div>
        </div>
        {!isBalanced && (
          <div className="alert-danger" style={{marginTop:'1rem'}}>
            <AlertTriangle size={16} className="shrink-0"/>
            <div>
              <p style={{fontWeight:700}}>الميزان غير متوازن — يوجد خطأ في البيانات</p>
              <p style={{fontSize:'0.8rem',marginTop:4}}>
                الفرق = {formatCurrency(Math.abs(totalDebit-totalCredit))} — راجع بيانات الاستثمارات والمصاريف
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
