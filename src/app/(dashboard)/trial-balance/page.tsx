'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { calcPortfolioSnapshot, type PortfolioSnapshot } from '@/lib/accounting';
import { formatCurrency } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, Download, Scale } from 'lucide-react';

interface TrialEntry {
  account: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
  balanceSide: 'D' | 'C';
  note?: string;
}

export default function TrialBalancePage() {
  const [entries, setEntries] = useState<TrialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await calcPortfolioSnapshot();
      setSnapshot(snap);

      const e: TrialEntry[] = [];

      // 1. النقد (أصل متداول) - فقط السيولة الحقيقية
      e.push({
        account: 'النقد والسيولة',
        accountType: 'أصل متداول',
        debit: snap.availableCash > 0 ? snap.availableCash : 0,
        credit: 0,
        balance: snap.availableCash,
        balanceSide: 'D',
        note: 'السيولة النقدية المتاحة',
      });

      // 2. الاستثمارات القائمة (أصل غير متداول) - تشمل active و distressed
      if (snap.activeTotalCost > 0) {
        e.push({
          account: 'الاستثمارات القائمة (بالتكلفة)',
          accountType: 'أصل غير متداول',
          debit: snap.activeTotalCost,
          credit: 0,
          balance: snap.activeTotalCost,
          balanceSide: 'D',
          note: `${snap.activeCount + snap.distressedCount} استثمار (قائم + متعثر) - التكلفة الإجمالية`,
        });
      }

      // 3. فرق إعادة التقييم (الأرباح غير المحققة)
      if (snap.unrealizedProfit > 0) {
        e.push({
          account: 'فرق إعادة التقييم',
          accountType: 'أصل / تسوية',
          debit: snap.unrealizedProfit,
          credit: 0,
          balance: snap.unrealizedProfit,
          balanceSide: 'D',
          note: `القيمة السوقية - التكلفة (أرباح غير محققة)`,
        });
      }

      // 4. رأس المال (حقوق ملك)
      e.push({
        account: 'رأس مال الملاك',
        accountType: 'حقوق ملاك',
        debit: 0,
        credit: snap.ownerCapitalIn,
        balance: snap.ownerCapitalIn,
        balanceSide: 'C',
        note: 'إجمالي رأس المال المدخل',
      });

      // 5. الأرباح المحققة من التخارجات
      if (snap.realizedProfit !== 0) {
        e.push({
          account: 'الأرباح المحققة من التخارجات',
          accountType: 'إيراد محقق',
          debit: snap.realizedProfit < 0 ? -snap.realizedProfit : 0,
          credit: snap.realizedProfit > 0 ? snap.realizedProfit : 0,
          balance: snap.realizedProfit,
          balanceSide: snap.realizedProfit >= 0 ? 'C' : 'D',
          note: 'أرباح تم تحقيقها نقداً من بيع استثمارات',
        });
      }

      // 6. الأرباح الموزعة المستلمة (إيراد نقدي)
      if (snap.dividendsReceived > 0) {
        e.push({
          account: 'الأرباح الموزعة المستلمة',
          accountType: 'إيراد نقدي',
          debit: 0,
          credit: snap.dividendsReceived,
          balance: snap.dividendsReceived,
          balanceSide: 'C',
          note: 'توزيعات نقدية استلمت من استثمارات (دخل نقدي)',
        });
      }

      // 7. الأرباح غير المحققة (إيراد غير محقق) - تقابل فرق إعادة التقييم
      if (snap.unrealizedProfit > 0) {
        e.push({
          account: 'الأرباح غير المحققة (تقييم)',
          accountType: 'إيراد غير محقق',
          debit: 0,
          credit: snap.unrealizedProfit,
          balance: snap.unrealizedProfit,
          balanceSide: 'C',
          note: 'زيادة قيمة الأصول القائمة (لم تتحقق نقداً)',
        });
      }

      // 8. المصاريف
      if (snap.totalExpenses > 0) {
        e.push({
          account: 'المصاريف',
          accountType: 'مصروف',
          debit: snap.totalExpenses,
          credit: 0,
          balance: snap.totalExpenses,
          balanceSide: 'D',
          note: 'مصاريف معتمدة (زكاة، رسوم، إلخ)',
        });
      }

      // 9. إذا كان هناك سحوبات ملاك
      if (snap.ownerCapitalOut > 0) {
        e.push({
          account: 'سحوبات الملاك',
          accountType: 'حقوق ملاك (سالب)',
          debit: 0,
          credit: snap.ownerCapitalOut,
          balance: snap.ownerCapitalOut,
          balanceSide: 'C',
          note: 'سحوبات نقدية من قبل الملاك',
        });
      }

      setEntries(e.filter(ent => Math.abs(ent.debit) > 0.01 || Math.abs(ent.credit) > 0.01));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري بناء الميزان...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scale size={22} style={{ color: 'var(--navy)' }} /> ميزان المراجعة
          </h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{
        padding: '1rem 1.25rem', borderRadius: '16px', color: '#fff',
        background: isBalanced ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isBalanced ? <CheckCircle size={24} /> : <XCircle size={24} />}
          <div>
            <p style={{ fontWeight: 800, fontSize: '1rem' }}>{isBalanced ? '✓ الميزان متوازن' : '✗ الميزان غير متوازن'}</p>
            <p style={{ fontSize: '0.75rem', opacity: .85 }}>
              {isBalanced ? `مدين = دائن = ${formatCurrency(totalDebit)}` : `الفرق = ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,auto)', gap: '1.5rem', textAlign: 'center' }}>
          <div><p style={{ fontSize: '0.65rem', opacity: .75 }}>إجمالي مدين</p><p style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCurrency(totalDebit)}</p></div>
          <div><p style={{ fontSize: '0.65rem', opacity: .75 }}>إجمالي دائن</p><p style={{ fontWeight: 800, fontSize: '0.9rem' }}>{formatCurrency(totalCredit)}</p></div>
        </div>
      </div>

      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div className="stat-card"><p className="text-sm text-slate-500">النقد المتوفر</p><p className="text-xl font-bold text-green-600">{formatCurrency(snapshot.availableCash)}</p></div>
          <div className="stat-card"><p className="text-sm text-slate-500">قيمة الاستثمارات القائمة (بالقيمة السوقية)</p><p className="text-xl font-bold text-blue-600">{formatCurrency(snapshot.activeCurrentValue)}</p></div>
          <div className="stat-card"><p className="text-sm text-slate-500">أصول متعثرة ضمن القائمة</p><p className="text-xl font-bold text-orange-600">{snapshot.distressedCount}</p></div>
          <div className="stat-card"><p className="text-sm text-slate-500">صافي قيمة المحفظة</p><p className="text-xl font-bold">{formatCurrency(snapshot.netPortfolioValue)}</p></div>
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>جدول الحسابات — القيد المزدوج</h3>
        </div>
        <div className="table-container overflow-x-auto">
          <table className="table min-w-[800px]">
            <thead><tr><th>الحساب</th><th>التصنيف</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>الجانب</th><th>ملاحظات</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{e.account}</td>
                  <td><span className="badge-gray text-xs">{e.accountType}</span></td>
                  <td style={{ textAlign: 'center', color: '#2563eb' }}>{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td>
                  <td style={{ textAlign: 'center', color: '#059669' }}>{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{formatCurrency(Math.abs(e.balance))}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: e.balanceSide === 'D' ? '#dbeafe' : '#dcfce7', padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>
                      {e.balanceSide === 'D' ? 'مدين' : 'دائن'}
                    </span>
                  </td>
                  <td className="text-xs">{e.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 800 }}>الإجمالي</td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#2563eb' }}>{formatCurrency(totalDebit)}</td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#059669' }}>{formatCurrency(totalCredit)}</td>
                <td colSpan={3}>{isBalanced ? '✓ متوازن' : `✗ فرق ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}</td>
              </tr>
            </tfoot>
           </table>
        </div>
      </div>
    </div>
  );
}
