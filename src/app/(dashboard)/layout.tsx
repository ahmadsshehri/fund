'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/utils';
import {
  LayoutDashboard, Users, TrendingUp, Receipt, GitBranch,
  BarChart3, Settings, UserCog, LogOut, Building2, Scale,
  Wallet, FileText, ChevronRight, Menu, X,
} from 'lucide-react';

interface NavItem { href: string; icon: React.ReactNode; label: string; roles: string[]; }

const navItems: NavItem[] = [
  { href: '/dashboard',       icon: <LayoutDashboard size={20} />, label: 'الرئيسية',        roles: ['manager','admin','investor'] },
  { href: '/investors',       icon: <Users size={20} />,           label: 'المستثمرون',      roles: ['manager','admin'] },
  { href: '/investments',     icon: <TrendingUp size={20} />,      label: 'الاستثمارات',     roles: ['manager','admin'] },
  { href: '/expenses',        icon: <Receipt size={20} />,         label: 'المصاريف',        roles: ['manager','admin'] },
  { href: '/distributions',   icon: <GitBranch size={20} />,       label: 'التوزيعات',       roles: ['manager','admin'] },
  { href: '/reports',         icon: <BarChart3 size={20} />,       label: 'التقارير',        roles: ['manager','admin'] },
  { href: '/trial-balance',   icon: <Scale size={20} />,           label: 'ميزان المراجعة', roles: ['manager'] },
  { href: '/investor-portal', icon: <FileText size={20} />,        label: 'بوابتي',          roles: ['investor'] },
  { href: '/users',           icon: <UserCog size={20} />,         label: 'المستخدمون',      roles: ['manager'] },
  { href: '/settings',        icon: <Settings size={20} />,        label: 'الإعدادات',       roles: ['manager','admin','investor'] },
];

