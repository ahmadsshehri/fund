'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { calculateCash } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import {
  LayoutDashboard, Users, TrendingUp, Receipt, GitBranch,
  BarChart3, Settings, UserCog, LogOut, Menu,
  Wallet, ChevronLeft, Building2, Bell, FileText,
} from 'lucide-react';

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'لوحة التحكم', roles: ['manager', 'admin', 'investor'] },
  { href: '/investors', icon: <Users size={18} />, label: 'المستثمرون', roles: ['manager', 'admin'] },
  { href: '/investments', icon: <TrendingUp size={18} />, label: 'الاستثمارات', roles: ['manager', 'admin'] },
  { href: '/expenses', icon: <Receipt size={18} />, label: 'المصاريف', roles: ['manager', 'admin'] },
  { href: '/distributions', icon: <GitBranch size={18} />, label: 'التوزيعات والملكية', roles: ['manager', 'admin'] },
  { href: '/reports', icon: <BarChart3 size={18} />, label: 'التقارير', roles: ['manager', 'admin'] },
  { href: '/investor-portal', icon: <FileText size={18} />, label: 'بوابة المستثمر', roles: ['investor'] },
  { href: '/users', icon: <UserCog size={18} />, label: 'المستخدمون والصلاحيات', roles: ['manager'] },
  { href: '/settings', icon: <Settings size={18} />, label: 'الإعدادات', roles: ['manager', 'admin', 'investor'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cash, setCash] = useState<number | null>(null);

  useEffect(() => {
    console.log('[Layout] loading:', loading, '| user:', user?.email ?? 'null');
    // Only redirect if loading is DONE and user is definitely null
    if (!loading && !user) {
      console.log('[Layout] No user after loading — redirecting to /login');
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      // Correct cash calculation: capital_in - active investments + closed returns + dividends - expenses - distributions
      const loadCash = async () => {
        try {
          const { collection, getDocs } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const [invSnap, invstSnap, expSnap, distSnap] = await Promise.all([
            getDocs(collection(db, 'investors')),
            getDocs(collection(db, 'investments')),
            getDocs(collection(db, 'expenses')),
            getDocs(collection(db, 'distributions')),
          ]);
          const invData = invSnap.docs.map(d => d.data());
          const invstData = invstSnap.docs.map(d => d.data());
          const expData = expSnap.docs.map(d => d.data());
          const distData = distSnap.docs.map(d => d.data());

          const capitalIn = invData.reduce((s: number, i: Record<string, unknown>) => s + ((i.totalPaid as number) || 0), 0);
          const investedActive = invstData.filter((i: Record<string, unknown>) => i.status === "active").reduce((s: number, i: Record<string, unknown>) => s + ((i.entryAmount as number) || 0), 0);
          const closingReturns = invstData.filter((i: Record<string, unknown>) => i.status === "closed").reduce((s: number, i: Record<string, unknown>) => s + ((i.closingAmount as number) || 0), 0);
          const closedEntries = invstData.filter((i: Record<string, unknown>) => i.status === "closed").reduce((s: number, i: Record<string, unknown>) => s + ((i.entryAmount as number) || 0), 0);
          const dividends = invstData.reduce((s: number, i: Record<string, unknown>) => s + ((i.dividends as {amount:number}[]) || []).reduce((ss, d) => ss + d.amount, 0), 0);
          const expOut = expData.filter((e: Record<string, unknown>) => e.status === "approved").reduce((s: number, e: Record<string, unknown>) => s + ((e.amount as number) || 0), 0);
          const distOut = distData.filter((d: Record<string, unknown>) => d.status === "approved" && d.affectsCash).reduce((s: number, d: Record<string, unknown>) => s + ((d.totalAmount as number) || 0), 0);

          setCash(capitalIn - investedActive + closingReturns - closedEntries + dividends - expOut - distOut);
        } catch (e) { console.error(e); }
      };
      loadCash();
    }
  }, [user]);

  // Show spinner while loading OR while we have a firebase user but user doc not loaded yet
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">جاري تحميل بيانات المستخدم...</p>
        </div>
      </div>
    );
  }

  // If not loading and no user, show nothing (redirect happening)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">جاري التوجيه...</p>
        </div>
      </div>
    );
  }

  const visibleNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-white border-l border-slate-200 flex flex-col shadow-sm shrink-0 fixed h-full z-40`}>
        {/* Logo */}
        <div className={`flex items-center ${sidebarOpen ? 'justify-between px-4' : 'justify-center'} h-16 border-b border-slate-200`}>
          {sidebarOpen && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
                <Building2 size={16} className="text-white" />
              </div>
              <span className="font-bold text-slate-800 text-sm">نظام الصندوق</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            {sidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Cash indicator */}
        {sidebarOpen && cash !== null && (user.role === 'manager' || user.role === 'admin') && (
          <div className="mx-3 mt-3 bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={14} className="text-green-600" />
              <span className="text-xs text-green-600 font-medium">الكاش المتوفر</span>
            </div>
            <span className="text-base font-bold text-green-700">{formatCurrency(cash)}</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
                style={!sidebarOpen ? { justifyContent: 'center', padding: '0.625rem 0.5rem' } : {}}
                title={!sidebarOpen ? item.label : undefined}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="border-t border-slate-200 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                {user.name?.[0] || 'م'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role === 'manager' ? 'مدير' : user.role === 'admin' ? 'إداري' : 'مستثمر'}</p>
              </div>
              <button onClick={signOut} className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={signOut} className="w-full flex justify-center p-2 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className={`flex-1 ${sidebarOpen ? 'mr-64' : 'mr-16'} transition-all duration-300 min-h-screen`}>
        <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <span className="text-slate-400 text-sm">
            {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <div className="flex items-center gap-3">
            {cash !== null && (user.role === 'manager' || user.role === 'admin') && (
              <div className="hidden sm:flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <Wallet size={14} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">{formatCurrency(cash)}</span>
              </div>
            )}
            <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <Bell size={18} />
            </button>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
