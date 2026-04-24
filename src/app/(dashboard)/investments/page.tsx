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
import {
  Plus, Search, Edit2, Eye, X, Save, AlertCircle, RefreshCw,
  TrendingUp, DollarSign, CheckCircle, XCircle, Lock,
  Activity, PlusCircle, BarChart2, Trash2, Banknote, Info,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────
type InvStatus = 'active' | 'closed' | 'distressed';
type InvType = 'accumulative' | 'dividend'; // تراكمي | يوزع أرباح

interface DividendRecord {
  id: string; date: Date; amount: number; notes: string;
}
interface ValueUpdate {
  id: string; date: Date; previousValue: number; newValue: number; profit: number; notes: string;
}
interface Investment {
  id: string; investmentNumber: string; name: string; entity: string;
  invType: InvType; entryDate: Date; entryAmount: number; currentValue: number;
  totalProfit: number; annualReturn: number; trueReturn: number;
  status: InvStatus; closingDate?: Date; closingAmount?: number;
  distressReason?: string; distressDate?: Date; notes: string;
  dividends: DividendRecord[];
  valueUpdates: ValueUpdate[];
  additionalAmounts: { date: Date; amount: number; notes: string }[];
  createdAt: Date;
}

const STATUS_LABELS: Record<InvStatus, string> = { active: 'قائم', closed: 'مغلق', distressed: 'متعثر' };
const STATUS_COLORS: Record<InvStatus, string> = { active: 'badge-green', closed: 'badge-blue', distressed: 'badge-red' };
const TYPE_LABELS: Record<InvType, string> = { accumulative: 'تراكمي', dividend: 'يوزع أرباح' };
const TYPE_COLORS: Record<InvType, string> = { accumulative: 'badge-purple', dividend: 'badge-orange' };

const toDate = (v: unknown): Date => v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(v as string);
const daysBetween = (from: Date, to?: Date) => Math.max(1, Math.round(((to || new Date()).getTime() - from.getTime()) / 86400000));
const pct = (n: number, decimals = 2) => `${n.toFixed(decimals)}%`;

// ─── Core return calculations ──────────────────────────────────────────────
function calcReturns(inv: Investment) {
  const entryAmount = inv.entryAmount;
  const days = daysBetween(inv.entryDate, inv.closingDate);
  const years = days / 365;

  // Total dividends received
  const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);

  // Capital gain (closing - entry, or current - entry for open)
  const capitalGain = inv.status === 'closed'
    ? (inv.closingAmount || 0) - entryAmount
    : inv.currentValue - entryAmount;

  // True total profit = dividends + capital gain
  const totalProfit = totalDividends + capitalGain;

  // True return % = total profit / entry amount * 100
  const trueReturn = entryAmount > 0 ? (totalProfit / entryAmount) * 100 : 0;

  // Annual return % = true return / years
  const annualReturn = years > 0 ? trueReturn / years : 0;

  return { totalDividends, capitalGain, totalProfit, trueReturn, annualReturn };
}

