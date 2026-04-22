import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { X, CheckCircle, Clock, FileText, DollarSign } from 'lucide-react';
import { formatMoney } from '../lib/money';

export default function FichaClienteModal({ cliente, onClose }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [baixaData, setBaixaData] = useState(null);

  useEffect(() => {
    if (cliente) loadData();
  }, [cliente]);

  async function loadData() {
    setLoading(true);
    const [vendasRes, titulosRes, contasRes] = await Promise.all([
      supabase.from('vendas').select('*, vendas_itens(*)').eq('cliente_id', cliente.id).order('data', { ascending: false }),
      supabase.from('contas_receber').select('*').eq('cliente_id', cliente.id).order('data_vencimento', { ascending: true }),
      supabase.from('contas_bancarias').select('*').order('nome')
    ]);
    
    setVendas(vendasRes.data || []);
    setTitulos(titulosRes.data || []);
    setContasBancarias(contasRes.data || []);
    setLoading(false);
  }

  function openBaixa(titulo) {
    setBaixaData({
      id: titulo.id,
      valor: titulo.valor,
      conta_bancaria_id: contasBancarias.length > 0 ? contasBancarias[0].id : '',
      data_pagamento: new Date().toISOString().split('T')[0]
    });
    setShowBaixaModal(true);
  }

  async function handleBaixa(e) {
    e.preventDefault();
    if (!baixaData.conta_bancaria_id) return addToast('Selecione a conta bancária', 'error');

    const titulo = titulos.find(t => t.id === baixaData.id);
    if (!titulo) return;

    const { error } = await supabase.from('contas_receber').update({
      status: 'recebido',
      data_pagamento: baixaData.data_pagamento,
      conta_bancaria_id: baixaData.conta_bancaria_id,
      valor_pago: baixaData.valor
    }).eq('id', baixaData.id);

    if (error) {
      addToast('Erro ao baixar título: ' + error.message, 'error');
      return;
    }

    // Gerar movimentação financeira
    await supabase.from('movimentacoes_financeiras').insert({
      conta_bancaria_id: baixaData.conta_bancaria_id,
      tipo: 'receita',
      valor: baixaData.valor,
      data: baixaData.data_pagamento,
      descricao: `Recebimento: ${titulo.descricao || 'Título ' + titulo.id}`,
      categoria: 'Vendas',
      referencia_id: titulo.id,
      referencia_tipo: 'conta_receber'
    });

    addToast('Pagamento recebido com sucesso!');
    setShowBaixaModal(false);
    loadData();
  }

  const pendentes = titulos.filter(t => t.status === 'pendente');
  const totalPendente = pendentes.reduce((acc, t) => acc + (t.valor || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '90vh' }}>
        
        {/* Header */}
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '24px' }}>{cliente.nome}</h2>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', display: 'flex', gap: '16px', marginTop: '4px' }}>
              <span>{cliente.tipo === 'PF' ? 'CPF' : 'CNPJ'}: {cliente.documento || 'Não informado'}</span>
              <span>Tel: {cliente.telefone || 'Não informado'}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={24} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', background: 'var(--color-background)' }}>
          {loading ? (
            <div className="dashboard-loading"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 'var(--space-6)', alignItems: 'start' }}>
              
              {/* Left Column: Vendas History */}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
                  <FileText size={20} className="text-primary" /> Histórico de Vendas
                </h3>
                {vendas.length === 0 ? (
                  <p className="text-muted">Nenhuma venda registrada para este cliente.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {vendas.map(v => (
                      <div key={v.id} className="glass-card" style={{ padding: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                          <span style={{ fontWeight: 600 }}>Pedido #{v.numero_pedido || v.id.substring(0,8)}</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>{new Date(v.data).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                          {v.vendas_itens?.length || 0} itens • Pagamento: {v.forma_pagamento}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className={`badge ${v.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatMoney(v.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Financeiro / Títulos */}
              <div>
                <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)' }}>
                  <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Total Pendente</div>
                  <div style={{ fontSize: '32px', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-danger)' }}>
                    {formatMoney(totalPendente)}
                  </div>
                </div>

                <h3 style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
                  <DollarSign size={20} className="text-primary" /> Títulos a Receber
                </h3>
                
                {pendentes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--radius-lg)', color: 'var(--color-success)' }}>
                    <CheckCircle size={32} style={{ margin: '0 auto var(--space-2)' }} />
                    <p style={{ fontWeight: 500 }}>Cliente sem dívidas pendentes!</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {pendentes.map(t => {
                      const isAtrasado = new Date(t.data_vencimento) < new Date(new Date().toISOString().split('T')[0]);
                      return (
                        <div key={t.id} className="glass-card" style={{ padding: 'var(--space-3)', borderLeft: `3px solid ${isAtrasado ? 'var(--color-danger)' : 'var(--color-warning)'}` }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '2px' }}>{t.descricao || 'Título'}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isAtrasado ? 'var(--color-danger)' : 'inherit' }}>
                              <Clock size={12}/> Venc: {new Date(t.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            <span>{t.forma_pagamento}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{formatMoney(t.valor)}</span>
                            <button className="btn btn-primary btn-sm" onClick={() => openBaixa(t)}>Receber</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Historico de pagos */}
                {titulos.filter(t => t.status === 'recebido').length > 0 && (
                  <div style={{ marginTop: 'var(--space-6)' }}>
                    <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Títulos Pagos Recentemente</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {titulos.filter(t => t.status === 'recebido').slice(0, 5).map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{new Date(t.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>{formatMoney(t.valor_pago || t.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Baixa Rápida */}
      {showBaixaModal && (
        <div className="modal-backdrop" onClick={() => setShowBaixaModal(false)} style={{ zIndex: 1010 }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Receber Pagamento</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowBaixaModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleBaixa}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Data do Pagamento</label>
                  <input type="date" className="form-input" value={baixaData.data_pagamento} onChange={e => setBaixaData({ ...baixaData, data_pagamento: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Conta de Destino</label>
                  <select className="form-select" value={baixaData.conta_bancaria_id} onChange={e => setBaixaData({ ...baixaData, conta_bancaria_id: e.target.value })} required>
                    {contasBancarias.map(cb => <option key={cb.id} value={cb.id}>{cb.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBaixaModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Confirmar Recebimento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
