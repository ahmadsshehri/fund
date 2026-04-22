'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy, query, Timestamp, writeBatch, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils';
import {
  Plus, Search, Edit2, Eye, X, Save, AlertCircle, RefreshCw,
  TrendingUp, DollarSign, CheckCircle, XCircle,
  Lock, Activity, PlusCircle, BarChart2, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type InvStatus = 'active' | 'closed' | 'distressed';

interface ValueUpdate {
  id: string; date: Date; previousValue: number;
  newValue: number; profit: number; notes: string;
}

interface Investment {
  id: string; investmentNumber: string; name: string; entity: string;
  entryDate: Date; entryAmount: number; currentValue: number;
  totalProfit: number; annualReturn: number; status: InvStatus;
  closingDate?: Date; closingAmount?: number;
  distressReason?: string; distressDate?: Date; notes: string;
  valueUpdates: ValueUpdate[];
  additionalAmounts: { date: Date; amount: number; notes: string }[];
  createdAt: Date;
}

const STATUS_LABELS: Record<InvStatus, string> = { active: 'قائم', closed: 'مغلق', distressed: 'متعثر' };
const STATUS_COLORS: Record<InvStatus, string> = { active: 'badge-green', closed: 'badge-blue', distressed: 'badge-red' };
const STATUS_ICONS: Record<InvStatus, React.ReactNode> = {
  active: <Activity size={14} />, closed: <CheckCircle size={14} />, distressed: <XCircle size={14} />,
};

const toDate = (v: unknown): Date => {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v as string);
};
const calcDuration = (from: Date, to?: Date) =>
  Math.round(((to || new Date()).getTime() - from.getTime()) / 86400000);
const calcAnnualReturn = (profit: number, invested: number, days: number) =>
  !invested || !days ? 0 : (profit / invested / (days / 365)) * 100;

const EMPTY_FORM = {
  name: '', entity: '', entryDate: '', entryAmount: '',
  status: 'active' as InvStatus, notes: '',
  distressReason: '', distressDate: '', closingDate: '', closingAmount: '',
};

