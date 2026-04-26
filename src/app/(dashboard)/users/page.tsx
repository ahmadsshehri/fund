'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getUsers, createUser, updateUser, resetUserPassword, getInvestors } from '@/lib/db';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatDate, timeAgo, USER_ROLES } from '@/lib/utils';
import type { User, UserRole, Investor, UserPermissions } from '@/types';
import {
  Plus, X, Save, AlertCircle, RefreshCw, UserCog, Shield,
  Key, UserCheck, UserX, Edit2, Clock, Link as LinkIcon,
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
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'admin' as UserRole,
    investorId: '', status: 'active' as User['status'],
    permissions: { ...DEFAULT_PERMISSIONS },
  });

  const load = async () => {
    setLoading(true);
    const [usrs, invs] = await Promise.all([getUsers(), getInvestors()]);
    setUsers(usrs);
    setInvestors(invs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', email: '', password: '', role: 'admin', investorId: '', status: 'active', permissions: { ...DEFAULT_PERMISSIONS } });
    setError(''); setSuccessMsg(''); setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      name: u.name, email: u.email, password: '',
      role: u.role, investorId: u.investorId || '', status: u.status,
      permissions: u.permissions || { ...DEFAULT_PERMISSIONS },
    });
    setError(''); setSuccessMsg(''); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) { setError('الاسم والبريد الإلكتروني مطلوبان'); return; }
    if (!editingId && !form.password) { setError('كلمة المرور مطلوبة لإنشاء حساب جديد'); return; }
    if (form.role === 'investor' && !form.investorId) { setError('يجب اختيار المستثمر المرتبط لحساب مستثمر'); return; }

    setSaving(true); setError('');
    try {
      if (editingId) {
        // ── تعديل مستخدم موجود ──
        await updateUser(editingId, {
          name: form.name,
          role: form.role,
          status: form.status,
          investorId: form.role === 'investor' ? (form.investorId || undefined) : undefined,
          permissions: form.role === 'admin' ? form.permissions : undefined,
        });

        // ✅ تحديث ثنائي الاتجاه: إذا كان مستثمراً، احفظ userId في بيانات المستثمر
        if (form.role === 'investor' && form.investorId) {
          await updateDoc(doc(db, 'investors', form.investorId), {
            userId: editingId,
            updatedAt: serverTimestamp(),
          });
        }

        // ✅ إذا غيّرنا الدور من investor لغيره، امسح userId من المستثمر القديم
        const oldUser = users.find(u => u.id === editingId);
        if (oldUser?.role === 'investor' && oldUser.investorId && form.role !== 'investor') {
          await updateDoc(doc(db, 'investors', oldUser.investorId), {
            userId: null,
            updatedAt: serverTimestamp(),
          });
        }

        setSuccessMsg('تم تحديث المستخدم بنجاح');
      } else {
        // ── إنشاء مستخدم جديد ──
        const newUid = await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          status: form.status,
          investorId: form.role === 'investor' ? (form.investorId || undefined) : undefined,
          permissions: form.role === 'admin' ? form.permissions : undefined,
          createdBy: currentUser!.id,
        });

        // ✅ احفظ userId في بيانات المستثمر
        if (form.role === 'investor' && form.investorId && newUid) {
          await updateDoc(doc(db, 'investors', form.investorId), {
            userId: newUid,
            updatedAt: serverTimestamp(),
          });
        }

        setSuccessMsg('تم إنشاء الحساب بنجاح. يمكن للمستخدم تسجيل الدخول الآن.');
      }

      setShowModal(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ';
      // ترجمة رسائل Firebase الشائعة
      if (msg.includes('email-already-in-use')) setError('هذا البريد الإلكتروني مستخدم بالفعل');
      else if (msg.includes('weak-password')) setError('كلمة المرور ضعيفة جداً (8 أحرف على الأقل)');
      else if (msg.includes('invalid-email')) setError('البريد الإلكتروني غير صالح');
      else setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`إرسال رابط إعادة تعيين كلمة المرور إلى ${email}؟`)) return;
    try {
      await resetUserPassword(email);
      alert('تم إرسال رابط إعادة تعيين كلمة المرور بنجاح ✓');
    } catch {
      alert('فشل إرسال الرابط. تأكد من صحة البريد الإلكتروني.');
    }
  };

  const handleToggleStatus = async (u: User) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`هل تريد ${newStatus === 'inactive' ? 'تعطيل' : 'تفعيل'} حساب ${u.name}؟`)) return;
    await updateUser(u.id, { status: newStatus });
    await load();
  };

  // ✅ ربط سريع: تعيين userId لمستثمر مباشرةً بدون فتح النموذج الكامل
  const handleQuickLink = async (userId: string, investorId: string) => {
    setSaving(true);
    try {
      await updateUser(userId, { investorId });
      await updateDoc(doc(db, 'investors', investorId), {
        userId,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const roleCount = (role: UserRole) => users.filter(u => u.role === role).length;

  // المستثمرون الذين لديهم حسابات
  const linkedInvestorIds = new Set(users.filter(u => u.investorId).map(u => u.investorId!));
  // المستثمرون الذين ليس لديهم حسابات بعد
  const unlinkedInvestors = investors.filter(i => !linkedInvestorIds.has(i.id));

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">المستخدمون والصلاحيات</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} مستخدم</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16} />مستخدم جديد</button>
      </div>

      {successMsg && (
        <div className="alert-success text-sm">
          <UserCheck size={16} className="shrink-0" />{successMsg}
          <button onClick={() => setSuccessMsg('')} className="mr-auto text-green-700 hover:text-green-900"><X size={14} /></button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { role: 'manager', label: 'مدراء', icon: <Shield size={16} className="text-purple-600" />, bg: 'bg-purple-50' },
          { role: 'admin', label: 'إداريون', icon: <UserCog size={16} className="text-blue-600" />, bg: 'bg-blue-50' },
          { role: 'investor', label: 'مستثمرون', icon: <UserCheck size={16} className="text-green-600" />, bg: 'bg-green-50' },
        ].map(item => (
          <div key={item.role} className="stat-card">
            <div className={`p-2 ${item.bg} rounded-lg w-fit mb-2`}>{item.icon}</div>
            <p className="text-xl font-bold">{roleCount(item.role as UserRole)}</p>
            <p className="text-xs text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* ✅ تنبيه للمستثمرين غير المرتبطين */}
      {unlinkedInvestors.length > 0 && (
        <div className="alert-warning text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{unlinkedInvestors.length} مستثمر ليس لديهم حساب دخول: {unlinkedInvestors.map(i => i.name).join('، ')}</span>
        </div>
      )}

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-slate-400">لا يوجد مستخدمون</div>
        ) : users.map(u => {
          const linkedInvestor = u.investorId ? investors.find(i => i.id === u.investorId) : null;
          return (
            <div key={u.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                    {u.name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{u.email}</p>
                  </div>
                </div>
                <span className={u.role === 'manager' ? 'badge-purple' : u.role === 'admin' ? 'badge-blue' : 'badge-green'}>
                  {USER_ROLES[u.role]}
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className={`${u.status === 'active' ? 'badge-green' : 'badge-red'} text-xs`}>
                  {u.status === 'active' ? 'نشط' : 'معطل'}
                </span>
                {linkedInvestor ? (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <UserCheck size={13} />{linkedInvestor.name}
                  </span>
                ) : u.role === 'investor' ? (
                  <span className="text-xs text-red-600 flex items-center gap-1">
                    <UserX size={13} />غير مرتبط بمستثمر
                  </span>
                ) : null}
              </div>
              <div className="flex gap-1.5 flex-wrap border-t border-slate-100 pt-3">
                <button onClick={() => openEdit(u)} className="flex-1 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"><Edit2 size={13} />تعديل</button>
                <button onClick={() => handleResetPassword(u.email)} className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"><Key size={13} />إعادة كلمة المرور</button>
                {u.id !== currentUser?.id && (
                  <button onClick={() => handleToggleStatus(u)} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${u.status === 'active' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {u.status === 'active' ? <><UserX size={13} />تعطيل</> : <><UserCheck size={13} />تفعيل</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th>
              <th>المستثمر المرتبط</th><th>آخر دخول</th><th>الحالة</th><th>إجراءات</th>
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
                  <td className="text-slate-500 text-sm font-mono">{u.email}</td>
                  <td>
                    <span className={u.role === 'manager' ? 'badge-purple' : u.role === 'admin' ? 'badge-blue' : 'badge-green'}>
                      {USER_ROLES[u.role]}
                    </span>
                  </td>
                  <td>
                    {linkedInvestor ? (
                      <span className="text-green-700 text-sm flex items-center gap-1">
                        <UserCheck size={14} />{linkedInvestor.name}
                      </span>
                    ) : u.role === 'investor' ? (
                      <span className="text-red-500 text-xs flex items-center gap-1">
                        <UserX size={13} />غير مرتبط
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="text-slate-400 text-xs">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {u.lastLogin ? timeAgo(u.lastLogin) : 'لم يدخل بعد'}
                    </span>
                  </td>
                  <td>
                    <span className={u.status === 'active' ? 'badge-green' : 'badge-red'}>
                      {u.status === 'active' ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg" title="تعديل"><Edit2 size={14} /></button>
                      <button onClick={() => handleResetPassword(u.email)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="إعادة تعيين كلمة المرور"><Key size={14} /></button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => handleToggleStatus(u)} className={`p-1.5 rounded-lg ${u.status === 'active' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-green-50 text-green-600'}`} title={u.status === 'active' ? 'تعطيل' : 'تفعيل'}>
                          {u.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
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
              <h2 className="font-bold text-base">{editingId ? 'تعديل مستخدم' : 'إنشاء مستخدم جديد'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && (
                <div className="alert-danger text-sm">
                  <AlertCircle size={16} className="shrink-0" />{error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">الاسم الكامل *</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="اسم المستخدم" />
                </div>
                <div>
                  <label className="label">البريد الإلكتروني *</label>
                  <input className="input" type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" disabled={!!editingId} />
                  {editingId && <p className="text-xs text-slate-400 mt-1">لا يمكن تغيير البريد الإلكتروني</p>}
                </div>

                {!editingId && (
                  <div className="col-span-2">
                    <label className="label">كلمة المرور الابتدائية *</label>
                    <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="8 أحرف على الأقل" />
                    <p className="text-xs text-slate-400 mt-1">يُنصح بتغييرها عند أول دخول</p>
                  </div>
                )}

                <div>
                  <label className="label">نوع المستخدم</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole, investorId: '' })}>
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

                {/* ✅ ربط المستثمر — يظهر فقط لنوع "مستثمر" */}
                {form.role === 'investor' && (
                  <div className="col-span-2">
                    <label className="label">ربط بمستثمر *</label>
                    <select
                      className="input"
                      value={form.investorId}
                      onChange={e => {
                        const inv = investors.find(i => i.id === e.target.value);
                        setForm({
                          ...form,
                          investorId: e.target.value,
                          // ✅ اقتراح اسم المستثمر إذا كان الحقل فارغاً
                          name: form.name || (inv?.name || ''),
                          email: form.email || (inv?.email || ''),
                        });
                      }}
                    >
                      <option value="">— اختر المستثمر المرتبط —</option>
                      {investors.map(i => {
                        const alreadyLinked = linkedInvestorIds.has(i.id) && i.id !== form.investorId;
                        return (
                          <option key={i.id} value={i.id} disabled={alreadyLinked}>
                            {i.name} ({i.investorNumber}){alreadyLinked ? ' — مرتبط بحساب آخر' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {form.investorId && (() => {
                      const inv = investors.find(i => i.id === form.investorId);
                      return inv ? (
                        <div className="mt-2 bg-blue-50 rounded-xl p-3 text-sm">
                          <p className="text-blue-800 font-semibold">{inv.name}</p>
                          <p className="text-blue-600 text-xs">{inv.email} · {inv.investorNumber}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* صلاحيات الإداري */}
              {form.role === 'admin' && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="font-semibold text-slate-700 mb-3 text-sm flex items-center gap-2">
                    <Shield size={15} />الصلاحيات التفصيلية
                  </p>
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
