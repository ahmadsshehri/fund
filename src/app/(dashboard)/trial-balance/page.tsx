'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { calcPortfolioSnapshot, type PortfolioSnapshot } from '@/lib/accounting';
import { formatCurrency, formatDate } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, Download, Scale, List } from 'lucide-react';

interface LedgerEntry {
  id: string;
  date: Date;
  type: string;
  description: string;
  cashEffect: number;
  runningBalance: number;
}

export default function TrialBalancePage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // جلب صورة المحفظة
      const snap = await calcPortfolioSnapshot();
      setSnapshot(snap);

      // جلب جميع حركات ledger وترتيبها حسب التاريخ
      const ledgerQuery = query(collection(db, 'ledger'), orderBy('date', 'asc'));
      const ledgerSnap = await getDocs(ledgerQuery);
      let running = 0;
      const entries: LedgerEntry[] = [];
      ledgerSnap.docs.forEach(doc => {
        const data = doc.data();
        const cash = data.cashEffect || 0;
        running += cash;
        entries.push({
          id: doc.id,
          date: data.date?.toDate?.() ?? new Date(),
          type: data.type || '?',
          description: data.description || '',
          cashEffect: cash,
          runningBalance: running,
        });
      });
      setLedgerEntries(entries);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exportCSV = () => {
    const rows = [
      ['التاريخ', 'النوع', 'الوصف', 'الأثر النقدي', 'الرصيد التراكمي'],
      ...ledgerEntries.map(e => [
        formatDate(e.date),
        e.type,
        e.description,
        e.cashEffect.toFixed(2),
        e.runningBalance.toFixed(2),
      ]),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `ledger-${new Date().toLocaleDateString('ar-SA')}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري تحميل سجل الحركات...</p>
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
            <Scale size={22} style={{ color: 'var(--navy)' }} /> ميزان المراجعة وسجل الحركات
          </h1>
          <p className="page-subtitle">عرض جميع حركات القيد المزدوج – {new Date().toLocaleDateString('ar-SA')}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={exportCSV} className="btn-secondary" style={{ fontSize: '0.82rem' }}>
            <Download size={14} /> تصدير CSV
          </button>
          <button onClick={load} className="btn-secondary" style={{ padding: '0.5rem 0.75rem' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-danger">
          <span style={{ fontSize: '0.85rem' }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ padding: '1rem' }}>
        <h3 className="section-title" style={{ marginBottom: '1rem' }}>📋 سجل الحركات (Ledger) – كل عملية على حدة</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع الحركة</th>
                <th>الوصف</th>
                <th style={{ textAlign: 'center' }}>الأثر النقدي (ر.س)</th>
                <th style={{ textAlign: 'center' }}>الرصيد التراكمي (ر.س)</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>لا توجد حركات في ledger حتى الآن</td></tr>
              ) : (
                ledgerEntries.map((entry, idx) => (
                  <tr key={entry.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.date)}</td>
                    <td>
                      <span className="badge-gray" style={{ fontSize: '0.7rem' }}>{entry.type}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{entry.description}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: entry.cashEffect >= 0 ? '#059669' : '#dc2626' }}>
                      {entry.cashEffect >= 0 ? '+' : ''}{formatCurrency(entry.cashEffect)}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{formatCurrency(entry.runningBalance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {snapshot && (
        <div className="card" style={{ padding: '1rem' }}>
          <h3 className="section-title" style={{ marginBottom: '1rem' }}>📊 ملخص الميزانية (حسابات مجمعة)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem' }}>
            <div className="stat-card"><p className="text-sm text-slate-500">النقد المتوفر</p><p className="text-xl font-bold">{formatCurrency(snapshot.availableCash)}</p></div>
            <div className="stat-card"><p className="text-sm text-slate-500">رأس مال الملاك</p><p className="text-xl font-bold">{formatCurrency(snapshot.ownerCapitalIn)}</p></div>
            <div className="stat-card"><p className="text-sm text-slate-500">الأرباح المحققة</p><p className="text-xl font-bold">{formatCurrency(snapshot.realizedProfit)}</p></div>
            <div className="stat-card"><p className="text-sm text-slate-500">الأرباح غير المحققة</p><p className="text-xl font-bold">{formatCurrency(snapshot.unrealizedProfit)}</p></div>
            <div className="stat-card"><p className="text-sm text-slate-500">توزيعات مستلمة</p><p className="text-xl font-bold">{formatCurrency(snapshot.dividendsReceived)}</p></div>
            <div className="stat-card"><p className="text-sm text-slate-500">إجمالي المصاريف</p><p className="text-xl font-bold">{formatCurrency(snapshot.totalExpenses)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