export default function InvestmentsPage() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [editInv, setEditInv] = useState<Investment | null>(null);
  const [showDetail, setShowDetail] = useState<Investment | null>(null);
  const [showClose, setShowClose] = useState<Investment | null>(null);
  const [showAddCapital, setShowAddCapital] = useState<Investment | null>(null);
  const [showAddProfit, setShowAddProfit] = useState<Investment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Investment | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [closeForm, setCloseForm] = useState({ closingDate: '', closingAmount: '' });
  const [capitalForm, setCapitalForm] = useState({ date: '', amount: '', notes: '' });
  const [profitForm, setProfitForm] = useState({ date: '', newValue: '', notes: '' });

  // ─── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'investments'), orderBy('createdAt', 'desc')));
      setInvestments(snap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id, investmentNumber: v.investmentNumber || '',
          name: v.name || '', entity: v.entity || '',
          entryDate: toDate(v.entryDate), entryAmount: v.entryAmount || 0,
          currentValue: v.currentValue || v.entryAmount || 0,
          totalProfit: v.totalProfit || 0, annualReturn: v.annualReturn || 0,
          status: v.status || 'active',
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          closingAmount: v.closingAmount,
          distressReason: v.distressReason, distressDate: v.distressDate ? toDate(v.distressDate) : undefined,
          notes: v.notes || '',
          valueUpdates: (v.valueUpdates || []).map((u: Record<string, unknown>) => ({ ...u, date: toDate(u.date) })),
          additionalAmounts: (v.additionalAmounts || []).map((a: Record<string, unknown>) => ({ ...a, date: toDate(a.date) })),
          createdAt: toDate(v.createdAt),
        };
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = investments.filter(inv =>
    (inv.name.toLowerCase().includes(search.toLowerCase()) || inv.entity.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || inv.status === statusFilter)
  );

  // ─── Open edit ───────────────────────────────────────────────────────────────
  const openEdit = (inv: Investment) => {
    setEditInv(inv);
    setForm({
      name: inv.name, entity: inv.entity,
      entryDate: inv.entryDate.toISOString().split('T')[0],
      entryAmount: String(inv.entryAmount),
      status: inv.status, notes: inv.notes,
      distressReason: inv.distressReason || '',
      distressDate: inv.distressDate ? inv.distressDate.toISOString().split('T')[0] : '',
      closingDate: inv.closingDate ? inv.closingDate.toISOString().split('T')[0] : '',
      closingAmount: inv.closingAmount ? String(inv.closingAmount) : '',
    });
    setError(''); setShowAdd(true);
  };

  // ─── Save (add or edit) ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name || !form.entity || !form.entryDate || !form.entryAmount) {
      setError('يرجى تعبئة الحقول المطلوبة'); return;
    }
    setSaving(true); setError('');
    try {
      const entryAmount = parseFloat(form.entryAmount);
      const entryDate = new Date(form.entryDate);
      let closingDate, closingAmount, totalProfit, annualReturn, distressDate;

      if (form.status === 'closed' && form.closingDate && form.closingAmount) {
        closingDate = Timestamp.fromDate(new Date(form.closingDate));
        closingAmount = parseFloat(form.closingAmount);
        totalProfit = closingAmount - entryAmount;
        annualReturn = calcAnnualReturn(totalProfit, entryAmount, calcDuration(entryDate, new Date(form.closingDate)));
      }
      if (form.status === 'distressed' && form.distressDate) {
        distressDate = Timestamp.fromDate(new Date(form.distressDate));
      }

      const data: Record<string, unknown> = {
        name: form.name, entity: form.entity,
        entryDate: Timestamp.fromDate(entryDate), entryAmount,
        status: form.status, notes: form.notes,
        closingDate: closingDate || null, closingAmount: closingAmount || null,
        totalProfit: totalProfit || 0,
        annualReturn: annualReturn || 0,
        distressReason: form.distressReason || null,
        distressDate: distressDate || null,
      };

      if (editInv) {
        // Edit existing
        await updateDoc(doc(db, 'investments', editInv.id), data);
      } else {
        // Add new
        const num = `INV-${String(investments.length + 1).padStart(4, '0')}`;
        await addDoc(collection(db, 'investments'), {
          ...data, investmentNumber: num,
          currentValue: closingAmount || entryAmount,
          valueUpdates: [], additionalAmounts: [],
          createdAt: serverTimestamp(), createdBy: user?.id,
        });
        // Cash flow
        await addDoc(collection(db, 'cashFlows'), {
          type: 'investment_out', date: Timestamp.fromDate(entryDate),
          amount: -entryAmount, description: `دخول استثمار: ${form.name}`,
          createdBy: user?.id, createdAt: serverTimestamp(),
        });
        if (form.status === 'closed' && closingDate && closingAmount) {
          await addDoc(collection(db, 'cashFlows'), {
            type: 'investment_return', date: closingDate,
            amount: closingAmount, description: `إغلاق استثمار: ${form.name}`,
            createdBy: user?.id, createdAt: serverTimestamp(),
          });
        }
      }
      setShowAdd(false); setEditInv(null); setForm(EMPTY_FORM);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete (with cascade) ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      // Delete investment document
      batch.delete(doc(db, 'investments', confirmDelete.id));
      // Delete all related cash flows
      const cashSnap = await getDocs(
        query(collection(db, 'cashFlows'), where('referenceId', '==', confirmDelete.id))
      );
      cashSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setConfirmDelete(null);
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Close investment ────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!showClose || !closeForm.closingDate || !closeForm.closingAmount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const closingAmount = parseFloat(closeForm.closingAmount);
      const closingDate = new Date(closeForm.closingDate);
      const totalProfit = closingAmount - showClose.entryAmount;
      const annualReturn = calcAnnualReturn(totalProfit, showClose.entryAmount, calcDuration(showClose.entryDate, closingDate));
      await updateDoc(doc(db, 'investments', showClose.id), {
        status: 'closed', closingDate: Timestamp.fromDate(closingDate),
        closingAmount, totalProfit, annualReturn, currentValue: closingAmount,
      });
      await addDoc(collection(db, 'cashFlows'), {
        type: 'investment_return', date: Timestamp.fromDate(closingDate),
        amount: closingAmount, referenceId: showClose.id,
        description: `إغلاق استثمار: ${showClose.name}`,
        createdBy: user?.id, createdAt: serverTimestamp(),
      });
      setShowClose(null); setCloseForm({ closingDate: '', closingAmount: '' });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Add capital ─────────────────────────────────────────────────────────────
  const handleAddCapital = async () => {
    if (!showAddCapital || !capitalForm.date || !capitalForm.amount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const amount = parseFloat(capitalForm.amount);
      const inv = showAddCapital;
      const updatedAdditional = [
        ...inv.additionalAmounts.map(a => ({ ...a, date: Timestamp.fromDate(a.date) })),
        { date: Timestamp.fromDate(new Date(capitalForm.date)), amount, notes: capitalForm.notes },
      ];
      await updateDoc(doc(db, 'investments', inv.id), {
        entryAmount: inv.entryAmount + amount,
        currentValue: inv.currentValue + amount,
        additionalAmounts: updatedAdditional,
      });
      await addDoc(collection(db, 'cashFlows'), {
        type: 'investment_out', date: Timestamp.fromDate(new Date(capitalForm.date)),
        amount: -amount, referenceId: inv.id,
        description: `إضافة رأس مال: ${inv.name}`,
        createdBy: user?.id, createdAt: serverTimestamp(),
      });
      setShowAddCapital(null); setCapitalForm({ date: '', amount: '', notes: '' });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Update value ─────────────────────────────────────────────────────────────
  const handleUpdateValue = async () => {
    if (!showAddProfit || !profitForm.date || !profitForm.newValue) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const newValue = parseFloat(profitForm.newValue);
      const inv = showAddProfit;
      const newUpdate = {
        id: Date.now().toString(), date: Timestamp.fromDate(new Date(profitForm.date)),
        previousValue: inv.currentValue, newValue,
        profit: newValue - inv.currentValue, notes: profitForm.notes,
      };
      const totalProfit = newValue - inv.entryAmount;
      const annualReturn = calcAnnualReturn(totalProfit, inv.entryAmount, calcDuration(inv.entryDate));
      await updateDoc(doc(db, 'investments', inv.id), {
        currentValue: newValue, totalProfit, annualReturn,
        valueUpdates: [
          ...inv.valueUpdates.map(u => ({ ...u, date: Timestamp.fromDate(u.date) })),
          newUpdate,
        ],
      });
      setShowAddProfit(null); setProfitForm({ date: '', newValue: '', notes: '' });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  const totalInvested = investments.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0);
  const totalCurrentValue = investments.filter(i => i.status === 'active').reduce((s, i) => s + i.currentValue, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">الاستثمارات</h1>
          <p className="text-slate-500 text-sm mt-0.5">{investments.length} استثمار إجمالاً</p>
        </div>
        <button onClick={() => { setEditInv(null); setForm(EMPTY_FORM); setError(''); setShowAdd(true); }} className="btn-primary">
          <Plus size={16} /> استثمار جديد
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'قائمة', count: investments.filter(i => i.status === 'active').length, color: 'text-green-700', bg: 'bg-green-50', icon: <Activity size={18} className="text-green-600" /> },
          { label: 'مغلقة', count: investments.filter(i => i.status === 'closed').length, color: 'text-blue-700', bg: 'bg-blue-50', icon: <CheckCircle size={18} className="text-blue-600" /> },
          { label: 'متعثرة', count: investments.filter(i => i.status === 'distressed').length, color: 'text-red-700', bg: 'bg-red-50', icon: <XCircle size={18} className="text-red-600" /> },
          { label: 'أرباح محققة', count: null, value: formatCurrency(investments.filter(i => i.status === 'closed').reduce((s, i) => s + i.totalProfit, 0)), color: 'text-purple-700', bg: 'bg-purple-50', icon: <TrendingUp size={18} className="text-purple-600" /> },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <div className={`p-2 ${card.bg} rounded-lg w-fit mb-3`}>{card.icon}</div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.count !== null ? card.count : card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {investments.filter(i => i.status === 'active').length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="stat-card flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-xl"><DollarSign size={22} className="text-blue-600" /></div>
            <div>
              <p className="text-xl font-bold">{formatCurrency(totalInvested)}</p>
              <p className="text-sm text-slate-500">إجمالي رأس المال القائم</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4">
            <div className="p-3 bg-green-50 rounded-xl"><BarChart2 size={22} className="text-green-600" /></div>
            <div>
              <p className="text-xl font-bold text-green-700">{formatCurrency(totalCurrentValue)}</p>
              <p className="text-sm text-slate-500">القيمة الحالية</p>
              {totalCurrentValue > totalInvested && (
                <p className="text-xs text-green-600">+ {formatCurrency(totalCurrentValue - totalInvested)} ربح تراكمي</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="input pr-9" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'closed', 'distressed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th><th>الاستثمار</th><th>الجهة</th><th>تاريخ الدخول</th>
              <th>رأس المال</th><th>القيمة الحالية</th><th>الربح / الخسارة</th>
              <th>العائد السنوي</th><th>المدة</th><th>الحالة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-slate-400">لا توجد استثمارات</td></tr>
            ) : filtered.map(inv => {
              const profit = inv.status === 'closed' ? inv.totalProfit : inv.currentValue - inv.entryAmount;
              const annualRet = inv.status === 'closed'
                ? inv.annualReturn
                : calcAnnualReturn(profit, inv.entryAmount, calcDuration(inv.entryDate));
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-xs text-slate-500">{inv.investmentNumber}</td>
                  <td>
                    <p className="font-medium text-slate-800">{inv.name}</p>
                    {inv.valueUpdates.length > 0 && <p className="text-xs text-blue-500">{inv.valueUpdates.length} تحديث</p>}
                  </td>
                  <td className="text-slate-600 text-sm">{inv.entity}</td>
                  <td className="text-slate-600">{formatDate(inv.entryDate)}</td>
                  <td className="font-semibold text-blue-700">{formatCurrency(inv.entryAmount)}</td>
                  <td className="font-semibold">{formatCurrency(inv.status === 'closed' ? inv.closingAmount || 0 : inv.currentValue)}</td>
                  <td className={profit >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                    {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                  </td>
                  <td className={annualRet >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {annualRet ? formatPercent(annualRet) : '—'}
                  </td>
                  <td className="text-slate-500 text-sm">{calcDuration(inv.entryDate, inv.closingDate)} يوم</td>
                  <td>
                    <span className={`${STATUS_COLORS[inv.status]} flex items-center gap-1 w-fit`}>
                      {STATUS_ICONS[inv.status]}{STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShowDetail(inv)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="تفاصيل"><Eye size={15} /></button>
                      <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg" title="تعديل"><Edit2 size={15} /></button>
                      {inv.status === 'active' && (<>
                        <button onClick={() => { setShowClose(inv); setCloseForm({ closingDate: '', closingAmount: '' }); setError(''); }} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg" title="إغلاق"><Lock size={15} /></button>
                        <button onClick={() => { setShowAddCapital(inv); setCapitalForm({ date: '', amount: '', notes: '' }); setError(''); }} className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg" title="إضافة رأس مال"><PlusCircle size={15} /></button>
                        <button onClick={() => { setShowAddProfit(inv); setProfitForm({ date: '', newValue: String(inv.currentValue), notes: '' }); setError(''); }} className="p-1.5 hover:bg-yellow-50 text-yellow-600 rounded-lg" title="تحديث القيمة"><TrendingUp size={15} /></button>
                      </>)}
                      <button onClick={() => setConfirmDelete(inv)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg" title="حذف"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Confirm Delete ───────────────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold text-red-700">تأكيد الحذف</h2>
              <button onClick={() => setConfirmDelete(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-semibold text-red-800">{confirmDelete.name}</p>
                <p className="text-sm text-red-600">رأس المال: {formatCurrency(confirmDelete.entryAmount)}</p>
              </div>
              <div className="alert-warning text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <div>
                  <p className="font-semibold">سيتم حذف ما يلي:</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    <li>• بيانات الاستثمار كاملة</li>
                    <li>• جميع حركات الكاش المرتبطة به</li>
                    <li>• سجل التحديثات والإضافات</li>
                  </ul>
                  <p className="mt-2 font-semibold">هذا الإجراء لا يمكن التراجع عنه.</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleDelete} disabled={saving} className="btn-danger">
                <Trash2 size={16} />{saving ? 'جاري الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ─────────────────────────────────────────────────────────── */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">{showDetail.name}</h2>
              <button onClick={() => setShowDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['الجهة', showDetail.entity],
                  ['تاريخ الدخول', formatDate(showDetail.entryDate)],
                  ['رأس المال الأصلي', formatCurrency(showDetail.entryAmount)],
                  ['القيمة الحالية', formatCurrency(showDetail.currentValue)],
                  ['الربح التراكمي', formatCurrency(showDetail.currentValue - showDetail.entryAmount)],
                  ['العائد السنوي', showDetail.annualReturn ? formatPercent(showDetail.annualReturn) : '—'],
                  ['الحالة', STATUS_LABELS[showDetail.status]],
                  ['المدة', `${calcDuration(showDetail.entryDate, showDetail.closingDate)} يوم`],
                  ...(showDetail.status === 'closed' ? [['تاريخ الإغلاق', formatDate(showDetail.closingDate)], ['مبلغ الإغلاق', formatCurrency(showDetail.closingAmount || 0)]] : []),
                  ...(showDetail.status === 'distressed' ? [['سبب التعثر', showDetail.distressReason || '—']] : []),
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}><p className="text-xs text-slate-500 mb-0.5">{k}</p><p className="text-sm font-semibold text-slate-800">{v}</p></div>
                ))}
              </div>
              {showDetail.additionalAmounts.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">إضافات رأس المال ({showDetail.additionalAmounts.length})</p>
                  <div className="space-y-2">
                    {showDetail.additionalAmounts.map((a, i) => (
                      <div key={i} className="flex justify-between items-center bg-purple-50 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-purple-800">{formatDate(a.date)}</p>
                          {a.notes && <p className="text-xs text-purple-600">{a.notes}</p>}
                        </div>
                        <span className="font-bold text-purple-700">+ {formatCurrency(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {showDetail.valueUpdates.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">سجل تحديثات القيمة ({showDetail.valueUpdates.length})</p>
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>التاريخ</th><th>القيمة السابقة</th><th>القيمة الجديدة</th><th>الفرق</th><th>ملاحظات</th></tr></thead>
                      <tbody>
                        {showDetail.valueUpdates.map((u, i) => (
                          <tr key={i}>
                            <td>{formatDate(u.date)}</td>
                            <td className="text-slate-600">{formatCurrency(u.previousValue)}</td>
                            <td className="font-semibold text-blue-700">{formatCurrency(u.newValue)}</td>
                            <td className={u.profit >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                              {u.profit >= 0 ? '+' : ''}{formatCurrency(u.profit)}
                            </td>
                            <td className="text-slate-500 text-xs">{u.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {showDetail.notes && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500 mb-1">ملاحظات</p><p className="text-sm">{showDetail.notes}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditInv(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">{editInv ? 'تعديل الاستثمار' : 'استثمار جديد'}</h2>
              <button onClick={() => { setShowAdd(false); setEditInv(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} className="shrink-0" />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">اسم الاستثمار *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">الجهة / الشركة *</label><input className="input" value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })} /></div>
                <div><label className="label">تاريخ الدخول *</label><input className="input" type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} /></div>
                <div><label className="label">مبلغ الدخول (ريال) *</label><input className="input" type="number" value={form.entryAmount} onChange={e => setForm({ ...form, entryAmount: e.target.value })} /></div>
                <div className="col-span-2">
                  <label className="label">الحالة</label>
                  <div className="flex gap-2">
                    {(['active', 'closed', 'distressed'] as InvStatus[]).map(s => (
                      <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${form.status === s ? s === 'active' ? 'bg-green-600 text-white border-green-600' : s === 'closed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {form.status === 'closed' && (<>
                  <div><label className="label">تاريخ الإغلاق *</label><input className="input" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} /></div>
                  <div>
                    <label className="label">مبلغ الإغلاق (ريال) *</label>
                    <input className="input" type="number" value={form.closingAmount} onChange={e => setForm({ ...form, closingAmount: e.target.value })} />
                    {form.closingAmount && form.entryAmount && (
                      <p className={`text-sm mt-1 font-medium ${parseFloat(form.closingAmount) >= parseFloat(form.entryAmount) ? 'text-green-600' : 'text-red-600'}`}>
                        الربح: {formatCurrency(parseFloat(form.closingAmount) - parseFloat(form.entryAmount))}
                      </p>
                    )}
                  </div>
                </>)}
                {form.status === 'distressed' && (<>
                  <div><label className="label">تاريخ التعثر</label><input className="input" type="date" value={form.distressDate} onChange={e => setForm({ ...form, distressDate: e.target.value })} /></div>
                  <div className="col-span-2"><label className="label">سبب التعثر</label><input className="input" value={form.distressReason} onChange={e => setForm({ ...form, distressReason: e.target.value })} /></div>
                </>)}
                <div className="col-span-2"><label className="label">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowAdd(false); setEditInv(null); }} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Save size={16} />{saving ? 'جاري الحفظ...' : editInv ? 'حفظ التعديلات' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Modal ──────────────────────────────────────────────────────────── */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">إغلاق الاستثمار</h2>
              <button onClick={() => setShowClose(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="font-semibold text-blue-800">{showClose.name}</p>
                <p className="text-sm text-blue-600">رأس المال: {formatCurrency(showClose.entryAmount)} | القيمة الحالية: {formatCurrency(showClose.currentValue)}</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ الإغلاق *</label><input className="input" type="date" value={closeForm.closingDate} onChange={e => setCloseForm({ ...closeForm, closingDate: e.target.value })} /></div>
              <div>
                <label className="label">مبلغ الإغلاق المستلم *</label>
                <input className="input" type="number" value={closeForm.closingAmount} onChange={e => setCloseForm({ ...closeForm, closingAmount: e.target.value })} />
                {closeForm.closingAmount && (
                  <p className={`text-sm mt-1 font-medium ${parseFloat(closeForm.closingAmount) >= showClose.entryAmount ? 'text-green-600' : 'text-red-600'}`}>
                    الربح / الخسارة: {formatCurrency(parseFloat(closeForm.closingAmount) - showClose.entryAmount)}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowClose(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleClose} disabled={saving} className="btn-success"><CheckCircle size={16} />{saving ? 'جاري...' : 'تأكيد الإغلاق'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Capital Modal ─────────────────────────────────────────────────────── */}
      {showAddCapital && (
        <div className="modal-overlay" onClick={() => setShowAddCapital(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">إضافة رأس مال</h2>
              <button onClick={() => setShowAddCapital(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-purple-50 rounded-xl p-4">
                <p className="font-semibold text-purple-800">{showAddCapital.name}</p>
                <p className="text-sm text-purple-600">رأس المال الحالي: {formatCurrency(showAddCapital.entryAmount)}</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">التاريخ *</label><input className="input" type="date" value={capitalForm.date} onChange={e => setCapitalForm({ ...capitalForm, date: e.target.value })} /></div>
              <div>
                <label className="label">المبلغ المضاف *</label>
                <input className="input" type="number" value={capitalForm.amount} onChange={e => setCapitalForm({ ...capitalForm, amount: e.target.value })} />
                {capitalForm.amount && <p className="text-sm mt-1 text-purple-600">رأس المال الجديد: {formatCurrency(showAddCapital.entryAmount + parseFloat(capitalForm.amount))}</p>}
              </div>
              <div><label className="label">ملاحظات</label><input className="input" value={capitalForm.notes} onChange={e => setCapitalForm({ ...capitalForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddCapital(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleAddCapital} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'إضافة'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Update Value Modal ───────────────────────────────────────────────────── */}
      {showAddProfit && (
        <div className="modal-overlay" onClick={() => setShowAddProfit(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">تحديث قيمة الاستثمار</h2>
              <button onClick={() => setShowAddProfit(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-yellow-50 rounded-xl p-4">
                <p className="font-semibold text-yellow-800">{showAddProfit.name}</p>
                <p className="text-sm text-yellow-700">القيمة الحالية: <strong>{formatCurrency(showAddProfit.currentValue)}</strong></p>
                <p className="text-xs text-yellow-600 mt-1">أدخل القيمة الجديدة كما وردت في كشف الشركة</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ التحديث *</label><input className="input" type="date" value={profitForm.date} onChange={e => setProfitForm({ ...profitForm, date: e.target.value })} /></div>
              <div>
                <label className="label">القيمة الجديدة (ريال) *</label>
                <input className="input" type="number" value={profitForm.newValue} onChange={e => setProfitForm({ ...profitForm, newValue: e.target.value })} />
                {profitForm.newValue && (
                  <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">السابقة</span><span>{formatCurrency(showAddProfit.currentValue)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">الجديدة</span><span className="font-semibold">{formatCurrency(parseFloat(profitForm.newValue))}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-500">الفرق</span>
                      <span className={`font-bold ${parseFloat(profitForm.newValue) >= showAddProfit.currentValue ? 'text-green-600' : 'text-red-600'}`}>
                        {parseFloat(profitForm.newValue) >= showAddProfit.currentValue ? '+' : ''}{formatCurrency(parseFloat(profitForm.newValue) - showAddProfit.currentValue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div><label className="label">ملاحظات (مثال: كشف 2025)</label><input className="input" value={profitForm.notes} onChange={e => setProfitForm({ ...profitForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddProfit(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleUpdateValue} disabled={saving} className="btn-primary"><TrendingUp size={16} />{saving ? 'جاري...' : 'تحديث'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
