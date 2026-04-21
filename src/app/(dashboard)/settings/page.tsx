'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Save, Settings, Shield, Bell, Database, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const { user, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'fund'>('general');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fund settings (stored locally for demo, would be in Firestore in prod)
  const [fundSettings, setFundSettings] = useState({
    fundName: 'الصندوق العائلي',
    currency: 'SAR',
    currencySymbol: 'ر.س',
    fiscalYearStart: '01-01',
    expenseTypes: ['زكاة', 'رسوم بنكية', 'إدارية', 'قانونية', 'أخرى'],
    investmentTypes: ['مغلق بعائد نهائي', 'يوزع أرباحاً دورية', 'تراكمي', 'متعثر', 'مجمد'],
    paymentMethods: ['تحويل بنكي', 'نقداً', 'شيك', 'أخرى'],
  });

  const handleChangePassword = async () => {
    setPwError(''); setPwSuccess(false);
    if (!pwForm.newPw || !pwForm.confirm) { setPwError('يرجى تعبئة جميع الحقول'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('كلمة المرور الجديدة غير متطابقة'); return; }
    if (pwForm.newPw.length < 8) { setPwError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    setSaving(true);
    try {
      await changePassword(pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch {
      setPwError('فشل تغيير كلمة المرور. تأكد من كلمة المرور الحالية.');
    } finally { setSaving(false); }
  };

  const tabs = [
    { id: 'general', label: 'الحساب الشخصي', icon: <Settings size={16} /> },
    { id: 'security', label: 'الأمان', icon: <Shield size={16} /> },
    { id: 'fund', label: 'إعدادات الصندوق', icon: <Database size={16} /> },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">الإعدادات</h1>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="card p-6 max-w-lg">
          <h3 className="section-title">معلومات الحساب</h3>
          <div className="space-y-4">
            <div>
              <label className="label">الاسم الكامل</label>
              <input className="input bg-slate-50" value={user?.name || ''} readOnly />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input className="input bg-slate-50" value={user?.email || ''} readOnly dir="ltr" />
            </div>
            <div>
              <label className="label">نوع المستخدم</label>
              <input className="input bg-slate-50" value={user?.role === 'manager' ? 'مدير' : user?.role === 'admin' ? 'مستخدم إداري' : 'مستثمر'} readOnly />
            </div>
            <p className="text-xs text-slate-400">لتعديل هذه البيانات، تواصل مع مدير النظام</p>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="card p-6 max-w-lg">
          <h3 className="section-title">تغيير كلمة المرور</h3>
          <div className="space-y-4">
            {pwError && <div className="alert-danger text-sm">{pwError}</div>}
            {pwSuccess && (
              <div className="alert-success text-sm">
                <CheckCircle size={16} className="shrink-0" />
                تم تغيير كلمة المرور بنجاح
              </div>
            )}
            <div>
              <label className="label">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  className="input pr-3 pl-10"
                  type={showNewPw ? 'text' : 'password'}
                  value={pwForm.newPw}
                  onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })}
                  placeholder="8 أحرف على الأقل"
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">تأكيد كلمة المرور الجديدة</label>
              <input
                className="input"
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                placeholder="أعد كتابة كلمة المرور"
              />
            </div>
            <button onClick={handleChangePassword} disabled={saving} className="btn-primary w-full justify-center">
              <Save size={16} />{saving ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-semibold text-slate-700 mb-3 text-sm">نصائح للأمان</h4>
            <ul className="space-y-2">
              {[
                'استخدم كلمة مرور تتكون من 8 أحرف على الأقل',
                'اجمع بين الأحرف الكبيرة والصغيرة والأرقام',
                'لا تشارك كلمة مرورك مع أي أحد',
                'غيّر كلمة المرور بشكل دوري',
              ].map(tip => (
                <li key={tip} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle size={14} className="text-green-500 shrink-0 mt-0.5" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'fund' && user?.role === 'manager' && (
        <div className="space-y-6">
          <div className="card p-6 max-w-xl">
            <h3 className="section-title">إعدادات الصندوق</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">اسم الصندوق</label>
                <input className="input" value={fundSettings.fundName} onChange={e => setFundSettings({ ...fundSettings, fundName: e.target.value })} />
              </div>
              <div>
                <label className="label">العملة</label>
                <select className="input" value={fundSettings.currency} onChange={e => setFundSettings({ ...fundSettings, currency: e.target.value })}>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                  <option value="KWD">دينار كويتي (KWD)</option>
                </select>
              </div>
              <div>
                <label className="label">بداية السنة المالية</label>
                <select className="input" value={fundSettings.fiscalYearStart} onChange={e => setFundSettings({ ...fundSettings, fiscalYearStart: e.target.value })}>
                  <option value="01-01">يناير (01)</option>
                  <option value="04-01">أبريل (04)</option>
                  <option value="07-01">يوليو (07)</option>
                  <option value="10-01">أكتوبر (10)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn-primary">
                <Save size={16} />حفظ الإعدادات
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { title: 'أنواع المصاريف', items: fundSettings.expenseTypes },
              { title: 'أنواع الاستثمار', items: fundSettings.investmentTypes },
              { title: 'طرق الدفع', items: fundSettings.paymentMethods },
            ].map(group => (
              <div key={group.title} className="card p-4">
                <h4 className="font-semibold text-slate-700 mb-3 text-sm">{group.title}</h4>
                <ul className="space-y-1.5">
                  {group.items.map(item => (
                    <li key={item} className="text-sm text-slate-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button className="text-blue-600 text-xs mt-3 hover:underline">+ إضافة (قريباً)</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
