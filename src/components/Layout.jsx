import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  Wallet,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  Building2,
  LineChart,
  FileCheck2,
  PlayCircle,
  Bug,
  Sun,
  Moon,
  UserCheck
} from 'lucide-react';
import './Layout.css';
import OfflineIndicator from './OfflineIndicator';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/estoque', icon: Package, label: 'Estoque' },
  { to: '/compras', icon: ShoppingCart, label: 'Compras' },
  { to: '/vendas', icon: Receipt, label: 'Vendas' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/fornecedores', icon: Truck, label: 'Fornecedores' },
  { to: '/vendedores', icon: UserCheck, label: 'Vendedores' },
  { to: '/financeiro', icon: Wallet, label: 'Financeiro' },
  { to: '/resultados', icon: BarChart3, label: 'Resultados' },
];

const NAV_ITEMS_EXTRA = [
  { to: '/inadimplencia', icon: AlertTriangle, label: 'Inadimplência', danger: true },
  { to: '/fluxo-caixa', icon: TrendingUp, label: 'Fluxo de Caixa' },
  { to: '/conciliacao', icon: FileCheck2, label: 'Conciliação Bancária' },
  { to: '/crm', icon: LineChart, label: 'CRM · Vendas' },
];

const NAV_ITEMS_CONFIG = [
  { to: '/empresa', icon: Building2, label: 'Minha Empresa' },
  { to: '/tutorial', icon: PlayCircle, label: 'Ajuda & Tutoriais' },
];

export default function Layout() {
  const { user, profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inadCount, setInadCount] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('una-theme') || 'dark');
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();

  // Robust logout handler with confirmation and error resilience
  const handleLogout = useCallback(async () => {
    if (loggingOut) return; // Prevent double-clicks

    const confirmed = window.confirm('Deseja realmente sair do sistema?');
    if (!confirmed) return;

    setLoggingOut(true);
    setSidebarOpen(false);

    try {
      await signOut();
      // signOut already handles redirect via window.location.href
    } catch (err) {
      console.error('[Layout] Logout failed:', err);
      // Fallback: force redirect even if signOut threw
      window.location.href = '/login';
    }
    // No need to setLoggingOut(false) — page will reload
  }, [signOut, loggingOut]);

  // Aplicar tema no HTML
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('una-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }

  useEffect(() => {
    // Badge count for inadimplência
    const hoje = new Date().toISOString().split('T')[0];
    supabase
      .from('contas_receber')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pendente', 'vencido'])
      .lt('data_vencimento', hoje)
      .then(({ count }) => setInadCount(count || 0));
  }, [location.pathname]);

  function getPageTitle() {
    const allItems = [...NAV_ITEMS, ...NAV_ITEMS_EXTRA];
    const item = allItems.find(n => n.to === location.pathname);
    return item ? item.label : 'UNA AURA';
  }

  return (
    <div className="app-layout">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          {/* Official logo */}
          <div className="sidebar-logo">
            <img src="/logo.svg" alt="UNA AURA" className="sidebar-logo-img" />
          </div>
          <button className="sidebar-close show-mobile-only" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Principal</div>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              <ChevronRight size={14} className="sidebar-link-arrow" />
            </NavLink>
          ))}

          <div className="nav-section-label" style={{ marginTop: 'var(--space-4)' }}>Financeiro</div>
          {NAV_ITEMS_EXTRA.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${item.danger ? 'sidebar-link-danger' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.danger && inadCount > 0 && (
                <span className="nav-badge">{inadCount > 99 ? '99+' : inadCount}</span>
              )}
              <ChevronRight size={14} className="sidebar-link-arrow" />
            </NavLink>
          ))}

          <div className="nav-section-label" style={{ marginTop: 'var(--space-4)' }}>Configurações</div>
          {NAV_ITEMS_CONFIG.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              <ChevronRight size={14} className="sidebar-link-arrow" />
            </NavLink>
          ))}

          {(user?.email === 'admin@teste.com' || profile?.role === 'admin') && (
            <NavLink
              to="/qa"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              style={{ marginTop: 'var(--space-2)', color: 'var(--color-primary)' }}
              onClick={() => setSidebarOpen(false)}
            >
              <Bug size={20} />
              <span>Modo Teste / QA</span>
              <ChevronRight size={14} className="sidebar-link-arrow" />
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(profile?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{profile?.name || 'Usuário'}</span>
              <span className="sidebar-user-role badge badge-gold">
                {profile?.role === 'admin' ? 'Admin' : 'Operador'}
              </span>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon sidebar-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sair do sistema"
            style={{
              minWidth: 40,
              minHeight: 40,
              position: 'relative',
              zIndex: 10,
              cursor: loggingOut ? 'wait' : 'pointer',
              opacity: loggingOut ? 0.6 : 1,
            }}
          >
            {loggingOut ? (
              <div className="spinner" style={{ width: 18, height: 18 }} />
            ) : (
              <LogOut size={18} />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-wrapper">
        {/* Header */}
        <header className="top-header">
          <div className="header-left">
            <button
              className="btn btn-ghost btn-icon show-mobile-only"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <h1 className="header-title">{getPageTitle()}</h1>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}
              style={{ borderRadius: 'var(--radius-full)', transition: 'all 0.3s' }}
            >
              {theme === 'dark' ? <Sun size={18} style={{ color: 'var(--color-gold)' }} /> : <Moon size={18} style={{ color: 'var(--color-gold)' }} />}
            </button>
            <OfflineIndicator />
            <span className="header-date">
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              }).replace(/^\w/, c => c.toUpperCase())}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
