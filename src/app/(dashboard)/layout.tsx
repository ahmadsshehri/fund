'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { calculateCash } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import {
  LayoutDashboard, Users, TrendingUp, Receipt, GitBranch,
  BarChart3, Settings, UserCog, LogOut, Menu, X, Wallet,
  ChevronLeft, Building2, Bell, FileText,
} from 'lucide-react';

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  roles: string[];
  sub?: NavItem[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'لوحة التحكم', roles: ['manager', 'admin', 'investor'] },
  { href: '/dashboard/investors', icon: <Users size={18} />, label: 'المستثمرون', roles: ['manager', 'admin'] },
  { href: '/dashboard/investments', icon: <TrendingUp size={18} />, label: 'الاستثمارات', roles: ['manager', 'admin'] },
  { href: '/dashboard/expenses', icon: <Receipt size={18} />, label: 'المصاريف', roles: ['manager', 'admin'] },
  { href: '/dashboard/distributions', icon: <GitBranch size={18} />, label: 'التوزيعات والملكية', roles: ['manager', 'admin'] },
  { href: '/dashboard/reports', icon: <BarChart3 size={18} />, label: 'التقارير', roles: ['manager', 'admin'] },
  { href: '/dashboard/investor-portal', icon: <FileText size={18} />, label: 'بوابة المستثمر', roles: ['investor'] },
  { href: '/dashboard/users', icon: <UserCog size={18} />, label: 'المستخدمون والصلاحيات', roles: ['manager'] },
  { href: '/dashboard/settings', icon: <Settings size={18} />, label: 'الإعدادات', roles: ['manager'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cash, setCash] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user && (user.role === 'manager' || user.role === 'admin')) {
      calculateCash().then(c => setCash(c.available));
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">جاري التحميل...</p>
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

        {/* Cash indicator - for managers/admins only */}
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
                className={`${isActive ? 'sidebar-link-active' : 'sidebar-link'} ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                title={!sidebarOpen ? item.label : undefined}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-slate-200 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                {user.name?.[0] || 'م'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {user.role === 'manager' ? 'مدير' : user.role === 'admin' ? 'إداري' : 'مستثمر'}
                </p>
              </div>
              <button onClick={signOut} className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors" title="تسجيل خروج">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={signOut} className="w-full flex justify-center p-2 hover:bg-red-50 hover:text-red-600 rounded-lg text-slate-400 transition-colors" title="تسجيل خروج">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 ${sidebarOpen ? 'mr-64' : 'mr-16'} transition-all duration-300 min-h-screen`}>
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Breadcrumb placeholder */}
            <span className="text-slate-400 text-sm">{new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Cash badge in header for quick view */}
            {cash !== null && (user.role === 'manager' || user.role === 'admin') && (
              <div className="hidden sm:flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                <Wallet size={14} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">{formatCurrency(cash)}</span>
              </div>
            )}
            <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 relative">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
