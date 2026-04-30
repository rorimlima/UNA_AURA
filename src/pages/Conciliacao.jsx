import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import { Upload, Search, Check, Link, X, FileDown, ShieldCheck, Download, FileText, ChevronRight, AlertCircle, Plus } from 'lucide-react';
import { formatMoney } from '../lib/money';

function parseOFX(ofxString) {
  const transactions = [];
  // Alguns arquivos OFX usam <STMTTRN> e fechamento </STMTTRN>, outros apenas abrem as tags em sequencia.
  // Vamos buscar por blocos que começam com <STMTTRN> até o próximo ou fim de arquivo/fechamento.
  const blocks = ofxString.split('<STMTTRN>').slice(1);

  for (const block of blocks) {
    const typeMatch = block.match(/<TRNTYPE>([^\r\n<]+)/i);
    const dateMatch = block.match(/<DTPOSTED>([^\r\n<]+)/i);
    const amtMatch = block.match(/<TRNAMT>([^\r\n<]+)/i);
    const idMatch = block.match(/<FITID>([^\r\n<]+)/i);
    const memoMatch = block.match(/<MEMO>([^\r\n<]+)/i);

    if (amtMatch && dateMatch) {
      const valorStr = amtMatch[1].trim();
      const rawDate = dateMatch[1].trim();
      const year = rawDate.substring(0, 4);
      const month = rawDate.substring(4, 6);
      const day = rawDate.substring(6, 8);

      transactions.push({
        id: idMatch ? idMatch[1].trim() : Math.random().toString(36).substring(7),
        tipo: typeMatch ? typeMatch[1].trim() : '',
        data: `${year}-${month}-${day}`,
        valor: Math.round(parseFloat(valorStr.replace(',', '.')) * 100),
        descricao: memoMatch ? memoMatch[1].trim() : 'Sem descrição',
        conciliado: false
      });
    }
  }
  return transactions;
}

