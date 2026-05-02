import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { X, CheckCircle, Clock, FileText, DollarSign, Download, Calendar, Activity } from 'lucide-react';
import { formatMoney, todayStr } from '../lib/money';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function FichaClienteModal({ cliente, onClose }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [titulos, setTitulos] = useState([]);
  const [contasFinanceiras, setContasFinanceiras] = useState([]);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [baixaData, setBaixaData] = useState(null);
  const [activeTab, setActiveTab] = useState('resumo'); // 'resumo', 'timeline', 'financeiro'
  const printRef = useRef(null);

  useEffect(() => {
    if (cliente) loadData();
  }, [cliente]);

  async function loadData() {
    setLoading(true);
    const [vendasRes, titulosRes, contasRes] = await Promise.all([
      supabase.from('vendas').select('*, vendas_itens(*)').eq('cliente_id', cliente.id).order('data', { ascending: false }),
      supabase.from('contas_receber').select('*').eq('cliente_id', cliente.id).order('data_vencimento', { ascending: true }),
      supabase.from('contas_financeiras').select('*').order('nome')
    ]);
    
    setVendas(vendasRes.data || []);
    setTitulos(titulosRes.data || []);
    setContasFinanceiras(contasRes.data || []);
    setLoading(false);
  }

  function openBaixa(titulo) {
    setBaixaData({
      id: titulo.id,
      valor: titulo.valor,
      conta_financeira_id: contasFinanceiras.length > 0 ? contasFinanceiras[0].id : '',
      data_pagamento: todayStr()
    });
    setShowBaixaModal(true);
  }

  async function handleBaixa(e) {
    e.preventDefault();
    if (!baixaData.conta_financeira_id) return addToast('Selecione a conta financeira', 'error');

    const titulo = titulos.find(t => t.id === baixaData.id);
    if (!titulo) return;

    const { error } = await supabase.from('contas_receber').update({
      status: 'recebido',
      data_recebimento: baixaData.data_pagamento,
      conta_financeira_id: baixaData.conta_financeira_id,
    }).eq('id', baixaData.id);

    if (error) {
      addToast('Erro ao baixar título: ' + error.message, 'error');
      return;
    }

    // Gerar movimentação financeira
    await supabase.from('movimentacoes_financeiras').insert({
      conta_financeira_id: baixaData.conta_financeira_id,
      tipo: 'entrada',
      valor: baixaData.valor,
      data: baixaData.data_pagamento,
      descricao: `Recebimento: ${titulo.descricao || 'Título ' + titulo.id.substring(0,8)}`,
      conta_receber_id: titulo.id,
    });

    addToast('Pagamento recebido com sucesso!');
    setShowBaixaModal(false);
    loadData();
  }

  async function exportToPDF() {
    if (!printRef.current) return;
    const originalTab = activeTab;
    setActiveTab('resumo'); // Força a aba de resumo para o print
    
    // Pequeno atraso para a tela renderizar a aba certa
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(printRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#131320'
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Dossie_${cliente.nome.replace(/\s+/g, '_')}.pdf`);
        addToast('PDF gerado com sucesso!');
      } catch (err) {
        addToast('Erro ao gerar PDF.', 'error');
        console.error(err);
      } finally {
        setActiveTab(originalTab);
      }
    }, 100);
  }

  const pendentes = titulos.filter(t => t.status === 'pendente');
  const totalPendente = pendentes.reduce((acc, t) => acc + (t.valor || 0), 0);
  const totalGasto = vendas.reduce((acc, v) => acc + (v.total || 0), 0);

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
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" onClick={exportToPDF} title="Exportar Dossiê PDF">
              <Download size={16} /> Exportar PDF
            </button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={24} /></button>
          </div>
        </div>

        {/* Tabs Menu */}
        <div style={{ display: 'flex', padding: '0 var(--space-6)', borderBottom: '1px solid var(--color-glass-border)', background: 'rgba(0,0,0,0.2)' }}>
          <button className={`tab-btn ${activeTab === 'resumo' ? 'active' : ''}`} onClick={() => setActiveTab('resumo')}>
            <Activity size={16} /> Resumo Geral
          </button>
          <button className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>
            <Clock size={16} /> Timeline de Vendas
          </button>
          <button className={`tab-btn ${activeTab === 'financeiro' ? 'active' : ''}`} onClick={() => setActiveTab('financeiro')}>
            <DollarSign size={16} /> Financeiro & Títulos
          </button>
        </div>

        {/* Body */}
        <div ref={printRef} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', background: 'var(--color-background)' }}>
          {loading ? (
            <div className="dashboard-loading"><div className="spinner" /></div>
          ) : (
            <>
              {activeTab === 'resumo' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  
                  {/* Cards de Resumo */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                    <div className="kpi-card" style={{ background: 'var(--color-surface)' }}>
                      <div className="kpi-icon" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--color-gold)' }}><FileText size={20} /></div>
                      <div className="kpi-label">Total Gasto</div>
                      <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-gold)' }}>{formatMoney(totalGasto)}</div>
                    </div>
                    <div className="kpi-card" style={{ background: 'var(--color-surface)' }}>
                      <div className="kpi-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)' }}><DollarSign size={20} /></div>
                      <div className="kpi-label">Dívida Pendente</div>
                      <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-danger)' }}>{formatMoney(totalPendente)}</div>
                    </div>
                    <div className="kpi-card" style={{ background: 'var(--color-surface)' }}>
                      <div className="kpi-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><Clock size={20} /></div>
                      <div className="kpi-label">Última Venda</div>
                      <div className="kpi-value" style={{ fontSize: 'var(--text-lg)' }}>
                        {vendas.length > 0 ? new Date(vendas[0].data).toLocaleDateString('pt-BR') : 'Nenhuma'}
                      </div>
                    </div>
                  </div>

                  {/* Informações Pessoais */}
                  <div className="glass-card" style={{ padding: 'var(--space-4)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-4)' }}>Informações Cadastrais</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Endereço:</span> {cliente.endereco || '—'}</div>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Cidade/UF:</span> {cliente.cidade ? `${cliente.cidade} - ${cliente.estado}` : '—'}</div>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Email:</span> {cliente.email || '—'}</div>
                      <div><span style={{ color: 'var(--color-text-muted)' }}>Data Nasc.:</span> {cliente.data_nascimento ? new Date(cliente.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                      <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--color-text-muted)' }}>Observações:</span> {cliente.observacoes || 'Nenhuma'}</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="animate-fade-in">
                  <h3 style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-6)' }}>
                    <FileText size={20} className="text-primary" /> Timeline de Vendas
                  </h3>
                  {vendas.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><FileText size={28}/></div>
                      <div className="empty-title">Nenhuma venda</div>
                      <div className="empty-text">Este cliente ainda não realizou compras.</div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                      {vendas.map(v => (
                        <div key={v.id} style={{ position: 'relative', marginBottom: 'var(--space-6)' }}>
                          {/* Timeline Dot */}
                          <div style={{ position: 'absolute', left: '-33px', top: '0', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--color-gold)', border: '4px solid var(--color-background)' }} />
                          
                          <div className="glass-card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                              <span style={{ fontWeight: 600 }}>Pedido #{v.numero_pedido || v.id.substring(0,8)}</span>
                              <span style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Calendar size={14} /> {new Date(v.data).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
                              Pagamento: {v.forma_pagamento}
                            </div>
                            
                            {/* Itens */}
                            {v.vendas_itens && v.vendas_itens.length > 0 && (
                              <div style={{ background: 'rgba(0,0,0,0.2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>Itens da Venda</div>
                                {v.vendas_itens.map(item => (
                                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
                                    <span>{item.quantidade}x</span>
                                    <span style={{ fontWeight: 600 }}>{formatMoney(item.quantidade * item.valor_unitario)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className={`badge ${v.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span>
                              <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '18px' }}>{formatMoney(v.total)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'financeiro' && (
                <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)' }}>
                  
                  <div className="glass-card" style={{ padding: 'var(--space-4)', border: '1px solid var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)' }}>
                    <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Dívida Atual (A Receber)</div>
                    <div style={{ fontSize: '32px', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-danger)' }}>
                      {formatMoney(totalPendente)}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
                      <DollarSign size={20} className="text-primary" /> Títulos a Receber (Abertos)
                    </h3>
                    {pendentes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 'var(--space-6)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--radius-lg)', color: 'var(--color-success)' }}>
                        <CheckCircle size={32} style={{ margin: '0 auto var(--space-2)' }} />
                        <p style={{ fontWeight: 500 }}>Cliente sem dívidas pendentes!</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {pendentes.map(t => {
                          const isAtrasado = new Date(t.data_vencimento) < new Date(todayStr());
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
                  </div>

                  {/* Historico de pagos */}
                  {titulos.filter(t => t.status === 'recebido').length > 0 && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Títulos Pagos Recentemente</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {titulos.filter(t => t.status === 'recebido').slice(0, 10).map(t => (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                            <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} color="var(--color-success)"/> Pago em: {new Date((t.data_recebimento || t.data_vencimento) + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>{formatMoney(t.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
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
                  <label className="form-label">Conta Financeira de Destino</label>
                  <select className="form-select" value={baixaData.conta_financeira_id} onChange={e => setBaixaData({ ...baixaData, conta_financeira_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {contasFinanceiras.map(cf => <option key={cf.id} value={cf.id}>{cf.nome}</option>)}
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
