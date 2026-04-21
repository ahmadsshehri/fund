'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getDistributions, createDistribution, approveDistribution, getInvestors } from '@/lib/db';
import { formatCurrency, formatDate, formatPercent, DISTRIBUTION_TYPES } from '@/lib/utils';
import type { Distribution, DistributionType, Investor, DistributionDetail } from '@/types';
import { Plus, CheckCircle, X, Save, AlertCircle, RefreshCw, GitBranch, DollarSign, Users, Eye } from 'lucide-react';

const STATUS_COLORS = { pending: 'badge-yellow', approved: 'badge-green' };

export default function DistributionsPage() {
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Distribution | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const [form, setForm] = useState({
    type: 'profit_distribution' as DistributionType,
    date: '', totalAmount: '', investorId: '',
    affectsCash: true, notes: '',
  });
  const [calculatedDetails, setCalculatedDetails] = useState<DistributionDetail[]>([]);

  const load = async () => {
    setLoading(true);
    const [dists, invs] = await Promise.all([getDistributions(), getInvestors()]);
    setDistributions(dists); setInvestors(invs); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Auto-calculate distribution per investor when amount changes and type is profit_distribution
  useEffect(() => {
    if (form.type === 'profit_distribution' && form.totalAmount && parseFloat(form.totalAmount) > 0) {
      const totalAmt = parseFloat(form.totalAmount);
      const activeInvestors = investors.filter(i => i.status === 'active');
      const details: DistributionDetail[] = activeInvestors.map(inv => ({
        investorId: inv.id,
        investorName: inv.name,
        ownershipPercentage: inv.ownershipPercentage,
        amount: (inv.ownershipPercentage / 100) * totalAmt,
        sharesBefore: inv.shareCount,
        sharesAfter: inv.shareCount,
      }));
      setCalculatedDetails(details);
    } else {
      setCalculatedDetails([]);
    }
  }, [form.type, form.totalAmount, investors]);

  const handleSave = async () => {
    if (!form.date || !form.totalAmount) { setError('يرجى تعبئة الحقول المطلوبة'); return; }
    setSaving(true); setError('');
    try {
      const inv = form.investorId ? investors.find(i => i.id === form.investorId) : null;
      const distNumber = `DIST-${String(distributions.length + 1).padStart(4, '0')}`;
      await createDistribution({
        distributionNumber: distNumber,
        type: form.type,
        date: new Date(form.date),
        totalAmount: parseFloat(form.totalAmount),
        investorId: form.investorId || undefined,
        investorName: inv?.name,
        sharesBefore: inv?.shareCount,
        sharesAfter: inv?.shareCount,
        ownershipBefore: inv?.ownershipPercentage,
        ownershipAfter: inv?.ownershipPercentage,
        affectsCash: form.affectsCash,
        details: calculatedDetails.length > 0 ? calculatedDetails : undefined,
        status: 'pending',
        notes: form.notes || undefined,
        createdBy: user!.id,
      }, user!.name);
      setShowModal(false);
      setForm({ type: 'profit_distribution', date: '', totalAmount: '', investorId: '', affectsCash: true, notes: '' });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('هل تريد اعتماد هذه العملية؟ لا يمكن التراجع.')) return;
    await approveDistribution(id, user!.id, user!.name);
    await load();
  };

  const totalApproved = distributions.filter(d => d.status === 'approved').reduce((s, d) => s + d.totalAmount, 0);
  const totalPending = distributions.filter(d => d.status === 'pending').reduce((s, d) => s + d.totalAmount, 0);

  const filtered = distributions.filter(d => typeFilter === 'all' || d.type === typeFilter);

  // Types that affect a single investor
  const singleInvestorTypes: DistributionType[] = ['new_investor', 'capital_increase', 'capital_decrease', 'investor_exit', 'increase_contribution', 'decrease_contribution'];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">التوزيعات وإعادة هيكلة الملكية</h1>
          <p className="text-slate-500 text-sm mt-0.5">{distributions.length} عملية إجمالاً</p>
        </div>
        {(user?.role === 'manager' || user?.permissions?.manageDistributions) && (
          <button onClick={() => { setShowModal(true); setError(''); }} className="btn-primary">
            <Plus size={16} />عملية جديدة
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="p-2 bg-green-50 rounded-lg w-fit mb-3"><DollarSign size={18} className="text-green-600" /></div>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalApproved)}</p>
          <p className="text-sm text-slate-500">إجمالي التوزيعات المعتمدة</p>
        </div>
        <div className="stat-card">
          <div className="p-2 bg-yellow-50 rounded-lg w-fit mb-3"><GitBranch size={18} className="text-yellow-600" /></div>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalPending)}</p>
          <p className="text-sm text-slate-500">في انتظار الاعتماد</p>
        </div>
        <div className="stat-card">
          <div className="p-2 bg-blue-50 rounded-lg w-fit mb-3"><Users size={18} className="text-blue-600" /></div>
          <p className="text-xl font-bold text-slate-800">{investors.filter(i => i.status === 'active').length}</p>
          <p className="text-sm text-slate-500">مستثمر نشط</p>
        </div>
      </div>

      {/* Investor Ownership Snapshot */}
      <div className="card p-6">
        <h3 className="section-title">هيكل الملكية الحالي</h3>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>المستثمر</th>
                <th>عدد الحصص</th>
                <th>نسبة الملكية</th>
                <th>شريط الملكية</th>
              </tr>
            </thead>
            <tbody>
              {investors.filter(i => i.status === 'active').map(inv => (
                <tr key={inv.id}>
                  <td className="font-medium">{inv.name}</td>
                  <td>{inv.shareCount.toLocaleString('ar-SA')}</td>
                  <td className="font-semibold text-blue-700">{formatPercent(inv.ownershipPercentage)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-slate-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(inv.ownershipPercentage, 100)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter */}
      <div className="card p-4 flex gap-3">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input sm:w-56">
          <option value="all">جميع أنواع العمليات</option>
          {Object.entries(DISTRIBUTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} />تحديث</button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>نوع العملية</th>
              <th>التاريخ</th>
              <th>المبلغ الإجمالي</th>
              <th>المستثمر</th>
              <th>يؤثر على الكاش</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">لا توجد عمليات</td></tr>
            ) : filtered.map(dist => (
              <tr key={dist.id}>
                <td className="font-mono text-xs text-slate-500">{dist.distributionNumber}</td>
                <td><span className="badge-blue">{DISTRIBUTION_TYPES[dist.type]}</span></td>
                <td className="text-slate-600">{formatDate(dist.date)}</td>
                <td className="font-semibold text-blue-700">{formatCurrency(dist.totalAmount)}</td>
                <td className="text-slate-600 text-sm">{dist.investorName || 'جميع المستثمرين'}</td>
                <td>
                  {dist.affectsCash
                    ? <span className="badge-green">نعم</span>
                    : <span className="badge-gray">لا</span>
                  }
                </td>
                <td><span className={STATUS_COLORS[dist.status]}>{dist.status === 'approved' ? 'معتمد' : 'في الانتظار'}</span></td>
                <td>
                  <div className="flex items-center gap-1">
                    {dist.details && dist.details.length > 0 && (
                      <button onClick={() => setDetail(dist)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="تفاصيل التوزيع"><Eye size={15} /></button>
                    )}
                    {dist.status === 'pending' && user?.role === 'manager' && (
                      <button onClick={() => handleApprove(dist.id)} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg" title="اعتماد">
                        <CheckCircle size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distribution Detail Modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">تفاصيل التوزيع</h2>
              <button onClick={() => setDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="mb-4 bg-blue-50 rounded-xl p-4">
                <p className="font-semibold text-blue-800">{DISTRIBUTION_TYPES[detail.type]}</p>
                <p className="text-blue-600 text-sm">الإجمالي: {formatCurrency(detail.totalAmount)} — {formatDate(detail.date)}</p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>المستثمر</th>
                    <th>نسبة الملكية</th>
                    <th>المبلغ المستحق</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.details?.map(d => (
                    <tr key={d.investorId}>
                      <td className="font-medium">{d.investorName}</td>
                      <td>{formatPercent(d.ownershipPercentage)}</td>
                      <td className="font-semibold text-green-700">{formatCurrency(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* New Distribution Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">عملية جديدة</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">نوع العملية *</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as DistributionType })}>
                    {Object.entries(DISTRIBUTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">التاريخ *</label>
                  <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="label">المبلغ الإجمالي *</label>
                  <input className="input" type="number" value={form.totalAmount} onChange={e => setForm({ ...form, totalAmount: e.target.value })} />
                </div>
                {singleInvestorTypes.includes(form.type) && (
                  <div className="col-span-2">
                    <label className="label">المستثمر المتأثر</label>
                    <select className="input" value={form.investorId} onChange={e => setForm({ ...form, investorId: e.target.value })}>
                      <option value="">— اختر مستثمراً —</option>
                      {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="affectsCash" checked={form.affectsCash} onChange={e => setForm({ ...form, affectsCash: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <label htmlFor="affectsCash" className="text-sm font-medium text-gray-700 cursor-pointer">هذه العملية تؤثر على الكاش</label>
                </div>
                <div className="col-span-2">
                  <label className="label">ملاحظات</label>
                  <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {/* Auto-calculated distribution */}
              {calculatedDetails.length > 0 && (
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-800 mb-3">توزيع تلقائي وفق نسب الملكية في يوم التوزيع</p>
                  <div className="space-y-2">
                    {calculatedDetails.map(d => (
                      <div key={d.investorId} className="flex justify-between items-center text-sm">
                        <span className="text-green-700">{d.investorName}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-green-600 text-xs">{formatPercent(d.ownershipPercentage)}</span>
                          <span className="font-semibold text-green-800">{formatCurrency(d.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowModal(false)} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Save size={16} />{saving ? 'جاري الحفظ...' : 'حفظ (يحتاج اعتماد)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
