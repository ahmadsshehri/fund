'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getExpenses, createExpense, updateExpense, approveExpense, deleteExpense, getInvestments } from '@/lib/db';
import { formatCurrency, formatDate, EXPENSE_TYPES, PAYMENT_METHODS } from '@/lib/utils';
import type { Expense, ExpenseType, PaymentMethod, Investment } from '@/types';
import { Plus, Search, Edit2, Trash2, CheckCircle, X, Save, AlertCircle, RefreshCw, Receipt, DollarSign } from 'lucide-react';

const STATUS_LABELS = { pending: 'في الانتظار', approved: 'معتمد', cancelled: 'ملغي' };
const STATUS_COLORS = { pending: 'badge-yellow', approved: 'badge-green', cancelled: 'badge-red' };

interface ExpForm {
  type: ExpenseType; description: string; date: string;
  amount: string; paymentMethod: PaymentMethod; investmentId: string; notes: string;
}
const EMPTY: ExpForm = { type: 'admin', description: '', date: '', amount: '', paymentMethod: 'bank_transfer', investmentId: '', notes: '' };

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => { setLoading(true); const [exp, inv] = await Promise.all([getExpenses(), getInvestments()]); setExpenses(exp); setInvestments(inv); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = expenses.filter(e => {
    const matchSearch = e.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0);
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
  const zakatTotal = expenses.filter(e => e.status === 'approved' && e.type === 'zakat').reduce((s, e) => s + e.amount, 0);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setError(''); setShowModal(true); };
  const openEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setForm({ type: exp.type, description: exp.description, date: exp.date?.toISOString().split('T')[0] || '', amount: String(exp.amount), paymentMethod: exp.paymentMethod, investmentId: exp.investmentId || '', notes: exp.notes || '' });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.date || !form.amount) { setError('يرجى تعبئة الحقول المطلوبة'); return; }
    setSaving(true); setError('');
    try {
      const inv = investments.find(i => i.id === form.investmentId);
      if (editingId) {
        await updateExpense(editingId, { type: form.type, description: form.description, date: new Date(form.date), amount: parseFloat(form.amount), paymentMethod: form.paymentMethod, investmentId: form.investmentId || undefined, investmentName: inv?.name, notes: form.notes || undefined }, user!.id, user!.name);
      } else {
        const expNumber = `EXP-${String(expenses.length + 1).padStart(4, '0')}`;
        await createExpense({ expenseNumber: expNumber, type: form.type, description: form.description, date: new Date(form.date), amount: parseFloat(form.amount), paymentMethod: form.paymentMethod, investmentId: form.investmentId || undefined, investmentName: inv?.name, status: 'pending', notes: form.notes || undefined, createdBy: user!.id }, user!.name);
      }
      setShowModal(false); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('هل تريد اعتماد هذا المصروف؟ سيُخصم من الكاش.')) return;
    await approveExpense(id, user!.id, user!.name); await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    try { await deleteExpense(id, user!.id, user!.name); await load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'لا يمكن الحذف'); }
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">المصاريف</h1><p className="text-slate-500 text-sm mt-0.5">{expenses.length} مصروف</p></div>
        {(user?.role === 'manager' || user?.permissions?.manageExpenses) && (
          <button onClick={openNew} className="btn-primary"><Plus size={16} />مصروف جديد</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><div className="p-2 bg-green-50 rounded-lg w-fit mb-2"><CheckCircle size={16} className="text-green-600" /></div><p className="text-lg font-bold">{formatCurrency(totalApproved)}</p><p className="text-xs text-slate-500">معتمدة</p></div>
        <div className="stat-card"><div className="p-2 bg-yellow-50 rounded-lg w-fit mb-2"><Receipt size={16} className="text-yellow-600" /></div><p className="text-lg font-bold">{formatCurrency(totalPending)}</p><p className="text-xs text-slate-500">انتظار</p></div>
        <div className="stat-card"><div className="p-2 bg-blue-50 rounded-lg w-fit mb-2"><DollarSign size={16} className="text-blue-600" /></div><p className="text-lg font-bold">{formatCurrency(zakatTotal)}</p><p className="text-xs text-slate-500">الزكاة</p></div>
      </div>

      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="input pr-9 text-sm" /></div>
        <div className="flex gap-1.5">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input flex-1 text-sm">
            <option value="all">كل الحالات</option><option value="pending">انتظار</option><option value="approved">معتمد</option><option value="cancelled">ملغي</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input flex-1 text-sm">
            <option value="all">كل الأنواع</option>
            {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button onClick={load} className="btn-secondary px-3"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
          : filtered.length === 0 ? <div className="text-center py-8 text-slate-400">لا توجد نتائج</div>
            : filtered.map(exp => (
              <div key={exp.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{exp.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(exp.date)} · {EXPENSE_TYPES[exp.type]}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`${STATUS_COLORS[exp.status]} text-xs`}>{STATUS_LABELS[exp.status]}</span>
                    <span className="font-bold text-red-600">{formatCurrency(exp.amount)}</span>
                  </div>
                </div>
                {exp.status === 'pending' && user?.role === 'manager' && (
                  <div className="flex gap-1.5 border-t border-slate-100 pt-3 mt-2">
                    <button onClick={() => handleApprove(exp.id)} className="flex-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"><CheckCircle size={13} />اعتماد</button>
                    <button onClick={() => openEdit(exp)} className="flex-1 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"><Edit2 size={13} />تعديل</button>
                    <button onClick={() => handleDelete(exp.id)} className="flex-1 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1"><Trash2 size={13} />حذف</button>
                  </div>
                )}
              </div>
            ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead><tr><th>الرقم</th><th>النوع</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>استثمار مرتبط</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-slate-400">لا توجد نتائج</td></tr>
                : filtered.map(exp => (
                  <tr key={exp.id}>
                    <td className="font-mono text-xs text-slate-500">{exp.expenseNumber}</td>
                    <td><span className="badge-blue">{EXPENSE_TYPES[exp.type]}</span></td>
                    <td className="font-medium max-w-xs truncate">{exp.description}</td>
                    <td className="text-slate-600">{formatDate(exp.date)}</td>
                    <td className="font-semibold text-red-700">{formatCurrency(exp.amount)}</td>
                    <td className="text-slate-600 text-sm">{PAYMENT_METHODS[exp.paymentMethod]}</td>
                    <td className="text-slate-600 text-sm">{exp.investmentName || '—'}</td>
                    <td><span className={STATUS_COLORS[exp.status]}>{STATUS_LABELS[exp.status]}</span></td>
                    <td>
                      {exp.status === 'pending' && user?.role === 'manager' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleApprove(exp.id)} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg"><CheckCircle size={14} /></button>
                          <button onClick={() => openEdit(exp)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(exp.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="text-base font-bold">{editingId ? 'تعديل مصروف' : 'مصروف جديد'}</h2><button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">نوع المصروف *</label><select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ExpenseType })}>{Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="label">طريقة الدفع</label><select className="input" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="col-span-2"><label className="label">الوصف *</label><input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div><label className="label">التاريخ *</label><input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><label className="label">المبلغ (ريال) *</label><input className="input" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">استثمار مرتبط (اختياري)</label><select className="input" value={form.investmentId} onChange={e => setForm({ ...form, investmentId: e.target.value })}><option value="">— غير مرتبط —</option>{investments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                <div className="col-span-2"><label className="label">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button><button onClick={handleSave} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'حفظ'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
