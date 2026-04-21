'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getUsers, createUser, updateUser, resetUserPassword, getInvestors } from '@/lib/db';
import { formatDate, timeAgo, USER_ROLES } from '@/lib/utils';
import type { User, UserRole, Investor, UserPermissions } from '@/types';
import {
  Plus, X, Save, AlertCircle, RefreshCw, UserCog, Shield,
  Key, UserCheck, UserX, Edit2, Mail, Clock,
} from 'lucide-react';

const DEFAULT_PERMISSIONS: UserPermissions = {
  manageInvestors: false, manageInvestments: false, manageExpenses: false,
  manageDistributions: false, viewReports: false, exportReports: false, manageUsers: false,
};

const PERM_LABELS: Record<keyof UserPermissions, string> = {
  manageInvestors: 'إدارة المستثمرين',
  manageInvestments: 'إدارة الاستثمارات',
  manageExpenses: 'إدارة المصاريف',
  manageDistributions: 'إدارة التوزيعات',
  viewReports: 'عرض التقارير',
  exportReports: 'تصدير التقارير',
  manageUsers: 'إدارة المستخدمين',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'admin' as UserRole,
    investorId: '', status: 'active' as User['status'],
    permissions: { ...DEFAULT_PERMISSIONS },
  });

  const load = async () => {
    setLoading(true);
    const [usrs, invs] = await Promise.all([getUsers(), getInvestors()]);
    setUsers(usrs); setInvestors(invs); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', email: '', password: '', role: 'admin', investorId: '', status: 'active', permissions: { ...DEFAULT_PERMISSIONS } });
    setError(''); setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      name: u.name, email: u.email, password: '',
      role: u.role, investorId: u.investorId || '', status: u.status,
      permissions: u.permissions || { ...DEFAULT_PERMISSIONS },
    });
    setError(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) { setError('الاسم والبريد الإلكتروني مطلوبان'); return; }
    if (!editingId && !form.password) { setError('كلمة المرور مطلوبة لإنشاء حساب جديد'); return; }
    setSaving(true); setError('');
    try {
      if (editingId) {
        await updateUser(editingId, {
          name: form.name, role: form.role, status: form.status,
          investorId: form.role === 'investor' ? (form.investorId || undefined) : undefined,
          permissions: form.role === 'admin' ? form.permissions : undefined,
        });
      } else {
        await createUser({
          name: form.name, email: form.email, password: form.password,
          role: form.role, status: form.status,
          investorId: form.role === 'investor' ? (form.investorId || undefined) : undefined,
          permissions: form.role === 'admin' ? form.permissions : undefined,
          createdBy: currentUser!.id,
        });
      }
      setShowModal(false); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`سيُرسل رابط إعادة تعيين كلمة المرور إلى ${email}`)) return;
    await resetUserPassword(email);
    alert('تم إرسال رابط إعادة تعيين كلمة المرور');
  };

  const handleToggleStatus = async (u: User) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`هل تريد ${newStatus === 'inactive' ? 'تعطيل' : 'تفعيل'} حساب ${u.name}؟`)) return;
    await updateUser(u.id, { status: newStatus });
    await load();
  };

  const roleCount = (role: UserRole) => users.filter(u => u.role === role).length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">المستخدمون والصلاحيات</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} مستخدم إجمالاً</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16} />مستخدم جديد</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { role: 'manager', label: 'مدراء', icon: <Shield size={18} className="text-purple-600" />, bg: 'bg-purple-50' },
          { role: 'admin', label: 'إداريون', icon: <UserCog size={18} className="text-blue-600" />, bg: 'bg-blue-50' },
          { role: 'investor', label: 'مستثمرون', icon: <UserCheck size={18} className="text-green-600" />, bg: 'bg-green-50' },
        ].map(item => (
          <div key={item.role} className="stat-card">
            <div className={`p-2 ${item.bg} rounded-lg w-fit mb-3`}>{item.icon}</div>
            <p className="text-2xl font-bold text-slate-800">{roleCount(item.role as UserRole)}</p>
            <p className="text-sm text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>البريد الإلكتروني</th>
              <th>الدور</th>
              <th>المستثمر المرتبط</th>
              <th>آخر دخول</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا يوجد مستخدمون</td></tr>
            ) : users.map(u => {
              const linkedInvestor = u.investorId ? investors.find(i => i.id === u.investorId) : null;
              return (
                <tr key={u.id} className={u.status === 'inactive' ? 'opacity-60' : ''}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {u.name[0]}
                      </div>
                      <span className="font-medium text-slate-800">{u.name}</span>
                    </div>
                  </td>
                  <td className="text-slate-600 text-sm font-mono">{u.email}</td>
                  <td>
                    <span className={u.role === 'manager' ? 'badge-purple' : u.role === 'admin' ? 'badge-blue' : 'badge-green'}>
                      {USER_ROLES[u.role]}
                    </span>
                  </td>
                  <td className="text-slate-600 text-sm">{linkedInvestor?.name || '—'}</td>
                  <td className="text-slate-500 text-xs">{u.lastLogin ? timeAgo(u.lastLogin) : 'لم يدخل بعد'}</td>
                  <td>
                    <span className={u.status === 'active' ? 'badge-green' : 'badge-red'}>
                      {u.status === 'active' ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg" title="تعديل"><Edit2 size={15} /></button>
                      <button onClick={() => handleResetPassword(u.email)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="إعادة تعيين كلمة المرور"><Key size={15} /></button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleToggleStatus(u)} className={`p-1.5 rounded-lg ${u.status === 'active' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-green-50 text-green-600'}`} title={u.status === 'active' ? 'تعطيل' : 'تفعيل'}>
                          {u.status === 'active' ? <UserX size={15} /> : <UserCheck size={15} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">{editingId ? 'تعديل مستخدم' : 'إنشاء مستخدم جديد'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">الاسم الكامل *</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">البريد الإلكتروني *</label>
                  <input className="input" type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editingId} />
                </div>
                {!editingId && (
                  <div className="col-span-2">
                    <label className="label">كلمة المرور الابتدائية *</label>
                    <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    <p className="text-xs text-slate-400 mt-1">يجب أن يغيرها المستخدم عند أول دخول</p>
                  </div>
                )}
                <div>
                  <label className="label">نوع المستخدم</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}>
                    <option value="admin">مستخدم إداري</option>
                    <option value="investor">مستثمر</option>
                    <option value="manager">مدير</option>
                  </select>
                </div>
                <div>
                  <label className="label">الحالة</label>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as User['status'] })}>
                    <option value="active">نشط</option>
                    <option value="inactive">معطل</option>
                  </select>
                </div>
                {form.role === 'investor' && (
                  <div className="col-span-2">
                    <label className="label">ربط بمستثمر</label>
                    <select className="input" value={form.investorId} onChange={e => setForm({ ...form, investorId: e.target.value })}>
                      <option value="">— اختر مستثمراً —</option>
                      {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.investorNumber})</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Admin permissions */}
              {form.role === 'admin' && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="font-semibold text-slate-700 mb-3 text-sm">الصلاحيات التفصيلية</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(PERM_LABELS) as [keyof UserPermissions, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.permissions[key]}
                          onChange={e => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-slate-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
