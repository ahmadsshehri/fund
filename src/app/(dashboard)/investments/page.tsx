'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getInvestments, createInvestment, updateInvestment, closeInvestment } from '@/lib/db';
import { formatCurrency, formatNumber, formatDate, formatPercent, INVESTMENT_TYPES, INVESTMENT_STATUSES, DISTRESS_STATUSES } from '@/lib/utils';
import type { Investment, InvestmentType, InvestmentStatus, DistressStatus } from '@/types';
import {
  Plus, Search, Edit2, Eye, X, Save, AlertCircle, RefreshCw,
  TrendingUp, DollarSign, CheckCircle, XCircle, PauseCircle,
  Lock, ChevronDown, Calendar, Activity,
} from 'lucide-react';

const STATUS_COLORS: Record<InvestmentStatus, string> = {
  active: 'badge-green',
  closed: 'badge-blue',
  distressed: 'badge-red',
  frozen: 'badge-yellow',
};

interface InvForm {
  name: string; type: InvestmentType; entity: string;
  entryDate: string; entryAmount: string;
  status: InvestmentStatus; closingDate: string; closingAmount: string;
  receivedProfits: string; accruedProfits: string;
  distributionPeriod: string;
  distressDate: string; distressReason: string;
  estimatedLossPercentage: string; expectedRecoveryAmount: string;
  distressStatus: string; notes: string;
}
const EMPTY: InvForm = {
  name: '', type: 'closed_return', entity: '', entryDate: '', entryAmount: '',
  status: 'active', closingDate: '', closingAmount: '', receivedProfits: '0',
  accruedProfits: '0', distributionPeriod: 'quarterly',
  distressDate: '', distressReason: '', estimatedLossPercentage: '0',
  expectedRecoveryAmount: '0', distressStatus: 'under_follow_up', notes: '',
};

