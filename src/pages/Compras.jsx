import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, ShoppingCart, X, Trash2, Upload, Eye } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';

export default function Compras() {
  const { addToast } = useToast();
  const [compras, setCompras] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fornecedor_id:'', data:new Date().toISOString().split('T')[0], numero_nota:'', numero_pedido:'', observacoes:'' });
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: c }, { data: f }, { data: p }] = await Promise.all([
      supabase.from('compras').select('*, fornecedores(nome), compras_itens(*, produtos(nome))').order('data', { ascending: false }),
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome, custo_unitario').eq('ativo', true).order('nome'),
    ]);
    setCompras(c || []); setFornecedores(f || []); setProdutos(p || []);
    setLoading(false);
  }

  function addToCart() {
    setCart([...cart, { produto_id: '', quantidade: 1, valor_unitario: 0 }]);
  }

  function updateCartItem(idx, field, value) {
    const items = [...cart];
    items[idx][field] = value;
    if (field === 'produto_id') {
      const prod = produtos.find(p => p.id === value);
      if (prod) items[idx].valor_unitario = prod.custo_unitario || 0;
    }
    setCart(items);
  }

  function removeCartItem(idx) { setCart(cart.filter((_, i) => i !== idx)); }

  const cartTotal = cart.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.fornecedor_id) return addToast('Selecione o fornecedor', 'error');
    if (cart.length === 0) return addToast('Adicione itens ao carrinho', 'error');
    if (cart.some(i => !i.produto_id)) return addToast('Selecione todos os produtos', 'error');

    const { data: compra, error } = await supabase.from('compras').insert({
      fornecedor_id: form.fornecedor_id, data: form.data, numero_nota: form.numero_nota,
      numero_pedido: form.numero_pedido, total: cartTotal, observacoes: form.observacoes, status: 'finalizada'
    }).select().single();

    if (error) return addToast('Erro: ' + error.message, 'error');

    const itens = cart.map(i => ({ compra_id: compra.id, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
    await supabase.from('compras_itens').insert(itens);

    // Update stock
    for (const item of cart) {
      await supabase.rpc('increment_stock', { p_id: item.produto_id, qty: item.quantidade }).catch(() => {
        // fallback: manual update
        supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single().then(({ data: prod }) => {
          supabase.from('produtos').update({ quantidade_estoque: (prod?.quantidade_estoque || 0) + item.quantidade }).eq('id', item.produto_id);
        });
      });
    }

    // Create contas_pagar
    await supabase.from('contas_pagar').insert({
      compra_id: compra.id, fornecedor_id: form.fornecedor_id,
      descricao: `Compra #${form.numero_nota || compra.id.substring(0, 8)}`,
      categoria: 'mercadoria', valor: cartTotal, data_vencimento: form.data, status: 'pendente'
    });

    addToast('Compra registrada com sucesso!');
    setShowModal(false); setCart([]); load();
  }

  const fmt = formatMoney;

  const filtered = compras.filter(c =>
    (c.fornecedores?.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.numero_nota || '').includes(search)
  );

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Compras</h2><p className="page-subtitle">{compras.length} compras registradas</p></div>
        <button className="btn btn-primary" onClick={() => { setForm({ fornecedor_id:'', data:new Date().toISOString().split('T')[0], numero_nota:'', numero_pedido:'', observacoes:'' }); setCart([]); setShowModal(true); }}>
          <Plus size={18} /> Nova Compra
        </button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar por fornecedor ou nota..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><ShoppingCart size={28} /></div><div className="empty-title">Nenhuma compra</div><div className="empty-text">Registre sua primeira compra.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data</th><th>Fornecedor</th><th>Nota</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{new Date(c.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{c.fornecedores?.nome || '—'}</td>
                  <td>{c.numero_nota || '—'}</td>
                  <td>{c.compras_itens?.length || 0}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(c.total)}</td>
                  <td><span className={`badge ${c.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header"><h3 className="modal-title">Nova Compra</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                  <div className="form-group"><label className="form-label">Fornecedor *</label>
                    <select className="form-select" value={form.fornecedor_id} onChange={e => setForm({ ...form, fornecedor_id: e.target.value })} required>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Nº Nota</label><input className="form-input" value={form.numero_nota} onChange={e => setForm({ ...form, numero_nota: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Nº Pedido</label><input className="form-input" value={form.numero_pedido} onChange={e => setForm({ ...form, numero_pedido: e.target.value })} /></div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Itens da Compra</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Adicionar Item</button>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item adicionado.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Produto</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => (
                          <tr key={idx}>
                            <td><select className="form-select" value={item.produto_id} onChange={e => updateCartItem(idx, 'produto_id', e.target.value)} style={{ minWidth: 200 }}>
                              <option value="">Selecione...</option>
                              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
                    Total: <span className="text-gold">{fmt(cartTotal)}</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Finalizar Compra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
