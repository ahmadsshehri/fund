'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy, query, Timestamp, writeBatch, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { addLedgerEntry } from '@/lib/accounting';
import {
  Plus, Search, Edit2, Eye, X, Save, AlertCircle, RefreshCw,
  TrendingUp, CheckCircle, XCircle, Lock,
  Activity, PlusCircle, BarChart2, Trash2, Banknote, Info,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
// ✅ حذف 'distressed' — الاستثمار إما قائم أو مغلق فقط
type InvStatus = 'active' | 'closed';
type InvType = 'accumulative' | 'dividend';

interface DividendRecord { id: string; date: Date; amount: number; notes: string; }
interface ValueUpdate { id: string; date: Date; previousValue: number; newValue: number; profit: number; notes: string; }
interface AdditionalAmount { id: string; date: Date; amount: number; notes: string; }

interface Investment {
  id: string; investmentNumber: string; name: string; entity: string;
  invType: InvType; entryDate: Date; entryAmount: number; currentValue: number;
  totalProfit: number; annualReturn: number; trueReturn: number;
  status: InvStatus; closingDate?: Date; closingAmount?: number;
  notes: string;
  dividends: DividendRecord[];
  valueUpdates: ValueUpdate[];
  additionalAmounts: AdditionalAmount[];
  createdAt: Date;
}

const STATUS_LABELS: Record<InvStatus, string> = { active: 'قائم', closed: 'مغلق' };
const STATUS_COLORS: Record<InvStatus, string> = { active: 'badge-green', closed: 'badge-blue' };
const TYPE_LABELS: Record<InvType, string> = { accumulative: 'تراكمي', dividend: 'يوزع أرباح' };
const TYPE_COLORS: Record<InvType, string> = { accumulative: 'badge-purple', dividend: 'badge-orange' };

const toDate = (v: unknown): Date =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);

const daysBetween = (from: Date, to?: Date) =>
  Math.max(1, Math.round(((to || new Date()).getTime() - from.getTime()) / 86400000));

const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

function calcReturns(inv: Investment) {
  const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
  const days = daysBetween(inv.entryDate, inv.closingDate);
  const years = days / 365;
  let capitalGain = 0;
  if (inv.status === 'closed') {
    capitalGain = (inv.closingAmount || 0) - inv.entryAmount;
  } else if (inv.invType === 'accumulative') {
    capitalGain = inv.currentValue - inv.entryAmount;
  }
  const totalProfit = totalDividends + capitalGain;
  const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
  const annualReturn = years > 0 ? trueReturn / years : 0;
  return { totalDividends, capitalGain, totalProfit, trueReturn, annualReturn };
}

const EMPTY_FORM = {
  name: '', entity: '', invType: 'accumulative' as InvType,
  entryDate: '', entryAmount: '', status: 'active' as InvStatus,
  notes: '', closingDate: '', closingAmount: '',
};