const EMPTY_FORM = {
  name: '', entity: '', invType: 'accumulative' as InvType,
  entryDate: '', entryAmount: '', status: 'active' as InvStatus, notes: '',
  distressReason: '', distressDate: '', closingDate: '', closingAmount: '',
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

  // Modals
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

  // Edit states for dividends & value updates
  const [editDividend, setEditDividend] = useState<{ invId: string; record: DividendRecord } | null>(null);
  const [editValueUpdate, setEditValueUpdate] = useState<{ invId: string; record: ValueUpdate } | null>(null);

  const [ownerCapital, setOwnerCapital] = useState(0);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [snap, invSnap] = await Promise.all([
        getDocs(query(collection(db, 'investments'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'investors')),
      ]);
      // رأس المال الحقيقي من المستثمرين
      const capital = invSnap.docs.reduce((s, d) => s + ((d.data().totalPaid as number) || 0), 0);
      setOwnerCapital(capital);
      setInvestments(snap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id, investmentNumber: v.investmentNumber || '',
          name: v.name || '', entity: v.entity || '',
          invType: v.invType || 'accumulative',
          entryDate: toDate(v.entryDate), entryAmount: v.entryAmount || 0,
          currentValue: v.currentValue || v.entryAmount || 0,
          totalProfit: v.totalProfit || 0, annualReturn: v.annualReturn || 0, trueReturn: v.trueReturn || 0,
          status: v.status || 'active',
          closingDate: v.closingDate ? toDate(v.closingDate) : undefined,
          closingAmount: v.closingAmount,
          distressReason: v.distressReason, distressDate: v.distressDate ? toDate(v.distressDate) : undefined,
          notes: v.notes || '',
          dividends: (v.dividends || []).map((d: Record<string, unknown>) => ({ ...d, date: toDate(d.date) })),
          valueUpdates: (v.valueUpdates || []).map((u: Record<string, unknown>) => ({ ...u, date: toDate(u.date) })),
          additionalAmounts: (v.additionalAmounts || []).map((a: Record<string, unknown>) => ({ ...a, date: toDate(a.date) })),
          createdAt: toDate(v.createdAt),
        };
      }));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ─── Portfolio-level metrics ───────────────────────────────────────────────
  const activeInvs = investments.filter(i => i.status === 'active');
  const closedInvs = investments.filter(i => i.status === 'closed');

  // إجمالي رأس المال = ما دفعه المستثمرون (وليس مجموع مبالغ الاستثمارات)
  const totalCapitalReal = ownerCapital;
  const totalDividendsAll = investments.reduce((s, i) => s + i.dividends.reduce((ss, d) => ss + d.amount, 0), 0);
  const totalCapitalGainAll = closedInvs.reduce((s, i) => s + ((i.closingAmount || 0) - i.entryAmount), 0)
    + activeInvs.reduce((s, i) => s + (i.currentValue - i.entryAmount), 0);
  const totalProfitAll = totalDividendsAll + totalCapitalGainAll;
  // العائد على رأس المال الحقيقي
  const portfolioReturn = totalCapitalReal > 0 ? (totalProfitAll / totalCapitalReal) * 100 : 0;

  const filtered = investments.filter(inv =>
    (inv.name.toLowerCase().includes(search.toLowerCase()) || inv.entity.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'all' || inv.status === statusFilter) &&
    (typeFilter === 'all' || inv.invType === typeFilter)
  );

  // ─── Open edit ─────────────────────────────────────────────────────────────
  const openEdit = (inv: Investment) => {
    setEditInv(inv);
    setForm({
      name: inv.name, entity: inv.entity, invType: inv.invType,
      entryDate: inv.entryDate.toISOString().split('T')[0],
      entryAmount: String(inv.entryAmount), status: inv.status, notes: inv.notes,
      distressReason: inv.distressReason || '',
      distressDate: inv.distressDate ? inv.distressDate.toISOString().split('T')[0] : '',
      closingDate: inv.closingDate ? inv.closingDate.toISOString().split('T')[0] : '',
      closingAmount: inv.closingAmount ? String(inv.closingAmount) : '',
    });
    setError(''); setShowAdd(true);
  };

  // ─── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name || !form.entity || !form.entryDate || !form.entryAmount) {
      setError('يرجى تعبئة الحقول المطلوبة'); return;
    }
    setSaving(true); setError('');
    try {
      const entryAmount = parseFloat(form.entryAmount);
      const entryDate = new Date(form.entryDate);
      let closingDate, closingAmount, totalProfit = 0, annualReturn = 0, trueReturn = 0, distressDate;

      if (form.status === 'closed' && form.closingDate && form.closingAmount) {
        closingDate = Timestamp.fromDate(new Date(form.closingDate));
        closingAmount = parseFloat(form.closingAmount);
        totalProfit = closingAmount - entryAmount;
        const days = daysBetween(entryDate, new Date(form.closingDate));
        trueReturn = entryAmount > 0 ? (totalProfit / entryAmount) * 100 : 0;
        annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      }
      if (form.status === 'distressed' && form.distressDate)
        distressDate = Timestamp.fromDate(new Date(form.distressDate));

      const data: Record<string, unknown> = {
        name: form.name, entity: form.entity, invType: form.invType,
        entryDate: Timestamp.fromDate(entryDate), entryAmount, status: form.status, notes: form.notes,
        closingDate: closingDate || null, closingAmount: closingAmount || null,
        totalProfit, annualReturn, trueReturn,
        distressReason: form.distressReason || null, distressDate: distressDate || null,
      };

      if (editInv) {
        await updateDoc(doc(db, 'investments', editInv.id), data);
      } else {
        const num = `INV-${String(investments.length + 1).padStart(4, '0')}`;
        await addDoc(collection(db, 'investments'), {
          ...data, investmentNumber: num,
          currentValue: closingAmount || entryAmount,
          dividends: [], valueUpdates: [], additionalAmounts: [],
          createdAt: serverTimestamp(), createdBy: user?.id,
        });
        await addDoc(collection(db, 'cashFlows'), {
          type: 'investment_out', date: Timestamp.fromDate(entryDate),
          amount: -entryAmount, referenceId: 'pending',
          description: `دخول استثمار: ${form.name}`,
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

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'investments', confirmDelete.id));
      const cashSnap = await getDocs(query(collection(db, 'cashFlows'), where('referenceId', '==', confirmDelete.id)));
      cashSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setConfirmDelete(null); await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Close investment ─────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!showClose || !closeForm.closingDate || !closeForm.closingAmount) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      const inv = showClose;
      const closingAmount = parseFloat(closeForm.closingAmount);
      const closingDate = new Date(closeForm.closingDate);
      const totalDividends = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const capitalGain = closingAmount - inv.entryAmount;
      const totalProfit = totalDividends + capitalGain;
      const days = daysBetween(inv.entryDate, closingDate);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;

      await updateDoc(doc(db, 'investments', inv.id), {
        status: 'closed', closingDate: Timestamp.fromDate(closingDate),
        closingAmount, totalProfit, trueReturn, annualReturn, currentValue: closingAmount,
      });
      await addDoc(collection(db, 'cashFlows'), {
        type: 'investment_return', date: Timestamp.fromDate(closingDate),
        amount: closingAmount, referenceId: inv.id,
        description: `إغلاق استثمار: ${inv.name}`,
        createdBy: user?.id, createdAt: serverTimestamp(),
      });
      setShowClose(null); setCloseForm({ closingDate: '', closingAmount: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Add dividend ─────────────────────────────────────────────────────────
  const handleAddDividend = async () => {
    if (!showAddDividend || !dividendForm.date || !dividendForm.amount) { setError('يرجى تعبئة جميع الحقول'); return; }
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
      const capitalGain = inv.status === 'closed' ? (inv.closingAmount || 0) - inv.entryAmount : inv.currentValue - inv.entryAmount;
      const totalProfit = totalDividends + capitalGain;
      const days = daysBetween(inv.entryDate, inv.closingDate);
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;

      await updateDoc(doc(db, 'investments', inv.id), {
        dividends: updatedDividends, totalProfit, trueReturn, annualReturn,
      });
      // Cash flow: dividend received
      await addDoc(collection(db, 'cashFlows'), {
        type: 'profit_received', date: Timestamp.fromDate(new Date(dividendForm.date)),
        amount, referenceId: inv.id,
        description: `أرباح موزعة: ${inv.name}`,
        createdBy: user?.id, createdAt: serverTimestamp(),
      });
      setShowAddDividend(null); setDividendForm({ date: '', amount: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Add capital ──────────────────────────────────────────────────────────
  const handleAddCapital = async () => {
    if (!showAddCapital || !capitalForm.date || !capitalForm.amount) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      const inv = showAddCapital;
      const amount = parseFloat(capitalForm.amount);
      const updatedAdditional = [
        ...inv.additionalAmounts.map(a => ({ ...a, date: Timestamp.fromDate(a.date) })),
        { date: Timestamp.fromDate(new Date(capitalForm.date)), amount, notes: capitalForm.notes },
      ];
      await updateDoc(doc(db, 'investments', inv.id), {
        entryAmount: inv.entryAmount + amount, currentValue: inv.currentValue + amount,
        additionalAmounts: updatedAdditional,
      });
      await addDoc(collection(db, 'cashFlows'), {
        type: 'investment_out', date: Timestamp.fromDate(new Date(capitalForm.date)),
        amount: -amount, referenceId: inv.id,
        description: `إضافة رأس مال: ${inv.name}`,
        createdBy: user?.id, createdAt: serverTimestamp(),
      });
      setShowAddCapital(null); setCapitalForm({ date: '', amount: '', notes: '' }); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Update value (accumulative) ───────────────────────────────────────────
  const handleUpdateValue = async () => {
    if (!showAddProfit || !profitForm.date || !profitForm.newValue) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      const inv = showAddProfit;
      const newValue = parseFloat(profitForm.newValue);
      const newUpdate = {
        id: Date.now().toString(), date: Timestamp.fromDate(new Date(profitForm.date)),
        previousValue: inv.currentValue, newValue, profit: newValue - inv.currentValue, notes: profitForm.notes,
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

  // ─── Render ───────────────────────────────────────────────────────────────

  // ─── Edit Dividend ─────────────────────────────────────────────────────────
  const handleEditDividend = async () => {
    if (!editDividend || !dividendForm.date || !dividendForm.amount) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      const inv = investments.find(i => i.id === editDividend.invId);
      if (!inv) throw new Error('الاستثمار غير موجود');
      const updatedDividends = inv.dividends.map(d =>
        d.id === editDividend.record.id
          ? { ...d, date: Timestamp.fromDate(new Date(dividendForm.date)), amount: parseFloat(dividendForm.amount), notes: dividendForm.notes }
          : { ...d, date: Timestamp.fromDate(d.date) }
      );
      const totalDivs = updatedDividends.reduce((s, d) => s + (d.amount as number), 0);
      const capitalGain = inv.status === 'closed' ? (inv.closingAmount || 0) - inv.entryAmount : inv.currentValue - inv.entryAmount;
      const totalProfit = totalDivs + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate, inv.closingDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', editDividend.invId), {
        dividends: updatedDividends, totalProfit, trueReturn, annualReturn,
      });
      setEditDividend(null);
      setDividendForm({ date: '', amount: '', notes: '' });
      await load();
      // Refresh detail modal
      const updated = investments.find(i => i.id === editDividend.invId);
      if (updated) setShowDetail(updated);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete Dividend ───────────────────────────────────────────────────────
  const handleDeleteDividend = async (inv: Investment, dividendId: string) => {
    if (!confirm('هل تريد حذف هذه الأرباح الموزعة؟')) return;
    setSaving(true);
    try {
      const updatedDividends = inv.dividends
        .filter(d => d.id !== dividendId)
        .map(d => ({ ...d, date: Timestamp.fromDate(d.date) }));
      const totalDivs = updatedDividends.reduce((s, d) => s + (d.amount as number), 0);
      const capitalGain = inv.status === 'closed' ? (inv.closingAmount || 0) - inv.entryAmount : inv.currentValue - inv.entryAmount;
      const totalProfit = totalDivs + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate, inv.closingDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', inv.id), {
        dividends: updatedDividends, totalProfit, trueReturn, annualReturn,
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ─── Edit Value Update ─────────────────────────────────────────────────────
  const handleEditValueUpdate = async () => {
    if (!editValueUpdate || !profitForm.date || !profitForm.newValue) { setError('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true); setError('');
    try {
      const inv = investments.find(i => i.id === editValueUpdate.invId);
      if (!inv) throw new Error('الاستثمار غير موجود');
      const newValue = parseFloat(profitForm.newValue);
      const updatedUpdates = inv.valueUpdates.map((u, idx) => {
        if (u.id !== editValueUpdate.record.id) return { ...u, date: Timestamp.fromDate(u.date) };
        const prevValue = idx > 0 ? inv.valueUpdates[idx - 1].newValue : inv.entryAmount;
        return {
          ...u,
          date: Timestamp.fromDate(new Date(profitForm.date)),
          newValue,
          previousValue: prevValue,
          profit: newValue - prevValue,
          notes: profitForm.notes,
        };
      });
      const totalDivs = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const capitalGain = newValue - inv.entryAmount;
      const totalProfit = totalDivs + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', editValueUpdate.invId), {
        currentValue: newValue, totalProfit, trueReturn, annualReturn,
        valueUpdates: updatedUpdates,
      });
      setEditValueUpdate(null);
      setProfitForm({ date: '', newValue: '', notes: '' });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'حدث خطأ'); }
    finally { setSaving(false); }
  };

  // ─── Delete Value Update ───────────────────────────────────────────────────
  const handleDeleteValueUpdate = async (inv: Investment, updateId: string) => {
    if (!confirm('هل تريد حذف هذا التحديث؟ سيُعاد حساب القيمة الحالية تلقائياً.')) return;
    setSaving(true);
    try {
      const filtered = inv.valueUpdates.filter(u => u.id !== updateId);
      // القيمة الحالية = آخر تحديث إن وجد، وإلا رأس المال
      const newCurrentValue = filtered.length > 0
        ? filtered[filtered.length - 1].newValue
        : inv.entryAmount;
      const totalDivs = inv.dividends.reduce((s, d) => s + d.amount, 0);
      const capitalGain = newCurrentValue - inv.entryAmount;
      const totalProfit = totalDivs + capitalGain;
      const trueReturn = inv.entryAmount > 0 ? (totalProfit / inv.entryAmount) * 100 : 0;
      const days = daysBetween(inv.entryDate);
      const annualReturn = days > 0 ? trueReturn / (days / 365) : 0;
      await updateDoc(doc(db, 'investments', inv.id), {
        currentValue: newCurrentValue, totalProfit, trueReturn, annualReturn,
        valueUpdates: filtered.map(u => ({ ...u, date: Timestamp.fromDate(u.date) })),
      });
      await load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-6">
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

      {/* Portfolio KPIs */}
      <div className="bg-gradient-to-l from-blue-700 to-indigo-800 rounded-2xl p-6 text-white">
        <p className="text-blue-200 text-sm font-medium mb-4 flex items-center gap-2"><BarChart2 size={16} />مؤشرات المحفظة الكاملة</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-blue-300 text-xs mb-1">إجمالي رأس المال</p>
            <p className="text-xl font-bold">{formatCurrency(totalCapitalReal)}</p>
          </div>
          <div>
            <p className="text-blue-300 text-xs mb-1">إجمالي الأرباح الموزعة</p>
            <p className="text-xl font-bold text-green-300">{formatCurrency(totalDividendsAll)}</p>
          </div>
          <div>
            <p className="text-blue-300 text-xs mb-1">إجمالي مكاسب رأس المال</p>
            <p className={`text-xl font-bold ${totalCapitalGainAll >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              {totalCapitalGainAll >= 0 ? '+' : ''}{formatCurrency(totalCapitalGainAll)}
            </p>
          </div>
          <div className="border-r border-blue-600 pr-6">
            <p className="text-blue-300 text-xs mb-1">عائد المحفظة الكلي</p>
            <p className={`text-2xl font-bold ${portfolioReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              {pct(portfolioReturn)}
            </p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card"><div className="p-2 bg-green-50 rounded-lg w-fit mb-3"><Activity size={18} className="text-green-600" /></div><p className="text-2xl font-bold text-green-700">{activeInvs.length}</p><p className="text-sm text-slate-500">قائمة</p></div>
        <div className="stat-card"><div className="p-2 bg-blue-50 rounded-lg w-fit mb-3"><CheckCircle size={18} className="text-blue-600" /></div><p className="text-2xl font-bold text-blue-700">{closedInvs.length}</p><p className="text-sm text-slate-500">مغلقة</p></div>
        <div className="stat-card"><div className="p-2 bg-red-50 rounded-lg w-fit mb-3"><XCircle size={18} className="text-red-600" /></div><p className="text-2xl font-bold text-red-700">{investments.filter(i => i.status === 'distressed').length}</p><p className="text-sm text-slate-500">متعثرة</p></div>
        <div className="stat-card"><div className="p-2 bg-emerald-50 rounded-lg w-fit mb-3"><TrendingUp size={18} className="text-emerald-600" /></div><p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalProfitAll)}</p><p className="text-sm text-slate-500">صافي الأرباح</p></div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="input pr-9" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'closed', 'distressed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${statusFilter === s ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
            </button>
          ))}
          <div className="h-8 w-px bg-slate-200 self-center mx-1" />
          {(['all', 'accumulative', 'dividend'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${typeFilter === t ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {t === 'all' ? 'كل الأنواع' : TYPE_LABELS[t]}
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
              <th>الرقم</th><th>الاستثمار</th><th>النوع</th><th>تاريخ الدخول</th>
              <th>رأس المال</th><th>أرباح موزعة</th><th>القيمة الحالية</th>
              <th>العائد الحقيقي</th><th>العائد السنوي</th><th>المدة</th><th>الحالة</th><th>إجراءات</th>
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
                    <p className="font-medium text-slate-800">{inv.name}</p>
                    <p className="text-xs text-slate-400">{inv.entity}</p>
                    {inv.dividends.length > 0 && <p className="text-xs text-orange-500">{inv.dividends.length} توزيع</p>}
                    {inv.valueUpdates.length > 0 && <p className="text-xs text-purple-500">{inv.valueUpdates.length} تحديث قيمة</p>}
                  </td>
                  <td><span className={TYPE_COLORS[inv.invType]}>{TYPE_LABELS[inv.invType]}</span></td>
                  <td className="text-slate-600">{formatDate(inv.entryDate)}</td>
                  <td className="font-semibold text-blue-700">{formatCurrency(inv.entryAmount)}</td>
                  <td className="text-orange-600 font-medium">{r.totalDividends > 0 ? formatCurrency(r.totalDividends) : '—'}</td>
                  <td className="font-semibold">
                    {inv.status === 'closed' ? formatCurrency(inv.closingAmount || 0) : formatCurrency(inv.currentValue)}
                  </td>
                  <td className={r.trueReturn >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                    {r.trueReturn >= 0 ? '+' : ''}{pct(r.trueReturn)}
                  </td>
                  <td className={r.annualReturn >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {pct(r.annualReturn)}
                  </td>
                  <td className="text-slate-500 text-sm">{days} يوم</td>
                  <td>
                    <span className={`${STATUS_COLORS[inv.status]} flex items-center gap-1 w-fit text-xs`}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => setShowDetail(inv)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg" title="تفاصيل"><Eye size={15} /></button>
                      <button onClick={() => openEdit(inv)} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg" title="تعديل"><Edit2 size={15} /></button>
                      {inv.status === 'active' && (<>
                        <button onClick={() => { setShowClose(inv); setCloseForm({ closingDate: '', closingAmount: '' }); setError(''); }} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg" title="إغلاق"><Lock size={15} /></button>
                        <button onClick={() => { setShowAddCapital(inv); setCapitalForm({ date: '', amount: '', notes: '' }); setError(''); }} className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg" title="إضافة رأس مال"><PlusCircle size={15} /></button>
                        {inv.invType === 'dividend' && (
                          <button onClick={() => { setShowAddDividend(inv); setDividendForm({ date: '', amount: '', notes: '' }); setError(''); }} className="p-1.5 hover:bg-orange-50 text-orange-600 rounded-lg" title="تسجيل أرباح موزعة"><Banknote size={15} /></button>
                        )}
                        {inv.invType === 'accumulative' && (
                          <button onClick={() => { setShowAddProfit(inv); setProfitForm({ date: '', newValue: String(inv.currentValue), notes: '' }); setError(''); }} className="p-1.5 hover:bg-yellow-50 text-yellow-600 rounded-lg" title="تحديث القيمة"><TrendingUp size={15} /></button>
                        )}
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

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {showDetail && (() => {
        const r = calcReturns(showDetail);
        return (
          <div className="modal-overlay" onClick={() => setShowDetail(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="text-lg font-bold">{showDetail.name}</h2>
                  <span className={`${TYPE_COLORS[showDetail.invType]} mt-1`}>{TYPE_LABELS[showDetail.invType]}</span>
                </div>
                <button onClick={() => setShowDetail(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>
              <div className="modal-body space-y-5">
                {/* Return analysis */}
                <div className="bg-gradient-to-l from-slate-700 to-slate-800 rounded-xl p-5 text-white">
                  <p className="text-slate-300 text-xs font-medium mb-3 flex items-center gap-1"><Info size={12} />تحليل العوائد</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-slate-400 text-xs">رأس المال</p><p className="text-base font-bold">{formatCurrency(showDetail.entryAmount)}</p></div>
                    <div><p className="text-slate-400 text-xs">أرباح موزعة</p><p className="text-base font-bold text-orange-300">{formatCurrency(r.totalDividends)}</p></div>
                    <div><p className="text-slate-400 text-xs">مكسب رأس المال</p><p className={`text-base font-bold ${r.capitalGain >= 0 ? 'text-green-300' : 'text-red-300'}`}>{r.capitalGain >= 0 ? '+' : ''}{formatCurrency(r.capitalGain)}</p></div>
                    <div className="border-t border-slate-600 pt-3"><p className="text-slate-400 text-xs">صافي الربح</p><p className={`text-lg font-bold ${r.totalProfit >= 0 ? 'text-green-300' : 'text-red-300'}`}>{r.totalProfit >= 0 ? '+' : ''}{formatCurrency(r.totalProfit)}</p></div>
                    <div className="border-t border-slate-600 pt-3"><p className="text-slate-400 text-xs">العائد الحقيقي</p><p className={`text-lg font-bold ${r.trueReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pct(r.trueReturn)}</p></div>
                    <div className="border-t border-slate-600 pt-3"><p className="text-slate-400 text-xs">العائد السنوي</p><p className={`text-lg font-bold ${r.annualReturn >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pct(r.annualReturn)}</p></div>
                  </div>
                </div>

                {/* Basic info */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['الجهة', showDetail.entity],
                    ['تاريخ الدخول', formatDate(showDetail.entryDate)],
                    ['الحالة', STATUS_LABELS[showDetail.status]],
                    ['المدة', `${daysBetween(showDetail.entryDate, showDetail.closingDate)} يوم`],
                    ...(showDetail.status === 'closed' ? [['تاريخ الإغلاق', formatDate(showDetail.closingDate)], ['مبلغ الإغلاق', formatCurrency(showDetail.closingAmount || 0)]] : []),
                    ...(showDetail.status === 'distressed' ? [['سبب التعثر', showDetail.distressReason || '—']] : []),
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k}><p className="text-xs text-slate-500 mb-0.5">{k}</p><p className="text-sm font-semibold text-slate-800">{v}</p></div>
                  ))}
                </div>

                {/* Dividends history */}
                {showDetail.dividends.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Banknote size={15} className="text-orange-500" />
                      الأرباح الموزعة ({showDetail.dividends.length})
                    </p>
                    <div className="table-container">
                      <table className="table">
                        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظات</th><th></th></tr></thead>
                        <tbody>
                          {showDetail.dividends.map((d, i) => (
                            <tr key={i}>
                              <td>{formatDate(d.date)}</td>
                              <td className="text-orange-600 font-semibold">{formatCurrency(d.amount)}</td>
                              <td className="text-slate-500 text-xs">{d.notes || '—'}</td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditDividend({ invId: showDetail.id, record: d });
                                      setDividendForm({ date: d.date.toISOString().split('T')[0], amount: String(d.amount), notes: d.notes || '' });
                                    }}
                                    className="icon-btn info" title="تعديل"
                                  ><Edit2 size={13} /></button>
                                  <button
                                    onClick={() => handleDeleteDividend(showDetail, d.id)}
                                    className="icon-btn danger" title="حذف"
                                  ><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-orange-50">
                            <td className="font-bold text-orange-800">الإجمالي</td>
                            <td className="font-bold text-orange-700">{formatCurrency(r.totalDividends)}</td>
                            <td>—</td><td>—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Value updates history */}
                {showDetail.valueUpdates.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <TrendingUp size={15} className="text-purple-500" />
                      تحديثات القيمة ({showDetail.valueUpdates.length})
                    </p>
                    <div className="table-container">
                      <table className="table">
                        <thead><tr><th>التاريخ</th><th>السابقة</th><th>الجديدة</th><th>الفرق</th><th>ملاحظات</th><th></th></tr></thead>
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
                              <td>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditValueUpdate({ invId: showDetail.id, record: u });
                                      setProfitForm({ date: u.date.toISOString().split('T')[0], newValue: String(u.newValue), notes: u.notes || '' });
                                    }}
                                    className="icon-btn info" title="تعديل"
                                  ><Edit2 size={13} /></button>
                                  <button
                                    onClick={() => handleDeleteValueUpdate(showDetail, u.id)}
                                    className="icon-btn danger" title="حذف"
                                  ><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Capital additions */}
                {showDetail.additionalAmounts.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><PlusCircle size={15} className="text-purple-500" />إضافات رأس المال</p>
                    <div className="space-y-2">
                      {showDetail.additionalAmounts.map((a, i) => (
                        <div key={i} className="flex justify-between items-center bg-purple-50 rounded-lg p-3">
                          <div><p className="text-sm font-medium text-purple-800">{formatDate(a.date)}</p>{a.notes && <p className="text-xs text-purple-600">{a.notes}</p>}</div>
                          <span className="font-bold text-purple-700">+ {formatCurrency(a.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showDetail.notes && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs text-slate-500 mb-1">ملاحظات</p><p className="text-sm">{showDetail.notes}</p></div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add/Edit Modal ────────────────────────────────────────────────────── */}
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

                {/* Type selector */}
                <div className="col-span-2">
                  <label className="label">نوع الاستثمار</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm({ ...form, invType: 'accumulative' })}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors text-right ${form.invType === 'accumulative' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <p className="font-semibold">تراكمي</p>
                      <p className="text-xs opacity-70 mt-0.5">الأرباح تُضاف للأصل سنوياً</p>
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, invType: 'dividend' })}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors text-right ${form.invType === 'dividend' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <p className="font-semibold">يوزع أرباح</p>
                      <p className="text-xs opacity-70 mt-0.5">أرباح نقدية دورية تُصرف</p>
                    </button>
                  </div>
                </div>

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
                    <label className="label">مبلغ الإغلاق *</label>
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
                <Save size={16} />{saving ? 'جاري...' : editInv ? 'حفظ التعديلات' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Dividend Modal ────────────────────────────────────────────────── */}
      {showAddDividend && (
        <div className="modal-overlay" onClick={() => setShowAddDividend(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold flex items-center gap-2"><Banknote size={20} className="text-orange-500" />تسجيل أرباح موزعة</h2>
              <button onClick={() => setShowAddDividend(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <p className="font-semibold text-orange-800">{showAddDividend.name}</p>
                <p className="text-sm text-orange-600">رأس المال: {formatCurrency(showAddDividend.entryAmount)}</p>
                <p className="text-sm text-orange-600">إجمالي أرباح سابقة: {formatCurrency(showAddDividend.dividends.reduce((s, d) => s + d.amount, 0))}</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ استلام الأرباح *</label><input className="input" type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} /></div>
              <div>
                <label className="label">مبلغ الأرباح المستلمة *</label>
                <input className="input" type="number" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} />
                {dividendForm.amount && (
                  <p className="text-xs text-orange-600 mt-1">
                    العائد على هذه الدفعة: {pct(parseFloat(dividendForm.amount) / showAddDividend.entryAmount * 100)}
                  </p>
                )}
              </div>
              <div><label className="label">ملاحظات (مثال: أرباح الربع الأول 2025)</label><input className="input" value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddDividend(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleAddDividend} disabled={saving} className="btn-primary">
                <Banknote size={16} />{saving ? 'جاري...' : 'تسجيل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Modal ───────────────────────────────────────────────────────── */}
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
                <p className="text-sm text-blue-600">رأس المال: {formatCurrency(showClose.entryAmount)}</p>
                {showClose.dividends.length > 0 && <p className="text-sm text-orange-600">أرباح موزعة سابقاً: {formatCurrency(showClose.dividends.reduce((s, d) => s + d.amount, 0))}</p>}
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div><label className="label">تاريخ الإغلاق *</label><input className="input" type="date" value={closeForm.closingDate} onChange={e => setCloseForm({ ...closeForm, closingDate: e.target.value })} /></div>
              <div>
                <label className="label">المبلغ المستلم عند الإغلاق *</label>
                <input className="input" type="number" value={closeForm.closingAmount} onChange={e => setCloseForm({ ...closeForm, closingAmount: e.target.value })} />
                {closeForm.closingAmount && (() => {
                  const totalDiv = showClose.dividends.reduce((s, d) => s + d.amount, 0);
                  const capGain = parseFloat(closeForm.closingAmount) - showClose.entryAmount;
                  const totalProfit = totalDiv + capGain;
                  return (
                    <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">مكسب رأس المال</span><span className={capGain >= 0 ? 'text-green-600' : 'text-red-600'}>{capGain >= 0 ? '+' : ''}{formatCurrency(capGain)}</span></div>
                      {totalDiv > 0 && <div className="flex justify-between"><span className="text-slate-500">أرباح موزعة سابقة</span><span className="text-orange-600">+ {formatCurrency(totalDiv)}</span></div>}
                      <div className="flex justify-between border-t border-slate-200 pt-1 font-bold"><span>صافي الربح الكلي</span><span className={totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}>{totalProfit >= 0 ? '+' : ''}{formatCurrency(totalProfit)}</span></div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowClose(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleClose} disabled={saving} className="btn-success"><CheckCircle size={16} />{saving ? 'جاري...' : 'تأكيد الإغلاق'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Capital Modal ─────────────────────────────────────────────────── */}
      {showAddCapital && (
        <div className="modal-overlay" onClick={() => setShowAddCapital(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">إضافة رأس مال</h2>
              <button onClick={() => setShowAddCapital(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-purple-50 rounded-xl p-4"><p className="font-semibold text-purple-800">{showAddCapital.name}</p><p className="text-sm text-purple-600">رأس المال الحالي: {formatCurrency(showAddCapital.entryAmount)}</p></div>
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

      {/* ── Update Value Modal ────────────────────────────────────────────────── */}
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
                <p className="text-xs text-yellow-600 mt-1">أدخل القيمة الجديدة كما في كشف الشركة</p>
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
              <div><label className="label">ملاحظات</label><input className="input" value={profitForm.notes} onChange={e => setProfitForm({ ...profitForm, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddProfit(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleUpdateValue} disabled={saving} className="btn-primary"><TrendingUp size={16} />{saving ? 'جاري...' : 'تحديث'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ────────────────────────────────────────────────────── */}
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
                  <p className="font-semibold">سيتم حذف ما يلي نهائياً:</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    <li>• بيانات الاستثمار كاملة</li>
                    <li>• جميع سجلات الأرباح الموزعة ({confirmDelete.dividends.length})</li>
                    <li>• جميع تحديثات القيمة ({confirmDelete.valueUpdates.length})</li>
                    <li>• جميع حركات الكاش المرتبطة</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleDelete} disabled={saving} className="btn-danger"><Trash2 size={16} />{saving ? 'جاري الحذف...' : 'حذف نهائياً'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Dividend Modal ───────────────────────────────────────────────── */}
      {editDividend && (
        <div className="modal-overlay" onClick={() => setEditDividend(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Banknote size={20} className="text-orange-500" />
                تعديل توزيع الأرباح
              </h2>
              <button onClick={() => setEditDividend(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <p className="text-xs text-orange-600">القيمة الحالية: <strong>{formatCurrency(editDividend.record.amount)}</strong> — {formatDate(editDividend.record.date)}</p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div>
                <label className="label">التاريخ *</label>
                <input className="input" type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">المبلغ (ريال) *</label>
                <input className="input" type="number" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} />
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <input className="input" value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditDividend(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleEditDividend} disabled={saving} className="btn-primary">
                <Save size={16} />{saving ? 'جاري...' : 'حفظ التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Value Update Modal ───────────────────────────────────────────── */}
      {editValueUpdate && (
        <div className="modal-overlay" onClick={() => setEditValueUpdate(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp size={20} className="text-purple-500" />
                تعديل تحديث القيمة
              </h2>
              <button onClick={() => setEditValueUpdate(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs text-yellow-700">
                  القيمة الحالية المسجلة: <strong>{formatCurrency(editValueUpdate.record.newValue)}</strong> — {formatDate(editValueUpdate.record.date)}
                </p>
              </div>
              {error && <div className="alert-danger text-sm"><AlertCircle size={16} />{error}</div>}
              <div>
                <label className="label">تاريخ التحديث *</label>
                <input className="input" type="date" value={profitForm.date} onChange={e => setProfitForm({ ...profitForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">القيمة الجديدة (ريال) *</label>
                <input className="input" type="number" value={profitForm.newValue} onChange={e => setProfitForm({ ...profitForm, newValue: e.target.value })} />
                {profitForm.newValue && (
                  <div className="mt-2 bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">القيمة السابقة</span>
                      <span>{formatCurrency(editValueUpdate.record.previousValue)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-500">الفرق</span>
                      <span className={`font-bold ${parseFloat(profitForm.newValue) >= editValueUpdate.record.previousValue ? 'text-green-600' : 'text-red-600'}`}>
                        {parseFloat(profitForm.newValue) >= editValueUpdate.record.previousValue ? '+' : ''}
                        {formatCurrency(parseFloat(profitForm.newValue) - editValueUpdate.record.previousValue)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="label">ملاحظات</label>
                <input className="input" value={profitForm.notes} onChange={e => setProfitForm({ ...profitForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditValueUpdate(null)} className="btn-secondary">إلغاء</button>
              <button onClick={handleEditValueUpdate} disabled={saving} className="btn-primary">
                <Save size={16} />{saving ? 'جاري...' : 'حفظ التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