export default function InvestmentsPage() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [closingInv, setClosingInv] = useState<Investment | null>(null);
  const [closeDate, setCloseDate] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [form, setForm] = useState<InvForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Investment | null>(null);

  const load = async () => { setLoading(true); setInvestments(await getInvestments()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filtered = investments.filter(inv => {
    const matchSearch = inv.name.toLowerCase().includes(search.toLowerCase()) || inv.entity.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchType = typeFilter === 'all' || inv.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const totalInvested = investments.filter(i => i.status === 'active').reduce((s, i) => s + i.entryAmount, 0);
  const totalProfit = investments.filter(i => i.status === 'closed').reduce((s, i) => s + (i.totalProfit || 0), 0);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setError(''); setShowModal(true); };
  const openEdit = (inv: Investment) => {
    setEditingId(inv.id);
    setForm({
      name: inv.name, type: inv.type, entity: inv.entity,
      entryDate: inv.entryDate?.toISOString().split('T')[0] || '',
      entryAmount: String(inv.entryAmount), status: inv.status,
      closingDate: inv.closingDate?.toISOString().split('T')[0] || '',
      closingAmount: String(inv.closingAmount || ''),
      receivedProfits: String(inv.receivedProfits || 0),
      accruedProfits: String(inv.accruedProfits || 0),
      distributionPeriod: inv.distributionPeriod || 'quarterly',
      distressDate: inv.distressInfo?.date?.toISOString().split('T')[0] || '',
      distressReason: inv.distressInfo?.reason || '',
      estimatedLossPercentage: String(inv.distressInfo?.estimatedLossPercentage || 0),
      expectedRecoveryAmount: String(inv.distressInfo?.expectedRecoveryAmount || 0),
      distressStatus: inv.distressInfo?.status || 'under_follow_up',
      notes: inv.notes || '',
    });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.entity || !form.entryDate || !form.entryAmount) { setError('يرجى تعبئة الحقول المطلوبة'); return; }
    setSaving(true); setError('');
    try {
      const baseData: Partial<Investment> = {
        name: form.name, type: form.type, entity: form.entity,
        entryDate: new Date(form.entryDate), entryAmount: parseFloat(form.entryAmount),
        status: form.status, notes: form.notes || undefined,
      };
      if (form.type === 'periodic_dividend' || form.type === 'accumulative') {
        baseData.receivedProfits = parseFloat(form.receivedProfits) || 0;
        baseData.accruedProfits = parseFloat(form.accruedProfits) || 0;
        baseData.distributionPeriod = form.distributionPeriod;
        baseData.lastProfitUpdate = new Date();
      }
      if (form.status === 'distressed' && form.distressDate) {
        baseData.distressInfo = {
          date: new Date(form.distressDate), reason: form.distressReason,
          estimatedLossPercentage: parseFloat(form.estimatedLossPercentage) || 0,
          expectedRecoveryAmount: parseFloat(form.expectedRecoveryAmount) || 0,
          status: form.distressStatus as DistressStatus,
        };
      }
      if (editingId) {
        await updateInvestment(editingId, baseData, user!.id, user!.name);
      } else {
        const invNumber = `INV-${String(investments.length + 1).padStart(4, '0')}`;
        await createInvestment({ ...baseData, investmentNumber: invNumber, createdBy: user!.id } as Omit<Investment, 'id' | 'createdAt' | 'updatedAt'>, user!.name);
      }
      setShowModal(false); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    if (!closingInv || !closeDate || !closeAmount) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      await closeInvestment(closingInv.id, new Date(closeDate), parseFloat(closeAmount), user!.id, user!.name);
      setShowCloseModal(false); setClosingInv(null); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const calcDuration = (inv: Investment) => {
    const to = inv.closingDate || new Date();
    return Math.round((to.getTime() - inv.entryDate.getTime()) / 86400000);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">الاستثمارات</h1>
          <p className="text-slate-500 text-sm mt-0.5">{investments.length} استثمار إجمالاً</p>
        </div>
        {(user?.role === 'manager' || user?.permissions?.manageInvestments) && (
          <button onClick={openNew} className="btn-primary"><Plus size={16} />استثمار جديد</button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'قائمة', count: investments.filter(i => i.status === 'active').length, color: 'text-green-600', bg: 'bg-green-50', icon: <Activity size={18} className="text-green-600" /> },
          { label: 'مغلقة', count: investments.filter(i => i.status === 'closed').length, color: 'text-blue-600', bg: 'bg-blue-50', icon: <CheckCircle size={18} className="text-blue-600" /> },
          { label: 'متعثرة', count: investments.filter(i => i.status === 'distressed').length, color: 'text-red-600', bg: 'bg-red-50', icon: <XCircle size={18} className="text-red-600" /> },
          { label: 'مجمدة', count: investments.filter(i => i.status === 'frozen').length, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: <PauseCircle size={18} className="text-yellow-600" /> },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`p-2 ${s.bg} rounded-lg w-fit mb-3`}>{s.icon}</div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl"><DollarSign size={22} className="text-blue-600" /></div>
          <div>
            <p className="text-xl font-bold text-slate-800">{formatCurrency(totalInvested)}</p>
            <p className="text-sm text-slate-500">إجمالي المستثمر (القائمة)</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-xl"><TrendingUp size={22} className="text-green-600" /></div>
          <div>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalProfit)}</p>
            <p className="text-sm text-slate-500">إجمالي الأرباح المحققة</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجهة..." className="input pr-9" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input sm:w-36">
          <option value="all">جميع الحالات</option>
          {Object.entries(INVESTMENT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input sm:w-44">
          <option value="all">جميع الأنواع</option>
          {Object.entries(INVESTMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} />تحديث</button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>اسم الاستثمار</th>
              <th>النوع</th>
              <th>الجهة</th>
              <th>تاريخ الدخول</th>
              <th>مبلغ الدخول</th>
              <th>الأرباح المستلمة</th>
              <th>الربح الإجمالي</th>
              <th>العائد السنوي</th>
              <th>المدة</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-slate-400">لا توجد نتائج</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono text-xs text-slate-500">{inv.investmentNumber}</td>
                <td className="font-medium text-slate-800">{inv.name}</td>
                <td><span className="badge-blue">{INVESTMENT_TYPES[inv.type]}</span></td>
                <td className="text-slate-600 text-sm">{inv.entity}</td>
                <td className="text-slate-600">{formatDate(inv.entryDate)}</td>
                <td className="font-semibold text-blue-700">{formatCurrency(inv.entryAmount)}</td>
                <td className="text-green-700">{formatCurrency(inv.receivedProfits || 0)}</td>
                <td className={(inv.totalProfit || 0) >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                  {inv.totalProfit !== undefined ? formatCurrency(inv.totalProfit) : '—'}
                </td>
                <td className={(inv.annualReturn || 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {inv.annualReturn !== undefined ? formatPercent(inv.annualReturn * 100) : '—'}
                </td>
                <td className="text-slate-600 text-sm">{calcDuration(inv)} يوم</td>
                <td><span className={STATUS_COLORS[inv.status]}>{INVESTMENT_STATUSES[inv.status]}</span></td>
                <td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDetail(inv)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="تفاصيل"><Eye size={15} /></button>
                    {(user?.role === 'manager' || user?.permissions?.manageInvestments) && (
                      <>
                        <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg" title="تعديل"><Edit2 size={15} /></button>
                        {inv.status === 'active' && (
                          <button onClick={() => { setClosingInv(inv); setCloseDate(''); setCloseAmount(''); setError(''); setShowCloseModal(true); }}
                            className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg" title="إغلاق الاستثمار"><Lock size={15} /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">{detail.name}</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['الجهة', detail.entity], ['النوع', INVESTMENT_TYPES[detail.type]],
                  ['تاريخ الدخول', formatDate(detail.entryDate)], ['مبلغ الدخول', formatCurrency(detail.entryAmount)],
                  ['الحالة', INVESTMENT_STATUSES[detail.status]],
                  ['تاريخ الإغلاق', formatDate(detail.closingDate)],
                  ['مبلغ الإغلاق', detail.closingAmount ? formatCurrency(detail.closingAmount) : '—'],
                  ['الربح الإجمالي', detail.totalProfit !== undefined ? formatCurrency(detail.totalProfit) : '—'],
                  ['العائد السنوي', detail.annualReturn !== undefined ? formatPercent(detail.annualReturn * 100) : '—'],
                  ['مدة الاستثمار', `${calcDuration(detail)} يوم`],
                  ['أرباح مستلمة', formatCurrency(detail.receivedProfits || 0)],
                  ['أرباح مستحقة', formatCurrency(detail.accruedProfits || 0)],
                ].map(([k, v]) => (
                  <div key={k}><p className="text-xs text-slate-500 mb-0.5">{k}</p><p className="text-sm font-medium text-slate-800">{v}</p></div>
                ))}
              </div>
              {detail.distressInfo && (
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="font-semibold text-red-800 mb-3">بيانات التعثر</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['تاريخ التعثر', formatDate(detail.distressInfo.date)],
                      ['سبب التعثر', detail.distressInfo.reason],
                      ['نسبة الخسارة التقديرية', formatPercent(detail.distressInfo.estimatedLossPercentage)],
                      ['المبلغ المتوقع استرداده', formatCurrency(detail.distressInfo.expectedRecoveryAmount)],
                      ['حالة المعالجة', DISTRESS_STATUSES[detail.distressInfo.status]],
                    ].map(([k, v]) => (
                      <div key={k}><p className="text-xs text-red-500 mb-0.5">{k}</p><p className="text-sm font-medium text-red-800">{v}</p></div>
                    ))}
                  </div>
                </div>
              )}
              {detail.notes && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500 mb-1">ملاحظات</p><p className="text-sm">{detail.notes}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* Close Investment Modal */}
      {showCloseModal && closingInv && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold text-slate-800">إغلاق الاستثمار</h2>
              <button onClick={() => setShowCloseModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="font-medium text-blue-800">{closingInv.name}</p>
                <p className="text-sm text-blue-600">مبلغ الدخول: {formatCurrency(closingInv.entryAmount)}</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div>
                <label className="label">تاريخ الإغلاق *</label>
                <input className="input" type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
              </div>
              <div>
                <label className="label">مبلغ الإغلاق (المستلم) *</label>
                <input className="input" type="number" value={closeAmount} onChange={e => setCloseAmount(e.target.value)} placeholder="0" />
                {closeAmount && closeDate && (
                  <p className={`text-sm mt-1 font-medium ${parseFloat(closeAmount) - closingInv.entryAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    الربح: {formatCurrency(parseFloat(closeAmount) - closingInv.entryAmount)}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCloseModal(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleClose} disabled={saving} className="btn-success">
                <CheckCircle size={16} />{saving ? 'جاري...' : 'تأكيد الإغلاق'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">{editingId ? 'تعديل استثمار' : 'إضافة استثمار جديد'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">اسم الاستثمار *</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">نوع الاستثمار *</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as InvestmentType })}>
                    {Object.entries(INVESTMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">الجهة / الأصل *</label>
                  <input className="input" value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })} />
                </div>
                <div>
                  <label className="label">تاريخ الدخول *</label>
                  <input className="input" type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">مبلغ الدخول (ريال) *</label>
                  <input className="input" type="number" value={form.entryAmount} onChange={e => setForm({ ...form, entryAmount: e.target.value })} />
                </div>
                <div>
                  <label className="label">الحالة</label>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as InvestmentStatus })}>
                    {Object.entries(INVESTMENT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {(form.type === 'periodic_dividend' || form.type === 'accumulative') && (
                  <>
                    <div>
                      <label className="label">الأرباح المستلمة</label>
                      <input className="input" type="number" value={form.receivedProfits} onChange={e => setForm({ ...form, receivedProfits: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">الأرباح المستحقة</label>
                      <input className="input" type="number" value={form.accruedProfits} onChange={e => setForm({ ...form, accruedProfits: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">دورية التوزيع</label>
                      <select className="input" value={form.distributionPeriod} onChange={e => setForm({ ...form, distributionPeriod: e.target.value })}>
                        <option value="monthly">شهرية</option>
                        <option value="quarterly">ربع سنوية</option>
                        <option value="semi-annual">نصف سنوية</option>
                        <option value="annual">سنوية</option>
                      </select>
                    </div>
                  </>
                )}
                {form.status === 'distressed' && (
                  <>
                    <div>
                      <label className="label">تاريخ التعثر</label>
                      <input className="input" type="date" value={form.distressDate} onChange={e => setForm({ ...form, distressDate: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">حالة المعالجة</label>
                      <select className="input" value={form.distressStatus} onChange={e => setForm({ ...form, distressStatus: e.target.value })}>
                        {Object.entries(DISTRESS_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="label">سبب التعثر</label>
                      <input className="input" value={form.distressReason} onChange={e => setForm({ ...form, distressReason: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">نسبة الخسارة التقديرية %</label>
                      <input className="input" type="number" value={form.estimatedLossPercentage} onChange={e => setForm({ ...form, estimatedLossPercentage: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">المبلغ المتوقع استرداده</label>
                      <input className="input" type="number" value={form.expectedRecoveryAmount} onChange={e => setForm({ ...form, expectedRecoveryAmount: e.target.value })} />
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Save size={16} />{saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
