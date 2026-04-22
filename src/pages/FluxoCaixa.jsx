import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, DollarSign, Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { downloadICS } from '../lib/googleCalendar';
import { useToast } from '../contexts/ToastContext';

const PERIODOS = [
  { key: 7, label: '7 dias' },
  { key: 15, label: '15 dias' },
  { key: 30, label: '30 dias' },
  { key: 60, label: '60 dias' },
  { key: 90, label: '90 dias' },
];

export default function FluxoCaixa() {
  const { addToast } = useToast();
  const [periodo, setPeriodo] = useState(30);
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totais, setTotais] = useState({ entradas: 0, saidas: 0, saldo: 0 });

  useEffect(() => { load(); }, [periodo]);

  async function load() {
    setLoading(true);
    const hoje = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 1); // inclui hoje
    const fim = new Date();
    fim.setDate(fim.getDate() + periodo);

    const inicioStr = inicio.toISOString().split('T')[0];
    const fimStr = fim.toISOString().split('T')[0];

    const [{ data: receber }, { data: pagar }] = await Promise.all([
      supabase.from('contas_receber')
        .select('id, valor, data_vencimento, status, descricao, clientes(nome)')
        .in('status', ['pendente', 'negociando'])
        .gte('data_vencimento', inicioStr)
        .lte('data_vencimento', fimStr)
        .order('data_vencimento'),
      supabase.from('contas_pagar')
        .select('id, valor, data_vencimento, status, descricao, fornecedores(nome)')
        .eq('status', 'pendente')
        .gte('data_vencimento', inicioStr)
        .lte('data_vencimento', fimStr)
        .order('data_vencimento'),
    ]);

    // Monta mapa dia a dia
    const diasMap = {};
    const addDia = (dateStr) => {
      if (!diasMap[dateStr]) {
        diasMap[dateStr] = { data: dateStr, entradas: 0, saidas: 0, itensEntrada: [], itensSaida: [] };
      }
    };

    // Preenche todos os dias do período
    for (let i = 0; i <= periodo; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      addDia(d.toISOString().split('T')[0]);
    }

    (receber || []).forEach(c => {
      const d = c.data_vencimento;
      addDia(d);
      diasMap[d].entradas += c.valor;
      diasMap[d].itensEntrada.push({ desc: c.descricao || c.clientes?.nome || '?', valor: c.valor });
    });

    (pagar || []).forEach(c => {
      const d = c.data_vencimento;
      addDia(d);
      diasMap[d].saidas += c.valor;
      diasMap[d].itensSaida.push({ desc: c.descricao || c.fornecedores?.nome || '?', valor: c.valor });
    });

    // Ordena e calcula saldo acumulado
    let saldoAcum = 0;
    const lista = Object.values(diasMap)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(dia => {
        saldoAcum += dia.entradas - dia.saidas;
        return { ...dia, saldoAcum };
      });

    const totalEntradas = lista.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas = lista.reduce((s, d) => s + d.saidas, 0);

    setDados(lista);
    setTotais({ entradas: totalEntradas, saidas: totalSaidas, saldo: totalEntradas - totalSaidas });
    setLoading(false);
  }

  function exportarCalendar() {
    const events = dados
      .filter(d => d.entradas > 0 || d.saidas > 0)
      .map(d => ({
        id: d.data,
        title: `UNA AURA · E: ${fmt(d.entradas)} | S: ${fmt(d.saidas)}`,
        date: d.data,
        details: [
          d.itensEntrada.length ? `ENTRADAS:\n${d.itensEntrada.map(i => `  • ${i.desc}: ${fmt(i.valor)}`).join('\n')}` : '',
          d.itensSaida.length ? `SAÍDAS:\n${d.itensSaida.map(i => `  • ${i.desc}: ${fmt(i.valor)}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n'),
      }));
    downloadICS(events, 'fluxo-caixa-una-aura.ics');
    addToast('Fluxo de caixa exportado para Google Calendar!');
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const maxVal = Math.max(...dados.map(d => Math.max(d.entradas, d.saidas)), 1);
  const diasComMovimento = dados.filter(d => d.entradas > 0 || d.saidas > 0);
  const melhorDia = diasComMovimento.reduce((m, d) => (!m || d.entradas - d.saidas > m.entradas - m.saidas) ? d : m, null);
  const piorDia = diasComMovimento.reduce((m, d) => (!m || d.saidas - d.entradas > m.saidas - m.entradas) ? d : m, null);

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Fluxo de Caixa</h2>
          <p className="page-subtitle">Previsão diária de entradas e saídas futuras</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          {PERIODOS.map(p => (
            <button key={p.key} className={`btn btn-sm ${periodo === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriodo(p.key)}>
              {p.label}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={exportarCalendar}>
            <Download size={14} /> Exportar .ics
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><TrendingUp size={20} /></div>
          <div className="kpi-label">Entradas Previstas</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{fmt(totais.entradas)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><TrendingDown size={20} /></div>
          <div className="kpi-label">Saídas Previstas</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-danger)' }}>{fmt(totais.saidas)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><DollarSign size={20} /></div>
          <div className="kpi-label">Saldo do Período</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: totais.saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmt(totais.saldo)}</div>
        </div>
        {melhorDia && (
          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--color-gold)' }}><Calendar size={20} /></div>
            <div className="kpi-label">Melhor Dia</div>
            <div className="kpi-value" style={{ fontSize: 'var(--text-base)', color: 'var(--color-gold)' }}>
              {new Date(melhorDia.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>+{fmt(melhorDia.entradas - melhorDia.saidas)}</div>
          </div>
        )}
      </div>

      {/* Gráfico de barras */}
      <div className="glass-card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
        <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-4)' }}>📊 Gráfico de Previsão</h4>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, minWidth: dados.length * 28, height: 140, padding: '0 var(--space-2)' }}>
            {dados.map((dia, i) => {
              const hE = dia.entradas > 0 ? Math.max((dia.entradas / maxVal) * 120, 4) : 0;
              const hS = dia.saidas > 0 ? Math.max((dia.saidas / maxVal) * 120, 4) : 0;
              const isHoje = dia.data === new Date().toISOString().split('T')[0];
              return (
                <div key={i} title={`${dia.data}\nEntradas: ${fmt(dia.entradas)}\nSaídas: ${fmt(dia.saidas)}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: '1 0 24px' }}>
                  <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                    {hE > 0 && <div style={{ width: 10, height: hE, background: 'var(--color-success)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />}
                    {hS > 0 && <div style={{ width: 10, height: hS, background: 'var(--color-danger)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />}
                    {hE === 0 && hS === 0 && <div style={{ width: 20, height: 4, background: 'var(--color-glass-border)', borderRadius: 2 }} />}
                  </div>
                  {isHoje && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-gold)' }} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--color-success)', borderRadius: 2, display: 'inline-block' }} /> Entradas</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--color-danger)', borderRadius: 2, display: 'inline-block' }} /> Saídas</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-gold)', display: 'inline-block' }} /> Hoje</span>
          </div>
        </div>
      </div>

      {/* Tabela diária */}
      <div className="glass-card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Dia</th>
              <th style={{ color: 'var(--color-success)' }}>Entradas</th>
              <th style={{ color: 'var(--color-danger)' }}>Saídas</th>
              <th>Saldo do Dia</th>
              <th>Saldo Acumulado</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((dia, i) => {
              const saldoDia = dia.entradas - dia.saidas;
              const isHoje = dia.data === new Date().toISOString().split('T')[0];
              const semMovimento = dia.entradas === 0 && dia.saidas === 0;
              return (
                <tr key={i} style={isHoje ? { background: 'rgba(201,169,110,0.06)' } : semMovimento ? { opacity: 0.4 } : {}}>
                  <td style={{ fontWeight: isHoje ? 700 : 400, color: isHoje ? 'var(--color-gold)' : 'var(--color-text-primary)' }}>
                    {new Date(dia.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    {isHoje && <span style={{ fontSize: 10, marginLeft: 6, background: 'var(--color-gold)', color: '#000', padding: '1px 5px', borderRadius: 4 }}>HOJE</span>}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    {new Date(dia.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </td>
                  <td style={{ color: dia.entradas > 0 ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: dia.entradas > 0 ? 600 : 400 }}>
                    {dia.entradas > 0 ? fmt(dia.entradas) : '—'}
                  </td>
                  <td style={{ color: dia.saidas > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)', fontWeight: dia.saidas > 0 ? 600 : 400 }}>
                    {dia.saidas > 0 ? fmt(dia.saidas) : '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: saldoDia > 0 ? 'var(--color-success)' : saldoDia < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {semMovimento ? '—' : (saldoDia >= 0 ? '+' : '') + fmt(saldoDia)}
                  </td>
                  <td style={{ fontWeight: 600, color: dia.saldoAcum >= 0 ? 'var(--color-text-primary)' : 'var(--color-danger)' }}>
                    {fmt(dia.saldoAcum)}
                  </td>
                  <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[
                      ...dia.itensEntrada.map(i => `↑ ${i.desc}`),
                      ...dia.itensSaida.map(i => `↓ ${i.desc}`),
                    ].join(' · ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--color-gold)', fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-primary)' }}>TOTAL DO PERÍODO</td>
              <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-success)', fontWeight: 700 }}>{fmt(totais.entradas)}</td>
              <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-danger)', fontWeight: 700 }}>{fmt(totais.saidas)}</td>
              <td colSpan={2} style={{ padding: 'var(--space-3) var(--space-4)', color: totais.saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700, fontSize: 'var(--text-lg)' }}>
                {totais.saldo >= 0 ? '+' : ''}{fmt(totais.saldo)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
