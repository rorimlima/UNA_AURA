import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, TrendingDown, Package, ShoppingCart,
  AlertTriangle, DollarSign, Users, BarChart3,
  ArrowUpRight, ArrowDownRight, Lightbulb, Gem, Gift
} from 'lucide-react';
import { formatMoney } from '../lib/money';
import './Dashboard.css';

export default function Dashboard() {
  const [data, setData] = useState({
    faturamento: 0,
    lucro: 0,
    totalVendas: 0,
    totalClientes: 0,
    estoqueBaixo: [],
    topProdutos: [],
    contasPagar: 0,
    contasReceber: 0,
    margemMedia: 0,
    aniversariantesMes: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Parallel queries — otimizado: apenas colunas necessárias, unificado clientes
      const [
        { data: vendas },
        { data: clientesData, count: clientesCount },
        { data: produtos },
        { data: contasPagar },
        { data: contasReceber },
      ] = await Promise.all([
        supabase.from('vendas').select('id, data, vendas_itens(quantidade, valor_unitario)').gte('data', startOfMonth),
        supabase.from('clientes').select('id, nome, data_nascimento', { count: 'exact' }),
        supabase.from('produtos').select('id, nome, custo_unitario, preco_venda, quantidade_estoque, estoque_minimo'),
        supabase.from('contas_pagar').select('valor').eq('status', 'pendente'),
        supabase.from('contas_receber').select('valor').eq('status', 'pendente'),
      ]);

      const faturamento = (vendas || []).reduce((sum, v) => {
        const total = (v.vendas_itens || []).reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);
        return sum + total;
      }, 0);

      const estoqueBaixo = (produtos || []).filter(p => (p.quantidade_estoque || 0) <= (p.estoque_minimo || 5));

      // Calculate margin from product data
      const produtosComMargem = (produtos || [])
        .filter(p => p.preco_venda > 0 && p.custo_unitario > 0)
        .map(p => ({
          ...p,
          margem: ((p.preco_venda - p.custo_unitario) / p.preco_venda) * 100
        }))
        .sort((a, b) => b.margem - a.margem);

      const margemMedia = produtosComMargem.length > 0
        ? produtosComMargem.reduce((s, p) => s + p.margem, 0) / produtosComMargem.length
        : 0;

      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();

      const aniversariantesMes = (clientesData || [])
        .filter(c => {
          if (!c.data_nascimento) return false;
          const [, month] = c.data_nascimento.split('-');
          return parseInt(month, 10) === currentMonth;
        })
        .map(c => {
          const [, , day] = c.data_nascimento.split('-');
          const diaNum = parseInt(day, 10);
          return {
            ...c,
            isToday: diaNum === currentDay,
            day: diaNum
          };
        })
        .sort((a, b) => a.day - b.day);

      setData({
        faturamento,
        lucro: faturamento * 0.4, // estimated
        totalVendas: (vendas || []).length,
        totalClientes: clientesCount || 0,
        estoqueBaixo,
        topProdutos: produtosComMargem.slice(0, 5),
        contasPagar: (contasPagar || []).reduce((s, c) => s + c.valor, 0),
        contasReceber: (contasReceber || []).reduce((s, c) => s + c.valor, 0),
        margemMedia,
        aniversariantesMes,
      });
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = formatMoney;

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner spinner-lg" />
        <p className="text-muted" style={{ marginTop: 'var(--space-4)' }}>Carregando dashboard...</p>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard animate-fade-in dashboard-antigravity">
      {/* KPI Cards */}
      <div className="dashboard-kpis">
        <div className="kpi-card">
          <div className="kpi-icon"><DollarSign size={20} /></div>
          <div className="kpi-label">Faturamento do Mês</div>
          <div className="kpi-value">{formatCurrency(data.faturamento)}</div>
          <div className="kpi-trend up">
            <ArrowUpRight size={14} />
            <span>Este mês</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
            <TrendingUp size={20} />
          </div>
          <div className="kpi-label">Lucro Estimado</div>
          <div className="kpi-value">{formatCurrency(data.lucro)}</div>
          <div className="kpi-trend up">
            <ArrowUpRight size={14} />
            <span>Margem {data.margemMedia.toFixed(0)}%</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
            <ShoppingCart size={20} />
          </div>
          <div className="kpi-label">Vendas no Mês</div>
          <div className="kpi-value">{data.totalVendas}</div>
          <div className="kpi-trend neutral">
            <span>pedidos realizados</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
            <Package size={20} />
          </div>
          <div className="kpi-label">Estoque Baixo</div>
          <div className="kpi-value">{data.estoqueBaixo.length}</div>
          <div className="kpi-trend warn">
            <AlertTriangle size={14} />
            <span>produtos em alerta</span>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="dashboard-grid">
        <div className="glass-card dashboard-finance-card">
          <h3 className="card-title">
            <Wallet size={18} className="text-gold" />
            Resumo Financeiro
          </h3>
          <div className="finance-items">
            <div className="finance-item">
              <div className="finance-item-label">
                <div className="finance-dot receive" />
                Contas a Receber
              </div>
              <span className="finance-item-value receive">{formatCurrency(data.contasReceber)}</span>
            </div>
            <div className="finance-item">
              <div className="finance-item-label">
                <div className="finance-dot pay" />
                Contas a Pagar
              </div>
              <span className="finance-item-value pay">{formatCurrency(data.contasPagar)}</span>
            </div>
            <div className="finance-divider" />
            <div className="finance-item total">
              <div className="finance-item-label">Saldo Projetado</div>
              <span className={`finance-item-value ${data.contasReceber - data.contasPagar >= 0 ? 'receive' : 'pay'}`}>
                {formatCurrency(data.contasReceber - data.contasPagar)}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-card dashboard-insights-card">
          <h3 className="card-title">
            <Lightbulb size={18} className="text-gold" />
            Insights Inteligentes
          </h3>
          <div className="insights-list">
            {data.estoqueBaixo.length > 0 && (
              <div className="insight-item warn">
                <AlertTriangle size={16} />
                <span>{data.estoqueBaixo.length} produto(s) com estoque baixo precisam de reposição.</span>
              </div>
            )}
            {data.topProdutos.length > 0 && (
              <div className="insight-item success">
                <Gem size={16} />
                <span><strong>{data.topProdutos[0]?.nome}</strong> possui a maior margem ({data.topProdutos[0]?.margem.toFixed(1)}%).</span>
              </div>
            )}
            {data.contasPagar > data.contasReceber && (
              <div className="insight-item warn">
                <TrendingDown size={16} />
                <span>As contas a pagar superam os recebimentos. Atenção ao fluxo de caixa.</span>
              </div>
            )}
            {data.faturamento === 0 && (
              <div className="insight-item info">
                <BarChart3 size={16} />
                <span>Nenhuma venda registrada neste mês. Comece cadastrando seus produtos!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>

      <div className="dashboard-grid dashboard-antigravity">
        {/* Low Stock Alert */}
        {data.estoqueBaixo.length > 0 && (
          <div className="glass-card dashboard-stock-alert">
            <h3 className="card-title">
              <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
              Alertas de Estoque
            </h3>
            <div className="stock-alert-grid">
              {data.estoqueBaixo.slice(0, 6).map(p => (
                <div key={p.id} className="stock-alert-item">
                  <div className="stock-alert-name">{p.nome}</div>
                  <div className="stock-alert-qty">
                    <span className="badge badge-danger">{p.quantidade_estoque || 0} un.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aniversariantes do Mês */}
        <div className="glass-card dashboard-birthdays-card">
          <h3 className="card-title">
            <Gift size={18} style={{ color: 'var(--color-primary)' }} />
            Aniversariantes do Mês
          </h3>
          <div className="birthdays-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {data.aniversariantesMes.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>Nenhum aniversariante este mês.</p>
            ) : (
              data.aniversariantesMes.map(c => (
                <div key={c.id} className={`birthday-item ${c.isToday ? 'today' : ''}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  background: c.isToday ? 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.1), rgba(var(--color-secondary-rgb), 0.1))' : 'var(--color-bg-secondary)',
                  border: c.isToday ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                  boxShadow: c.isToday ? '0 0 10px rgba(var(--color-primary-rgb), 0.2)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: c.isToday ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                      color: c.isToday ? 'white' : 'var(--color-text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold', fontSize: '1.2rem'
                    }}>
                      <Gift size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: c.isToday ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                        {c.nome}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Dia {c.day}
                      </div>
                    </div>
                  </div>
                  {c.isToday && (
                    <span className="badge badge-primary" style={{ animation: 'pulse 2s infinite' }}>HOJE!</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Wallet({ size, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
    </svg>
  );
}
