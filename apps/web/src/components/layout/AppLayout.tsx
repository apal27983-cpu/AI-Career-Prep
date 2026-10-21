import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  FileText,
  GaugeCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings as SettingsIcon,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profile', label: 'My Profile', icon: UserRound },
  { to: '/resume', label: 'Resume Analyzer', icon: FileText },
  { to: '/skill-gap', label: 'Skill Gap Analysis', icon: Target },
  { to: '/interview', label: 'Interview Practice', icon: MessagesSquare },
  { to: '/history', label: 'Interview History', icon: History },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // The mobile drawer should never survive a navigation.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    notify('You have been signed out.', 'info');
    navigate('/login', { replace: true });
  };

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-1 px-2 py-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
          title={collapsed ? item.label : undefined}
        >
          <item.icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <Link to="/dashboard" className="flex items-center gap-2 px-4 py-4">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"
      >
        <GaugeCircle className="h-5 w-5" />
      </span>
      <span className={cn('text-sm font-semibold text-slate-900', collapsed && 'lg:hidden')}>
        Career Prep
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-slate-200 bg-white lg:flex',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        {brand}
        {nav}
        <div className="border-t border-slate-200 p-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            <ChevronLeft
              aria-hidden="true"
              className={cn('h-[18px] w-[18px] transition-transform', collapsed && 'rotate-180')}
            />
            <span className={cn(collapsed && 'lg:hidden')}>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              {user?.hasProfile ? null : (
                <Link
                  to="/onboarding"
                  className="text-xs font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
                >
                  Finish setting up your career profile
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight text-slate-900">{user?.name}</p>
                <p className="text-xs leading-tight text-slate-500">{user?.email}</p>
              </div>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
              >
                {user ? initialsOf(user.name) : '?'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleLogout()}
                icon={<LogOut className="h-4 w-4" />}
              >
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
