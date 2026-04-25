'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestors, createInvestor, updateInvestor } from '@/lib/db';
import { formatCurrency, formatNumber, formatPercent, formatDate } from '@/lib/utils';
import type { Investor, InvestorStatus } from '@/types';
import {
  Plus, Search, Edit2, Eye, UserCheck, UserX, RefreshCw,
  Users, DollarSign, Layers, X, Save, AlertCircle,
} from 'lucide-react';

const STATUS_LABELS: Record<InvestorStatus, string> = { active: 'نشط', inactive: 'غير نشط', exited: 'خرج' };
const STATUS_COLORS: Record<InvestorStatus, string> = { active: 'badge-green', inactive: 'badge-gray', exited: 'badge-red' };

interface InvestorFormData {
  name: string; email: string; identityNumber: string; joinDate: string;
  investedAmount: string; shareCount: string; sharePrice: string;
  notes: string; status: InvestorStatus;
}

const EMPTY_FORM: InvestorFormData = {
  name: '', email: '', identityNumber: '', joinDate: '',
  investedAmount: '', shareCount: '', sharePrice: '', notes: '', status: 'active',
};

export default function InvestorsPage() {
  const { user } = useAuth();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvestorFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);

  const load = async () => { setLoading(true); const data = await getInvestors(); setInvestors(data); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = investors.filter(inv => {
    const matchSearch = inv.name.toLowerCase().includes(search.toLowerCase()) || inv.email.toLowerCase().includes(search.toLowerCase()) || inv.investorNumber?.includes(search);
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCapital = investors.reduce((s, i) => s + i.totalPaid, 0);
  const totalShares = investors.reduce((s, i) => s + i.shareCount, 0);
  const activeCount = investors.filter(i => i.status === 'active').length;

  const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const openEdit = (inv: Investor) => {
    setEditingId(inv.id);
    setForm({ name: inv.name, email: inv.email, identityNumber: inv.identityNumber || '', joinDate: inv.joinDate ? inv.joinDate.toISOString().split('T')[0] : '', investedAmount: String(inv.investedAmount), shareCount: String(inv.shareCount), sharePrice: String(inv.sharePrice), notes: inv.notes || '', status: inv.status });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email || !form.joinDate || !form.investedAmount || !form.shareCount) { setError('يرجى تعبئة جميع الحقول المطلوبة'); return; }
    setSaving(true); setError('');
    try {
      const investedAmount = parseFloat(form.investedAmount);
      const shareCount = parseFloat(form.shareCount);
      const sharePrice = parseFloat(form.sharePrice) || investedAmount / shareCount;
      const joinDate = new Date(form.joinDate);
      if (editingId) {
        await updateInvestor(editingId, { name: form.name, email: form.email, identityNumber: form.identityNumber || undefined, joinDate, investedAmount, shareCount, sharePrice, ownershipPercentage: (shareCount / (investors.reduce((s, i) => s + (i.id === editingId ? shareCount : i.shareCount), 0))) * 100, notes: form.notes || undefined, status: form.status }, user!.id, user!.name);
      } else {
        const investorNumber = `INV-${String(investors.length + 1).padStart(4, '0')}`;
        const newTotalShares = investors.reduce((s, i) => s + i.shareCount, 0) + shareCount;
        await createInvestor({ investorNumber, name: form.name, email: form.email, identityNumber: form.identityNumber || undefined, joinDate, investedAmount, additionalAmount: 0, totalPaid: investedAmount, shareCount, sharePrice, ownershipPercentage: (shareCount / newTotalShares) * 100, status: form.status, notes: form.notes || undefined, createdBy: user!.id }, user!.name);
      }
      setShowModal(false); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">المستثمرون</h1><p className="text-slate-500 text-sm mt-0.5">{investors.length} مستثمر</p></div>
        {(user?.role === 'manager' || user?.permissions?.manageInvestors) && (
          <button onClick={openNew} className="btn-primary"><Plus size={16} />مستثمر جديد</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><div className="p-2 bg-blue-50 rounded-lg w-fit mb-2"><Users size={16} className="text-blue-600" /></div><p className="text-xl font-bold">{activeCount}</p><p className="text-xs text-slate-500">نشط</p></div>
        <div className="stat-card"><div className="p-2 bg-green-50 rounded-lg w-fit mb-2"><DollarSign size={16} className="text-green-600" /></div><p className="text-lg font-bold">{formatCurrency(totalCapital)}</p><p className="text-xs text-slate-500">رأس المال</p></div>
        <div className="stat-card"><div className="p-2 bg-purple-50 rounded-lg w-fit mb-2"><Layers size={16} className="text-purple-600" /></div><p className="text-xl font-bold">{formatNumber(totalShares, 0)}</p><p className="text-xs text-slate-500">إجمالي الحصص</p></div>
      </div>

      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="input pr-9 text-sm" /></div>
        <div className="flex gap-1.5">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input flex-1 text-sm">
            <option value="all">الكل</option><option value="active">نشط</option><option value="inactive">غير نشط</option><option value="exited">خرج</option>
          </select>
          <button onClick={load} className="btn-secondary px-3"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
          : filtered.length === 0 ? <div className="text-center py-8 text-slate-400">لا توجد نتائج</div>
            : filtered.map(inv => (
              <div key={inv.id} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-800">{inv.name}</p>
                    <p className="text-xs text-slate-400">{inv.email}</p>
                    <p className="text-xs text-slate-400 font-mono">{inv.investorNumber}</p>
                  </div>
                  <span className={`${STATUS_COLORS[inv.status]} text-xs`}>{STATUS_LABELS[inv.status]}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">رأس المال</p><p className="font-bold text-blue-700 text-sm">{formatCurrency(inv.totalPaid)}</p></div>
                  <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">نسبة الملكية</p><p className="font-bold text-sm">{formatPercent(inv.ownershipPercentage)}</p></div>
                  <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">الحصص</p><p className="font-bold text-sm">{formatNumber(inv.shareCount, 0)}</p></div>
                  <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">تاريخ الانضمام</p><p className="font-bold text-sm">{formatDate(inv.joinDate)}</p></div>
                </div>
                <div className="flex gap-1.5 border-t border-slate-100 pt-3">
                  <button onClick={() => setSelectedInvestor(inv)} className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"><Eye size={13} />تفاصيل</button>
                  {(user?.role === 'manager' || user?.permissions?.manageInvestors) && (
                    <button onClick={() => openEdit(inv)} className="flex-1 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"><Edit2 size={13} />تعديل</button>
                  )}
                </div>
              </div>
            ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead>
            <tr><th>رقم المستثمر</th><th>الاسم</th><th>تاريخ الانضمام</th><th>رأس المال</th><th>الحصص</th><th>نسبة الملكية</th><th>سعر الحصة</th><th>الحالة</th><th>حساب مرتبط</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={10} className="text-center py-12 text-slate-400">لا توجد نتائج</td></tr>
                : filtered.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs text-slate-500">{inv.investorNumber}</td>
                    <td><div><p className="font-medium text-slate-800">{inv.name}</p><p className="text-xs text-slate-400">{inv.email}</p></div></td>
                    <td className="text-slate-600">{formatDate(inv.joinDate)}</td>
                    <td className="font-semibold text-blue-700">{formatCurrency(inv.totalPaid)}</td>
                    <td className="text-slate-600">{formatNumber(inv.shareCount, 0)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(inv.ownershipPercentage, 100)}%` }} /></div>
                        <span className="text-sm font-medium">{formatPercent(inv.ownershipPercentage)}</span>
                      </div>
                    </td>
                    <td className="text-slate-600">{formatCurrency(inv.sharePrice)}</td>
                    <td><span className={STATUS_COLORS[inv.status]}>{STATUS_LABELS[inv.status]}</span></td>
                    <td>{inv.userId ? <span className="badge-green flex items-center gap-1 w-fit"><UserCheck size={12} />مرتبط</span> : <span className="badge-gray flex items-center gap-1 w-fit"><UserX size={12} />غير مرتبط</span>}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelectedInvestor(inv)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg"><Eye size={14} /></button>
                        {(user?.role === 'manager' || user?.permissions?.manageInvestors) && <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedInvestor && (
        <div className="modal-overlay" onClick={() => setSelectedInvestor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="text-base font-bold">بيانات المستثمر</h2><button onClick={() => setSelectedInvestor(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {([['الاسم', selectedInvestor.name], ['البريد الإلكتروني', selectedInvestor.email], ['رقم المستثمر', selectedInvestor.investorNumber], ['تاريخ الانضمام', formatDate(selectedInvestor.joinDate)], ['مبلغ الاستثمار الأصلي', formatCurrency(selectedInvestor.investedAmount)], ['إضافات لاحقة', formatCurrency(selectedInvestor.additionalAmount)], ['إجمالي المدفوع', formatCurrency(selectedInvestor.totalPaid)], ['عدد الحصص', formatNumber(selectedInvestor.shareCount, 0)], ['سعر الحصة', formatCurrency(selectedInvestor.sharePrice)], ['نسبة الملكية', formatPercent(selectedInvestor.ownershipPercentage)], ['الحالة', STATUS_LABELS[selectedInvestor.status]], ['رقم الهوية', selectedInvestor.identityNumber || '—']] as [string, string][]).map(([k, v]) => (
                  <div key={k}><p className="text-xs text-slate-500 mb-0.5">{k}</p><p className="text-sm font-medium text-slate-800">{v}</p></div>
                ))}
              </div>
              {selectedInvestor.notes && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500 mb-1">ملاحظات</p><p className="text-sm text-slate-700">{selectedInvestor.notes}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="text-base font-bold">{editingId ? 'تعديل مستثمر' : 'إضافة مستثمر جديد'}</h2><button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} className="shrink-0" />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">الاسم *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="label">البريد الإلكتروني *</label><input className="input" type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="label">رقم الهوية</label><input className="input" value={form.identityNumber} onChange={e => setForm({ ...form, identityNumber: e.target.value })} /></div>
                <div><label className="label">تاريخ الانضمام *</label><input className="input" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} /></div>
                <div><label className="label">مبلغ الاستثمار *</label><input className="input" type="number" value={form.investedAmount} onChange={e => setForm({ ...form, investedAmount: e.target.value })} /></div>
                <div><label className="label">عدد الحصص *</label><input className="input" type="number" value={form.shareCount} onChange={e => setForm({ ...form, shareCount: e.target.value })} /></div>
                <div><label className="label">سعر الحصة (تلقائي إن ترك)</label><input className="input" type="number" value={form.sharePrice} onChange={e => setForm({ ...form, sharePrice: e.target.value })} /></div>
                <div><label className="label">الحالة</label><select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as InvestorStatus })}><option value="active">نشط</option><option value="inactive">غير نشط</option><option value="exited">خرج</option></select></div>
              </div>
              <div><label className="label">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button><button onClick={handleSave} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'حفظ'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
