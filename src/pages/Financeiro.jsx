import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { DollarSign, ArrowDownCircle, ArrowUpCircle, Check, X, Plus, Search, Building2, CreditCard } from 'lucide-react';

export default function Financeiro() {
  const { addToast } = useToast();
  const [tab, setTab] = useState('pagar');
  const [contasPagar, setContasPagar] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [contasFin, setContasFin] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showContaModal, setShowContaModal] = useState(false);
  const [contaForm, setContaForm] = useState({ nome:'', tipo:'banco', banco:'', agencia:'', numero_conta:'', saldo_inicial:'' });
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [pagarForm, setPagarForm] = useState({ descricao:'', categoria:'outros', fornecedor_id:'', valor:'', data_vencimento:'', forma_pagamento:'pix', observacoes:'' });
  const [fornecedores, setFornecedores] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: cp }, { data: cr }, { data: cf }, { data: forn }] = await Promise.all([
      supabase.from('contas_pagar').select('*, fornecedores(nome)').order('data_vencimento'),
      supabase.from('contas_receber').select('*, clientes(nome)').order('data_vencimento'),
      supabase.from('contas_financeiras').select('*').eq('ativa', true).order('nome'),
      supabase.from('fornecedores').select('id, nome').order('nome'),
    ]);
    setContasPagar(cp || []); setContasReceber(cr || []); setContasFin(cf || []); setFornecedores(forn || []);
    setLoading(false);
  }

  async function markPaid(id) {
    await supabase.from('contas_pagar').update({ status: 'pago', data_pagamento: new Date().toISOString().split('T')[0] }).eq('id', id);
    addToast('Conta marcada como paga!'); load();
  }

  async function markReceived(id) {
    await supabase.from('contas_receber').update({ status: 'recebido', data_recebimento: new Date().toISOString().split('T')[0] }).eq('id', id);
    addToast('Recebimento confirmado!'); load();
  }

  async function saveConta(e) {
    e.preventDefault();
    const { error } = await supabase.from('contas_financeiras').insert({
      ...contaForm, saldo_inicial: parseFloat(contaForm.saldo_inicial) || 0, saldo_atual: parseFloat(contaForm.saldo_inicial) || 0
    });
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast('Conta cadastrada!');
    setShowContaModal(false); load();
  }

  async function savePagar(e) {
    e.preventDefault();
    if (!pagarForm.valor || !pagarForm.data_vencimento) return addToast('Preencha valor e vencimento', 'error');
    const { error } = await supabase.from('contas_pagar').insert({
      descricao: pagarForm.descricao,
      categoria: pagarForm.categoria,
      fornecedor_id: pagarForm.fornecedor_id || null,
      valor: parseFloat(pagarForm.valor),
      data_vencimento: pagarForm.data_vencimento,
      forma_pagamento: pagarForm.forma_pagamento,
      observacoes: pagarForm.observacoes,
      status: 'pendente',
    });
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast('Conta a pagar cadastrada!');
    setShowPagarModal(false);
    setPagarForm({ descricao:'', categoria:'outros', fornecedor_id:'', valor:'', data_vencimento:'', forma_pagamento:'pix', observacoes:'' });
    load();
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const totalPagar = contasPagar.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);
  const totalReceber = contasReceber.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);

  const filteredPagar = contasPagar.filter(c => (c.descricao || '').toLowerCase().includes(search.toLowerCase()) || (c.fornecedores?.nome || '').toLowerCase().includes(search.toLowerCase()));
  const filteredReceber = contasReceber.filter(c => (c.descricao || '').toLowerCase().includes(search.toLowerCase()) || (c.clientes?.nome || '').toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Financeiro</h2><p className="page-subtitle">Gestão financeira inteligente</p></div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={() => { setPagarForm({ descricao:'', categoria:'outros', fornecedor_id:'', valor:'', data_vencimento:'', forma_pagamento:'pix', observacoes:'' }); setShowPagarModal(true); }}>
            <CreditCard size={18} /> Nova Conta a Pagar
          </button>
          <button className="btn btn-secondary" onClick={() => { setContaForm({ nome:'', tipo:'banco', banco:'', agencia:'', numero_conta:'', saldo_inicial:'' }); setShowContaModal(true); }}>
            <Building2 size={18} /> Nova Conta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><ArrowUpCircle size={20} /></div>
          <div className="kpi-label">A Pagar (Pendente)</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-danger)' }}>{fmt(totalPagar)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><ArrowDownCircle size={20} /></div>
          <div className="kpi-label">A Receber (Pendente)</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{fmt(totalReceber)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><DollarSign size={20} /></div>
          <div className="kpi-label">Saldo Projetado</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: totalReceber - totalPagar >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmt(totalReceber - totalPagar)}</div>
        </div>
      </div>

      {/* Bank Accounts */}
      {contasFin.length > 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)' }}>Contas Financeiras</h4>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {contasFin.map(c => (
              <div key={c.id} style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)', minWidth: 180 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{c.nome}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{c.tipo} {c.banco ? `• ${c.banco}` : ''}</div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-gold)', marginTop: 'var(--space-2)' }}>{fmt(c.saldo_atual)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button className={`btn ${tab === 'pagar' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('pagar')}>
          <ArrowUpCircle size={16} /> Contas a Pagar
        </button>
        <button className={`btn ${tab === 'receber' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('receber')}>
          <ArrowDownCircle size={16} /> Contas a Receber
        </button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {tab === 'pagar' ? (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredPagar.map(c => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--color-text-primary)' }}>{c.descricao || '—'}</td>
                  <td>{c.fornecedores?.nome || '—'}</td>
                  <td><span className="badge badge-gold">{c.categoria}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{fmt(c.valor)}</td>
                  <td>{c.data_vencimento ? new Date(c.data_vencimento).toLocaleDateString('pt-BR') : '—'}</td>
                  <td><span className={`badge ${c.status === 'pago' ? 'badge-success' : c.status === 'vencido' ? 'badge-danger' : 'badge-warning'}`}>{c.status}</span></td>
                  <td>{c.status === 'pendente' && <button className="btn btn-ghost btn-sm" onClick={() => markPaid(c.id)} style={{ color: 'var(--color-success)' }}><Check size={14} /> Pagar</button>}</td>
                </tr>
              ))}
              {filteredPagar.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }} className="text-muted">Nenhuma conta a pagar.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Descrição</th><th>Cliente</th><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredReceber.map(c => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--color-text-primary)' }}>{c.descricao || '—'}</td>
                  <td>{c.clientes?.nome || '—'}</td>
                  <td>{c.parcela}/{c.total_parcelas}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>{fmt(c.valor)}</td>
                  <td>{c.data_vencimento ? new Date(c.data_vencimento).toLocaleDateString('pt-BR') : '—'}</td>
                  <td><span className={`badge ${c.status === 'recebido' ? 'badge-success' : c.status === 'vencido' ? 'badge-danger' : 'badge-warning'}`}>{c.status}</span></td>
                  <td>{c.status === 'pendente' && <button className="btn btn-ghost btn-sm" onClick={() => markReceived(c.id)} style={{ color: 'var(--color-success)' }}><Check size={14} /> Receber</button>}</td>
                </tr>
              ))}
              {filteredReceber.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }} className="text-muted">Nenhuma conta a receber.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Conta Financeira Modal */}
      {showContaModal && (
        <div className="modal-backdrop" onClick={() => setShowContaModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">Nova Conta Financeira</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowContaModal(false)}><X size={20} /></button></div>
            <form onSubmit={saveConta}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={contaForm.nome} onChange={e => setContaForm({ ...contaForm, nome: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label">Tipo</label>
                  <select className="form-select" value={contaForm.tipo} onChange={e => setContaForm({ ...contaForm, tipo: e.target.value })}>
                    <option value="banco">Banco</option><option value="caixa">Caixa</option><option value="carteira_digital">Carteira Digital</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Banco</label><input className="form-input" value={contaForm.banco} onChange={e => setContaForm({ ...contaForm, banco: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Saldo Inicial (R$)</label><input type="number" step="0.01" className="form-input" value={contaForm.saldo_inicial} onChange={e => setContaForm({ ...contaForm, saldo_inicial: e.target.value })} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowContaModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Cadastrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nova Conta a Pagar Modal */}
      {showPagarModal && (
        <div className="modal-backdrop" onClick={() => setShowPagarModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 className="modal-title">Nova Conta a Pagar</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPagarModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={savePagar}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Descrição *</label>
                    <input className="form-input" placeholder="Ex: Aluguel, Energia, Fornecedor..." value={pagarForm.descricao} onChange={e => setPagarForm({ ...pagarForm, descricao: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoria</label>
                    <select className="form-select" value={pagarForm.categoria} onChange={e => setPagarForm({ ...pagarForm, categoria: e.target.value })}>
                      <option value="mercadoria">Mercadoria</option>
                      <option value="aluguel">Aluguel</option>
                      <option value="marketing">Marketing</option>
                      <option value="embalagem">Embalagem</option>
                      <option value="frete">Frete</option>
                      <option value="servico">Serviço</option>
                      <option value="imposto">Imposto / Taxa</option>
                      <option value="salario">Salário</option>
                      <option value="energia">Energia / Utilidades</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fornecedor</label>
                    <select className="form-select" value={pagarForm.fornecedor_id} onChange={e => setPagarForm({ ...pagarForm, fornecedor_id: e.target.value })}>
                      <option value="">Nenhum</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor (R$) *</label>
                    <input type="number" step="0.01" min="0.01" className="form-input" placeholder="0,00" value={pagarForm.valor} onChange={e => setPagarForm({ ...pagarForm, valor: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data de Vencimento *</label>
                    <input type="date" className="form-input" value={pagarForm.data_vencimento} onChange={e => setPagarForm({ ...pagarForm, data_vencimento: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Forma de Pagamento</label>
                    <select className="form-select" value={pagarForm.forma_pagamento} onChange={e => setPagarForm({ ...pagarForm, forma_pagamento: e.target.value })}>
                      <option value="pix">PIX</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="debito">Cartão Débito</option>
                      <option value="credito">Cartão Crédito</option>
                      <option value="boleto">Boleto Bancário</option>
                      <option value="transferencia">Transferência / TED / DOC</option>
                      <option value="cheque">Cheque</option>
                      <option value="deposito">Depósito</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Observações</label>
                    <input className="form-input" placeholder="Informações adicionais..." value={pagarForm.observacoes} onChange={e => setPagarForm({ ...pagarForm, observacoes: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPagarModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Cadastrar Conta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
