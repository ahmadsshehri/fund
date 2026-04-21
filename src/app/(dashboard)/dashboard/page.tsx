'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { getDashboardStats } from '@/lib/db';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import type { DashboardStats } from '@/types';
import {
  Wallet, TrendingUp, Users, Layers, Activity, AlertTriangle,
  CheckCircle, XCircle, PauseCircle, DollarSign, ArrowUpRight,
  ArrowDownRight, Info, RefreshCw,
} from 'lucide-react';

function StatCard({ label, value, icon, color = 'blue', subLabel }: {
  label: string; value: string; icon: React.ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
  subLabel?: string;
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-slate-800 mb-0.5">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
      {subLabel && <p className="text-xs text-slate-400 mt-1">{subLabel}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const data = await getDashboardStats();
      setStats(data);
      setLastUpdated(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500 text-sm">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  if (!stats) return <div className="text-center text-slate-500 py-20">تعذر تحميل البيانات</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm mt-0.5">آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}</p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw size={16} />
          تحديث
        </button>
      </div>

      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((alert, i) => (
            <div key={i} className={`alert-${alert.type} text-sm`}>
              {alert.type === 'danger' && <XCircle size={16} className="shrink-0 mt-0.5" />}
              {alert.type === 'warning' && <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
              {alert.type === 'info' && <Info size={16} className="shrink-0 mt-0.5" />}
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Cash Banner */}
      <div className="bg-gradient-to-l from-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={20} className="text-green-200" />
              <span className="text-green-200 text-sm font-medium">الكاش المتوفر الآن</span>
            </div>
            <p className="text-4xl font-bold">{formatCurrency(stats.availableCash)}</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-green-200 text-xs mb-1">مجمد</p>
              <p className="text-xl font-bold">{formatCurrency(stats.frozenCash)}</p>
            </div>
            <div className="text-center">
              <p className="text-green-200 text-xs mb-1">سعر الحصة</p>
              <p className="text-xl font-bold">{formatCurrency(stats.currentSharePrice)}</p>
            </div>
            <div className="text-center">
              <p className="text-green-200 text-xs mb-1">إجمالي الحصص</p>
              <p className="text-xl font-bold">{formatNumber(stats.totalShares)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي رأس المال"
          value={formatCurrency(stats.totalCapital)}
          icon={<DollarSign size={20} />}
          color="blue"
        />
        <StatCard
          label="عدد المستثمرين"
          value={formatNumber(stats.totalInvestors, 0)}
          icon={<Users size={20} />}
          color="purple"
        />
        <StatCard
          label="استثمارات قائمة"
          value={formatNumber(stats.activeInvestments, 0)}
          icon={<Activity size={20} />}
          color="green"
        />
        <StatCard
          label="استثمارات مغلقة"
          value={formatNumber(stats.closedInvestments, 0)}
          icon={<CheckCircle size={20} />}
          color="blue"
        />
        <StatCard
          label="استثمارات متعثرة"
          value={formatNumber(stats.distressedInvestments, 0)}
          icon={<XCircle size={20} />}
          color="red"
        />
        <StatCard
          label="أرباح محققة"
          value={formatCurrency(stats.realizedProfits)}
          icon={<ArrowUpRight size={20} />}
          color="green"
        />
        <StatCard
          label="أرباح غير محققة"
          value={formatCurrency(stats.unrealizedProfits)}
          icon={<TrendingUp size={20} />}
          color="yellow"
        />
        <StatCard
          label="إجمالي المصاريف"
          value={formatCurrency(stats.totalExpenses)}
          icon={<ArrowDownRight size={20} />}
          color="orange"
        />
        <StatCard
          label="إجمالي التوزيعات"
          value={formatCurrency(stats.totalDistributions)}
          icon={<Layers size={20} />}
          color="purple"
        />
      </div>

      {/* Quick Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fund Position */}
        <div className="card p-6">
          <h3 className="section-title">ملخص المركز المالي</h3>
          <div className="space-y-4">
            {[
              { label: 'إجمالي رأس المال', value: formatCurrency(stats.totalCapital), color: 'text-blue-700' },
              { label: 'إجمالي الأرباح المحققة', value: formatCurrency(stats.realizedProfits), color: 'text-green-700' },
              { label: 'إجمالي الأرباح التراكمية', value: formatCurrency(stats.unrealizedProfits), color: 'text-yellow-700' },
              { label: 'إجمالي المصاريف', value: formatCurrency(-stats.totalExpenses), color: 'text-red-700' },
              { label: 'إجمالي التوزيعات', value: formatCurrency(-stats.totalDistributions), color: 'text-orange-700' },
              { label: 'الكاش المتوفر', value: formatCurrency(stats.availableCash), color: 'text-green-800 font-bold text-base' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-600">{row.label}</span>
                <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Investment Overview */}
        <div className="card p-6">
          <h3 className="section-title">نظرة على الاستثمارات</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
              <CheckCircle size={20} className="text-green-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">قائمة</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-green-200 rounded-full h-1.5">
                    <div
                      className="bg-green-600 h-1.5 rounded-full"
                      style={{ width: `${stats.activeInvestments / (stats.activeInvestments + stats.closedInvestments + stats.distressedInvestments || 1) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-green-700">{stats.activeInvestments}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <Activity size={20} className="text-blue-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">مغلقة</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-blue-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${stats.closedInvestments / (stats.activeInvestments + stats.closedInvestments + stats.distressedInvestments || 1) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-blue-700">{stats.closedInvestments}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
              <XCircle size={20} className="text-red-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">متعثرة</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-red-200 rounded-full h-1.5">
                    <div
                      className="bg-red-600 h-1.5 rounded-full"
                      style={{ width: `${stats.distressedInvestments / (stats.activeInvestments + stats.closedInvestments + stats.distressedInvestments || 1) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-red-700">{stats.distressedInvestments}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