const mobileBottomNav = [
  { href: '/dashboard',      icon: <LayoutDashboard size={22} />, label: 'الرئيسية',   roles: ['manager','admin','investor'] },
  { href: '/investments',    icon: <TrendingUp size={22} />,      label: 'استثمارات',  roles: ['manager','admin'] },
  { href: '/investors',      icon: <Users size={22} />,           label: 'مستثمرون',   roles: ['manager','admin'] },
  { href: '/reports',        icon: <BarChart3 size={22} />,       label: 'التقارير',   roles: ['manager','admin'] },
  { href: '/investor-portal',icon: <FileText size={22} />,        label: 'بوابتي',     roles: ['investor'] },
  { href: '/settings',       icon: <Settings size={22} />,        label: 'الإعدادات',  roles: ['manager','admin','investor'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [cash, setCash] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // إغلاق الـ drawer عند تغيير الصفحة
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const loadCash = useCallback(async () => {
    if (!user || user.role === 'investor') return;
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const [invSnap, invstSnap, expSnap, distSnap] = await Promise.all([
        getDocs(collection(db, 'investors')),
        getDocs(collection(db, 'investments')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'distributions')),
      ]);
      const inv   = invSnap.docs.map(d => d.data());
      const invst = invstSnap.docs.map(d => d.data());
      const exp   = expSnap.docs.map(d => d.data());
      const dist  = distSnap.docs.map(d => d.data());
      const capitalIn  = inv.reduce((s: number, i: Record<string,unknown>) => s + ((i.totalPaid as number)||0), 0);
      const activeOut  = invst.filter((i: Record<string,unknown>) => i.status==='active').reduce((s: number, i: Record<string,unknown>) => s + ((i.entryAmount as number)||0), 0);
      const closedIn   = invst.filter((i: Record<string,unknown>) => i.status==='closed').reduce((s: number, i: Record<string,unknown>) => s + ((i.closingAmount as number)||0), 0);
      const closedOut  = invst.filter((i: Record<string,unknown>) => i.status==='closed').reduce((s: number, i: Record<string,unknown>) => s + ((i.entryAmount as number)||0), 0);
      const divs       = invst.reduce((s: number, i: Record<string,unknown>) => s + ((i.dividends as {amount:number}[])||[]).reduce((ss,d)=>ss+d.amount,0), 0);
      const expOut     = exp.filter((e: Record<string,unknown>) => e.status==='approved').reduce((s: number, e: Record<string,unknown>) => s + ((e.amount as number)||0), 0);
      const distOut    = dist.filter((d: Record<string,unknown>) => d.status==='approved'&&d.affectsCash).reduce((s: number, d: Record<string,unknown>) => s + ((d.totalAmount as number)||0), 0);
      setCash(capitalIn - activeOut + closedIn - closedOut + divs - expOut - distOut);
    } catch(e) { console.error(e); }
  }, [user]);

  useEffect(() => { loadCash(); }, [loadCash]);

  if (loading || !user) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--pearl)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: 'var(--navy)', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>جاري التحميل...</p>
      </div>
    </div>
  );

  const visibleNav = navItems.filter(i => i.roles.includes(user.role));
  const visibleMobileNav = mobileBottomNav.filter(i => i.roles.includes(user.role)).slice(0, 5);
  const isManager = user.role === 'manager' || user.role === 'admin';

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }

        /* ── DESKTOP: الـ sidebar ثابت على اليمين ── */
        #desktop-sidebar {
          display: flex;
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 260px;
          z-index: 40;
          flex-direction: column;
          background: var(--navy);
          box-shadow: -4px 0 24px rgba(0,0,0,.15);
        }

        /* ── MAIN CONTENT ── */
        #main-content {
          margin-right: 260px;
          min-height: 100dvh;
          background: var(--pearl);
          overflow-x: hidden;
        }
        #main-inner {
          padding: 1.5rem;
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* ── MOBILE HEADER ── */
        #mobile-header {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 30;
          height: 56px;
          background: var(--navy);
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          padding-top: env(safe-area-inset-top);
          box-shadow: 0 2px 12px rgba(0,0,0,.2);
        }

        /* ── MOBILE BOTTOM NAV ── */
        #mobile-bottom-nav {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 40;
          background: #fff;
          border-top: 1px solid var(--border);
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -4px 20px rgba(0,0,0,.08);
        }

        /* ── MOBILE DRAWER OVERLAY ── */
        #drawer-overlay {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(15,23,41,.7);
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }
        #drawer-panel {
          position: absolute;
          top: 0; bottom: 0; right: 0;
          width: min(280px, 85vw);
          background: var(--navy);
          display: flex;
          flex-direction: column;
          box-shadow: -8px 0 40px rgba(0,0,0,.3);
          animation: slideInRight 0.25s cubic-bezier(.32,.72,0,1);
          overflow-y: auto;
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 767px) {
          #desktop-sidebar { display: none !important; }
          #mobile-header { display: flex !important; }
          #mobile-bottom-nav { display: flex !important; }
          #main-content {
            margin-right: 0 !important;
            padding-top: calc(56px + env(safe-area-inset-top));
            padding-bottom: calc(64px + env(safe-area-inset-bottom));
          }
          #main-inner {
            padding: 0.875rem !important;
            /* ✅ المفتاح: يمنع أي محتوى من الخروج عن حدود الشاشة */
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
          }
          #drawer-overlay { display: block !important; }
        }

        /* ── SIDEBAR LINKS ── */
        .sl { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.875rem; border-radius: 12px; font-size: 0.875rem; font-weight: 500; color: rgba(255,255,255,.65); text-decoration: none; transition: all 0.15s; white-space: nowrap; }
        .sl:hover { background: rgba(255,255,255,.1); color: #fff; }
        .sl-active { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.875rem; border-radius: 12px; font-size: 0.875rem; font-weight: 700; background: var(--gold); color: var(--navy); text-decoration: none; white-space: nowrap; box-shadow: 0 2px 8px rgba(201,168,76,.4); }

        /* ── BOTTOM NAV ITEMS ── */
        .bni { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 4px; border-radius: 10px; font-size: 0.58rem; font-weight: 600; color: #94a3b8; text-decoration: none; transition: color 0.15s; }
        .bni.active { color: var(--navy); }
        .bni .ni { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: background 0.15s; }
        .bni.active .ni { background: rgba(15,23,41,.08); }
      `}</style>

      {/* ══════════════════════════════════════════
          DESKTOP SIDEBAR
      ══════════════════════════════════════════ */}
      <aside id="desktop-sidebar">
        {/* Logo */}
        <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '12px', background: 'linear-gradient(135deg, #c9a84c, #e8c97a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Building2 size={20} color="#0f1729" />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', lineHeight: 1.2 }}>نظام الصندوق</p>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.7rem' }}>إدارة المحفظة</p>
            </div>
          </div>
        </div>

        {/* Cash widget */}
        {isManager && cash !== null && (
          <div style={{ margin: '0.875rem', padding: '0.75rem 1rem', borderRadius: '14px', flexShrink: 0, background: cash >= 0 ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)', border: cash >= 0 ? '1px solid rgba(16,185,129,.25)' : '1px solid rgba(239,68,68,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Wallet size={13} color={cash >= 0 ? '#10b981' : '#ef4444'} />
              <span style={{ fontSize: '0.68rem', color: cash >= 0 ? '#6ee7b7' : '#fca5a5', fontWeight: 600 }}>الكاش المتوفر</span>
            </div>
            <span style={{ color: cash >= 0 ? '#34d399' : '#f87171', fontWeight: 800, fontSize: '1rem' }}>{formatCurrency(cash)}</span>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {visibleNav.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href} className={active ? 'sl-active' : 'sl'}>
                  {item.icon}
                  <span>{item.label}</span>
                  {active && <ChevronRight size={14} style={{ marginRight: 'auto', opacity: 0.6 }} />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,.06)' }}>
            <div style={{ width: 34, height: 34, borderRadius: '10px', flexShrink: 0, background: 'linear-gradient(135deg, #c9a84c, #e8c97a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1729', fontWeight: 800, fontSize: '0.9rem' }}>
              {user.name?.[0] || 'م'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#fff', fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.68rem' }}>{user.role === 'manager' ? 'مدير' : user.role === 'admin' ? 'إداري' : 'مستثمر'}</p>
            </div>
            <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', padding: '6px', borderRadius: '8px', display: 'flex', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget).style.color = '#ef4444'; (e.currentTarget).style.background = 'rgba(239,68,68,.15)'; }}
              onMouseLeave={e => { (e.currentTarget).style.color = 'rgba(255,255,255,.35)'; (e.currentTarget).style.background = 'none'; }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          MOBILE HEADER
      ══════════════════════════════════════════ */}
      <header id="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, borderRadius: '10px', background: 'linear-gradient(135deg, #c9a84c, #e8c97a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={17} color="#0f1729" />
          </div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>الصندوق</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isManager && cash !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cash >= 0 ? '#f0fdf4' : '#fef2f2', border: `1.5px solid ${cash >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 20, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: cash >= 0 ? '#15803d' : '#dc2626' }}>
              <Wallet size={12} />
              {formatCurrency(cash)}
            </div>
          )}
          <button onClick={() => setDrawerOpen(true)} style={{ background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer', color: '#fff', padding: '7px', borderRadius: '8px', display: 'flex' }}>
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          MOBILE DRAWER
      ══════════════════════════════════════════ */}
      {drawerOpen && (
        <div id="drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div id="drawer-panel" onClick={e => e.stopPropagation()}>
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', paddingTop: 'calc(1rem + env(safe-area-inset-top))', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, #c9a84c, #e8c97a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={18} color="#0f1729" />
                </div>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>نظام الصندوق</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer', color: '#fff', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Cash in drawer */}
            {isManager && cash !== null && (
              <div style={{ margin: '0.75rem', padding: '0.75rem 1rem', borderRadius: '14px', flexShrink: 0, background: cash >= 0 ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)', border: cash >= 0 ? '1px solid rgba(16,185,129,.25)' : '1px solid rgba(239,68,68,.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <Wallet size={12} color={cash >= 0 ? '#10b981' : '#ef4444'} />
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.5)' }}>الكاش المتوفر</span>
                </div>
                <span style={{ color: cash >= 0 ? '#34d399' : '#f87171', fontWeight: 800, fontSize: '1rem' }}>{formatCurrency(cash)}</span>
              </div>
            )}

            {/* Nav links */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
              {visibleNav.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link key={item.href} href={item.href} className={active ? 'sl-active' : 'sl'}
                    onClick={() => setDrawerOpen(false)}
                    style={{ marginBottom: '2px', display: 'flex' }}>
                    {item.icon}<span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User in drawer */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,.08)', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,.06)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '10px', flexShrink: 0, background: 'linear-gradient(135deg, #c9a84c, #e8c97a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1729', fontWeight: 800 }}>
                  {user.name?.[0] || 'م'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                  <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '0.7rem' }}>{user.role === 'manager' ? 'مدير' : user.role === 'admin' ? 'إداري' : 'مستثمر'}</p>
                </div>
                <button onClick={() => { signOut(); setDrawerOpen(false); }} style={{ background: 'rgba(239,68,68,.15)', border: 'none', cursor: 'pointer', color: '#f87171', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main id="main-content">
        <div id="main-inner">
          {children}
        </div>
      </main>

      {/* ══════════════════════════════════════════
          MOBILE BOTTOM NAV
      ══════════════════════════════════════════ */}
      <nav id="mobile-bottom-nav" style={{ display: 'none', alignItems: 'center', padding: '0 0.25rem' }}>
        {visibleMobileNav.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={`bni ${active ? 'active' : ''}`}>
              <div className="ni">{item.icon}</div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
