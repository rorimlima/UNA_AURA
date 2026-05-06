import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import { Plus, Search, X, Trash2, Eye, Edit2, RotateCcw, Package, Gift, DollarSign, CheckCircle } from 'lucide-react';
import { formatMoney, toCents, toReal, todayStr } from '../lib/money';
import { logActivity } from '../lib/activityLogger';
import { listarDevolucoes, criarDevolucao, finalizarDevolucao, cancelarDevolucao, excluirDevolucao, getSaldoCredito, getComprasFornecedor } from '../lib/creditosFornecedor';

export default function Devolucoes() {
  const { addToast } = useToast();
  const [devolucoes, setDevolucoes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  const [showModal, setShowModal] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ fornecedor_id: '', compra_id: '', motivo: '', observacoes: '', gerar_credito: true, data: todayStr() });
  const [cart, setCart] = useState([]);
  const [comprasForn, setComprasForn] = useState([]);
  const savingRef = useRef(false);

  const fmt = formatMoney;

  useEffect(() => { load(); }, []);

  async function load() {
    const [devs, { data: f }, { data: p }] = await Promise.all([
      listarDevolucoes(),
      supabase.from('fornecedores').select('id, nome, codigo').eq('is_deleted', false).order('nome'),
      supabase.from('produtos').select('id, nome, codigo, referencia, custo_unitario').eq('ativo', true).order('nome'),
    ]);
    setDevolucoes(devs); setFornecedores(f || []); setProdutos(p || []);
    setLoading(false);
  }

  async function onFornecedorChange(fornId) {
    setForm(prev => ({ ...prev, fornecedor_id: fornId, compra_id: '' }));
    if (fornId) {
      const compras = await getComprasFornecedor(fornId);
      setComprasForn(compras);
    } else { setComprasForn([]); }
  }

  function loadItensFromCompra(compraId) {
    const compra = comprasForn.find(c => c.id === compraId);
    if (!compra) return;
    setForm(prev => ({ ...prev, compra_id: compraId }));
    setCart((compra.compras_itens || []).map(i => ({
      produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
      nome: i.produtos?.nome || '', referencia: i.produtos?.referencia || ''
    })));
  }

  function addToCart() { setCart([...cart, { produto_id: '', quantidade: 1, valor_unitario: 0, nome: '', referencia: '' }]); }
  function updateCartItem(idx, field, value) {
    const items = [...cart]; items[idx][field] = value;
    if (field === 'produto_id') {
      const prod = produtos.find(p => p.id === value);
      if (prod) { items[idx].valor_unitario = prod.custo_unitario || 0; items[idx].nome = prod.nome; items[idx].referencia = prod.referencia || ''; }
    }
    setCart(items);
  }
  function removeCartItem(idx) { setCart(cart.filter((_, i) => i !== idx)); }
  const cartTotal = cart.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);

  function openNew() {
    setForm({ fornecedor_id: '', compra_id: '', motivo: '', observacoes: '', gerar_credito: true, data: todayStr() });
    setCart([]); setComprasForn([]); setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    if (!form.fornecedor_id) { savingRef.current = false; return addToast('Selecione o fornecedor', 'error'); }
    if (cart.length === 0) { savingRef.current = false; return addToast('Adicione itens', 'error'); }
    if (cart.some(i => !i.produto_id)) { savingRef.current = false; return addToast('Selecione todos os produtos', 'error'); }
    setSaving(true);
    try {
      const { devolucao } = await criarDevolucao(
        { fornecedor_id: form.fornecedor_id, compra_id: form.compra_id || null, motivo: form.motivo, observacoes: form.observacoes, gerar_credito: form.gerar_credito },
        cart.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }))
      );
      logActivity('CREATE', 'devolucao_fornecedor', devolucao.id, `Devolução #${devolucao.codigo}`, { total: cartTotal, itens: cart.length });
      addToast('✅ Devolução criada como rascunho!');
      setShowModal(false); await load();
    } catch (err) { addToast('Erro: ' + (err.message || err), 'error'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function handleFinalizar(dev) {
    if (!confirm(`Finalizar devolução #${dev.codigo}? O estoque será decrementado e o crédito gerado.`)) return;
    try {
      await finalizarDevolucao(dev.id);
      addToast('✅ Devolução finalizada! Crédito gerado.');
      logActivity('UPDATE', 'devolucao_fornecedor', dev.id, `Finalizada devolução #${dev.codigo}`);
      load();
    } catch (err) { addToast('Erro: ' + (err.message || err), 'error'); }
  }

  async function handleCancelar(dev) {
    if (!confirm(`Cancelar devolução #${dev.codigo}?`)) return;
    try {
      await cancelarDevolucao(dev.id);
      addToast('Devolução cancelada.'); load();
    } catch (err) { addToast('Erro: ' + (err.message || err), 'error'); }
  }

  async function handleExcluir(dev) {
    if (dev.status !== 'rascunho') return addToast('Só é possível excluir rascunhos', 'error');
    if (!confirm(`Excluir devolução #${dev.codigo}?`)) return;
    try {
      await excluirDevolucao(dev.id);
      addToast('Devolução excluída.'); load();
    } catch (err) { addToast('Erro: ' + (err.message || err), 'error'); }
  }

  function viewDetalhes(dev) { setDetalhe(dev); setShowDetalhes(true); }

  const filtered = devolucoes.filter(d => {
    const q = search.toLowerCase();
    return (d.codigo?.toString() || '').includes(q) ||
      (d.fornecedores?.nome || '').toLowerCase().includes(q) ||
      (d.motivo || '').toLowerCase().includes(q) ||
      (d.status || '').toLowerCase().includes(q);
  });

  const totalDevolvido = devolucoes.filter(d => d.status === 'finalizada').reduce((s, d) => s + (d.total || 0), 0);
  const totalPendente = devolucoes.filter(d => d.status === 'rascunho').reduce((s, d) => s + (d.total || 0), 0);

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Devoluções ao Fornecedor</h2><p className="page-subtitle">{devolucoes.length} devoluções registradas</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nova Devolução</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card"><div className="kpi-icon"><RotateCcw size={20} /></div><div className="kpi-label">Total Devoluções</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{devolucoes.length}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><DollarSign size={20} /></div><div className="kpi-label">Total Devolvido</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace', color: 'var(--color-success)' }}>{fmt(totalDevolvido)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}><Package size={20} /></div><div className="kpi-label">Pendentes</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace', color: 'var(--color-warning)' }}>{fmt(totalPendente)}</div></div>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="🔍 Buscar por código, fornecedor, motivo ou status..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><RotateCcw size={28} /></div><div className="empty-title">Nenhuma devolução</div><div className="empty-text">Registre uma devolução ao fornecedor.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>#</th><th>Data</th><th>Fornecedor</th><th>Motivo</th><th>Itens</th><th style={{ textAlign: 'right' }}>Total</th><th>Crédito</th><th>Status</th><th style={{ textAlign: 'center' }}>Ações</th></tr></thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)' }}>{d.codigo || '—'}</span></td>
                  <td>{new Date(d.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ fontWeight: 500 }}>{d.fornecedores?.nome || '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.motivo || '—'}</td>
                  <td>{d.itens_devolucao_fornecedor?.length || 0}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{fmt(d.total)}</td>
                  <td>{d.gerar_credito ? <span className="badge badge-success">Sim</span> : <span className="badge badge-gold">Não</span>}</td>
                  <td><span className={`badge ${d.status === 'finalizada' ? 'badge-success' : d.status === 'cancelada' ? 'badge-danger' : 'badge-warning'}`}>{d.status?.toUpperCase()}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Ver detalhes" onClick={() => viewDetalhes(d)} style={{ color: 'var(--color-info)' }}><Eye size={14} /></button>
                      {d.status === 'rascunho' && <button className="btn btn-ghost btn-icon btn-sm" title="Finalizar" onClick={() => handleFinalizar(d)} style={{ color: 'var(--color-success)' }}><CheckCircle size={14} /></button>}
                      {d.status === 'rascunho' && <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => handleExcluir(d)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>}
                      {d.status === 'finalizada' && <button className="btn btn-ghost btn-icon btn-sm" title="Cancelar" onClick={() => handleCancelar(d)} style={{ color: 'var(--color-danger)' }}><X size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova Devolução */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header"><h3 className="modal-title">Nova Devolução ao Fornecedor</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <form onSubmit={handleSave} noValidate>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                  <div className="form-group">
                    <label className="form-label">Fornecedor *</label>
                    <select className="form-select" value={form.fornecedor_id} onChange={e => onFornecedorChange(e.target.value)} required>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.codigo ? f.codigo + ' — ' : ''}{f.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Compra de Origem (opcional)</label>
                    <select className="form-select" value={form.compra_id} onChange={e => loadItensFromCompra(e.target.value)} disabled={!form.fornecedor_id}>
                      <option value="">Sem referência</option>
                      {comprasForn.map(c => <option key={c.id} value={c.id}>#{c.codigo} — {fmt(c.total)} — {c.numero_nota || 'S/N'}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Motivo</label><input className="form-input" value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} placeholder="Ex: Defeito de fabricação" /></div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Observações</label><textarea className="form-input" rows={2} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.gerar_credito} onChange={e => setForm({ ...form, gerar_credito: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--color-gold)' }} />
                      Gerar crédito ao finalizar
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Itens da Devolução</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Adicionar Item</button>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item. Selecione uma compra de origem ou adicione manualmente.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Produto</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => (
                          <tr key={idx}>
                            <td style={{ minWidth: 200 }}>
                              <select className="form-select" value={item.produto_id} onChange={e => updateCartItem(idx, 'produto_id', e.target.value)} style={{ fontSize: 'var(--text-sm)' }}>
                                <option value="">Selecione...</option>
                                {produtos.map(p => <option key={p.id} value={p.id}>{p.referencia || p.codigo || '—'} — {p.nome}</option>)}
                              </select>
                            </td>
                            <td><input type="number" className="form-input" value={item.quantidade} onChange={e => updateCartItem(idx, 'quantidade', parseInt(e.target.value) || 0)} min="1" style={{ width: 80, textAlign: 'right' }} /></td>
                            <td><input type="number" step="0.01" className="form-input" value={toReal(item.valor_unitario)} onChange={e => updateCartItem(idx, 'valor_unitario', toCents(e.target.value))} style={{ width: 120, textAlign: 'right', fontFamily: 'monospace' }} /></td>
                            <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-gold)' }}>{fmt(item.quantidade * item.valor_unitario)}</td>
                            <td><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeCartItem(idx)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ textAlign: 'right', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(201,169,110,0.08)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{cart.length} ite{cart.length === 1 ? 'm' : 'ns'}</span>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'monospace' }}>Total: <span className="text-gold">{fmt(cartTotal)}</span></span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving || cartTotal === 0}>{saving ? <><div className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} /> Salvando...</> : 'Criar Rascunho'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes */}
      {showDetalhes && detalhe && (
        <div className="modal-backdrop" onClick={() => setShowDetalhes(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(201,169,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RotateCcw size={18} style={{ color: 'var(--color-gold)' }} /></div>
                <div><h3 className="modal-title" style={{ margin: 0 }}>Devolução #{detalhe.codigo}</h3><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{detalhe.fornecedores?.nome}</span></div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDetalhes(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                {[
                  { label: 'Data', value: new Date(detalhe.data).toLocaleDateString('pt-BR') },
                  { label: 'Total', value: fmt(detalhe.total) },
                  { label: 'Motivo', value: detalhe.motivo || '—' },
                ].map((info, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{info.label}</div>
                    <div style={{ fontWeight: 600 }}>{info.value}</div>
                  </div>
                ))}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                  <span className={`badge ${detalhe.status === 'finalizada' ? 'badge-success' : detalhe.status === 'cancelada' ? 'badge-danger' : 'badge-warning'}`}>{detalhe.status?.toUpperCase()}</span>
                </div>
              </div>
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)' }}>Itens</h4>
              <table className="data-table">
                <thead><tr><th>#</th><th>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Valor Unit.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                <tbody>
                  {(detalhe.itens_devolucao_fornecedor || []).map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500 }}>{item.produtos?.nome || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{item.quantidade}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{fmt(item.valor_unitario)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-gold)' }}>{fmt(item.quantidade * item.valor_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-gold)' }}>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Total:</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: 'var(--color-gold)' }}>{fmt(detalhe.total)}</td>
                  </tr>
                </tfoot>
              </table>
              {detalhe.observacoes && <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><strong>Obs:</strong> {detalhe.observacoes}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
