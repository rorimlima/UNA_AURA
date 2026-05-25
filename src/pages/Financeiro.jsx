import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import { DollarSign, ArrowDownCircle, ArrowUpCircle, Check, X, Plus, Search, Building2, CreditCard, Settings, Wallet, TrendingUp, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { toReal } from '../lib/money';

const fmtPagLabel = { pix:'PIX', credito:'Crédito', debito:'Débito', dinheiro:'Dinheiro', boleto:'Boleto', transferencia:'Transf.', cheque:'Cheque', crediario:'Crediário', deposito:'Depósito' };
import { formatMoney, toCents, todayStr } from '../lib/money';
import { logActivity } from '../lib/activityLogger';

export default function Financeiro() {
  const { addToast } = useToast();
  const [tab, setTab] = useState('contas');
  const [contasPagar, setContasPagar] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [contasFin, setContasFin] = useState([]);
  const [configTaxas, setConfigTaxas] = useState([]);
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  const [search, setSearch] = useState('');
  const [showContaModal, setShowContaModal] = useState(false);
  const [contaForm, setContaForm] = useState({ nome:'', tipo:'banco', banco:'', agencia:'', numero_conta:'', saldo_inicial:'' });
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [pagarForm, setPagarForm] = useState({ descricao:'', categoria:'outros', fornecedor_id:'', valor:'', data_vencimento:'', forma_pagamento:'pix', observacoes:'', conta_origem_id:'' });
  const [showTaxaModal, setShowTaxaModal] = useState(false);
  const [taxaForm, setTaxaForm] = useState({ forma_pagamento:'', percentual_taxa:'', prazo_recebimento_dias:'' });
  const [editTaxaId, setEditTaxaId] = useState(null);
  const [fornecedores, setFornecedores] = useState([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: cp }, { data: cr }, { data: cf }, { data: forn }, { data: taxas }] = await Promise.all([
      supabase.from('contas_pagar').select('id, descricao, categoria, valor, valor_taxa, data_vencimento, data_pagamento, forma_pagamento, status, status_lancamento, conta_origem_id, fornecedor_id, fornecedores(nome), conta_origem:contas_financeiras!conta_origem_id(nome)').or('is_deleted.is.null,is_deleted.eq.false').order('data_vencimento'),
      supabase.from('contas_receber').select('id, descricao, valor, valor_taxa, parcela, total_parcelas, data_vencimento, data_recebimento, forma_pagamento, status, status_lancamento, conta_destino_id, cliente_id, venda_id, clientes(nome), conta_destino:contas_financeiras!conta_destino_id(nome)').or('is_deleted.is.null,is_deleted.eq.false').order('data_vencimento'),
      supabase.from('contas_financeiras').select('id, nome, tipo, banco, saldo_atual, saldo_inicial').eq('ativa', true).order('nome'),
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('configuracao_taxas').select('*').or('is_deleted.is.null,is_deleted.eq.false').order('forma_pagamento'),
    ]);
    setContasPagar(cp || []); setContasReceber(cr || []); setContasFin(cf || []);
    setFornecedores(forn || []); setConfigTaxas(taxas || []);
    setLoading(false);
  }

  async function markPaid(id) {
    const conta = contasPagar.find(c => c.id === id);
    if (!conta) return;
    const taxa = conta.valor_taxa || 0;
    const valorLiquido = conta.valor + taxa; // A Pagar: valor + taxa = total debitado
    // Atualizar o status
    await supabase.from('contas_pagar').update({ status: 'pago', status_lancamento: 'confirmado', data_pagamento: todayStr() }).eq('id', id);
    // Debitar da conta financeira de origem (valor total = valor + taxa)
    if (conta.conta_origem_id) {
      const cfin = contasFin.find(cf => cf.id === conta.conta_origem_id);
      if (cfin) {
        const novoSaldo = (cfin.saldo_atual || 0) - valorLiquido;
        await supabase.from('contas_financeiras').update({ saldo_atual: novoSaldo }).eq('id', conta.conta_origem_id);
      }
    }
    logActivity('UPDATE', 'contas_pagar', id, `Confirmou pagamento — Valor: ${fmt(conta.valor)}, Taxa: ${fmt(taxa)}, Debitado: ${fmt(valorLiquido)}`);
    addToast('Conta paga e lançamento confirmado!'); load();
  }

  async function markReceived(id) {
    const conta = contasReceber.find(c => c.id === id);
    if (!conta) return;
    const taxa = conta.valor_taxa || 0;
    const valorLiquido = conta.valor - taxa; // A Receber: valor - taxa = valor líquido creditado
    // Atualizar o status
    await supabase.from('contas_receber').update({ status: 'recebido', status_lancamento: 'confirmado', data_recebimento: todayStr() }).eq('id', id);
    // Creditar na conta financeira de destino (valor líquido)
    if (conta.conta_destino_id) {
      const cfin = contasFin.find(cf => cf.id === conta.conta_destino_id);
      if (cfin) {
        const novoSaldo = (cfin.saldo_atual || 0) + valorLiquido;
        await supabase.from('contas_financeiras').update({ saldo_atual: novoSaldo }).eq('id', conta.conta_destino_id);
      }
    }
    logActivity('UPDATE', 'contas_receber', id, `Confirmou recebimento — Valor: ${fmt(conta.valor)}, Taxa: ${fmt(taxa)}, Creditado: ${fmt(valorLiquido)}`);
    addToast('Recebimento confirmado!'); load();
  }

  async function setContaDestino(receberId, contaId) {
    await supabase.from('contas_receber').update({ conta_destino_id: contaId || null }).eq('id', receberId);
    addToast('Conta destino atualizada!'); load();
  }

  async function setContaOrigem(pagarId, contaId) {
    await supabase.from('contas_pagar').update({ conta_origem_id: contaId || null }).eq('id', pagarId);
    addToast('Conta origem atualizada!'); load();
  }

  // Handler: Atualizar valor_taxa inline com feedback instantâneo
  async function updateTaxaReceber(id, valorTaxaReais) {
    const taxa = toCents(valorTaxaReais);
    // Optimistic update — atualiza o state local imediatamente
    setContasReceber(prev => prev.map(c => c.id === id ? { ...c, valor_taxa: taxa } : c));
    const { error } = await supabase.from('contas_receber').update({ valor_taxa: taxa }).eq('id', id);
    if (error) { addToast('Erro ao salvar taxa: ' + error.message, 'error'); load(); return; }
    addToast('Taxa atualizada!');
  }
  async function updateTaxaPagar(id, valorTaxaReais) {
    const taxa = toCents(valorTaxaReais);
    // Optimistic update — atualiza o state local imediatamente
    setContasPagar(prev => prev.map(c => c.id === id ? { ...c, valor_taxa: taxa } : c));
    const { error } = await supabase.from('contas_pagar').update({ valor_taxa: taxa }).eq('id', id);
    if (error) { addToast('Erro ao salvar taxa: ' + error.message, 'error'); load(); return; }
    addToast('Taxa atualizada!');
  }

  async function saveConta(e) {
    e.preventDefault();
    const { error } = await supabase.from('contas_financeiras').insert({
      ...contaForm, saldo_inicial: toCents(contaForm.saldo_inicial), saldo_atual: toCents(contaForm.saldo_inicial)
    });
    if (error) return addToast('Erro: ' + error.message, 'error');
    logActivity('CREATE', 'contas_financeiras', null, `Cadastrou conta: ${contaForm.nome}`);
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
      conta_origem_id: pagarForm.conta_origem_id || null,
      valor: toCents(pagarForm.valor),
      data_vencimento: pagarForm.data_vencimento,
      forma_pagamento: pagarForm.forma_pagamento,
      observacoes: pagarForm.observacoes,
      status: 'pendente',
      status_lancamento: 'pendente',
    });
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast('Conta a pagar cadastrada!');
    setShowPagarModal(false);
    setPagarForm({ descricao:'', categoria:'outros', fornecedor_id:'', valor:'', data_vencimento:'', forma_pagamento:'pix', observacoes:'', conta_origem_id:'' });
    load();
  }

  async function saveTaxa(e) {
    e.preventDefault();
    const payload = { forma_pagamento: taxaForm.forma_pagamento, percentual_taxa: parseFloat(taxaForm.percentual_taxa) || 0, prazo_recebimento_dias: parseInt(taxaForm.prazo_recebimento_dias) || 0 };
    if (editTaxaId) {
      const { error } = await supabase.from('configuracao_taxas').update(payload).eq('id', editTaxaId);
      if (error) return addToast('Erro: ' + error.message, 'error');
    } else {
      const { error } = await supabase.from('configuracao_taxas').insert(payload);
      if (error) return addToast('Erro: ' + error.message, 'error');
    }
    addToast(editTaxaId ? 'Taxa atualizada!' : 'Taxa cadastrada!');
    setShowTaxaModal(false); setEditTaxaId(null); load();
  }

  const fmt = formatMoney;

  const totalPagar = contasPagar.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);
  const totalReceber = contasReceber.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);

  const filteredPagar = contasPagar.filter(c => (c.descricao || '').toLowerCase().includes(search.toLowerCase()) || (c.fornecedores?.nome || '').toLowerCase().includes(search.toLowerCase()));
  const filteredReceber = contasReceber.filter(c => (c.descricao || '').toLowerCase().includes(search.toLowerCase()) || (c.clientes?.nome || '').toLowerCase().includes(search.toLowerCase()));

  const exportarRelatorioPDF = () => {
    const doc = new jsPDF('landscape');
    
    // Configurações do layout do PDF - Estilo Corporativo Elegante
    doc.setFillColor(13, 13, 18); // Fundo escuro (cor da marca) para o cabeçalho
    doc.rect(0, 0, doc.internal.pageSize.width, 35, 'F');
    
    doc.setTextColor(201, 169, 110); // Dourado
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text('UNA AURA', 14, 22);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text('Relatório Financeiro', 65, 22);
    
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, doc.internal.pageSize.width - 60, 22);

    // Resumo KPI
    let y = 50;
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text('Resumo Consolidado', 14, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    // KPI boxes text
    doc.setTextColor(248, 113, 113); // Vermelho
    doc.text(`A Pagar (Pendente): ${fmt(totalPagar)}`, 14, y);
    
    doc.setTextColor(74, 222, 128); // Verde
    doc.text(`A Receber (Pendente): ${fmt(totalReceber)}`, 90, y);
    
    doc.setTextColor(totalReceber - totalPagar >= 0 ? 74 : 248, totalReceber - totalPagar >= 0 ? 222 : 113, totalReceber - totalPagar >= 0 ? 128 : 113);
    doc.setFont("helvetica", "bold");
    doc.text(`Saldo Projetado: ${fmt(totalReceber - totalPagar)}`, 170, y);
    
    y += 20;

    let head = [];
    let body = [];
    let tituloTabela = '';

    if (tab === 'pagar') {
      tituloTabela = 'Contas a Pagar';
      head = [['Descrição', 'Fornecedor', 'Forma Pag.', 'Categoria', 'Vencimento', 'Valor', 'Taxa', 'Valor Pago', 'Status']];
      body = filteredPagar.map(c => [
        c.descricao || '—', 
        c.fornecedores?.nome || '—',
        fmtPagLabel[c.forma_pagamento] || c.forma_pagamento || '—',
        c.categoria || '—',
        c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—',
        fmt(c.valor),
        fmt(c.valor_taxa || 0),
        fmt(c.valor - (c.valor_taxa || 0)),
        c.status
      ]);
    } else if (tab === 'receber') {
      tituloTabela = 'Contas a Receber';
      head = [['Descrição', 'Cliente', 'Forma Pag.', 'Parcela', 'Vencimento', 'Valor', 'Taxa', 'Valor Recebido', 'Status']];
      body = filteredReceber.map(c => [
        c.descricao || '—', 
        c.clientes?.nome || '—',
        fmtPagLabel[c.forma_pagamento] || c.forma_pagamento || '—',
        `${c.parcela}/${c.total_parcelas}`,
        c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—',
        fmt(c.valor),
        fmt(c.valor_taxa || 0),
        fmt(c.valor - (c.valor_taxa || 0)),
        c.status
      ]);
    } else {
      tituloTabela = 'Contas Financeiras';
      head = [['Nome', 'Tipo', 'Banco', 'Saldo Inicial', 'Saldo Atual']];
      body = contasFin.map(c => [
        c.nome || '—',
        c.tipo || '—',
        c.banco || '—',
        fmt(c.saldo_inicial || 0),
        fmt(c.saldo_atual || 0)
      ]);
    }

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(tituloTabela, 14, y);
    y += 5;

    doc.autoTable({
      startY: y,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [201, 169, 110], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, font: 'helvetica', cellPadding: 4 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      bodyStyles: { textColor: [60, 60, 60] }
    });

    const finalY = doc.lastAutoTable.finalY || y;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento gerado pelo sistema UNA AURA.', 14, finalY + 10);

    doc.save(`UNA_AURA_Financeiro_${new Date().toISOString().split('T')[0]}.pdf`);
    addToast('Relatório PDF exportado com sucesso!');
  };

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Financeiro</h2><p className="page-subtitle">Gestão financeira inteligente</p></div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportarRelatorioPDF} style={{ borderColor: 'var(--color-gold)', color: 'var(--color-gold)' }}>
            <FileText size={18} /> Exportar PDF
          </button>
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

      {/* ══════ DASHBOARD CARDS: Contas Financeiras ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {contasFin.map(c => {
          const saldo = c.saldo_atual || 0;
          const isNeg = saldo < 0;
          return (
            <div key={c.id} className="glass-card" style={{ padding: 'var(--space-5)', position: 'relative', overflow: 'hidden', transition: 'all 0.3s ease', cursor: 'default' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: isNeg ? 'rgba(248,113,113,0.06)' : 'rgba(74,222,128,0.06)', borderRadius: '0 0 0 100%' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: isNeg ? 'var(--color-danger-bg)' : 'rgba(201,169,110,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={20} style={{ color: isNeg ? 'var(--color-danger)' : 'var(--color-gold)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{c.nome}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{c.tipo}{c.banco ? ` • ${c.banco}` : ''}</div>
                </div>
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'monospace', color: isNeg ? 'var(--color-danger)' : 'var(--color-success)', letterSpacing: '-0.02em' }}>
                {fmt(saldo)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>Saldo Inicial: {fmt(c.saldo_inicial || 0)}</div>
            </div>
          );
        })}
        {contasFin.length === 0 && (
          <div className="glass-card" style={{ padding: 'var(--space-8)', textAlign: 'center', gridColumn: '1/-1' }}>
            <Wallet size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 8 }} />
            <div style={{ color: 'var(--color-text-muted)' }}>Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.</div>
          </div>
        )}
      </div>

      {/* Controls: Tabs & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div className="tabs-wrapper">
            <button className={`tab-btn ${tab === 'contas' ? 'active' : ''}`} onClick={() => setTab('contas')}><Wallet size={16} /> Contas</button>
            <button className={`tab-btn ${tab === 'pagar' ? 'active' : ''}`} onClick={() => setTab('pagar')}><ArrowUpCircle size={16} /> A Pagar</button>
            <button className={`tab-btn ${tab === 'receber' ? 'active' : ''}`} onClick={() => setTab('receber')}><ArrowDownCircle size={16} /> A Receber</button>
            <button className={`tab-btn ${tab === 'taxas' ? 'active' : ''}`} onClick={() => setTab('taxas')}><Settings size={16} /> Taxas</button>
          </div>
          
          <div style={{ position: 'relative', flexGrow: 1, maxWidth: 320 }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" className="form-input" placeholder="Buscar lançamentos..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '44px', background: 'var(--color-glass)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
      </div>

      {/* ── TAB: Contas Financeiras ── */}
      {tab === 'contas' && (
        <div className="glass-card table-responsive">
          <table className="data-table">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Banco</th><th style={{ textAlign: 'right' }}>Saldo Inicial</th><th style={{ textAlign: 'right' }}>Saldo Atual</th></tr></thead>
            <tbody>
              {contasFin.filter(c => (c.nome||'').toLowerCase().includes(search.toLowerCase())).map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nome}</td>
                  <td><span className="badge badge-gold">{c.tipo}</span></td>
                  <td>{c.banco || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.saldo_inicial || 0)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: (c.saldo_atual||0) < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{fmt(c.saldo_atual || 0)}</td>
                </tr>
              ))}
              {contasFin.length === 0 && <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Nenhuma conta.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Contas a Pagar ── */}
      {tab === 'pagar' && (
        <div className="glass-card table-responsive">
          <table className="data-table">
            <thead><tr><th style={{ width: 40 }}></th><th>Descrição</th><th>Fornecedor</th><th>Forma</th><th>Categoria</th><th style={{textAlign:'right'}}>Valor</th><th style={{textAlign:'right'}}>Taxa</th><th style={{textAlign:'right'}}>Valor Pago</th><th>Venc.</th><th>Conta Origem</th><th>Lanç.</th><th>Status</th></tr></thead>
            <tbody>
              {filteredPagar.map(c => {
                const taxa = c.valor_taxa || 0;
                const valorPago = c.valor - taxa;
                return (
                <tr key={c.id}>
                  <td style={{ paddingRight: 0 }}>{c.status === 'pendente' && <button className="btn btn-ghost btn-sm" onClick={() => markPaid(c.id)} style={{ color: 'var(--color-success)', padding: 'var(--space-1)', minHeight: 0, height: 'auto' }} title="Confirmar Pagamento"><Check size={18} /></button>}</td>
                  <td style={{ color: 'var(--color-text-primary)' }}>{c.descricao || '—'}</td>
                  <td>{c.fornecedores?.nome || '—'}</td>
                  <td><span className="badge badge-gold" style={{fontSize:'var(--text-xs)'}}>{fmtPagLabel[c.forma_pagamento] || c.forma_pagamento || '—'}</span></td>
                  <td><span className="badge badge-gold">{c.categoria}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--color-danger)', fontFamily: 'monospace', textAlign:'right' }}>{fmt(c.valor)}</td>
                  <td style={{textAlign:'right'}}>
                    <input key={`pagar-taxa-${c.id}-${taxa}`} type="number" step="0.01" min="0" style={{ width: 80, padding: '3px 6px', fontSize: 'var(--text-xs)', fontFamily: 'monospace', background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-sm)', color: taxa > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)', textAlign: 'right' }} defaultValue={toReal(taxa)} onBlur={e => { const v = parseFloat(e.target.value) || 0; if (toCents(v) !== taxa) updateTaxaPagar(c.id, v); }} />
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--color-success)', fontFamily: 'monospace', textAlign:'right' }}>{fmt(valorPago)}</td>
                  <td style={{fontSize:'var(--text-xs)'}}>{c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    <select className="form-select" value={c.conta_origem_id || ''} onChange={e => setContaOrigem(c.id, e.target.value)} style={{ minWidth: 100, fontSize: 'var(--text-xs)', padding: '3px 6px' }}>
                      <option value="">—</option>
                      {contasFin.map(cf => <option key={cf.id} value={cf.id}>{cf.nome}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${c.status_lancamento === 'confirmado' ? 'badge-success' : 'badge-warning'}`}>{c.status_lancamento || 'pendente'}</span></td>
                  <td><span className={`badge ${c.status === 'pago' ? 'badge-success' : c.status === 'vencido' ? 'badge-danger' : 'badge-warning'}`}>{c.status}</span></td>
                </tr>
                );
              })}
              {filteredPagar.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', padding: 'var(--space-8)' }} className="text-muted">Nenhuma conta a pagar.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Contas a Receber ── */}
      {tab === 'receber' && (
        <div className="glass-card table-responsive">
          <table className="data-table">
            <thead><tr><th style={{ width: 40 }}></th><th>Descrição</th><th>Cliente</th><th>Forma</th><th>Parcela</th><th style={{textAlign:'right'}}>Valor</th><th style={{textAlign:'right'}}>Taxa</th><th style={{textAlign:'right'}}>Valor Recebido</th><th>Venc.</th><th>Conta Destino</th><th>Lanç.</th><th>Status</th></tr></thead>
            <tbody>
              {filteredReceber.map(c => {
                const taxa = c.valor_taxa || 0;
                const valorRecebido = c.valor - taxa;
                return (
                <tr key={c.id}>
                  <td style={{ paddingRight: 0 }}>{c.status === 'pendente' && <button className="btn btn-ghost btn-sm" onClick={() => markReceived(c.id)} style={{ color: 'var(--color-success)', padding: 'var(--space-1)', minHeight: 0, height: 'auto' }} title="Confirmar Recebimento"><Check size={18} /></button>}</td>
                  <td style={{ color: 'var(--color-text-primary)' }}>{c.descricao || '—'}</td>
                  <td>{c.clientes?.nome || '—'}</td>
                  <td><span className="badge badge-gold" style={{fontSize:'var(--text-xs)'}}>{fmtPagLabel[c.forma_pagamento] || c.forma_pagamento || '—'}</span></td>
                  <td>{c.parcela}/{c.total_parcelas}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)', fontFamily: 'monospace', textAlign:'right' }}>{fmt(c.valor)}</td>
                  <td style={{textAlign:'right'}}>
                    <input key={`receber-taxa-${c.id}-${taxa}`} type="number" step="0.01" min="0" style={{ width: 80, padding: '3px 6px', fontSize: 'var(--text-xs)', fontFamily: 'monospace', background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)', borderRadius: 'var(--radius-sm)', color: taxa > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)', textAlign: 'right' }} defaultValue={toReal(taxa)} onBlur={e => { const v = parseFloat(e.target.value) || 0; if (toCents(v) !== taxa) updateTaxaReceber(c.id, v); }} />
                  </td>
                  <td style={{ fontWeight: 700, color: valorRecebido >= 0 ? 'var(--color-gold)' : 'var(--color-danger)', fontFamily: 'monospace', textAlign:'right', background: 'rgba(201,169,110,0.06)', borderRadius: 'var(--radius-sm)' }}>{fmt(valorRecebido)}</td>
                  <td style={{fontSize:'var(--text-xs)'}}>{c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    <select className="form-select" value={c.conta_destino_id || ''} onChange={e => setContaDestino(c.id, e.target.value)} style={{ minWidth: 100, fontSize: 'var(--text-xs)', padding: '3px 6px' }}>
                      <option value="">—</option>
                      {contasFin.map(cf => <option key={cf.id} value={cf.id}>{cf.nome}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${c.status_lancamento === 'confirmado' ? 'badge-success' : 'badge-warning'}`}>{c.status_lancamento || 'pendente'}</span></td>
                  <td><span className={`badge ${c.status === 'recebido' ? 'badge-success' : c.status === 'vencido' ? 'badge-danger' : 'badge-warning'}`}>{c.status}</span></td>
                </tr>
                );
              })}
              {filteredReceber.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', padding: 'var(--space-8)' }} className="text-muted">Nenhuma conta a receber.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Configuração de Taxas ── */}
      {tab === 'taxas' && (
        <div className="glass-card table-responsive">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)' }}>
            <h4 style={{ fontFamily: 'var(--font-display)' }}>Configuração de Taxas por Forma de Pagamento</h4>
            <button className="btn btn-secondary btn-sm" onClick={() => { setTaxaForm({ forma_pagamento:'', percentual_taxa:'', prazo_recebimento_dias:'' }); setEditTaxaId(null); setShowTaxaModal(true); }}><Plus size={14} /> Nova Taxa</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Forma de Pagamento</th><th style={{ textAlign: 'right' }}>Taxa (%)</th><th style={{ textAlign: 'right' }}>Prazo (dias)</th><th></th></tr></thead>
            <tbody>
              {configTaxas.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.forma_pagamento}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: t.percentual_taxa > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>{parseFloat(t.percentual_taxa).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{t.prazo_recebimento_dias}d</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => { setTaxaForm({ forma_pagamento: t.forma_pagamento, percentual_taxa: t.percentual_taxa, prazo_recebimento_dias: t.prazo_recebimento_dias }); setEditTaxaId(t.id); setShowTaxaModal(true); }} style={{ color: 'var(--color-gold)' }}><Settings size={13} /> Editar</button></td>
                </tr>
              ))}
              {configTaxas.length === 0 && <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Nenhuma taxa configurada.</td></tr>}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
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
                  <div className="form-group">
                    <label className="form-label">Conta Origem</label>
                    <select className="form-select" value={pagarForm.conta_origem_id} onChange={e => setPagarForm({ ...pagarForm, conta_origem_id: e.target.value })}>
                      <option value="">Nenhuma</option>
                      {contasFin.map(cf => <option key={cf.id} value={cf.id}>{cf.nome}</option>)}
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

      {/* ══════ MODAL: Configuração de Taxas ══════ */}
      {showTaxaModal && (
        <div className="modal-backdrop" onClick={() => setShowTaxaModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} style={{ color: 'var(--color-gold)' }} /> {editTaxaId ? 'Editar' : 'Nova'} Taxa</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowTaxaModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveTaxa}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Forma de Pagamento *</label>
                  <input className="form-input" value={taxaForm.forma_pagamento} onChange={e => setTaxaForm({ ...taxaForm, forma_pagamento: e.target.value })} placeholder="Ex: credito, debito, pix..." required disabled={!!editTaxaId} />
                </div>
                <div className="form-group">
                  <label className="form-label">Percentual da Taxa (%)</label>
                  <input type="number" step="0.01" min="0" max="100" className="form-input" value={taxaForm.percentual_taxa} onChange={e => setTaxaForm({ ...taxaForm, percentual_taxa: e.target.value })} placeholder="Ex: 3.49" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Prazo de Recebimento (dias)</label>
                  <input type="number" min="0" className="form-input" value={taxaForm.prazo_recebimento_dias} onChange={e => setTaxaForm({ ...taxaForm, prazo_recebimento_dias: e.target.value })} placeholder="Ex: 30" required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaxaModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editTaxaId ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
