import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Gem, Package, Lightbulb } from 'lucide-react';
import { formatMoney } from '../lib/money';

export default function Resultados() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes');

  useEffect(() => { load(); }, [periodo]);

  async function load() {
    setLoading(true);
    const now = new Date();
    let startDate;
    if (periodo === 'mes') { startDate = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (periodo === 'trimestre') { startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); }
    else { startDate = new Date(now.getFullYear(), 0, 1); }

    const [{ data: vendas }, { data: compras }, { data: cp }, { data: cr }, { data: produtos }] = await Promise.all([
      supabase.from('vendas').select('*, vendas_itens(*)').gte('data', startDate.toISOString()),
      supabase.from('compras').select('*, compras_itens(*)').gte('data', startDate.toISOString()),
      supabase.from('contas_pagar').select('*').gte('created_at', startDate.toISOString()),
      supabase.from('contas_receber').select('*').gte('created_at', startDate.toISOString()),
      supabase.from('produtos').select('*').eq('ativo', true),
    ]);

    const receita = (vendas || []).reduce((s, v) => s + (v.vendas_itens || []).reduce((ss, i) => ss + i.quantidade * i.valor_unitario, 0), 0);
    const custoMerc = (compras || []).reduce((s, c) => s + (c.compras_itens || []).reduce((ss, i) => ss + i.quantidade * i.valor_unitario, 0), 0);
    const despesas = (cp || []).filter(c => c.categoria !== 'mercadoria').reduce((s, c) => s + c.valor, 0);
    const lucBruto = receita - custoMerc;
    const lucLiquido = lucBruto - despesas;
    const margem = receita > 0 ? (lucLiquido / receita * 100) : 0;

    const totalVendas = (vendas || []).length;
    const ticketMedio = totalVendas > 0 ? receita / totalVendas : 0;

    const totalEstoque = (produtos || []).reduce((s, p) => s + (p.quantidade_estoque || 0), 0);
    const vendidoQty = (vendas || []).reduce((s, v) => s + (v.vendas_itens || []).reduce((ss, i) => ss + i.quantidade, 0), 0);
    const giroEstoque = totalEstoque > 0 ? (vendidoQty / totalEstoque) : 0;

    // Top profitable products
    const prodMap = {};
    (vendas || []).forEach(v => {
      (v.vendas_itens || []).forEach(i => {
        if (!prodMap[i.produto_id]) prodMap[i.produto_id] = { qty: 0, receita: 0 };
        prodMap[i.produto_id].qty += i.quantidade;
        prodMap[i.produto_id].receita += i.quantidade * i.valor_unitario;
      });
    });

    const topProds = Object.entries(prodMap).map(([id, d]) => {
      const prod = (produtos || []).find(p => p.id === id);
      const custo = prod ? prod.custo_unitario * d.qty : 0;
      return { nome: prod?.nome || 'Desconhecido', receita: d.receita, lucro: d.receita - custo, margem: d.receita > 0 ? ((d.receita - custo) / d.receita * 100) : 0 };
    }).sort((a, b) => b.lucro - a.lucro).slice(0, 5);

    // Insights
    const insights = [];
    const estoqueParado = (produtos || []).filter(p => (p.quantidade_estoque || 0) > 20);
    if (estoqueParado.length > 0) insights.push({ type: 'warn', text: `${estoqueParado.length} produto(s) com estoque alto (>20 un.). Considere promoções.` });
    if (topProds.length > 0) insights.push({ type: 'success', text: `"${topProds[0].nome}" é o mais lucrativo com margem de ${topProds[0].margem.toFixed(1)}%.` });
    if (despesas > lucBruto * 0.3) insights.push({ type: 'warn', text: 'Despesas operacionais estão acima de 30% do lucro bruto. Revise custos.' });
    if (margem > 40) insights.push({ type: 'success', text: `Excelente margem líquida de ${margem.toFixed(1)}%!` });

    setData({ receita, custoMerc, despesas, lucBruto, lucLiquido, margem, ticketMedio, giroEstoque, topProds, insights, totalVendas });
    setLoading(false);
  }

  const fmt = formatMoney;

  if (loading || !data) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Resultado Financeiro</h2><p className="page-subtitle">Visão de consultoria do seu negócio</p></div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {['mes', 'trimestre', 'ano'].map(p => (
            <button key={p} className={`btn ${periodo === p ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setPeriodo(p)}>
              {p === 'mes' ? 'Mês' : p === 'trimestre' ? 'Trimestre' : 'Ano'}
            </button>
          ))}
        </div>
      </div>

      {/* DRE */}
      <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BarChart3 size={20} className="text-gold" /> Demonstrativo de Resultados
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Receita Total</span>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-success)' }}>{fmt(data.receita)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>(-) Custo Mercadorias</span>
            <span style={{ color: 'var(--color-danger)' }}>{fmt(data.custoMerc)}</span>
          </div>
          <div style={{ borderTop: '1px dashed var(--color-glass-border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>= Lucro Bruto</span>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{fmt(data.lucBruto)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>(-) Despesas Operacionais</span>
            <span style={{ color: 'var(--color-danger)' }}>{fmt(data.despesas)}</span>
          </div>
          <div style={{ borderTop: '2px solid var(--color-gold)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>= Lucro Líquido</span>
            <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: data.lucLiquido >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmt(data.lucLiquido)}</span>
          </div>
          <div style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Margem Líquida: <strong style={{ color: 'var(--color-gold)' }}>{data.margem.toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      {/* Indicators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card"><div className="kpi-icon"><DollarSign size={20} /></div><div className="kpi-label">Ticket Médio</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{fmt(data.ticketMedio)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}><Package size={20} /></div><div className="kpi-label">Giro de Estoque</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{data.giroEstoque.toFixed(2)}x</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><TrendingUp size={20} /></div><div className="kpi-label">Total Vendas</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{data.totalVendas}</div></div>
      </div>

      {/* Top Products & Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}><Gem size={18} className="text-gold" /> Produtos Mais Lucrativos</h4>
          {data.topProds.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Sem vendas no período.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {data.topProds.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{p.nome}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Margem: {p.margem.toFixed(1)}%</div>
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>{fmt(p.lucro)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}><Lightbulb size={18} className="text-gold" /> Insights</h4>
          {data.insights.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Registre vendas para gerar insights.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {data.insights.map((ins, i) => (
                <div key={i} className={`insight-item ${ins.type}`}>
                  {ins.type === 'warn' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