export default function Conciliacao() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  
  const [contasFinanceiras, setContasFinanceiras] = useState([]);
  const [contaSelecionada, setContaSelecionada] = useState('');
  
  const [extrato, setExtrato] = useState([]); // Transacoes OFX
  const [sistema, setSistema] = useState({ receber: [], pagar: [] }); // Transacoes internas

  // Lembrete de qual item do banco e do sistema estão selecionados para vincular
  const [selecionadoBanco, setSelecionadoBanco] = useState(null);
  const [selecionadoSistema, setSelecionadoSistema] = useState(null);
  
  // Modal de Lançamento Avulso
  const [showAvulso, setShowAvulso] = useState(false);
  const [avulsoForm, setAvulsoForm] = useState({ descricao: '', tipo: 'saida', categoria: 'outros' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    // Buscar contas bancárias (financeiras)
    const { data: contasInfo } = await supabase.from('contas_financeiras').select('*').order('nome');
    if (contasInfo) {
      setContasFinanceiras(contasInfo);
      if (contasInfo.length > 0) setContaSelecionada(contasInfo[0].id);
    }

    // Buscar todos os títulos pendentes
    const [{ data: receber }, { data: pagar }] = await Promise.all([
      supabase.from('contas_receber').select('*, clientes(nome)').eq('status', 'pendente').order('data_vencimento'),
      supabase.from('contas_pagar').select('*, fornecedores(nome)').eq('status', 'pendente').order('data_vencimento')
    ]);

    setSistema({
      receber: receber || [],
      pagar: pagar || []
    });
    setLoading(false);
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const parsed = parseOFX(content);
      
      // Auto-sugestão simples de pares
      setExtrato(parsed.map(t => ({ ...t, sugestao: null })));
      addToast(`${parsed.length} transações importadas.`);
      
      // Limpa os selecionados
      setSelecionadoBanco(null);
      setSelecionadoSistema(null);
    };
    reader.readAsText(file);
  };

  // Conciliar um par
  const handleConciliar = async () => {
    if (!selecionadoBanco || !selecionadoSistema || !contaSelecionada) return;
    
    setLoading(true);
    const isRecebimento = selecionadoSistema.tipo === 'receber';
    const tableName = isRecebimento ? 'contas_receber' : 'contas_pagar';
    
    // 1. Atualizar status do título
    const { error: errUpdate } = await supabase.from(tableName).update({
      status: isRecebimento ? 'recebido' : 'pago',
      [isRecebimento ? 'data_recebimento' : 'data_pagamento']: selecionadoBanco.data,
      conta_financeira_id: contaSelecionada
    }).eq('id', selecionadoSistema.id);

    if (errUpdate) { addToast('Erro ao atualizar título', 'error'); setLoading(false); return; }

    // 2. Criar movimentação financeira
    const { error: errMov } = await supabase.from('movimentacoes_financeiras').insert({
      conta_financeira_id: contaSelecionada,
      tipo: isRecebimento ? 'entrada' : 'saida',
      valor: Math.abs(selecionadoBanco.valor), // valor absoluto
      descricao: selecionadoBanco.descricao,
      data: selecionadoBanco.data,
      [isRecebimento ? 'conta_receber_id' : 'conta_pagar_id']: selecionadoSistema.id
    });

    if (errMov) { addToast('Erro ao gravar movimentação', 'error'); setLoading(false); return; }

    // 3. Atualizar estado visual
    setExtrato(ext => ext.map(e => e.id === selecionadoBanco.id ? { ...e, conciliado: true } : e));
    setSistema(sys => ({
      receber: isRecebimento ? sys.receber.filter(r => r.id !== selecionadoSistema.id) : sys.receber,
      pagar: !isRecebimento ? sys.pagar.filter(p => p.id !== selecionadoSistema.id) : sys.pagar,
    }));

    setSelecionadoBanco(null);
    setSelecionadoSistema(null);
    addToast('Transação conciliada!');
    setLoading(false);
  };

  // Lançamento avulso (ex: taxa do banco)
  const handleLancamentoAvulso = async (e) => {
    e.preventDefault();
    if (!selecionadoBanco || !contaSelecionada) return;

    setLoading(true);
    const { error: errMov } = await supabase.from('movimentacoes_financeiras').insert({
      conta_financeira_id: contaSelecionada,
      tipo: avulsoForm.tipo,
      valor: Math.abs(selecionadoBanco.valor),
      descricao: `${selecionadoBanco.descricao} (${avulsoForm.descricao})`,
      data: selecionadoBanco.data
    });

    if (errMov) { addToast('Erro ao registrar lançamento avulso', 'error'); setLoading(false); return; }

    setExtrato(ext => ext.map(ex => ex.id === selecionadoBanco.id ? { ...ex, conciliado: true } : ex));
    setSelecionadoBanco(null);
    setShowAvulso(false);
    addToast('Lançamento avulso registrado!');
    setLoading(false);
  };

  const getFilteredSistema = () => {
    if (!selecionadoBanco) {
      // Retorna tudo mesclado se nada do banco está selecionado
      return [
        ...sistema.receber.map(r => ({ ...r, tipo: 'receber' })),
        ...sistema.pagar.map(p => ({ ...p, tipo: 'pagar' }))
      ].sort((a,b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    }
    
    // Se selecionou uma transacao do banco:
    const valorBusca = Math.abs(selecionadoBanco.valor);
    if (selecionadoBanco.valor > 0) {
      // Filtrar contas a receber, priorizar valores exatos
      return sistema.receber.map(r => ({ ...r, tipo: 'receber' })).sort((a,b) => {
        if (a.valor === valorBusca && b.valor !== valorBusca) return -1;
        if (b.valor === valorBusca && a.valor !== valorBusca) return 1;
        return 0;
      });
    } else {
      // Filtrar contas a pagar
      return sistema.pagar.map(p => ({ ...p, tipo: 'pagar' })).sort((a,b) => {
        if (a.valor === valorBusca && b.valor !== valorBusca) return -1;
        if (b.valor === valorBusca && a.valor !== valorBusca) return 1;
        return 0;
      });
    }
  };

  const listaSistema = getFilteredSistema();

  if (loading && extrato.length === 0) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ flexShrink: 0, marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link size={24} className="text-gold" /> Conciliação Bancária
          </h2>
          <p className="page-subtitle">Faça o cruzamento do extrato bancário com o financeiro</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <select className="form-select" value={contaSelecionada} onChange={e => setContaSelecionada(e.target.value)} style={{ width: 220 }}>
            {contasFinanceiras.length === 0 && <option value="">Sem contas bancárias</option>}
            {contasFinanceiras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Upload size={18} />
            Importar OFX
            <input type="file" accept=".ofx,.qfx" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {extrato.length === 0 ? (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
          <FileText size={48} style={{ opacity: 0.5 }} />
          <h3>Nenhum extrato importado</h3>
          <p style={{ maxWidth: 400, textAlign: 'center' }}>Faça o upload do arquivo OFX (padrão exportado pelo seu banco) para começar a conciliação automática.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 'var(--space-4)', flex: 1, minHeight: 0 }}>
          
          {/* Coluna 1: Banco */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--color-glass-border)', display: 'flex', justifyContent: 'space-between' }}>
              <strong>Extrato Bancário</strong>
              <span className="badge badge-info">{extrato.filter(e => !e.conciliado).length} pendentes</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
              {extrato.map(ext => {
                if (ext.conciliado) return null;
                const isSelected = selecionadoBanco?.id === ext.id;
                return (
                  <div key={ext.id} 
                    onClick={() => setSelecionadoBanco(ext)}
                    style={{ 
                      padding: 'var(--space-3)', 
                      margin: 'var(--space-2) 0', 
                      borderRadius: 'var(--radius-md)', 
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--color-gold)' : '1px solid var(--color-glass-border)',
                      background: isSelected ? 'rgba(201,169,110,0.05)' : 'var(--color-bg-primary)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.2s ease'
                    }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {new Date(ext.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                        {ext.descricao}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: ext.valor > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {formatMoney(ext.valor)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botões do Meio (Conciliar) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)' }}>
            <button 
              className="btn btn-icon" 
              disabled={!selecionadoBanco || !selecionadoSistema || loading}
              onClick={handleConciliar}
              title="Vincular registros"
              style={{ 
                width: 48, height: 48, borderRadius: '50%', 
                background: (selecionadoBanco && selecionadoSistema) ? 'var(--color-gold)' : 'var(--color-glass)',
                color: (selecionadoBanco && selecionadoSistema) ? '#fff' : 'var(--color-text-muted)',
                boxShadow: 'var(--shadow-md)',
                opacity: (selecionadoBanco && selecionadoSistema) ? 1 : 0.5,
                border: 'none', transition: 'all 0.3s'
              }}>
              <Check size={24} />
            </button>

            {/* Avulso */}
            {selecionadoBanco && (
              <button 
                className="btn btn-icon"
                title="Lançamento Avulso (Taxas, etc)"
                onClick={() => {
                  setAvulsoForm({ descricao: 'Taxa Bancária', tipo: selecionadoBanco.valor > 0 ? 'entrada' : 'saida', categoria: 'taxas' });
                  setShowAvulso(true);
                }}
                style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-glass)', color: 'var(--color-text-primary)', border: '1px solid var(--color-glass-border)' }}>
                <Plus size={18} />
              </button>
            )}
          </div>

          {/* Coluna 2: Sistema */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--color-glass-border)', display: 'flex', justifyContent: 'space-between' }}>
              <strong>Títulos Pendentes</strong>
              {selecionadoBanco && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>Filtrando por compatibilidade...</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
              {listaSistema.map(sys => {
                const isSelected = selecionadoSistema?.id === sys.id;
                const matchExato = selecionadoBanco && (Math.abs(selecionadoBanco.valor) === sys.valor);
                
                return (
                  <div key={sys.id} 
                    onClick={() => setSelecionadoSistema(sys)}
                    style={{ 
                      padding: 'var(--space-3)', 
                      margin: 'var(--space-2) 0', 
                      borderRadius: 'var(--radius-md)', 
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--color-gold)' : (matchExato ? '1px dashed var(--color-gold)' : '1px solid var(--color-glass-border)'),
                      background: isSelected ? 'rgba(201,169,110,0.05)' : (matchExato ? 'rgba(201,169,110,0.02)' : 'var(--color-bg-primary)'),
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.2s ease',
                      opacity: (selecionadoBanco && !matchExato) ? 0.6 : 1
                    }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge ${sys.tipo === 'receber' ? 'badge-success' : 'badge-danger'}`} style={{ padding: '0 4px', fontSize: 10 }}>
                          {sys.tipo === 'receber' ? 'REC' : 'PAG'}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                          Venc: {new Date(sys.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, marginTop: 2 }}>
                        {sys.clientes?.nome || sys.fornecedores?.nome || sys.descricao}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: sys.tipo === 'receber' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {formatMoney(sys.valor)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
        </div>
      )}

      {/* Modal Lançamento Avulso */}
      {showAvulso && (
        <div className="modal-backdrop" onClick={() => setShowAvulso(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Lançamento Avulso</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAvulso(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleLancamentoAvulso}>
              <div className="modal-body">
                <p className="text-muted" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  Use isso para taxas bancárias ou recebimentos não registrados previamente no sistema.
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--color-glass)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                  <span>Valor:</span>
                  <strong style={{ color: avulsoForm.tipo === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {formatMoney(Math.abs(selecionadoBanco.valor))}
                  </strong>
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={avulsoForm.descricao} onChange={e => setAvulsoForm({...avulsoForm, descricao: e.target.value})} required autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAvulso(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
