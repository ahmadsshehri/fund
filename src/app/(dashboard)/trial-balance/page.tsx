'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { calcPortfolioSnapshot, type PortfolioSnapshot } from '@/lib/accounting';
import { formatCurrency } from '@/lib/utils';
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

export default function TrialBalancePage() {
  const [entries, setEntries] = useState<TrialEntry[]>([]);
  const [checks, setChecks] = useState<{ name: string; expected: number; actual: number; pass: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await calcPortfolioSnapshot();
      setSnapshot(snap);

      const e: TrialEntry[] = [];

      // 1. النقد (أصل متداول)
      e.push({
        account: 'النقد والسيولة',
        accountType: 'أصل متداول',
        debit: snap.availableCash > 0 ? snap.availableCash : 0,
        credit: 0,
        balance: snap.availableCash,
        balanceSide: 'D',
        note: `رصيد نقدي`,
      });

      // 2. الاستثمارات القائمة (بالتكلفة) - أصل غير متداول
      if (snap.activeTotalCost > 0) {
        e.push({
          account: 'الاستثمارات القائمة (بالتكلفة)',
          accountType: 'أصل غير متداول',
          debit: snap.activeTotalCost,
          credit: 0,
          balance: snap.activeTotalCost,
          balanceSide: 'D',
          note: `${snap.activeCount} استثمار`,
        });
      }

      // 3. فرق إعادة التقييم (الأرباح غير المحققة كأصل)
      if (snap.unrealizedProfit > 0) {
        e.push({
          account: 'فرق إعادة التقييم',
          accountType: 'أصل / تسوية',
          debit: snap.unrealizedProfit,
          credit: 0,
          balance: snap.unrealizedProfit,
          balanceSide: 'D',
          note: `القيمة السوقية - التكلفة`,
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
        note: `إجمالي رأس المال`,
      });

      // 5. الأرباح المحققة من التخارجات (إيراد محقق)
      if (snap.realizedProfit !== 0) {
        e.push({
          account: 'الأرباح المحققة من التخارجات',
          accountType: 'إيراد محقق',
          debit: snap.realizedProfit < 0 ? -snap.realizedProfit : 0,
          credit: snap.realizedProfit > 0 ? snap.realizedProfit : 0,
          balance: snap.realizedProfit,
          balanceSide: snap.realizedProfit >= 0 ? 'C' : 'D',
          note: `متحصلات - تكلفة`,
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
          note: 'توزيعات نقدية مستلمة',
        });
      }

      // 7. الأرباح غير المحققة (إيراد غير محقق) ← هذا الحساب هو الذي كان مفقوداً!
      if (snap.unrealizedProfit > 0) {
        e.push({
          account: 'الأرباح غير المحققة (تقييم)',
          accountType: 'إيراد غير محقق',
          debit: 0,
          credit: snap.unrealizedProfit,
          balance: snap.unrealizedProfit,
          balanceSide: 'C',
          note: 'زيادة قيمة الأصول القائمة',
        });
      }

      // 8. المصاريف (زكاة وإدارية)
      if (snap.totalExpenses > 0) {
        e.push({
          account: 'المصاريف',
          accountType: 'مصروف',
          debit: snap.totalExpenses,
          credit: 0,
          balance: snap.totalExpenses,
          balanceSide: 'D',
          note: 'مصاريف معتمدة',
        });
      }

      // إزالة أي قيد ليس له رصيد
      const filtered = e.filter(ent => Math.abs(ent.debit) > 0.01 || Math.abs(ent.credit) > 0.01);
      setEntries(filtered);

      // --- فحوصات التوازن ---
      const totalDebit = filtered.reduce((s, x) => s + x.debit, 0);
      const totalCredit = filtered.reduce((s, x) => s + x.credit, 0);
      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

      const totalAssets = filtered
        .filter(x => x.accountType.startsWith('أصل'))
        .reduce((s, x) => s + Math.abs(x.balance), 0);

      const totalEquityAndIncome = filtered
        .filter(x => !x.accountType.startsWith('أصل'))
        .reduce((s, x) => {
          if (x.accountType === 'مصروف') return s - Math.abs(x.balance);
          return s + Math.abs(x.balance);
        }, 0);

      setChecks([
        { name: 'توازن القيد المزدوج (مدين = دائن)', expected: totalDebit, actual: totalCredit, pass: isBalanced },
        { name: 'الأصول = حقوق الملكية + الإيرادات - المصروفات', expected: totalAssets, actual: totalEquityAndIncome, pass: Math.abs(totalAssets - totalEquityAndIncome) < 0.01 },
        { name: 'النقد = رأس المال + أرباح محققة + توزيعات - مصاريف', expected: snap.availableCash, actual: snap.ownerCapitalIn + snap.realizedProfit + snap.dividendsReceived - snap.totalExpenses, pass: Math.abs(snap.availableCash - (snap.ownerCapitalIn + snap.realizedProfit + snap.dividendsReceived - snap.totalExpenses)) < 0.01 },
        { name: 'صافي قيمة المحفظة = نقد + قيمة القائمة', expected: snap.netPortfolioValue, actual: snap.availableCash + snap.activeCurrentValue, pass: Math.abs(snap.netPortfolioValue - (snap.availableCash + snap.activeCurrentValue)) < 0.01 },
      ]);
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
  const passCount = checks.filter(c => c.pass).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري بناء ميزان المراجعة...</p>
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
          <p className="page-subtitle">نظام القيد المزدوج — {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { const csv = entries.map(e => `${e.account},${e.accountType},${e.debit},${e.credit},${e.balance},${e.balanceSide},${e.note || ''}`).join('\n'); navigator.clipboard.writeText(csv); alert('تم نسخ الجدول'); }} className="btn-secondary" style={{ fontSize: '0.82rem' }}><Download size={14} /> نسخ</button>
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}><RefreshCw size={15} /></button>
        </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,auto)', gap: '1.5rem', textAlign: 'center' }}>
          {[
            ['إجمالي مدين', formatCurrency(totalDebit)],
            ['إجمالي دائن', formatCurrency(totalCredit)],
            [`فحوصات ناجحة`, `${passCount}/${checks.length}`],
          ].map(([k, v]) => (
            <div key={k}><p style={{ fontSize: '0.65rem', opacity: .75 }}>{k}</p><p style={{ fontWeight: 800, fontSize: '0.9rem' }}>{v}</p></div>
          ))}
        </div>
      </div>

      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'رأس مال الملاك', value: snapshot.ownerCapitalIn, color: '#2563eb' },
            { label: 'النقد المتوفر', value: snapshot.availableCash, color: snapshot.availableCash >= 0 ? '#059669' : '#dc2626' },
            { label: 'قيمة المحفظة القائمة', value: snapshot.activeCurrentValue, color: '#0891b2' },
            { label: 'صافي قيمة المحفظة', value: snapshot.netPortfolioValue, color: 'var(--navy)' },
            { label: 'أرباح محققة', value: snapshot.realizedProfit, color: snapshot.realizedProfit >= 0 ? '#059669' : '#dc2626' },
            { label: 'توزيعات مستلمة', value: snapshot.dividendsReceived, color: '#d97706' },
            { label: 'أرباح غير محققة', value: snapshot.unrealizedProfit, color: snapshot.unrealizedProfit >= 0 ? '#0891b2' : '#dc2626' },
            { label: 'إجمالي المصاريف', value: snapshot.totalExpenses, color: '#dc2626' },
          ].map(card => (
            <div key={card.label} className="stat-card" style={{ padding: '0.875rem' }}>
              <p style={{ fontSize: '1rem', fontWeight: 800, color: card.color, fontFamily: 'monospace' }}>{formatCurrency(card.value)}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>{card.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>جدول الحسابات — القيد المزدوج</h3>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>الحساب</th><th>التصنيف</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th>الجانب</th><th>ملاحظات</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{e.account}</td>
                  <td><span className="badge-gray" style={{ fontSize: '0.65rem' }}>{e.accountType}</span></td>
                  <td style={{ textAlign: 'center', color: '#2563eb' }}>{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td>
                  <td style={{ textAlign: 'center', color: '#059669' }}>{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{formatCurrency(Math.abs(e.balance))}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: e.balanceSide === 'D' ? '#dbeafe' : '#dcfce7', padding: '4px 10px', borderRadius: 8, fontWeight: 700 }}>
                      {e.balanceSide === 'D' ? 'مدين' : 'دائن'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.72rem', color: '#64748b' }}>{e.note}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan={2} style={{ fontWeight: 800 }}>الإجمالي</td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#2563eb' }}>{formatCurrency(totalDebit)}</td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#059669' }}>{formatCurrency(totalCredit)}</td>
                <td colSpan={3}>{isBalanced ? '✓ متوازن' : `✗ فرق ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 className="section-title">فحوصات التوازن المحاسبي</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {checks.map((check, i) => (
            <div key={i} style={{ padding: '0.75rem 1rem', borderRadius: '12px', background: check.pass ? '#f0fdf4' : '#fef2f2', border: `1px solid ${check.pass ? '#bbf7d0' : '#fecaca'}`, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {check.pass ? <CheckCircle size={16} style={{ color: '#059669' }} /> : <XCircle size={16} style={{ color: '#dc2626' }} />}
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{check.name}</span>
              </div>
              <div>{check.pass ? <span style={{ color: '#059669' }}>{formatCurrency(check.expected)}</span> : <span style={{ color: '#dc2626' }}>متوقع: {formatCurrency(check.expected)} | فعلي: {formatCurrency(check.actual)}</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
