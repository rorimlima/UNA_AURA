import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Receipt, X, Trash2 } from 'lucide-react';

export default function Vendas() {
  const { addToast } = useToast();
  const [vendas, setVendas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ cliente_id:'', data:new Date().toISOString().split('T')[0], numero_pedido:'', observacoes:'', forma_pagamento:'pix', parcelas:1, primeiro_vencimento:'' });
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: v }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('vendas').select('*, clientes(nome), vendas_itens(*, produtos(nome))').order('data', { ascending: false }),
      supabase.from('clientes').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome, preco_venda, quantidade_estoque').eq('ativo', true).order('nome'),
    ]);
    setVendas(v || []); setClientes(c || []); setProdutos(p || []);
    setLoading(false);
  }

  function addToCart() { setCart([...cart, { produto_id:'', quantidade:1, valor_unitario:0 }]); }

  function updateCartItem(idx, field, value) {
    const items = [...cart];
    items[idx][field] = value;
    if (field === 'produto_id') {
      const prod = produtos.find(p => p.id === value);
      if (prod) items[idx].valor_unitario = prod.preco_venda || 0;
    }
    setCart(items);
  }

  function removeCartItem(idx) { setCart(cart.filter((_, i) => i !== idx)); }
  const cartTotal = cart.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);

  async function handleSave(e) {
    e.preventDefault();
    if (cart.length === 0) return addToast('Adicione itens', 'error');
    if (cart.some(i => !i.produto_id)) return addToast('Selecione todos os produtos', 'error');

    // Check stock
    for (const item of cart) {
      const prod = produtos.find(p => p.id === item.produto_id);
      if (prod && (prod.quantidade_estoque || 0) < item.quantidade) {
        return addToast(`Estoque insuficiente para "${prod.nome}"`, 'error');
      }
    }

    const { data: venda, error } = await supabase.from('vendas').insert({
      cliente_id: form.cliente_id || null, data: form.data, numero_pedido: form.numero_pedido,
      total: cartTotal, observacoes: form.observacoes, status: 'finalizada'
    }).select().single();
    if (error) return addToast('Erro: ' + error.message, 'error');

    const itens = cart.map(i => ({ venda_id: venda.id, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
    await supabase.from('vendas_itens').insert(itens);

    // Update stock (subtract)
    for (const item of cart) {
      const prod = produtos.find(p => p.id === item.produto_id);
      if (prod) {
        await supabase.from('produtos').update({ quantidade_estoque: Math.max(0, (prod.quantidade_estoque || 0) - item.quantidade) }).eq('id', item.produto_id);
      }
    }

    // Create contas_receber (with parcelas)
    const parcelas = parseInt(form.parcelas) || 1;
    const valorParcela = cartTotal / parcelas;
    // Use primeiro_vencimento as base date; fallback to sale date
    const baseVencimento = form.primeiro_vencimento ? new Date(form.primeiro_vencimento + 'T12:00:00') : new Date(form.data + 'T12:00:00');
    for (let i = 0; i < parcelas; i++) {
      const vencimento = new Date(baseVencimento);
      vencimento.setMonth(vencimento.getMonth() + i);
      await supabase.from('contas_receber').insert({
        venda_id: venda.id, cliente_id: form.cliente_id || null,
        descricao: `Venda #${form.numero_pedido || venda.id.substring(0, 8)} ${parcelas > 1 ? `(${i+1}/${parcelas})` : ''}`,
        valor: Math.round(valorParcela * 100) / 100, parcela: i + 1, total_parcelas: parcelas,
        data_vencimento: vencimento.toISOString().split('T')[0],
        forma_pagamento: form.forma_pagamento, status: 'pendente'
      });
    }

    addToast('Venda registrada!');
    setShowModal(false); setCart([]); load();
  }

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const filtered = vendas.filter(v =>
    (v.clientes?.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.numero_pedido || '').includes(search)
  );

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Vendas</h2><p className="page-subtitle">{vendas.length} vendas</p></div>
        <button className="btn btn-primary" onClick={() => { setForm({ cliente_id:'', data:new Date().toISOString().split('T')[0], numero_pedido:'', observacoes:'', forma_pagamento:'pix', parcelas:1, primeiro_vencimento:'' }); setCart([]); setShowModal(true); }}>
          <Plus size={18} /> Nova Venda
        </button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar por cliente ou pedido..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><Receipt size={28} /></div><div className="empty-title">Nenhuma venda</div><div className="empty-text">Registre a primeira venda.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Pedido</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{v.clientes?.nome || 'Sem cliente'}</td>
                  <td>{v.numero_pedido || '—'}</td>
                  <td>{v.vendas_itens?.length || 0}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>{fmt(v.total)}</td>
                  <td><span className={`badge ${v.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span></td>
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
                      <option value="">Sem cliente</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Nº Pedido</label><input className="form-input" value={form.numero_pedido} onChange={e => setForm({ ...form, numero_pedido: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Forma de Pagamento</label>
                    <select className="form-select" value={form.forma_pagamento} onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}>
                      <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="credito">Cartão Crédito</option><option value="debito">Cartão Débito</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cheque">Cheque</option>
                      <option value="crediario">💳 Crediário (parcelado sem cartão)</option>
                    </select>
                    {form.forma_pagamento === 'crediario' && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-rose, #D4688A)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        ⚠️ Crediário: parcelas rastreadas no módulo de Inadimplência
                      </span>
                    )}
                  </div>
                  <div className="form-group"><label className="form-label">Nº de Parcelas</label><input type="number" className="form-input" value={form.parcelas} onChange={e => setForm({ ...form, parcelas: e.target.value })} min="1" max="24" /></div>
                  <div className="form-group">
                    <label className="form-label">Primeiro Vencimento</label>
                    <input type="date" className="form-input" value={form.primeiro_vencimento} onChange={e => setForm({ ...form, primeiro_vencimento: e.target.value })} />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', display: 'block' }}>As parcelas serão geradas mensalmente a partir desta data.</span>
                  </div>
                </div>

                {/* Parcelas Preview */}
                {form.parcelas > 1 && form.primeiro_vencimento && cartTotal > 0 && (() => {
                  const parcelas = parseInt(form.parcelas) || 1;
                  const valor = Math.round((cartTotal / parcelas) * 100) / 100;
                  const base = new Date(form.primeiro_vencimento + 'T12:00:00');
                  return (
                    <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)', background: 'rgba(201,169,110,0.04)', border: '1px solid rgba(201,169,110,0.12)' }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-gold)', marginBottom: 'var(--space-3)' }}>📅 Preview das Parcelas</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-2)' }}>
                        {Array.from({ length: parcelas }, (_, i) => {
                          const d = new Date(base);
                          d.setMonth(d.getMonth() + i);
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                              <span style={{ color: 'var(--color-text-muted)' }}>{i + 1}ª parcela</span>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}</div>
                                <div style={{ color: 'var(--color-text-muted)' }}>{d.toLocaleDateString('pt-BR')}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Itens da Venda</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Item</button>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => (
                          <tr key={idx}>
                            <td><select className="form-select" value={item.produto_id} onChange={e => updateCartItem(idx, 'produto_id', e.target.value)} style={{ minWidth: 200 }}>
                              <option value="">Selecione...</option>
                              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.quantidade_estoque || 0} un.)</option>)}
                            </select></td>
                            <td><input type="number" className="form-input" value={item.quantidade} onChange={e => updateCartItem(idx, 'quantidade', parseInt(e.target.value) || 0)} min="1" style={{ width: 80 }} /></td>
                            <td><input type="number" step="0.01" className="form-input" value={item.valor_unitario} onChange={e => updateCartItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)} style={{ width: 120 }} /></td>
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Finalizar Venda</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
