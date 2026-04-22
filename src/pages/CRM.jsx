import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, DollarSign, ShoppingCart, Users, Award,
  BarChart3, CreditCard, Package, Calendar, Star
} from 'lucide-react';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function getPeriodDates(filter) {
  const now = new Date();
  if (filter === '7d') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return [d.toISOString().split('T')[0], now.toISOString().split('T')[0]];
  }
  if (filter === '30d') {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return [d.toISOString().split('T')[0], now.toISOString().split('T')[0]];
  }
  if (filter === '6m') {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return [d.toISOString().split('T')[0], now.toISOString().split('T')[0]];
  }
  if (filter === 'year') {
    return [`${now.getFullYear()}-01-01`, now.toISOString().split('T')[0]];
  }
  // current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  return [start, now.toISOString().split('T')[0]];
}

export default function CRM() {
  const [filter, setFilter] = useState('mes');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [filter]);

  async function loadData() {
    setLoading(true);
    const [start, end] = getPeriodDates(filter);

    const [
      { data: vendas },
      { data: vendedores },
      { data: clientes },
      { data: todosVendas },
    ] = await Promise.all([
      supabase.from('vendas')
        .select('*, clientes(nome), vendedores(nome, comissao_pct), vendas_itens(quantidade, valor_unitario, produtos(nome))')
        .gte('data', start).lte('data', end).eq('status', 'finalizada'),
      supabase.from('vendedores').select('id, nome, comissao_pct').eq('ativo', true),
      supabase.from('clientes').select('id, nome'),
      // Last 6 months for chart
      supabase.from('vendas')
        .select('data, total')
        .eq('status', 'finalizada')
        .gte('data', (() => { const d = new Date(); d.setMonth(d.getMonth() - 5); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; })()),
    ]);

    const v = vendas || [];
    const totalFaturado = v.reduce((s, x) => s + (x.total || 0), 0);
    const nVendas = v.length;
    const ticketMedio = nVendas > 0 ? totalFaturado / nVendas : 0;
    const clientesAtivos = new Set(v.filter(x => x.cliente_id).map(x => x.cliente_id)).size;

    // Ranking vendedores
    const rankVendedores = {};
    for (const venda of v) {
      const vid = venda.vendedor_id;
      const nome = venda.vendedores?.nome || 'Sem vendedor';
      if (!rankVendedores[vid || '_none']) rankVendedores[vid || '_none'] = { nome, total: 0, qtd: 0, comissao_pct: venda.vendedores?.comissao_pct || 0 };
      rankVendedores[vid || '_none'].total += venda.total || 0;
      rankVendedores[vid || '_none'].qtd += 1;
    }
    const rankVendList = Object.values(rankVendedores).sort((a, b) => b.total - a.total);

    // Top clientes
    const rankClientes = {};
    for (const venda of v) {
      const cid = venda.cliente_id || '_none';
      const nome = venda.clientes?.nome || 'Cliente avulso';
      if (!rankClientes[cid]) rankClientes[cid] = { nome, total: 0, qtd: 0 };
      rankClientes[cid].total += venda.total || 0;
      rankClientes[cid].qtd += 1;
    }
    const rankClientesList = Object.values(rankClientes).sort((a, b) => b.total - a.total).slice(0, 5);

    // Formas de pagamento
    const fPag = {};
    for (const venda of v) {
      const fp = venda.forma_pagamento || 'outros';
      fPag[fp] = (fPag[fp] || 0) + (venda.total || 0);
    }
    const fPagList = Object.entries(fPag).map(([k, val]) => ({ nome: k, valor: val })).sort((a, b) => b.valor - a.valor);

    // Top produtos
    const topProd = {};
    for (const venda of v) {
      for (const item of (venda.vendas_itens || [])) {
        const nome = item.produtos?.nome || 'Produto';
        if (!topProd[nome]) topProd[nome] = { nome, qtd: 0, total: 0 };
        topProd[nome].qtd += item.quantidade || 0;
        topProd[nome].total += (item.quantidade || 0) * (item.valor_unitario || 0);
      }
    }
    const topProdList = Object.values(topProd).sort((a, b) => b.total - a.total).slice(0, 5);

    // Monthly chart (last 6 months)
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: MESES[d.getMonth()], total: 0 };
    });
    for (const venda of (todosVendas || [])) {
      const d = new Date(venda.data);
      const m = months.find(x => x.year === d.getFullYear() && x.month === d.getMonth());
      if (m) m.total += venda.total || 0;
    }
    const maxMes = Math.max(...months.map(m => m.total), 1);

    setData({ totalFaturado, nVendas, ticketMedio, clientesAtivos, rankVendList, rankClientesList, fPagList, topProdList, months, maxMes });
    setLoading(false);
  }

  const FILTERS = [
    { key: 'mes', label: 'Este Mês' },
    { key: '7d', label: 'Últimos 7 dias' },
    { key: '30d', label: 'Últimos 30 dias' },
    { key: '6m', label: '6 Meses' },
    { key: 'year', label: 'Este Ano' },
  ];

  const pagLabels = { pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão Crédito', debito: 'Cartão Débito', boleto: 'Boleto', transferencia: 'Transferência', cheque: 'Cheque', crediario: 'Crediário' };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">CRM · Análise de Vendas</h2>
          <p className="page-subtitle">Performance comercial em tempo real</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="dashboard-kpis" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: 'var(--space-6)' }}>
            <div className="kpi-card">
              <div className="kpi-icon"><DollarSign size={20} /></div>
              <div className="kpi-label">Total Faturado</div>
              <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{fmt(data.totalFaturado)}</div>
              <div className="kpi-trend up"><TrendingUp size={14} /><span>no período</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><BarChart3 size={20} /></div>
              <div className="kpi-label">Ticket Médio</div>
              <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{fmt(data.ticketMedio)}</div>
              <div className="kpi-trend neutral"><span>por venda</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}><ShoppingCart size={20} /></div>
              <div className="kpi-label">Nº de Vendas</div>
              <div className="kpi-value">{data.nVendas}</div>
              <div className="kpi-trend neutral"><span>transações</span></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}><Users size={20} /></div>
              <div className="kpi-label">Clientes Ativos</div>
              <div className="kpi-value">{data.clientesAtivos}</div>
              <div className="kpi-trend neutral"><span>com compras</span></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
            {/* Gráfico mensal */}
            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
                <Calendar size={18} className="text-gold" /> Evolução Mensal (últimos 6 meses)
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', height: 160 }}>
                {data.months.map((m, i) => {
                  const pct = data.maxMes > 0 ? (m.total / data.maxMes) * 100 : 0;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, opacity: m.total > 0 ? 1 : 0 }}>
                        {fmt(m.total).replace('R$\u00a0', 'R$ ')}
                      </div>
                      <div style={{ width: '100%', background: 'var(--color-glass)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: 120, display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(pct, 2)}%`,
                          background: i === data.months.length - 1
                            ? 'linear-gradient(180deg, var(--color-gold) 0%, var(--color-gold-deep) 100%)'
                            : 'linear-gradient(180deg, rgba(201,169,110,0.5) 0%, rgba(201,169,110,0.2) 100%)',
                          borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                          transition: 'height 0.6s ease',
                        }} />
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Formas de pagamento */}
            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
                <CreditCard size={18} className="text-gold" /> Pagamentos
              </h3>
              {data.fPagList.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Sem dados</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {data.fPagList.map((fp, i) => {
                    const pct = data.totalFaturado > 0 ? (fp.valor / data.totalFaturado) * 100 : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 4 }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{pagLabels[fp.nome] || fp.nome}</span>
                          <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                        </div>
                        <div style={{ background: 'var(--color-glass)', borderRadius: 100, height: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-gold)', borderRadius: 100, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-6)' }}>
            {/* Ranking Vendedores */}
            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
                <Award size={18} className="text-gold" /> Ranking Vendedores
              </h3>
              {data.rankVendList.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Sem dados</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {data.rankVendList.map((v, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: i === 0 ? 'rgba(201,169,110,0.08)' : 'transparent', borderRadius: 'var(--radius-md)', border: i === 0 ? '1px solid rgba(201,169,110,0.2)' : 'none' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? 'var(--color-gold)' : 'var(--color-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: i === 0 ? 'white' : 'var(--color-text-muted)', flexShrink: 0 }}>
                        {i === 0 ? <Star size={12} /> : i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{v.qtd} venda{v.qtd !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-success)' }}>{fmt(v.total)}</div>
                        {v.comissao_pct > 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>{fmt(v.total * v.comissao_pct / 100)} comissão</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Clientes */}
            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
                <Users size={18} className="text-gold" /> Top Clientes
              </h3>
              {data.rankClientesList.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Sem dados</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {data.rankClientesList.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(201,169,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-gold)', flexShrink: 0 }}>
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{c.qtd} compra{c.qtd !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-success)' }}>{fmt(c.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Produtos */}
            <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
                <Package size={18} className="text-gold" /> Produtos Mais Vendidos
              </h3>
              {data.topProdList.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Sem dados</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {data.topProdList.map((p, i) => {
                    const maxT = data.topProdList[0].total;
                    const pct = maxT > 0 ? (p.total / maxT) * 100 : 0;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 4 }}>
                          <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.nome}</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>{p.qtd} un · <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>{fmt(p.total)}</span></span>
                        </div>
                        <div style={{ background: 'var(--color-glass)', borderRadius: 100, height: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-deep))', borderRadius: 100, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
