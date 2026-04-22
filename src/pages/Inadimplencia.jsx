import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import {
  AlertTriangle, Search, MessageCircle, Calendar, Check, DollarSign,
  Filter, Download, Clock, TrendingDown, Phone, X, ChevronDown
} from 'lucide-react';
import { generateCalendarLink, downloadICS, generateWhatsAppMessage } from '../lib/googleCalendar';

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: '1_30', label: '1–30 dias' },
  { key: '31_60', label: '31–60 dias' },
  { key: '60+', label: '+60 dias' },
  { key: 'negociando', label: 'Em negociação' },
];

export default function Inadimplencia() {
  const { addToast } = useToast();
  const [inadimplentes, setInadimplentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [showPagtoModal, setShowPagtoModal] = useState(false);
  const [selectedConta, setSelectedConta] = useState(null);
  const [pagtoForm, setPagtoForm] = useState({ valor: '', data: new Date().toISOString().split('T')[0], observacao: '' });
  const [logMap, setLogMap] = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const hoje = new Date().toISOString().split('T')[0];

    // Busca contas em atraso (pendente + vencido) agrupadas por cliente
    const { data: contas } = await supabase
      .from('contas_receber')
      .select('*, clientes(id, nome, telefone, email, cpf_cnpj)')
      .in('status', ['pendente', 'vencido'])
      .lt('data_vencimento', hoje)
      .order('data_vencimento');

    // Busca logs de cobrança
    const contaIds = (contas || []).map(c => c.id);
    let logs = {};
    if (contaIds.length > 0) {
      const { data: logData } = await supabase
        .from('cobrancas_log')
        .select('*')
        .in('conta_receber_id', contaIds)
        .order('data_contato', { ascending: false });

      (logData || []).forEach(l => {
        if (!logs[l.conta_receber_id]) logs[l.conta_receber_id] = [];
        logs[l.conta_receber_id].push(l);
      });
    }
    setLogMap(logs);

    // Agrupa por cliente
    const clienteMap = {};
    (contas || []).forEach(c => {
      const cid = c.cliente_id || 'sem_cliente';
      if (!clienteMap[cid]) {
        clienteMap[cid] = {
          cliente: c.clientes,
          contas: [],
          total: 0,
          maxAtraso: 0,
        };
      }
      const atraso = Math.floor((new Date(hoje) - new Date(c.data_vencimento)) / (1000 * 60 * 60 * 24));
      clienteMap[cid].contas.push({ ...c, diasAtraso: atraso });
      clienteMap[cid].total += c.valor;
      clienteMap[cid].maxAtraso = Math.max(clienteMap[cid].maxAtraso, atraso);
    });

    setInadimplentes(Object.values(clienteMap));
    setLoading(false);
  }

  async function logCobranca(contaId, tipo, resultado = 'enviado') {
    await supabase.from('cobrancas_log').insert({
      conta_receber_id: contaId, tipo, resultado
    });
    addToast(`Cobrança registrada: ${tipo}`);
    load();
  }

  function openWhatsApp(conta) {
    const msg = generateWhatsAppMessage({
      clienteName: conta.clientes?.nome || 'Cliente',
      valor: conta.valor,
      dataVencimento: conta.data_vencimento,
      parcela: conta.parcela,
      totalParcelas: conta.total_parcelas,
      pedido: conta.descricao,
    });
    const tel = (conta.clientes?.telefone || '').replace(/\D/g, '');
    const url = tel ? `https://wa.me/55${tel}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
    logCobranca(conta.id, 'whatsapp');
  }

  function openCalendar(conta) {
    const link = generateCalendarLink({
      title: `💎 Cobrança UNA AURA — ${conta.clientes?.nome || 'Cliente'}`,
      date: new Date().toISOString().split('T')[0],
      details: `Parcela ${conta.parcela}/${conta.total_parcelas}\nValor: R$ ${conta.valor}\nVencimento: ${conta.data_vencimento}\nDescrição: ${conta.descricao || ''}`,
    });
    window.open(link, '_blank');
    logCobranca(conta.id, 'calendar');
  }

  async function marcarNegociando(contaId) {
    await supabase.from('contas_receber').update({ status: 'negociando' }).eq('id', contaId);
    logCobranca(contaId, 'presencial', 'negociando');
    load();
  }

  async function registrarPagamento(e) {
    e.preventDefault();
    if (!selectedConta) return;
    const { error } = await supabase.from('contas_receber').update({
      status: 'recebido',
      data_recebimento: pagtoForm.data,
      valor: parseFloat(pagtoForm.valor) || selectedConta.valor,
    }).eq('id', selectedConta.id);
    if (error) return addToast('Erro: ' + error.message, 'error');
    await logCobranca(selectedConta.id, 'pagamento', 'pago');
    addToast('Pagamento registrado!');
    setShowPagtoModal(false);
    load();
  }

  function exportarICS(contas) {
    const events = contas.map(c => ({
      id: c.id,
      title: `Cobrança ${c.clientes?.nome || 'Cliente'} — R$ ${c.valor}`,
      date: new Date().toISOString().split('T')[0],
      details: `Vencimento: ${c.data_vencimento}\n${c.descricao || ''}`,
    }));
    downloadICS(events, 'cobrancas-inadimplencia.ics');
    addToast('Arquivo .ics exportado! Importe no Google Calendar.');
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const filtered = inadimplentes.filter(g => {
    const nome = g.cliente?.nome || '';
    if (search && !nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (filtro === '1_30') return g.maxAtraso >= 1 && g.maxAtraso <= 30;
    if (filtro === '31_60') return g.maxAtraso >= 31 && g.maxAtraso <= 60;
    if (filtro === '60+') return g.maxAtraso > 60;
    if (filtro === 'negociando') return g.contas.some(c => c.status === 'negociando');
    return true;
  });

  const totalGeral = filtered.reduce((s, g) => s + g.total, 0);
  const totalClientes = filtered.length;
  const maiorAtraso = filtered.reduce((m, g) => Math.max(m, g.maxAtraso), 0);
  const totalContas = filtered.reduce((s, g) => s + g.contas.length, 0);

  // Gather all contas for bulk export
  const todasContas = filtered.flatMap(g => g.contas);

  const badgeAtraso = (dias) => {
    if (dias > 60) return 'badge-danger';
    if (dias > 30) return 'badge-warning';
    return 'badge badge-info';
  };

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ color: 'var(--color-rose)' }}>
            <AlertTriangle size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            Inadimplência
          </h2>
          <p className="page-subtitle">{totalClientes} clientes com pendências · {totalContas} parcelas em atraso</p>
        </div>
        {todasContas.length > 0 && (
          <button className="btn btn-secondary" onClick={() => exportarICS(todasContas)}>
            <Download size={16} /> Exportar para Google Calendar
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(212,104,138,0.12)', color: 'var(--color-rose)' }}><TrendingDown size={20} /></div>
          <div className="kpi-label">Total Inadimplente</div>
          <div className="kpi-value" style={{ color: 'var(--color-rose)', fontSize: 'var(--text-xl)' }}>{fmt(totalGeral)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><AlertTriangle size={20} /></div>
          <div className="kpi-label">Clientes em Atraso</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{totalClientes}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}><Clock size={20} /></div>
          <div className="kpi-label">Maior Atraso</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: maiorAtraso > 60 ? 'var(--color-danger)' : 'var(--color-warning)' }}>{maiorAtraso} dias</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><DollarSign size={20} /></div>
          <div className="kpi-label">Parcelas em Aberto</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{totalContas}</div>
        </div>
      </div>

      {/* Filtros e busca */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {FILTROS.map(f => (
            <button key={f.key} className={`btn btn-sm ${filtro === f.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de inadimplentes por cliente */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" style={{ color: 'var(--color-success)' }}><Check size={32} /></div>
          <div className="empty-title" style={{ color: 'var(--color-success)' }}>Nenhuma inadimplência!</div>
          <div className="empty-text">Todos os clientes estão em dia com seus pagamentos. 🎉</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filtered.map((grupo, gi) => (
            <div key={gi} className="glass-card" style={{ overflow: 'hidden', border: grupo.maxAtraso > 60 ? '1px solid rgba(248,113,113,0.25)' : '1px solid var(--color-glass-border)' }}>
              {/* Cliente header */}
              <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-glass-border)', background: grupo.maxAtraso > 60 ? 'rgba(248,113,113,0.04)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'rgba(212,104,138,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--color-rose)', fontSize: 'var(--text-lg)' }}>
                    {(grupo.cliente?.nome || 'S')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{grupo.cliente?.nome || 'Sem cliente'}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {grupo.cliente?.telefone || ''} {grupo.cliente?.email ? `· ${grupo.cliente.email}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-rose)' }}>{fmt(grupo.total)}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{grupo.contas.length} parcela(s)</div>
                  </div>
                  <span className={`badge ${grupo.maxAtraso > 60 ? 'badge-danger' : grupo.maxAtraso > 30 ? 'badge-warning' : 'badge-info'}`}>
                    {grupo.maxAtraso} dias atraso
                  </span>
                </div>
              </div>

              {/* Parcelas */}
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Descrição</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Atraso</th><th>Última Cobrança</th><th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.contas.map((c, ci) => {
                    const ultimoLog = (logMap[c.id] || [])[0];
                    return (
                      <tr key={ci}>
                        <td style={{ color: 'var(--color-text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descricao || '—'}</td>
                        <td>{c.parcela}/{c.total_parcelas}</td>
                        <td style={{ fontWeight: 600, color: 'var(--color-rose)' }}>{fmt(c.valor)}</td>
                        <td>{new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td><span className={`badge ${c.diasAtraso > 60 ? 'badge-danger' : c.diasAtraso > 30 ? 'badge-warning' : 'badge-info'}`}>{c.diasAtraso}d</span></td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          {ultimoLog ? (
                            <span title={ultimoLog.observacao}>
                              {ultimoLog.tipo} · {new Date(ultimoLog.data_contato).toLocaleDateString('pt-BR')}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                            {/* WhatsApp */}
                            <button className="btn btn-sm" title="Enviar cobrança via WhatsApp"
                              style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.2)' }}
                              onClick={() => openWhatsApp(c)}>
                              <MessageCircle size={13} />
                            </button>
                            {/* Google Calendar */}
                            <button className="btn btn-sm" title="Agendar no Google Calendar"
                              style={{ background: 'rgba(96,165,250,0.1)', color: 'var(--color-info)', border: '1px solid rgba(96,165,250,0.2)' }}
                              onClick={() => openCalendar(c)}>
                              <Calendar size={13} />
                            </button>
                            {/* Negociando */}
                            {c.status !== 'negociando' && (
                              <button className="btn btn-sm" title="Marcar como em negociação"
                                style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid rgba(251,191,36,0.2)' }}
                                onClick={() => marcarNegociando(c.id)}>
                                <Phone size={13} />
                              </button>
                            )}
                            {/* Registrar Pagamento */}
                            <button className="btn btn-sm" title="Registrar pagamento"
                              style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid rgba(74,222,128,0.2)' }}
                              onClick={() => { setSelectedConta(c); setPagtoForm({ valor: c.valor, data: new Date().toISOString().split('T')[0], observacao: '' }); setShowPagtoModal(true); }}>
                              <Check size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Modal Registrar Pagamento */}
      {showPagtoModal && selectedConta && (
        <div className="modal-backdrop" onClick={() => setShowPagtoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Registrar Pagamento</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPagtoModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={registrarPagamento}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                  <strong>{selectedConta.clientes?.nome || 'Cliente'}</strong> — {selectedConta.descricao}
                  <div style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>Original: {fmt(selectedConta.valor)} · Atraso: {selectedConta.diasAtraso} dias</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor Recebido (R$)</label>
                  <input type="number" step="0.01" className="form-input" value={pagtoForm.valor} onChange={e => setPagtoForm({ ...pagtoForm, valor: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Data do Pagamento</label>
                  <input type="date" className="form-input" value={pagtoForm.data} onChange={e => setPagtoForm({ ...pagtoForm, data: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Observação</label>
                  <input className="form-input" placeholder="Forma de pagamento, negociação, etc." value={pagtoForm.observacao} onChange={e => setPagtoForm({ ...pagtoForm, observacao: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPagtoModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Confirmar Pagamento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
