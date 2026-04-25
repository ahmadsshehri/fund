'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

interface BalanceCheck {
  name: string;
  expected: number;
  actual: number;
  pass: boolean;
}

export default function TrialBalancePage() {
  const [entries, setEntries] = useState<TrialEntry[]>([]);
  const [checks, setChecks] = useState<BalanceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      // استخدام الدالة الصحيحة من accounting.ts
      const snap = await calcPortfolioSnapshot();
      setSnapshot(snap);

      // بناء قيود الميزانية بشكل صحيح
      const e: TrialEntry[] = [];

      // ─── 1. الأصول المتداولة (النقد فقط) ───
      e.push({
        account: 'النقد والسيولة',
        accountType: 'أصل متداول',
        debit: snap.availableCash > 0 ? snap.availableCash : 0,
        credit: snap.availableCash < 0 ? Math.abs(snap.availableCash) : 0,
        balance: snap.availableCash,
        balanceSide: snap.availableCash >= 0 ? 'D' : 'C',
        note: `النقد المتوفر = ${formatCurrency(snap.availableCash)}`,
      });

      // ─── 2. الأصول غير المتداولة (الاستثمارات القائمة بالتكلفة) ───
      if (snap.activeTotalCost > 0) {
        e.push({
          account: 'الاستثمارات القائمة (بالتكلفة)',
          accountType: 'أصل غير متداول',
          debit: snap.activeTotalCost,
          credit: 0,
          balance: snap.activeTotalCost,
          balanceSide: 'D',
          note: `${snap.activeCount} استثمار - التكلفة الإجمالية`,
        });
      }

      // ─── 3. تسوية التقييم (الأرباح غير المحققة) ───
      if (Math.abs(snap.unrealizedProfit) > 0.01) {
        e.push({
          account: 'فرق إعادة التقييم',
          accountType: 'أصل / تسوية',
          debit: snap.unrealizedProfit > 0 ? snap.unrealizedProfit : 0,
          credit: snap.unrealizedProfit < 0 ? Math.abs(snap.unrealizedProfit) : 0,
          balance: snap.unrealizedProfit,
          balanceSide: snap.unrealizedProfit >= 0 ? 'D' : 'C',
          note: `القيمة السوقية ${formatCurrency(snap.activeCurrentValue)} - التكلفة ${formatCurrency(snap.activeTotalCost)}`,
        });
      }

      // ─── 4. حقوق الملاك ───
      e.push({
        account: 'رأس مال الملاك',
        accountType: 'حقوق ملاك',
        debit: 0,
        credit: snap.ownerCapitalIn,
        balance: snap.ownerCapitalIn,
        balanceSide: 'C',
        note: `إجمالي رأس المال المدخل`,
      });

      // ─── 5. الأرباح المحققة من التخارجات ───
      if (Math.abs(snap.realizedProfit) > 0.01) {
        e.push({
          account: 'الأرباح المحققة من التخارجات',
          accountType: 'إيراد محقق',
          debit: snap.realizedProfit < 0 ? Math.abs(snap.realizedProfit) : 0,
          credit: snap.realizedProfit > 0 ? snap.realizedProfit : 0,
          balance: snap.realizedProfit,
          balanceSide: snap.realizedProfit >= 0 ? 'C' : 'D',
          note: `متحصلات ${formatCurrency(snap.exitProceeds)} - تكلفة ${formatCurrency(snap.closedTotalCost)}`,
        });
      }

      // ─── 6. الأرباح الموزعة المستلمة (إيراد نقدي) ───
      if (snap.dividendsReceived > 0) {
        e.push({
          account: 'الأرباح الموزعة المستلمة',
          accountType: 'إيراد نقدي',
          debit: 0,
          credit: snap.dividendsReceived,
          balance: snap.dividendsReceived,
          balanceSide: 'C',
          note: 'توزيعات نقدية مستلمة من الاستثمارات',
        });
      }

      // ─── 7. المصاريف ───
      if (snap.totalExpenses > 0) {
        e.push({
          account: 'المصاريف (زكاة وإدارية)',
          accountType: 'مصروف',
          debit: snap.totalExpenses,
          credit: 0,
          balance: snap.totalExpenses,
          balanceSide: 'D',
          note: 'مصاريف معتمدة - تقلل النقد',
        });
      }

      // ─── 8. سحوبات الملاك (إذا وجدت) ───
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

      setEntries(e);

      // ─── فحوصات التوازن ───
      const totalDebit = e.reduce((s, x) => s + x.debit, 0);
      const totalCredit = e.reduce((s, x) => s + x.credit, 0);

      const totalAssets = e
        .filter((x) => x.accountType.startsWith('أصل'))
        .reduce((s, x) => s + Math.abs(x.balance), 0);

      const totalEquityAndIncome = e
        .filter((x) => !x.accountType.startsWith('أصل'))
        .reduce((s, x) => {
          if (x.accountType === 'مصروف') return s - Math.abs(x.balance);
          if (x.accountType === 'حقوق ملاك (سالب)') return s - Math.abs(x.balance);
          return s + Math.abs(x.balance);
        }, 0);

      setChecks([
        {
          name: 'توازن القيد المزدوج (مدين = دائن)',
          expected: totalDebit,
          actual: totalCredit,
          pass: Math.abs(totalDebit - totalCredit) < 0.01,
        },
        {
          name: 'الأصول = حقوق الملاك + الإيرادات - المصاريف - السحوبات',
          expected: totalAssets,
          actual: totalEquityAndIncome,
          pass: Math.abs(totalAssets - totalEquityAndIncome) < 0.01,
        },
        {
          name: 'صحة النقد المتوفر',
          expected: snap.availableCash,
          actual:
            snap.ownerCapitalIn +
            snap.realizedProfit +
            snap.dividendsReceived -
            snap.totalExpenses -
            snap.ownerCapitalOut,
          pass: Math.abs(snap.availableCash - (snap.ownerCapitalIn + snap.realizedProfit + snap.dividendsReceived - snap.totalExpenses - snap.ownerCapitalOut)) < 0.01,
        },
        {
          name: 'صافي قيمة المحفظة = نقد + قيمة الأصول القائمة',
          expected: snap.netPortfolioValue,
          actual: snap.availableCash + snap.activeCurrentValue,
          pass: Math.abs(snap.netPortfolioValue - (snap.availableCash + snap.activeCurrentValue)) < 0.01,
        },
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
  const passCount = checks.filter((c) => c.pass).length;

  const exportCSV = () => {
    const rows = [
      ['الحساب', 'التصنيف', 'مدين', 'دائن', 'الرصيد', 'الجانب', 'ملاحظات'],
      ...entries.map((e) => [
        e.account,
        e.accountType,
        e.debit.toFixed(2),
        e.credit.toFixed(2),
        e.balance.toFixed(2),
        e.balanceSide === 'D' ? 'مدين' : 'دائن',
        e.note || '',
      ]),
      [],
      ['الإجمالي', '', totalDebit.toFixed(2), totalCredit.toFixed(2), '', '', ''],
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `ميزان-مراجعة-${new Date().toLocaleDateString('ar-SA')}.csv`;
    a.click();
  };

  const ACCOUNT_TYPES = ['أصل متداول', 'أصل غير متداول', 'أصل / تسوية', 'حقوق ملاك', 'حقوق ملاك (سالب)', 'إيراد محقق', 'إيراد نقدي', 'مصروف'];

  const TYPE_LABELS: Record<string, string> = {
    'أصل متداول': '📦 الأصول المتداولة',
    'أصل غير متداول': '🏗️ الأصول غير المتداولة',
    'أصل / تسوية': '⚖️ تسويات التقييم',
    'حقوق ملاك': '👤 حقوق الملاك',
    'حقوق ملاك (سالب)': '🔻 سحوبات الملاك',
    'إيراد محقق': '✅ الأرباح المحققة',
    'إيراد نقدي': '💰 الإيرادات النقدية',
    'مصروف': '📤 المصاريف',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #e2e8f0',
              borderTopColor: 'var(--navy)',
              borderRadius: '50%',
              margin: '0 auto 12px',
              animation: 'spin 0.7s linear infinite',
            }}
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري بناء ميزان المراجعة...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scale size={22} style={{ color: 'var(--navy)' }} /> ميزان المراجعة
          </h1>
          <p className="page-subtitle">
            نظام القيد المزدوج — {new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} className="btn-secondary" style={{ fontSize: '0.82rem' }}>
            <Download size={14} /> تصدير
          </button>
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Balance Banner */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '16px',
          color: '#fff',
          background: isBalanced ? 'linear-gradient(135deg,#059669,#10b981)' : 'linear-gradient(135deg,#dc2626,#ef4444)',
          boxShadow: isBalanced ? '0 4px 16px rgba(5,150,105,.3)' : '0 4px 16px rgba(220,38,38,.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isBalanced ? <CheckCircle size={24} /> : <XCircle size={24} />}
          <div>
            <p style={{ fontWeight: 800, fontSize: '1rem' }}>{isBalanced ? '✓ الميزان متوازن' : '✗ الميزان غير متوازن'}</p>
            <p style={{ fontSize: '0.75rem', opacity: 0.85 }}>
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
            <div key={k}>
              <p style={{ fontSize: '0.65rem', opacity: 0.75 }}>{k}</p>
              <p style={{ fontWeight: 800, fontSize: '0.9rem' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
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
          ].map((card) => (
            <div key={card.label} className="stat-card" style={{ padding: '0.875rem' }}>
              <p style={{ fontSize: '1rem', fontWeight: 800, color: card.color, fontFamily: 'monospace' }}>{formatCurrency(card.value)}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trial Balance Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontWeight: 700, fontSize: '0.95rem' }}>جدول الحسابات — القيد المزدوج</h3>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'flex', gap: '1rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 600 }}>م = مدين Debit</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>د = دائن Credit</span>
          </div>
        </div>
        <div className="table-container" style={{ borderRadius: 0, border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>الحساب</th>
                <th>التصنيف</th>
                <th style={{ textAlign: 'center' }}>مدين (م)</th>
                <th style={{ textAlign: 'center' }}>دائن (د)</th>
                <th style={{ textAlign: 'center' }}>الرصيد</th>
                <th style={{ textAlign: 'center' }}>الجانب</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_TYPES.map((type) => {
                const typeEntries = entries.filter((e) => e.accountType === type);
                if (typeEntries.length === 0) return null;
                return (
                  <>
                    <tr key={`h-${type}`} style={{ background: '#f8fafc' }}>
                      <td
                        colSpan={7}
                        style={{
                          padding: '0.4rem 1rem',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                          color: '#64748b',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        {TYPE_LABELS[type]}
                      </td>
                    </tr>
                    {typeEntries.map((entry, i) => (
                      <tr key={`${type}-${i}`}>
                        <td style={{ fontWeight: 600 }}>{entry.account}</td>
                        <td>
                          <span className="badge-gray" style={{ fontSize: '0.65rem' }}>
                            {entry.accountType}
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 600,
                            color: entry.debit > 0 ? '#2563eb' : '#94a3b8',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                          }}
                        >
                          {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 600,
                            color: entry.credit > 0 ? '#059669' : '#94a3b8',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                          }}
                        >
                          {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: entry.balance >= 0 ? '#1e293b' : '#dc2626',
                          }}
                        >
                          {formatCurrency(Math.abs(entry.balance))}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              background: entry.balanceSide === 'D' ? '#dbeafe' : '#dcfce7',
                              color: entry.balanceSide === 'D' ? '#1d4ed8' : '#15803d',
                            }}
                          >
                            {entry.balanceSide === 'D' ? 'م' : 'د'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.72rem', color: '#64748b' }}>{entry.note}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 800, color: 'var(--navy)' }}>الإجمالي</td>
                <td>—</td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#2563eb', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatCurrency(totalDebit)}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 900, color: '#059669', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatCurrency(totalCredit)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {isBalanced ? (
                    <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.8rem' }}>✓ متوازن</span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.8rem' }}>✗ {formatCurrency(Math.abs(totalDebit - totalCredit))}</span>
                  )}
                </td>
                <td colSpan={2}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Balance Checks */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 className="section-title">فحوصات التوازن المحاسبي</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {checks.map((check, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                gap: '1rem',
                background: check.pass ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${check.pass ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', flex: 1 }}>
                {check.pass ? (
                  <CheckCircle size={16} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                )}
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: check.pass ? '#166534' : '#991b1b' }}>{check.name}</span>
              </div>
              <div style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                {check.pass ? (
                  <span style={{ color: '#059669', fontWeight: 700 }}>{formatCurrency(check.expected)}</span>
                ) : (
                  <span style={{ color: '#dc2626' }}>
                    متوقع: {formatCurrency(check.expected)} | فعلي: {formatCurrency(check.actual)} | فرق: {formatCurrency(Math.abs(check.expected - check.actual))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accounting Equation */}
      {snapshot && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 className="section-title">معادلة الميزانية: الأصول = حقوق الملاك + الإيرادات - المصاريف - السحوبات</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'stretch' }}>
            <div style={{ background: '#eff6ff', borderRadius: '14px', padding: '1rem' }}>
              <p style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.8rem', marginBottom: '0.5rem' }}>الأصول</p>
              {entries
                .filter((e) => e.accountType.startsWith('أصل'))
                .map((e) => (
                  <div key={e.account} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '3px 0', borderBottom: '1px solid #dbeafe' }}>
                    <span style={{ color: '#475569' }}>{e.account}</span>
                    <span style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(Math.abs(e.balance))}</span>
                  </div>
                ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0', marginTop: '4px' }}>
                <span style={{ fontWeight: 800, color: '#1d4ed8' }}>الإجمالي</span>
                <span style={{ fontWeight: 900, color: '#1d4ed8', fontFamily: 'monospace' }}>
                  {formatCurrency(entries.filter((e) => e.accountType.startsWith('أصل')).reduce((s, e) => s + Math.abs(e.balance), 0))}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: 'var(--navy)' }}>=</div>

            <div style={{ background: '#f0fdf4', borderRadius: '14px', padding: '1rem' }}>
              <p style={{ fontWeight: 700, color: '#166534', fontSize: '0.8rem', marginBottom: '0.5rem' }}>حقوق + أرباح − مصاريف − سحوبات</p>
              {entries
                .filter((e) => !e.accountType.startsWith('أصل'))
                .map((e) => (
                  <div key={e.account} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '3px 0', borderBottom: '1px solid #bbf7d0' }}>
                    <span style={{ color: '#475569' }}>{e.account}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        color: e.accountType === 'مصروف' || e.accountType === 'حقوق ملاك (سالب)' ? '#dc2626' : '#059669',
                      }}
                    >
                      {e.accountType === 'مصروف' || e.accountType === 'حقوق ملاك (سالب)' ? '−' : '+'}
                      {formatCurrency(Math.abs(e.balance))}
                    </span>
                  </div>
                ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0', marginTop: '4px' }}>
                <span style={{ fontWeight: 800, color: '#166534' }}>الإجمالي</span>
                <span style={{ fontWeight: 900, color: '#166534', fontFamily: 'monospace' }}>
                  {formatCurrency(
                    entries
                      .filter((e) => !e.accountType.startsWith('أصل'))
                      .reduce((s, e) => {
                        if (e.accountType === 'مصروف' || e.accountType === 'حقوق ملاك (سالب)') return s - Math.abs(e.balance);
                        return s + Math.abs(e.balance);
                      }, 0),
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