export default function InvestmentsPage() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [ownerCapital, setOwnerCapital] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [editInv, setEditInv] = useState<Investment | null>(null);
  const [showDetail, setShowDetail] = useState<Investment | null>(null);
  const [showClose, setShowClose] = useState<Investment | null>(null);
  const [showAddCapital, setShowAddCapital] = useState<Investment | null>(null);
  const [showAddProfit, setShowAddProfit] = useState<Investment | null>(null);
  const [showAddDividend, setShowAddDividend] = useState<Investment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Investment | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [closeForm, setCloseForm] = useState({ closingDate: '', closingAmount: '' });
  const [capitalForm, setCapitalForm] = useState({ date: '', amount: '', notes: '' });
  const [profitForm, setProfitForm] = useState({ date: '', newValue: '', notes: '' });
  const [dividendForm, setDividendForm] = useState({ date: '', amount: '', notes: '' });
  const [editDividend, setEditDividend] = useState<{ invId: string; record: DividendRecord } | null>(null);
  const [editValueUpdate, setEditValueUpdate] = useState<{ invId: string; record: ValueUpdate } | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [snap, invSnap] = await Promise.all([
        getDocs(query(collection(db, 'investments'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'investors')),
      ]);
      setOwnerCapital(invSnap.docs.reduce((s, d) => s + ((d.data().totalPaid as number) || 0), 0));
      setInvestments(snap.docs.map(d => {
        const v = d.data();
        // ✅ تحويل أي قيمة distressed → active عند القراءة (للبيانات القديمة)
        const rawStatus = v.status || 'active';
        const status: InvStatus = rawStatus === 'distressed' ? 'active' : rawStatus;
        return {
          id: d.id,
          investmentNumber: v.investmentNumber || '',
          name: v.name || '', entity: v.entity || '',
          invType: v.invType || 'accumulative',
          entryDate: toDate(v.entryDate), entryAmount: v.entryAmount || 0,
          currentValue: v.currentValue || v.entryAmount || 0,
          totalProfit: v.totalProfit || 0, annualReturn: v.annualReturn || 0, trueReturn: v.trueReturn || 0,
          status,
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          closingAmount: v.closingAmount,
          notes: v.notes || '',
          dividends: (v.dividends || []).map((dd: Record<string, unknown>) => ({ ...dd, date: toDate(dd.date) })),
          valueUpdates: (v.valueUpdates || []).map((u: Record<string, unknown>) => ({ ...u, date: toDate(u.date) })),
          additionalAmounts: (v.additionalAmounts || []).map((a: Record<string, unknown>) => ({
            id: (a.id as string) || String(Date.now()),
            amount: a.amount, notes: a.notes, date: toDate(a.date),
          })),
          createdAt: toDate(v.createdAt),
        };
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ─── Portfolio metrics ──────────────────────────────────────────────────
  const activeInvs = investments.filter(i => i.status === 'active');
  const closedInvs = investments.filter(i => i.status === 'closed');
  const totalDividendsAll = investments.reduce((s, i) => s + i.dividends.reduce((ss, d) => ss + d.amount, 0), 0);
  const totalCapGain = closedInvs.reduce((s, i) => s + ((i.closingAmount || 0) - i.entryAmount), 0)
    + activeInvs.reduce((s, i) => i.invType === 'accumulative' ? s + (i.currentValue - i.entryAmount) : s, 0);
  const totalProfitAll = totalDividendsAll + totalCapGain;
  const portfolioReturn = ownerCapital > 0 ? (totalProfitAll / ownerCapital) * 100 : 0;

  const filtered = investments.filter(inv =>
    (inv.name.toLowerCase().includes(search.toLowerCase()) || inv.entity.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || inv.status === statusFilter) &&
    (typeFilter === 'all' || inv.invType === typeFilter)
  );

  // ─── Save ───────────────────────────────────────────────────────────────
  const openEdit = (inv: Investment) => {
    setEditInv(inv);
    setForm({
      name: inv.name, entity: inv.entity, invType: inv.invType,
      entryDate: inv.entryDate.toISOString().split('T')[0],
      entryAmount: String(inv.entryAmount), status: inv.status, notes: inv.notes,
      closingDate: inv.closingDate ? inv.closingDate.toISOString().split('T')[0] : '',
      closingAmount: inv.closingAmount ? String(inv.closingAmount) : '',
    });
    setError(''); setShowAdd(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.entity || !form.entryDate || !form.entryAmount) {
      setError('يرجى تعبئة الحقول المطلوبة'); return;
    }
    setSaving(true); setError('');
    try {
      const entryAmount = parseFloat(form.entryAmount);
      const entryDate = new Date(form.entryDate);
      let closingDate, closingAmount, totalProfit = 0, annualReturn = 0, trueReturn = 0;

      if (form.status === 'closed' && form.closingDate && form.closingAmount) {
        closingDate = Timestamp.fromDate(new Date(form.closingDate));
        closingAmount = parseFloat(form.closingAmount);
        totalProfit = closingAmount - entryAmount;
        const days = daysBetween(entryDate, new Date(form.closingDate));
        trueReturn = entryAmount > 0 ? (totalProfit / entryAmount) * 100 : 0;
        annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      }

      // currentValue: للمغلق = closingAmount، للتراكمي القائم = entryAmount، للموزِّع = entryAmount
      const currentValue = form.status === 'closed'
        ? (closingAmount || entryAmount)
        : entryAmount;

      const data: Record<string, unknown> = {
        name: form.name, entity: form.entity, invType: form.invType,
        entryDate: Timestamp.fromDate(entryDate), entryAmount,
        status: form.status, notes: form.notes,
        closingDate: closingDate || null, closingAmount: closingAmount || null,
        totalProfit, annualReturn, trueReturn, currentValue,
      };

      if (editInv) {
        // تعديل — لا نُعيد كتابة الـ ledger
        await updateDoc(doc(db, 'investments', editInv.id), data);
      } else {
        // ✅ إنشاء جديد — نكتب في الـ ledger لتأثير على النقد
        const num = `INV-${String(investments.length + 1).padStart(4, '0')}`;
        const invRef = await addDoc(collection(db, 'investments'), {
          ...data, investmentNumber: num,
          dividends: [], valueUpdates: [], additionalAmounts: [],
          createdAt: serverTimestamp(), createdBy: user?.id,
        });

        // ✅ Ledger: خصم النقد عند دخول الاستثمار
        await addLedgerEntry({
          date: entryDate,
          type: 'invest_funding',
          description: `تمويل استثمار: ${form.name}`,
          cashEffect: -entryAmount,
          bookValueEffect: entryAmount,
          investmentId: invRef.id,
          createdBy: user?.id || 'system',
        });

        // ✅ إذا كان مغلقاً عند الإدخال — أضف حركة تخارج أيضاً
        if (form.status === 'closed' && closingDate && closingAmount) {
          await addLedgerEntry({
            date: new Date(form.closingDate),
            type: 'invest_full_exit',
            description: `إغلاق استثمار: ${form.name}`,
            cashEffect: closingAmount,
            bookValueEffect: -entryAmount,
            realizedProfitEffect: closingAmount - entryAmount,
            investmentId: invRef.id,
            createdBy: user?.id || 'system',
          });
        }
      }

      setShowAdd(false); setEditInv(null); setForm(EMPTY_FORM);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'investments', confirmDelete.id));
      // حذف حركات الـ ledger المرتبطة
      const ledgerSnap = await getDocs(
        query(collection(db, 'ledger'), where('investmentId', '==', confirmDelete.id))
      );
      ledgerSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setConfirmDelete(null); await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Close ────────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!showClose || !closeForm.closingDate || !closeForm.closingAmount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = showClose;
      const closingAmount = parseFloat(closeForm.closingAmount);
      const closingDate = new Date(closeForm.closingDate);
      const tempInv = { ...inv, status: 'closed' as InvStatus, closingAmount };
      const returns = calcReturns(tempInv);

      await updateDoc(doc(db, 'investments', inv.id), {
        status: 'closed',
        closingDate: Timestamp.fromDate(closingDate),
        closingAmount,
        totalProfit: returns.totalProfit,
        trueReturn: returns.trueReturn,
        annualReturn: returns.annualReturn,
        currentValue: closingAmount,
      });

      // ✅ Ledger: إضافة متحصلات التخارج
      await addLedgerEntry({
        date: closingDate,
        type: 'invest_full_exit',
        description: `إغلاق استثمار: ${inv.name}`,
        cashEffect: closingAmount,
        bookValueEffect: -inv.entryAmount,
        realizedProfitEffect: closingAmount - inv.entryAmount,
        investmentId: inv.id,
        createdBy: user?.id || 'system',
      });

      setShowClose(null); setCloseForm({ closingDate: '', closingAmount: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Add Dividend ──────────────────────────────────────────────────────
  const handleAddDividend = async () => {
    if (!showAddDividend || !dividendForm.date || !dividendForm.amount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = showAddDividend;
      const amount = parseFloat(dividendForm.amount);
      const newDividend = {
        id: Date.now().toString(),
        date: Timestamp.fromDate(new Date(dividendForm.date)),
        amount, notes: dividendForm.notes,
      };
      const updatedDividends = [
        ...inv.dividends.map(d => ({ ...d, date: Timestamp.fromDate(d.date) })),
        newDividend,
      ];
      const totalDividends = updatedDividends.reduce((s, d) => s + d.amount, 0);
      const capitalGain = inv.invType === 'accumulative' ? inv.currentValue - inv.entryAmount : 0;
      const totalProfit = totalDividends + capitalGain;
      const days = daysBetween(inv.entryDate);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;

      await updateDoc(doc(db, 'investments', inv.id), {
        dividends: updatedDividends, totalProfit, trueReturn, annualReturn,
      });

      // ✅ Ledger
      await addLedgerEntry({
        date: new Date(dividendForm.date),
        type: 'invest_dividend',
        description: `توزيع أرباح: ${inv.name}`,
        cashEffect: amount,
        investmentId: inv.id,
        createdBy: user?.id || 'system',
      });

      setShowAddDividend(null); setDividendForm({ date: '', amount: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Add Capital ──────────────────────────────────────────────────────
  const handleAddCapital = async () => {
    if (!showAddCapital || !capitalForm.date || !capitalForm.amount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = showAddCapital;
      const amount = parseFloat(capitalForm.amount);
      const newId = Date.now().toString();
      const updatedAdditional = [
        ...inv.additionalAmounts.map(a => ({ ...a, date: Timestamp.fromDate(a.date) })),
        { id: newId, date: Timestamp.fromDate(new Date(capitalForm.date)), amount, notes: capitalForm.notes },
      ];
      const newEntryAmount = inv.entryAmount + amount;
      const newCurrentValue = inv.invType === 'dividend' ? newEntryAmount : inv.currentValue + amount;

      await updateDoc(doc(db, 'investments', inv.id), {
        entryAmount: newEntryAmount, currentValue: newCurrentValue,
        additionalAmounts: updatedAdditional,
      });

      // ✅ Ledger
      await addLedgerEntry({
        date: new Date(capitalForm.date),
        type: 'invest_topup',
        description: `زيادة رأس مال: ${inv.name}`,
        cashEffect: -amount,
        bookValueEffect: amount,
        investmentId: inv.id,
        createdBy: user?.id || 'system',
      });

      setShowAddCapital(null); setCapitalForm({ date: '', amount: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete Capital ──────────────────────────────────────────────────
  const handleDeleteCapital = async (inv: Investment, itemId: string) => {
    if (!confirm('هل تريد حذف هذه الزيادة؟ سيُعاد حساب رأس المال تلقائياً.')) return;
    setSaving(true);
    try {
      const item = inv.additionalAmounts.find(a => a.id === itemId);
      if (!item) return;
      const filtered = inv.additionalAmounts.filter(a => a.id !== itemId);
      const newEntryAmount = inv.entryAmount - item.amount;
      const newCurrentValue = inv.invType === 'dividend'
        ? newEntryAmount
        : Math.max(0, inv.currentValue - item.amount);
      await updateDoc(doc(db, 'investments', inv.id), {
        entryAmount: newEntryAmount, currentValue: newCurrentValue,
        additionalAmounts: filtered.map(a => ({ ...a, date: Timestamp.fromDate(a.date) })),
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Update Value ────────────────────────────────────────────────────
  const handleUpdateValue = async () => {
    if (!showAddProfit || !profitForm.date || !profitForm.newValue) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = showAddProfit;
      const newValue = parseFloat(profitForm.newValue);
      const oldValue = inv.currentValue;
      const newUpdate = {
        id: Date.now().toString(),
        date: Timestamp.fromDate(new Date(profitForm.date)),
        previousValue: oldValue, newValue, profit: newValue - oldValue, notes: profitForm.notes,
      };
      const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const capitalGain = newValue - inv.entryAmount;
      const totalProfit = totalDividends + capitalGain;
      const days = daysBetween(inv.entryDate);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;

      await updateDoc(doc(db, 'investments', inv.id), {
        currentValue: newValue, totalProfit, trueReturn, annualReturn,
        valueUpdates: [
          ...inv.valueUpdates.map(u => ({ ...u, date: Timestamp.fromDate(u.date) })),
          newUpdate,
        ],
      });
      setShowAddProfit(null); setProfitForm({ date: '', newValue: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Edit Dividend ───────────────────────────────────────────────────
  const handleEditDividend = async () => {
    if (!editDividend || !dividendForm.date || !dividendForm.amount) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = investments.find(i => i.id === editDividend.invId);
      if (!inv) throw new Error('الاستثمار غير موجود');
      const updated = inv.dividends.map(d => d.id === editDividend.record.id
        ? { ...d, date: new Date(dividendForm.date), amount: parseFloat(dividendForm.amount), notes: dividendForm.notes }
        : d);
      const totalDividends = updated.reduce((s, d) => s + d.amount, 0);
      const capitalGain = inv.status === 'closed' ? (inv.closingAmount || 0) - inv.entryAmount : inv.invType === 'accumulative' ? inv.currentValue - inv.entryAmount : 0;
      const totalProfit = totalDividends + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate, inv.closingDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', editDividend.invId), {
        dividends: updated.map(d => ({ ...d, date: Timestamp.fromDate(d.date) })),
        totalProfit, trueReturn, annualReturn,
      });
      setEditDividend(null); setDividendForm({ date: '', amount: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete Dividend ─────────────────────────────────────────────────
  const handleDeleteDividend = async (inv: Investment, dividendId: string) => {
    if (!confirm('هل تريد حذف هذه الأرباح؟')) return;
    setSaving(true);
    try {
      const updated = inv.dividends.filter(d => d.id !== dividendId);
      const totalDividends = updated.reduce((s, d) => s + d.amount, 0);
      const capitalGain = inv.status === 'closed' ? (inv.closingAmount || 0) - inv.entryAmount : inv.invType === 'accumulative' ? inv.currentValue - inv.entryAmount : 0;
      const totalProfit = totalDividends + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate, inv.closingDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', inv.id), {
        dividends: updated.map(d => ({ ...d, date: Timestamp.fromDate(d.date) })),
        totalProfit, trueReturn, annualReturn,
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Edit / Delete Value Update ──────────────────────────────────────
  const handleEditValueUpdate = async () => {
    if (!editValueUpdate || !profitForm.date || !profitForm.newValue) {
      setError('يرجى تعبئة جميع الحقول'); return;
    }
    setSaving(true); setError('');
    try {
      const inv = investments.find(i => i.id === editValueUpdate.invId);
      if (!inv) throw new Error('الاستثمار غير موجود');
      const newValue = parseFloat(profitForm.newValue);
      const updated = inv.valueUpdates.map((u, idx) => {
        if (u.id !== editValueUpdate.record.id) return { ...u, date: Timestamp.fromDate(u.date) };
        const prev = idx > 0 ? inv.valueUpdates[idx - 1].newValue : inv.entryAmount;
        return { ...u, date: Timestamp.fromDate(new Date(profitForm.date)), newValue, previousValue: prev, profit: newValue - prev, notes: profitForm.notes };
      });
      const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const totalProfit = totalDividends + (newValue - inv.entryAmount);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', editValueUpdate.invId), {
        currentValue: newValue, totalProfit, trueReturn, annualReturn, valueUpdates: updated,
      });
      setEditValueUpdate(null); setProfitForm({ date: '', newValue: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleDeleteValueUpdate = async (inv: Investment, updateId: string) => {
    if (!confirm('هل تريد حذف هذا التحديث؟')) return;
    setSaving(true);
    try {
      const filtered = inv.valueUpdates.filter(u => u.id !== updateId);
      const newCV = filtered.length > 0 ? filtered[filtered.length - 1].newValue : inv.entryAmount;
      const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const totalProfit = totalDividends + (newCV - inv.entryAmount);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', inv.id), {
        currentValue: newCV, totalProfit, trueReturn, annualReturn,
        valueUpdates: filtered.map(u => ({ ...u, date: Timestamp.fromDate(u.date) })),
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── UI ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">الاستثمارات</h1>
          <p className="text-slate-500 text-sm mt-0.5">{investments.length} استثمار إجمالاً</p>
        </div>
        <button onClick={() => { setEditInv(null); setForm(EMPTY_FORM); setError(''); setShowAdd(true); }} className="btn-primary">
          <Plus size={16} /> استثمار جديد
        </button>
      </div>

      {/* Portfolio Banner */}
      <div className="bg-gradient-to-l from-blue-700 to-indigo-800 rounded-2xl p-5 text-white">
        <p className="text-blue-200 text-xs font-medium mb-3 flex items-center gap-1.5">
          <BarChart2 size={14} /> مؤشرات المحفظة
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-blue-300 text-xs mb-1">إجمالي رأس المال</p><p className="text-lg font-bold">{formatCurrency(ownerCapital)}</p></div>
          <div><p className="text-blue-300 text-xs mb-1">أرباح موزعة</p><p className="text-lg font-bold text-green-300">{formatCurrency(totalDividendsAll)}</p></div>
          <div><p className="text-blue-300 text-xs mb-1">مكاسب رأس المال</p><p className={`text-lg font-bold ${totalCapGain >= 0 ? 'text-green-300' : 'text-red-300'}`}>{totalCapGain >= 0 ? '+' : ''}{formatCurrency(totalCapGain)}</p></div>
          <div className="border-r border-blue-600 pr-4">
            <p className="text-blue-300 text-xs mb-1">عائد المحفظة</p>
            <p className={`text-2xl font-bold ${portfolioReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pct(portfolioReturn)}</p>
          </div>
        </div>
      </div>

      {/* Stats — ✅ حذف "متعثرة" */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card"><div className="p-2 bg-green-50 rounded-lg w-fit mb-2"><Activity size={16} className="text-green-600" /></div><p className="text-xl font-bold text-green-700">{activeInvs.length}</p><p className="text-xs text-slate-500">قائمة</p></div>
        <div className="stat-card"><div className="p-2 bg-blue-50 rounded-lg w-fit mb-2"><CheckCircle size={16} className="text-blue-600" /></div><p className="text-xl font-bold text-blue-700">{closedInvs.length}</p><p className="text-xs text-slate-500">مغلقة</p></div>
        <div className="stat-card"><div className="p-2 bg-emerald-50 rounded-lg w-fit mb-2"><TrendingUp size={16} className="text-emerald-600" /></div><p className="text-xl font-bold text-emerald-700">{formatCurrency(totalProfitAll)}</p><p className="text-xs text-slate-500">صافي الأرباح</p></div>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجهة..." className="input pr-9 text-sm" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'active', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${statusFilter === s ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
          <div className="h-7 w-px bg-slate-200 self-center" />
          {(['all', 'accumulative', 'dividend'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${typeFilter === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {t === 'all' ? 'كل الأنواع' : TYPE_LABELS[t]}
            </button>
          ))}
          <button onClick={load} className="btn-secondary px-3 py-1.5 text-xs"><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="text-center py-10 text-slate-400">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">لا توجد استثمارات</div>
        ) : filtered.map(inv => {
          const r = calcReturns(inv);
          return (
            <div key={inv.id} className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-800">{inv.name}</p>
                  <p className="text-xs text-slate-400">{inv.entity} · {inv.investmentNumber}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`${STATUS_COLORS[inv.status]} text-xs`}>{STATUS_LABELS[inv.status]}</span>
                  <span className={`${TYPE_COLORS[inv.invType]} text-xs`}>{TYPE_LABELS[inv.invType]}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">رأس المال</p><p className="font-bold text-blue-700 text-sm">{formatCurrency(inv.entryAmount)}</p></div>
                <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">القيمة الحالية</p><p className="font-bold text-sm">{inv.status === 'closed' ? formatCurrency(inv.closingAmount || 0) : formatCurrency(inv.currentValue)}</p></div>
                <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">العائد الحقيقي</p><p className={`font-bold text-sm ${r.trueReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.trueReturn >= 0 ? '+' : ''}{pct(r.trueReturn)}</p></div>
                <div className="bg-slate-50 rounded-xl p-2.5"><p className="text-xs text-slate-500">أرباح موزعة</p><p className="font-bold text-orange-600 text-sm">{r.totalDividends > 0 ? formatCurrency(r.totalDividends) : '—'}</p></div>
              </div>
              <div className="flex gap-1.5 flex-wrap border-t border-slate-100 pt-3">
                <button onClick={() => setShowDetail(inv)} className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"><Eye size={13} />تفاصيل</button>
                <button onClick={() => openEdit(inv)} className="flex-1 py-1.5 bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"><Edit2 size={13} />تعديل</button>
                {inv.status === 'active' && (<>
                  <button onClick={() => { setShowClose(inv); setCloseForm({ closingDate: '', closingAmount: '' }); setError(''); }} className="py-1.5 px-2.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold flex items-center gap-1"><Lock size={13} />إغلاق</button>
                  <button onClick={() => { setShowAddCapital(inv); setCapitalForm({ date: '', amount: '', notes: '' }); setError(''); }} className="py-1.5 px-2.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold flex items-center gap-1"><PlusCircle size={13} />رأس مال</button>
                  {inv.invType === 'dividend' && <button onClick={() => { setShowAddDividend(inv); setDividendForm({ date: '', amount: '', notes: '' }); setError(''); }} className="py-1.5 px-2.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-semibold flex items-center gap-1"><Banknote size={13} />أرباح</button>}
                  {inv.invType === 'accumulative' && <button onClick={() => { setShowAddProfit(inv); setProfitForm({ date: '', newValue: String(inv.currentValue), notes: '' }); setError(''); }} className="py-1.5 px-2.5 bg-yellow-50 text-yellow-700 rounded-lg text-xs font-semibold flex items-center gap-1"><TrendingUp size={13} />قيمة</button>}
                </>)}
                <button onClick={() => setConfirmDelete(inv)} className="py-1.5 px-2.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-1"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop Table ── */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th><th>الاستثمار</th><th>النوع</th><th>تاريخ الدخول</th>
              <th>رأس المال</th><th>أرباح موزعة</th><th>القيمة الحالية</th>
              <th>العائد الحقيقي</th><th>العائد السنوي</th><th>المدة</th>
              <th>الحالة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="text-center py-12 text-slate-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-slate-400">لا توجد استثمارات</td></tr>
            ) : filtered.map(inv => {
              const r = calcReturns(inv);
              const days = daysBetween(inv.entryDate, inv.closingDate);
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-xs text-slate-500">{inv.investmentNumber}</td>
                  <td>
                    <p className="font-semibold text-slate-800">{inv.name}</p>
                    <p className="text-xs text-slate-400">{inv.entity}</p>
                    {inv.dividends.length > 0 && <p className="text-xs text-orange-500">{inv.dividends.length} توزيع</p>}
                    {inv.valueUpdates.length > 0 && <p className="text-xs text-purple-500">{inv.valueUpdates.length} تحديث</p>}
                  </td>
                  <td><span className={TYPE_COLORS[inv.invType]}>{TYPE_LABELS[inv.invType]}</span></td>
                  <td className="text-slate-600 text-sm">{formatDate(inv.entryDate)}</td>
                  <td className="font-semibold text-blue-700">{formatCurrency(inv.entryAmount)}</td>
                  <td className="text-orange-600">{r.totalDividends > 0 ? formatCurrency(r.totalDividends) : '—'}</td>
                  <td className="font-semibold">{inv.status === 'closed' ? formatCurrency(inv.closingAmount || 0) : formatCurrency(inv.currentValue)}</td>
                  <td className={r.trueReturn >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{r.trueReturn >= 0 ? '+' : ''}{pct(r.trueReturn)}</td>
                  <td className={r.annualReturn >= 0 ? 'text-green-700' : 'text-red-600'}>{pct(r.annualReturn)}</td>
                  <td className="text-slate-500 text-sm">{days} يوم</td>
                  <td><span className={`${STATUS_COLORS[inv.status]} text-xs`}>{STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShowDetail(inv)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg"><Eye size={14} /></button>
                      <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg"><Edit2 size={14} /></button>
                      {inv.status === 'active' && (<>
                        <button onClick={() => { setShowClose(inv); setCloseForm({ closingDate: '', closingAmount: '' }); setError(''); }} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg" title="إغلاق"><Lock size={14} /></button>
                        <button onClick={() => { setShowAddCapital(inv); setCapitalForm({ date: '', amount: '', notes: '' }); setError(''); }} className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg" title="إضافة رأس مال"><PlusCircle size={14} /></button>
                        {inv.invType === 'dividend' && <button onClick={() => { setShowAddDividend(inv); setDividendForm({ date: '', amount: '', notes: '' }); setError(''); }} className="p-1.5 hover:bg-orange-50 text-orange-600 rounded-lg" title="أرباح"><Banknote size={14} /></button>}
                        {inv.invType === 'accumulative' && <button onClick={() => { setShowAddProfit(inv); setProfitForm({ date: '', newValue: String(inv.currentValue), notes: '' }); setError(''); }} className="p-1.5 hover:bg-yellow-50 text-yellow-600 rounded-lg" title="تحديث القيمة"><TrendingUp size={14} /></button>}
                      </>)}
                      <button onClick={() => setConfirmDelete(inv)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Detail Modal ── */}
      {showDetail && (() => {
        const r = calcReturns(showDetail);
        return (
          <div className="modal-overlay" onClick={() => setShowDetail(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="font-bold text-base">{showDetail.name}</h2>
                  <span className={`${TYPE_COLORS[showDetail.invType]} text-xs mt-1`}>{TYPE_LABELS[showDetail.invType]}</span>
                </div>
                <button onClick={() => setShowDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>
              <div className="modal-body space-y-4">
                {/* Returns banner */}
                <div className="bg-gradient-to-l from-slate-700 to-slate-800 rounded-xl p-4 text-white">
                  <p className="text-slate-300 text-xs mb-3 flex items-center gap-1"><Info size={12} />تحليل العوائد</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><p className="text-slate-400 text-xs">رأس المال</p><p className="font-bold">{formatCurrency(showDetail.entryAmount)}</p></div>
                    <div><p className="text-slate-400 text-xs">أرباح موزعة</p><p className="font-bold text-orange-300">{formatCurrency(r.totalDividends)}</p></div>
                    <div><p className="text-slate-400 text-xs">مكسب رأس المال</p><p className={`font-bold ${r.capitalGain >= 0 ? 'text-green-300' : 'text-red-300'}`}>{r.capitalGain >= 0 ? '+' : ''}{formatCurrency(r.capitalGain)}</p></div>
                    <div className="border-t border-slate-600 pt-2"><p className="text-slate-400 text-xs">صافي الربح</p><p className={`text-lg font-bold ${r.totalProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>{r.totalProfit >= 0 ? '+' : ''}{formatCurrency(r.totalProfit)}</p></div>
                    <div className="border-t border-slate-600 pt-2"><p className="text-slate-400 text-xs">العائد الحقيقي</p><p className={`text-lg font-bold ${r.trueReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pct(r.trueReturn)}</p></div>
                    <div className="border-t border-slate-600 pt-2"><p className="text-slate-400 text-xs">العائد السنوي</p><p className={`text-lg font-bold ${r.annualReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pct(r.annualReturn)}</p></div>
                  </div>
                </div>

                {/* Dividends */}
                {showDetail.dividends.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Banknote size={14} className="text-orange-500" />الأرباح الموزعة ({showDetail.dividends.length})</p>
                    <div className="space-y-2">
                      {showDetail.dividends.map(d => (
                        <div key={d.id} className="flex items-center justify-between bg-orange-50 rounded-xl p-3">
                          <div><p className="text-sm font-medium text-orange-800">{formatDate(d.date)}</p>{d.notes && <p className="text-xs text-orange-600">{d.notes}</p>}</div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-orange-700">{formatCurrency(d.amount)}</span>
                            <button onClick={() => { setEditDividend({ invId: showDetail.id, record: d }); setDividendForm({ date: d.date.toISOString().split('T')[0], amount: String(d.amount), notes: d.notes || '' }); }} className="icon-btn info"><Edit2 size={13} /></button>
                            <button onClick={() => handleDeleteDividend(showDetail, d.id)} className="icon-btn danger"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Value Updates */}
                {showDetail.valueUpdates.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><TrendingUp size={14} className="text-purple-500" />تحديثات القيمة ({showDetail.valueUpdates.length})</p>
                    <div className="space-y-2">
                      {showDetail.valueUpdates.map(u => (
                        <div key={u.id} className="flex items-center justify-between bg-purple-50 rounded-xl p-3">
                          <div><p className="text-sm font-medium text-purple-800">{formatDate(u.date)}</p><p className="text-xs text-purple-600">{formatCurrency(u.previousValue)} ← {formatCurrency(u.newValue)}</p></div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${u.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{u.profit >= 0 ? '+' : ''}{formatCurrency(u.profit)}</span>
                            <button onClick={() => { setEditValueUpdate({ invId: showDetail.id, record: u }); setProfitForm({ date: u.date.toISOString().split('T')[0], newValue: String(u.newValue), notes: u.notes || '' }); }} className="icon-btn info"><Edit2 size={13} /></button>
                            <button onClick={() => handleDeleteValueUpdate(showDetail, u.id)} className="icon-btn danger"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional Capital */}
                {showDetail.additionalAmounts.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><PlusCircle size={14} className="text-purple-500" />إضافات رأس المال ({showDetail.additionalAmounts.length})</p>
                    <div className="space-y-2">
                      {showDetail.additionalAmounts.map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-purple-50 rounded-xl p-3">
                          <div><p className="text-sm font-medium text-purple-800">{formatDate(a.date)}</p>{a.notes && <p className="text-xs text-purple-600">{a.notes}</p>}</div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-700">+{formatCurrency(a.amount)}</span>
                            <button onClick={() => handleDeleteCapital(showDetail, a.id)} className="icon-btn danger"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showDetail.notes && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">ملاحظات</p>
                    <p className="text-sm">{showDetail.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditInv(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="font-bold text-base">{editInv ? 'تعديل الاستثمار' : 'استثمار جديد'}</h2>
              <button onClick={() => { setShowAdd(false); setEditInv(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} className="shrink-0" />{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">اسم الاستثمار *</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">الجهة / الشركة *</label><input className="input" value={form.entity} onChange={e => setForm({ ...form, entity: e.target.value })} /></div>
                <div className="col-span-2">
                  <label className="label">نوع الاستثمار</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm({ ...form, invType: 'accumulative' })} className={`p-3 rounded-xl border-2 text-sm font-medium text-right transition-colors ${form.invType === 'accumulative' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <p className="font-semibold">تراكمي</p><p className="text-xs opacity-60 mt-0.5">الأرباح تُضاف للأصل</p>
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, invType: 'dividend' })} className={`p-3 rounded-xl border-2 text-sm font-medium text-right transition-colors ${form.invType === 'dividend' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <p className="font-semibold">يوزع أرباح</p><p className="text-xs opacity-60 mt-0.5">أرباح نقدية دورية</p>
                    </button>
                  </div>
                </div>
                <div><label className="label">تاريخ الدخول *</label><input className="input" type="date" value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} /></div>
                <div><label className="label">مبلغ الدخول (ريال) *</label><input className="input" type="number" value={form.entryAmount} onChange={e => setForm({ ...form, entryAmount: e.target.value })} /></div>
                <div className="col-span-2">
                  <label className="label">الحالة</label>
                  <div className="flex gap-2">
                    {(['active', 'closed'] as InvStatus[]).map(s => (
                      <button key={s} type="button" onClick={() => setForm({ ...form, status: s })} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${form.status === s ? s === 'active' ? 'bg-green-600 text-white border-green-600' : 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {form.status === 'closed' && (<>
                  <div><label className="label">تاريخ الإغلاق *</label><input className="input" type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} /></div>
                  <div>
                    <label className="label">مبلغ الإغلاق *</label>
                    <input className="input" type="number" value={form.closingAmount} onChange={e => setForm({ ...form, closingAmount: e.target.value })} />
                    {form.closingAmount && form.entryAmount && (
                      <p className={`text-xs mt-1 font-medium ${parseFloat(form.closingAmount) >= parseFloat(form.entryAmount) ? 'text-green-600' : 'text-red-600'}`}>
                        الربح: {formatCurrency(parseFloat(form.closingAmount) - parseFloat(form.entryAmount))}
                      </p>
                    )}
                  </div>
                </>)}
                <div className="col-span-2"><label className="label">ملاحظات</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowAdd(false); setEditInv(null); }} className="btn-secondary">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : editInv ? 'حفظ التعديلات' : 'إضافة'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dividend Modal ── */}
      {showAddDividend && (
        <div className="modal-overlay" onClick={() => setShowAddDividend(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base flex items-center gap-2"><Banknote size={17} className="text-orange-500" />تسجيل أرباح موزعة</h2><button onClick={() => setShowAddDividend(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="bg-orange-50 rounded-xl p-3"><p className="font-semibold text-orange-800">{showAddDividend.name}</p><p className="text-sm text-orange-600">رأس المال: {formatCurrency(showAddDividend.entryAmount)}</p><p className="text-sm text-orange-600">أرباح سابقة: {formatCurrency(showAddDividend.dividends.reduce((s, d) => s + d.amount, 0))}</p></div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ استلام الأرباح *</label><input className="input" type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} /></div>
              <div><label className="label">المبلغ المستلم *</label><input className="input" type="number" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} /></div>
              <div><label className="label">ملاحظات</label><input className="input" value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowAddDividend(null)} className="btn-secondary">إلغاء</button><button onClick={handleAddDividend} disabled={saving} className="btn-primary"><Banknote size={16} />{saving ? 'جاري...' : 'تسجيل'}</button></div>
          </div>
        </div>
      )}

      {/* ── Close Modal ── */}
      {showClose && (
        <div className="modal-overlay" onClick={() => setShowClose(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base">إغلاق الاستثمار</h2><button onClick={() => setShowClose(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="bg-blue-50 rounded-xl p-3"><p className="font-semibold text-blue-800">{showClose.name}</p><p className="text-sm text-blue-600">رأس المال: {formatCurrency(showClose.entryAmount)}</p>{showClose.dividends.length > 0 && <p className="text-sm text-orange-600">أرباح موزعة: {formatCurrency(showClose.dividends.reduce((s, d) => s + d.amount, 0))}</p>}</div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ الإغلاق *</label><input className="input" type="date" value={closeForm.closingDate} onChange={e => setCloseForm({ ...closeForm, closingDate: e.target.value })} /></div>
              <div>
                <label className="label">المبلغ المستلم عند الإغلاق *</label>
                <input className="input" type="number" value={closeForm.closingAmount} onChange={e => setCloseForm({ ...closeForm, closingAmount: e.target.value })} />
                {closeForm.closingAmount && (() => {
                  const totalDiv = showClose.dividends.reduce((s, d) => s + d.amount, 0);
                  const capGain = parseFloat(closeForm.closingAmount) - showClose.entryAmount;
                  const total = totalDiv + capGain;
                  return (
                    <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">مكسب رأس المال</span><span className={capGain >= 0 ? 'text-green-600' : 'text-red-600'}>{capGain >= 0 ? '+' : ''}{formatCurrency(capGain)}</span></div>
                      {totalDiv > 0 && <div className="flex justify-between"><span className="text-slate-500">أرباح موزعة سابقة</span><span className="text-orange-600">+{formatCurrency(totalDiv)}</span></div>}
                      <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>صافي الربح الكلي</span><span className={total >= 0 ? 'text-green-700' : 'text-red-600'}>{total >= 0 ? '+' : ''}{formatCurrency(total)}</span></div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowClose(null)} className="btn-secondary">إلغاء</button><button onClick={handleClose} disabled={saving} className="btn-success"><CheckCircle size={16} />{saving ? 'جاري...' : 'تأكيد الإغلاق'}</button></div>
          </div>
        </div>
      )}

      {/* ── Add Capital Modal ── */}
      {showAddCapital && (
        <div className="modal-overlay" onClick={() => setShowAddCapital(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base">إضافة رأس مال</h2><button onClick={() => setShowAddCapital(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="bg-purple-50 rounded-xl p-3"><p className="font-semibold text-purple-800">{showAddCapital.name}</p><p className="text-sm text-purple-600">رأس المال الحالي: {formatCurrency(showAddCapital.entryAmount)}</p></div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">التاريخ *</label><input className="input" type="date" value={capitalForm.date} onChange={e => setCapitalForm({ ...capitalForm, date: e.target.value })} /></div>
              <div><label className="label">المبلغ المضاف *</label><input className="input" type="number" value={capitalForm.amount} onChange={e => setCapitalForm({ ...capitalForm, amount: e.target.value })} />{capitalForm.amount && <p className="text-sm mt-1 text-purple-600">رأس المال الجديد: {formatCurrency(showAddCapital.entryAmount + parseFloat(capitalForm.amount))}</p>}</div>
              <div><label className="label">ملاحظات</label><input className="input" value={capitalForm.notes} onChange={e => setCapitalForm({ ...capitalForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowAddCapital(null)} className="btn-secondary">إلغاء</button><button onClick={handleAddCapital} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'إضافة'}</button></div>
          </div>
        </div>
      )}

      {/* ── Update Value Modal ── */}
      {showAddProfit && (
        <div className="modal-overlay" onClick={() => setShowAddProfit(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base">تحديث قيمة الاستثمار</h2><button onClick={() => setShowAddProfit(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="bg-yellow-50 rounded-xl p-3"><p className="font-semibold text-yellow-800">{showAddProfit.name}</p><p className="text-sm text-yellow-700">القيمة الحالية: <strong>{formatCurrency(showAddProfit.currentValue)}</strong></p></div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ التحديث *</label><input className="input" type="date" value={profitForm.date} onChange={e => setProfitForm({ ...profitForm, date: e.target.value })} /></div>
              <div>
                <label className="label">القيمة الجديدة (ريال) *</label>
                <input className="input" type="number" value={profitForm.newValue} onChange={e => setProfitForm({ ...profitForm, newValue: e.target.value })} />
                {profitForm.newValue && (
                  <div className="mt-2 bg-slate-50 rounded-lg p-3 text-sm flex justify-between">
                    <span className="text-slate-500">الفرق</span>
                    <span className={`font-bold ${parseFloat(profitForm.newValue) >= showAddProfit.currentValue ? 'text-green-600' : 'text-red-600'}`}>
                      {parseFloat(profitForm.newValue) >= showAddProfit.currentValue ? '+' : ''}{formatCurrency(parseFloat(profitForm.newValue) - showAddProfit.currentValue)}
                    </span>
                  </div>
                )}
              </div>
              <div><label className="label">ملاحظات</label><input className="input" value={profitForm.notes} onChange={e => setProfitForm({ ...profitForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setShowAddProfit(null)} className="btn-secondary">إلغاء</button><button onClick={handleUpdateValue} disabled={saving} className="btn-primary"><TrendingUp size={16} />{saving ? 'جاري...' : 'تحديث'}</button></div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base text-red-700">تأكيد الحذف</h2><button onClick={() => setConfirmDelete(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3"><p className="font-semibold text-red-800">{confirmDelete.name}</p><p className="text-sm text-red-600">رأس المال: {formatCurrency(confirmDelete.entryAmount)}</p></div>
              <div className="alert-warning text-sm"><AlertCircle size={16} className="shrink-0" /><div><p className="font-semibold">سيتم حذف ما يلي نهائياً:</p><ul className="mt-1 text-xs space-y-0.5"><li>• بيانات الاستثمار كاملة</li><li>• جميع سجلات الأرباح الموزعة ({confirmDelete.dividends.length})</li><li>• جميع تحديثات القيمة ({confirmDelete.valueUpdates.length})</li><li>• جميع حركات الـ ledger المرتبطة</li></ul></div></div>
            </div>
            <div className="modal-footer"><button onClick={() => setConfirmDelete(null)} className="btn-secondary">إلغاء</button><button onClick={handleDelete} disabled={saving} className="btn-danger"><Trash2 size={16} />{saving ? 'جاري...' : 'حذف نهائياً'}</button></div>
          </div>
        </div>
      )}

      {/* ── Edit Dividend ── */}
      {editDividend && (
        <div className="modal-overlay" onClick={() => setEditDividend(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base flex items-center gap-2"><Banknote size={17} className="text-orange-500" />تعديل توزيع الأرباح</h2><button onClick={() => setEditDividend(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">التاريخ *</label><input className="input" type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} /></div>
              <div><label className="label">المبلغ *</label><input className="input" type="number" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} /></div>
              <div><label className="label">ملاحظات</label><input className="input" value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setEditDividend(null)} className="btn-secondary">إلغاء</button><button onClick={handleEditDividend} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'حفظ'}</button></div>
          </div>
        </div>
      )}

      {/* ── Edit Value Update ── */}
      {editValueUpdate && (
        <div className="modal-overlay" onClick={() => setEditValueUpdate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2 className="font-bold text-base flex items-center gap-2"><TrendingUp size={17} className="text-purple-500" />تعديل تحديث القيمة</h2><button onClick={() => setEditValueUpdate(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button></div>
            <div className="modal-body space-y-4">
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ التحديث *</label><input className="input" type="date" value={profitForm.date} onChange={e => setProfitForm({ ...profitForm, date: e.target.value })} /></div>
              <div><label className="label">القيمة الجديدة *</label><input className="input" type="number" value={profitForm.newValue} onChange={e => setProfitForm({ ...profitForm, newValue: e.target.value })} /></div>
              <div><label className="label">ملاحظات</label><input className="input" value={profitForm.notes} onChange={e => setProfitForm({ ...profitForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer"><button onClick={() => setEditValueUpdate(null)} className="btn-secondary">إلغاء</button><button onClick={handleEditValueUpdate} disabled={saving} className="btn-primary"><Save size={16} />{saving ? 'جاري...' : 'حفظ'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
