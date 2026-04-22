import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Receipt, X, Trash2, Printer, CheckCircle } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';

const fmt = formatMoney;
const fmtPag = { pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão Crédito', debito: 'Cartão Débito', boleto: 'Boleto', transferencia: 'Transferência', cheque: 'Cheque', crediario: 'Crediário' };

// ─── Recibo PDF (print) ─────────────────────────────────────────────────────
function imprimirRecibo(venda, empresa) {
  const logoHtml = empresa?.logo_url
    ? `<img src="${empresa.logo_url}" alt="logo" style="height:64px;object-fit:contain;margin-bottom:8px"/>`
    : '';

  const itensHtml = (venda.vendas_itens || []).map(i =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #eee">${i.produtos?.nome || '—'}</td>
      <td style="text-align:center;border-bottom:1px solid #eee">${i.quantidade}</td>
      <td style="text-align:right;border-bottom:1px solid #eee">${fmt(i.valor_unitario)}</td>
      <td style="text-align:right;border-bottom:1px solid #eee;font-weight:600">${fmt(i.quantidade * i.valor_unitario)}</td>
    </tr>`
  ).join('');

  // Agrupar parcelas e exibir os métodos de pagamento
  const parcelasHtml = venda._parcelas?.length > 0
    ? `<div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:8px">
        <div style="font-weight:600;margin-bottom:8px">Condições de Pagamento</div>
        ${venda._parcelas.map((p, i) =>
          `<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">
            <span>${fmtPag[p.forma_pagamento] || p.forma_pagamento} - Venc: ${new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
            <span style="font-weight:600">${fmt(p.valor)}</span>
          </div>`
        ).join('')}
      </div>`
    : '';

  const enderecoEmpresa = empresa
    ? [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(', ')
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Recibo de Venda #${venda.numero_pedido || venda.id?.substring(0,8)}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#111}
    h1{font-size:20px;margin:0}
    .header{text-align:center;border-bottom:2px solid #c9a96e;padding-bottom:16px;margin-bottom:16px}
    .empresa-nome{font-size:18px;font-weight:700;color:#8b6914}
    .empresa-info{font-size:12px;color:#666;margin-top:2px}
    .secao{margin:16px 0}
    .label{font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.5px}
    .valor{font-size:14px;font-weight:600}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th{text-align:left;font-size:11px;color:#999;text-transform:uppercase;border-bottom:2px solid #c9a96e;padding-bottom:6px}
    .total-row{font-size:18px;font-weight:700;color:#c9a96e;text-align:right;padding-top:12px;border-top:2px solid #c9a96e}
    .footer{text-align:center;margin-top:24px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:16px}
  </style></head><body>
  <div class="header">
    ${logoHtml}
    <div class="empresa-nome">${empresa?.nome || 'UNA AURA'}</div>
    ${empresa?.cnpj ? `<div class="empresa-info">CNPJ: ${empresa.cnpj}</div>` : ''}
    ${enderecoEmpresa ? `<div class="empresa-info">${enderecoEmpresa}</div>` : ''}
    ${empresa?.telefone ? `<div class="empresa-info">Tel: ${empresa.telefone}</div>` : ''}
  </div>

  <h1 style="margin-bottom:4px">Recibo de Venda</h1>
  <div style="font-size:13px;color:#666">Nº ${venda.numero_pedido || venda.id?.substring(0,8)} · ${new Date(venda.data).toLocaleDateString('pt-BR')}</div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">
    <div><div class="label">Cliente</div><div class="valor">${venda.clientes?.nome || 'Consumidor'}</div></div>
    <div><div class="label">Vendedor</div><div class="valor">${venda.vendedores?.nome || '—'}</div></div>
    <div><div class="label">Múltiplos Pagtos</div><div class="valor">${venda._parcelas?.length || 0} parcelas/lançamentos</div></div>
    <div><div class="label">Status</div><div class="valor">${venda.status || 'finalizada'}</div></div>
  </div>

  <table><thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${itensHtml}</tbody></table>

  <div class="total-row">Total: ${fmt(venda.total)}</div>

  ${parcelasHtml}

  ${venda.observacoes ? `<div style="margin-top:16px;padding:12px;background:#fffbe6;border-radius:8px;font-size:13px"><strong>Obs:</strong> ${venda.observacoes}</div>` : ''}

  <div class="footer">
    ${empresa?.nome || 'UNA AURA'} · ${empresa?.email || ''}<br/>
    Obrigada pela preferência! ✨
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); };
}

export default function Vendas() {
  const { addToast } = useToast();
  const [vendas, setVendas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ cliente_id: '', vendedor_id: '', data: new Date().toISOString().split('T')[0], numero_pedido: '', observacoes: '' });
  const [cart, setCart] = useState([]);
  const [pagamentos, setPagamentos] = useState([]); // Multiple payments
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: v }, { data: c }, { data: p }, { data: vend }, { data: emp }] = await Promise.all([
      supabase.from('vendas').select('*, clientes(nome), vendedores(nome), vendas_itens(*, produtos(nome))').order('data', { ascending: false }),
      supabase.from('clientes').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque').eq('ativo', true).order('nome'),
      supabase.from('vendedores').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('empresa').select('*').limit(1).maybeSingle(),
    ]);
    setVendas(v || []); setClientes(c || []); setProdutos(p || []);
    setVendedores(vend || []); setEmpresa(emp);
    setLoading(false);
  }

  function addToCart() { setCart([...cart, { produto_id: '', quantidade: 1, valor_unitario: 0 }]); }
  function updateCartItem(idx, field, value) {
    const items = [...cart]; items[idx][field] = value;
    if (field === 'produto_id') { const prod = produtos.find(p => p.id === value); if (prod) items[idx].valor_unitario = prod.preco_venda || 0; }
    setCart(items);
  }
  function removeCartItem(idx) { setCart(cart.filter((_, i) => i !== idx)); }
  const cartTotal = cart.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);

  function addPagamento() {
    const defaultData = form.data || new Date().toISOString().split('T')[0];
    const remanescente = Math.max(0, cartTotal - pagamentosTotal);
    setPagamentos([...pagamentos, { id: Date.now(), forma_pagamento: 'pix', valor: remanescente, parcelas: 1, primeiro_vencimento: defaultData }]);
  }
  function updatePagamento(idx, field, value) {
    const p = [...pagamentos];
    p[idx][field] = value;
    setPagamentos(p);
  }
  function removePagamento(idx) { setPagamentos(pagamentos.filter((_, i) => i !== idx)); }
  const pagamentosTotal = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);

  function openNew() {
    const uniqueId = 'PD-' + Date.now().toString(36).toUpperCase();
    setForm({ cliente_id: '', vendedor_id: '', data: new Date().toISOString().split('T')[0], numero_pedido: uniqueId, observacoes: '' });
    setCart([]);
    setPagamentos([]);
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (cart.length === 0) return addToast('Adicione itens', 'error');
    if (cart.some(i => !i.produto_id)) return addToast('Selecione todos os produtos', 'error');
    if (pagamentos.length === 0) return addToast('Adicione pelo menos uma forma de pagamento', 'error');
    if (pagamentosTotal !== cartTotal) return addToast('A soma dos pagamentos não bate com o total da venda', 'error');
    
    for (const item of cart) {
      const prod = produtos.find(p => p.id === item.produto_id);
      if (prod && (prod.quantidade_estoque || 0) < item.quantidade)
        return addToast(`Estoque insuficiente para "${prod.nome}"`, 'error');
    }

    // 1. Inserir a venda
    // Vamos registrar forma_pagamento como Múltiplo para retrocompatibilidade
    const { data: venda, error } = await supabase.from('vendas').insert({
      cliente_id: form.cliente_id || null, 
      vendedor_id: form.vendedor_id || null,
      data: form.data, 
      numero_pedido: form.numero_pedido,
      total: cartTotal, 
      observacoes: form.observacoes,
      forma_pagamento: pagamentos.length > 1 ? 'Múltiplo' : pagamentos[0].forma_pagamento,
      status: 'finalizada'
    }).select().single();
    if (error) return addToast('Erro ao salvar venda: ' + error.message, 'error');

    // 2. Inserir itens
    const itens = cart.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
    await supabase.from('vendas_itens').insert(itens);

    // 3. Atualizar estoque
    for (const item of cart) {
      const prod = produtos.find(p => p.id === item.produto_id);
      if (prod) await supabase.from('produtos').update({ quantidade_estoque: Math.max(0, (prod.quantidade_estoque || 0) - item.quantidade) }).eq('id', item.produto_id);
    }

    // 4. Gerar parcelas para CADA pagamento adicionado
    const parcelasGeradas = [];
    for (const pag of pagamentos) {
      const parcelas = parseInt(pag.parcelas) || 1;
      const valorParcela = Math.round(pag.valor / parcelas);
      const baseVencimento = new Date((pag.primeiro_vencimento || form.data) + 'T12:00:00');
      
      for (let i = 0; i < parcelas; i++) {
        const vencimento = new Date(baseVencimento); 
        vencimento.setMonth(vencimento.getMonth() + i);
        const dataVenc = vencimento.toISOString().split('T')[0];
        
        // Compensar erro de arredondamento na última parcela
        const valFinal = i === parcelas - 1 ? pag.valor - (valorParcela * (parcelas - 1)) : valorParcela;

        const pData = {
          venda_id: venda.id, 
          cliente_id: form.cliente_id || null,
          descricao: `Venda #${form.numero_pedido || venda.id.substring(0, 8)} - ${fmtPag[pag.forma_pagamento] || pag.forma_pagamento} ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`,
          valor: valFinal, 
          parcela: i + 1, 
          total_parcelas: parcelas,
          data_vencimento: dataVenc, 
          forma_pagamento: pag.forma_pagamento, 
          status: 'pendente'
        };

        parcelasGeradas.push(pData);
        await supabase.from('contas_receber').insert(pData);
      }
    }

    // 5. Concluir
    const { data: vendaCompleta } = await supabase.from('vendas')
      .select('*, clientes(nome), vendedores(nome), vendas_itens(*, produtos(nome))')
      .eq('id', venda.id).single();

    addToast('Venda registrada com sucesso!');
    setShowModal(false); 

    if (confirm('Venda salva! Deseja imprimir o recibo?')) {
      imprimirRecibo({ ...vendaCompleta, _parcelas: parcelasGeradas }, empresa);
    }
    load();
  }

  const filtered = vendas.filter(v =>
    (v.clientes?.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.numero_pedido || '').includes(search)
  );

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Vendas</h2><p className="page-subtitle">{vendas.length} vendas registradas</p></div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Nova Venda
        </button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar por cliente ou pedido..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><Receipt size={28} /></div><div className="empty-title">Nenhuma venda</div><div className="empty-text">Registre a primeira venda.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Pedido</th><th>Itens</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ fontWeight: 500 }}>{v.clientes?.nome || 'Sem cliente'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{v.vendedores?.nome || '—'}</td>
                  <td>{v.numero_pedido || '—'}</td>
                  <td>{v.vendas_itens?.length || 0}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>{fmt(v.total)}</td>
                  <td><span className={`badge ${v.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Imprimir Recibo" onClick={async () => {
                      // Para impressão de vendas antigas, buscamos as parcelas reais
                      const { data: cRec } = await supabase.from('contas_receber').select('*').eq('venda_id', v.id);
                      imprimirRecibo({ ...v, _parcelas: cRec || [] }, empresa);
                    }}>
                      <Printer size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header"><h3 className="modal-title">Nova Venda</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                  <div className="form-group"><label className="form-label">Cliente</label>
                    <select className="form-select" value={form.cliente_id} onChange={e => setForm({ ...form, cliente_id: e.target.value })}>
                      <option value="">Sem cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Vendedor</label>
                    <select className="form-select" value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })}>
                      <option value="">Sem vendedor</option>{vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required /></div>
                  <div className="form-group"><label className="form-label">Nº Pedido</label><input className="form-input" value={form.numero_pedido} readOnly style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', cursor: 'not-allowed' }} /></div>
                </div>

                {/* Itens */}
                <div style={{ marginBottom: 'var(--space-6)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={18}/> Itens da Venda</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Item</button>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => (
                          <tr key={idx}>
                            <td><select className="form-select" value={item.produto_id} onChange={e => updateCartItem(idx, 'produto_id', e.target.value)} style={{ minWidth: 200 }}>
                              <option value="">Selecione...</option>{produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.quantidade_estoque || 0} un.)</option>)}
                            </select></td>
                            <td><input type="number" className="form-input" value={item.quantidade} onChange={e => updateCartItem(idx, 'quantidade', parseInt(e.target.value) || 0)} min="1" style={{ width: 80 }} /></td>
                            <td><input type="number" step="0.01" className="form-input" value={toReal(item.valor_unitario)} onChange={e => updateCartItem(idx, 'valor_unitario', toCents(e.target.value))} style={{ width: 120 }} /></td>
                            <td style={{ fontWeight: 600 }}>{fmt(item.quantidade * item.valor_unitario)}</td>
                            <td><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeCartItem(idx)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ textAlign: 'right', marginTop: 'var(--space-4)', fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                    Total: <span style={{ color: 'var(--color-success)' }}>{fmt(cartTotal)}</span>
                  </div>
                </div>

                {/* Pagamentos */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Pagamentos</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addPagamento}><Plus size={14} /> Adicionar Pagamento</button>
                  </div>
                  {pagamentos.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum pagamento registrado.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {pagamentos.map((pag, idx) => (
                        <div key={pag.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 40px', gap: 'var(--space-3)', alignItems: 'end', background: 'rgba(0,0,0,0.02)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Forma</label>
                            <select className="form-select" value={pag.forma_pagamento} onChange={e => updatePagamento(idx, 'forma_pagamento', e.target.value)}>
                              <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option>
                              <option value="credito">Cartão Crédito</option><option value="debito">Cartão Débito</option>
                              <option value="boleto">Boleto</option><option value="transferencia">Transferência</option>
                              <option value="cheque">Cheque</option><option value="crediario">💳 Crediário</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Valor</label>
                            <input type="number" step="0.01" className="form-input" value={toReal(pag.valor)} onChange={e => updatePagamento(idx, 'valor', toCents(e.target.value))} />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Parcelas</label>
                            <input type="number" className="form-input" value={pag.parcelas} onChange={e => updatePagamento(idx, 'parcelas', parseInt(e.target.value) || 1)} min="1" max="24" />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>1º Venc.</label>
                            <input type="date" className="form-input" value={pag.primeiro_vencimento} onChange={e => updatePagamento(idx, 'primeiro_vencimento', e.target.value)} required />
                          </div>
                          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removePagamento(idx)} style={{ color: 'var(--color-danger)', marginBottom: 8 }}><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'var(--space-4)', gap: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                      Total Informado: <strong>{fmt(pagamentosTotal)}</strong>
                    </div>
                    {pagamentosTotal !== cartTotal && (
                      <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <X size={14}/> Diferença de {fmt(Math.abs(cartTotal - pagamentosTotal))}
                      </div>
                    )}
                    {pagamentosTotal === cartTotal && cartTotal > 0 && (
                      <div style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={14}/> Valores batem!
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Observações</label>
                  <input className="form-input" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} placeholder="Opcional..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={pagamentosTotal !== cartTotal || cartTotal === 0}>Finalizar Venda</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
