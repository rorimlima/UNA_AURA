import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Compras from './pages/Compras';
import Vendas from './pages/Vendas';
import Clientes from './pages/Clientes';
import Fornecedores from './pages/Fornecedores';
import Financeiro from './pages/Financeiro';
import Resultados from './pages/Resultados';
import Inadimplencia from './pages/Inadimplencia';
import FluxoCaixa from './pages/FluxoCaixa';
import Empresa from './pages/Empresa';
import CRM from './pages/CRM';
import Conciliacao from './pages/Conciliacao';
import Tutorial from './pages/Tutorial';
import QA from './pages/QA';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="compras" element={<Compras />} />
            <Route path="vendas" element={<Vendas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="fornecedores" element={<Fornecedores />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="resultados" element={<Resultados />} />
            <Route path="inadimplencia" element={<Inadimplencia />} />
            <Route path="fluxo-caixa" element={<FluxoCaixa />} />
            <Route path="conciliacao" element={<Conciliacao />} />
            <Route path="empresa" element={<Empresa />} />
            <Route path="crm" element={<CRM />} />
            <Route path="tutorial" element={<Tutorial />} />
            <Route path="qa" element={<QA />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
