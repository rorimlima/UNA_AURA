import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, ShoppingCart, X, Trash2, DollarSign, TrendingDown, Edit2 } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';

export default function Compras() {
  const { addToast } = useToast();
  const [compras, setCompras] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fornecedor_id:'', data:new Date().toISOString().split('T')[0], numero_nota:'', numero_pedido:'', observacoes:'' });
  const [cart, setCart] = useState([]);
  const [pagamentos, setPagamentos] = useState([]); // Multiple payments
  const [search, setSearch] = useState('');
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
  const [novoFornecedorForm, setNovoFornecedorForm] = useState({ nome: '', telefone: '' });
  const [showNovoProduto, setShowNovoProduto] = useState(false);
  const [novoProdutoForm, setNovoProdutoForm] = useState({ nome: '', custo_unitario: '' });
  const [prodSearches, setProdSearches] = useState({}); // per-row product search
  const [prodDropdowns, setProdDropdowns] = useState({}); // per-row dropdown visibility
  const searchTimers = useRef({});

  // Smart supplier search
  const [fornSearch, setFornSearch] = useState('');
  const [showFornDropdown, setShowFornDropdown] = useState(false);
  const [fornSearchResults, setFornSearchResults] = useState([]);
  const [fornSearchLoading, setFornSearchLoading] = useState(false);
  const fornDropdownRef = useRef(null);
  const fornSearchTimer = useRef(null);

  // Close supplier dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (fornDropdownRef.current && !fornDropdownRef.current.contains(e.target)) {
        setShowFornDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live Supabase search for suppliers with debounce
  function handleFornSearchChange(value) {
    setFornSearch(value);
    setShowFornDropdown(true);
    if (!value) {
      setForm(prev => ({ ...prev, fornecedor_id: '' }));
      setFornSearchResults(fornecedores.slice(0, 15));
      return;
    }
    clearTimeout(fornSearchTimer.current);
    fornSearchTimer.current = setTimeout(async () => {
      setFornSearchLoading(true);
      const q = value.trim();
      const { data } = await supabase
        .from('fornecedores')
        .select('id, nome, codigo, tipo, documento, telefone, email, status_financeiro')
        .or(`nome.ilike.%${q}%,codigo.ilike.%${q}%,documento.ilike.%${q}%,telefone.ilike.%${q}%`)
        .order('nome')
        .limit(15);
      setFornSearchResults(data || []);
      setFornSearchLoading(false);
    }, 300);
  }

  // Load initial supplier results when dropdown opens
  function handleFornFocus() {
    setShowFornDropdown(true);
    if (fornSearchResults.length === 0 && !fornSearch) {
      setFornSearchResults(fornecedores.slice(0, 15));
    }
  }

  function selectFornecedor(forn) {
    setForm(prev => ({ ...prev, fornecedor_id: forn.id }));
    setFornSearch(`${forn.codigo ? forn.codigo + ' ' : ''}${forn.nome}`.trim());
    setShowFornDropdown(false);
  }

  // Smart product search with debounce
  function handleProdSearch(idx, query) {
    setProdSearches(prev => ({ ...prev, [idx]: query }));
    clearTimeout(searchTimers.current[idx]);
    searchTimers.current[idx] = setTimeout(() => {
      setProdDropdowns(prev => ({ ...prev, [idx]: query.length > 0 }));
    }, 300);
  }

  function getFilteredProducts(idx) {
    const q = (prodSearches[idx] || '').toLowerCase();
    if (!q) return produtos;
    return produtos.filter(p =>
      (p.nome || '').toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.referencia || '').toLowerCase().includes(q) ||
      toReal(p.custo_unitario).toFixed(2).includes(q)
    );
  }

  function selectProduct(idx, prod) {
    updateCartItem(idx, 'produto_id', prod.id);
    setProdSearches(prev => ({ ...prev, [idx]: `${prod.referencia || ''} ${prod.nome}`.trim() }));
    setProdDropdowns(prev => ({ ...prev, [idx]: false }));
  }

  // Build display map from dynamic formas_pagamento
  const fmtPag = Object.fromEntries(formasPagamento.map(f => [f.nome, f.nome]));

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: c }, { data: f }, { data: p }, { data: fp }] = await Promise.all([
      supabase.from('compras').select('*, fornecedores(nome), compras_itens(*, produtos(nome))').order('data', { ascending: false }),
      supabase.from('fornecedores').select('id, nome, codigo, tipo, documento, telefone, email, status_financeiro').order('nome'),
      supabase.from('produtos').select('id, nome, codigo, referencia, custo_unitario').eq('ativo', true).order('nome'),
      supabase.from('formas_pagamento').select('*').eq('ativa', true).order('nome'),
    ]);
    setCompras(c || []); setFornecedores(f || []); setProdutos(p || []);
    setFormasPagamento(fp || []);
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

  function addPagamento() {
    const defaultData = form.data || new Date().toISOString().split('T')[0];
    const remanescente = Math.max(0, cartTotal - pagamentosTotal);
    const defaultForma = formasPagamento.length > 0 ? formasPagamento[0].nome : 'PIX';
    setPagamentos([...pagamentos, { id: Date.now(), forma_pagamento: defaultForma, valor: remanescente, parcelas: 1, primeiro_vencimento: defaultData }]);
  }
  function updatePagamento(idx, field, value) {
    const p = [...pagamentos];
    p[idx][field] = value;
    setPagamentos(p);
  }
  function removePagamento(idx) { setPagamentos(pagamentos.filter((_, i) => i !== idx)); }
  const pagamentosTotal = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);

  function openNew() {
    setForm({ fornecedor_id:'', data:new Date().toISOString().split('T')[0], numero_nota:'', numero_pedido:'', observacoes:'' });
    setCart([]);
    setPagamentos([]);
    setFornSearch('');
    setShowFornDropdown(false);
    setFornSearchResults([]);
    setShowModal(true);
  }

  async function handleSaveNovoFornecedor(e) {
    e.preventDefault();
    if (!novoFornecedorForm.nome) return addToast('Nome obrigatório', 'error');
    const { data, error } = await supabase.from('fornecedores').insert({ nome: novoFornecedorForm.nome, telefone: novoFornecedorForm.telefone }).select().single();
    if (error) return addToast('Erro: ' + error.message, 'error');
    setFornecedores([...fornecedores, data].sort((a,b)=>a.nome.localeCompare(b.nome)));
    setForm({ ...form, fornecedor_id: data.id });
    setFornSearch(data.nome);
    setShowFornDropdown(false);
    setShowNovoFornecedor(false);
    setNovoFornecedorForm({ nome: '', telefone: '' });
    addToast('Fornecedor cadastrado!');
  }

  async function handleSaveNovoProduto(e) {
    e.preventDefault();
    if (!novoProdutoForm.nome) return addToast('Nome obrigatório', 'error');
    const { data, error } = await supabase.from('produtos').insert({ nome: novoProdutoForm.nome, custo_unitario: toCents(novoProdutoForm.custo_unitario || '0'), ativo: true }).select().single();
    if (error) return addToast('Erro: ' + error.message, 'error');
    setProdutos([...produtos, data].sort((a,b)=>a.nome.localeCompare(b.nome)));
    setCart([...cart, { produto_id: data.id, quantidade: 1, valor_unitario: data.custo_unitario }]);
    setShowNovoProduto(false);
    setNovoProdutoForm({ nome: '', custo_unitario: '' });
    addToast('Produto cadastrado!');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.fornecedor_id) return addToast('Selecione o fornecedor', 'error');
    if (cart.length === 0) return addToast('Adicione itens ao carrinho', 'error');
    if (cart.some(i => !i.produto_id)) return addToast('Selecione todos os produtos', 'error');
    // Permitir salvar sem pagamento (fica como rascunho/pendente)
    if (pagamentos.length > 0 && pagamentosTotal !== cartTotal) return addToast('A soma dos pagamentos não bate com o total da compra', 'error');

    // Determinar status usando valores aceitos pela constraint do banco
    // 'finalizada' = pago, 'rascunho' = pendente
    const formasImediatas = formasPagamento.filter(f => f.pagamento_imediato).map(f => f.nome);
    const pgtoImediato = pagamentos.filter(p => formasImediatas.includes(p.forma_pagamento));
    const totalImediato = pgtoImediato.reduce((s, p) => s + (p.valor || 0), 0);
    let statusCompra = 'rascunho'; // pendente
    if (pagamentos.length > 0 && totalImediato >= cartTotal) statusCompra = 'finalizada'; // pago

    const { data: compra, error } = await supabase.from('compras').insert({
      fornecedor_id: form.fornecedor_id, data: form.data, numero_nota: form.numero_nota,
      numero_pedido: form.numero_pedido, total: cartTotal, observacoes: form.observacoes, status: statusCompra
    }).select().single();

    if (error) return addToast('Erro: ' + error.message, 'error');

    const itens = cart.map(i => ({ compra_id: compra.id, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
    await supabase.from('compras_itens').insert(itens);

    // Update stock — somar quantidade comprada ao estoque atual
    for (const item of cart) {
      const { data: prod } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
      if (prod) {
        const novaQtd = (prod.quantidade_estoque || 0) + item.quantidade;
        await supabase.from('produtos').update({ quantidade_estoque: novaQtd }).eq('id', item.produto_id);
      }
    }

    // Create contas_pagar para cada pagamento
    const parcelasGeradas = [];
    for (const pag of pagamentos) {
      const parcelas = parseInt(pag.parcelas) || 1;
      const valorParcela = Math.round(pag.valor / parcelas);
      const baseVencimento = new Date((pag.primeiro_vencimento || form.data) + 'T12:00:00');
      for (let i = 0; i < parcelas; i++) {
        const vencimento = new Date(baseVencimento); 
        vencimento.setMonth(vencimento.getMonth() + i);
        const dataVenc = vencimento.toISOString().split('T')[0];
        const valFinal = i === parcelas - 1 ? pag.valor - (valorParcela * (parcelas - 1)) : valorParcela;
        parcelasGeradas.push({
          compra_id: compra.id, fornecedor_id: form.fornecedor_id,
          descricao: `Compra #${form.numero_nota || compra.id.substring(0, 8)} - ${pag.forma_pagamento} ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`,
          categoria: 'mercadoria', valor: valFinal, data_vencimento: dataVenc, 
          forma_pagamento: pag.forma_pagamento,
          status: formasImediatas.includes(pag.forma_pagamento) ? 'pago' : 'pendente'
        });
      }
    }
    if (parcelasGeradas.length > 0) await supabase.from('contas_pagar').insert(parcelasGeradas);

    // Recalcular status financeiro do fornecedor via RPC
    await supabase.rpc('recalcular_status_fornecedor', { p_fornecedor_id: form.fornecedor_id }).catch(() => {});

    addToast('Compra registrada com sucesso!');
    setShowModal(false); setCart([]); setPagamentos([]); setProdSearches({}); setProdDropdowns({}); setFornSearch(''); setShowFornDropdown(false); setFornSearchResults([]); load();
  }

  async function deleteCompra(compra) {
    if (!confirm(`Excluir compra ${compra.numero_nota || compra.id.substring(0, 8)}? O estoque será revertido.`)) return;
    // 1. Reverter estoque — subtrair quantidades dos itens
    const itens = compra.compras_itens || [];
    for (const item of itens) {
      const { data: prod } = await supabase.from('produtos').select('quantidade_estoque').eq('id', item.produto_id).single();
      if (prod) {
        const novaQtd = Math.max(0, (prod.quantidade_estoque || 0) - (item.quantidade || 0));
        await supabase.from('produtos').update({ quantidade_estoque: novaQtd }).eq('id', item.produto_id);
      }
    }
    // 2. Excluir contas a pagar vinculadas
    await supabase.from('contas_pagar').delete().eq('compra_id', compra.id);
    // 3. Excluir itens da compra
    await supabase.from('compras_itens').delete().eq('compra_id', compra.id);
    // 4. Excluir a compra
    const { error } = await supabase.from('compras').delete().eq('id', compra.id);
    if (error) return addToast('Erro ao excluir: ' + error.message, 'error');
    addToast('Compra excluída e estoque revertido!');
    load();
  }

  const fmt = formatMoney;

  const filtered = compras.filter(c => {
    const q = search.toLowerCase();
    return (c.fornecedores?.nome || '').toLowerCase().includes(q) ||
      (c.numero_nota || '').toLowerCase().includes(q) ||
      (c.numero_pedido || '').toLowerCase().includes(q) ||
      (c.status || '').toLowerCase().includes(q) ||
      fmt(c.total).includes(search);
  });

  // KPIs comerciais
  const totalComprasGeral = compras.reduce((s, c) => s + (c.total || 0), 0);
  const totalPagas = compras.filter(c => c.status === 'finalizada').reduce((s, c) => s + (c.total || 0), 0);
  const totalPendente = totalComprasGeral - totalPagas;

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Compras</h2><p className="page-subtitle">{compras.length} compras registradas</p></div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Nova Compra
        </button>
      </div>

      {/* KPIs Comerciais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card"><div className="kpi-icon"><ShoppingCart size={20} /></div><div className="kpi-label">Total em Compras</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace' }}>{fmt(totalComprasGeral)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><DollarSign size={20} /></div><div className="kpi-label">Total Pago</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace', color: 'var(--color-success)' }}>{fmt(totalPagas)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><TrendingDown size={20} /></div><div className="kpi-label">Saldo Devedor</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace', color: totalPendente > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{fmt(totalPendente)}</div></div>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="🔍 Buscar por fornecedor, nota, pedido, status ou valor..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><ShoppingCart size={28} /></div><div className="empty-title">Nenhuma compra</div><div className="empty-text">Registre sua primeira compra.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data</th><th>Fornecedor</th><th>Nota</th><th>Itens</th><th style={{ textAlign: 'right' }}>Total (R$)</th><th>Status</th><th style={{ textAlign: 'center' }}>Ações</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{new Date(c.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{c.fornecedores?.nome || '—'}</td>
                  <td>{c.numero_nota || '—'}</td>
                  <td>{c.compras_itens?.length || 0}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: '0.5px', textAlign: 'right' }}>{fmt(c.total)}</td>
                  <td><span className={`badge ${c.status === 'finalizada' ? 'badge-success' : c.status === 'cancelada' ? 'badge-danger' : 'badge-warning'}`}>{c.status === 'finalizada' ? 'PAGO' : c.status === 'rascunho' ? 'PENDENTE' : c.status?.toUpperCase()}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Excluir compra" onClick={() => deleteCompra(c)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-gold)' }}>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Filtrado:</td>
                <td style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 'var(--text-base)', color: 'var(--color-gold)', textAlign: 'right' }}>{fmt(filtered.reduce((s, c) => s + (c.total || 0), 0))}</td>
                <td></td>
              </tr>
            </tfoot>
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div ref={fornDropdownRef} style={{ position: 'relative', flex: 1 }}>
                        <input
                          className="form-input"
                          placeholder="🔍 Buscar por nome, código (FORN-0001), CNPJ, telefone..."
                          value={fornSearch}
                          onChange={e => handleFornSearchChange(e.target.value)}
                          onFocus={handleFornFocus}
                          autoComplete="off"
                        />
                        {showFornDropdown && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: 'var(--color-bg-secondary, #1a1a2e)', border: '1px solid var(--color-glass-border)', borderRadius: '0 0 8px 8px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                            {fornSearchLoading ? (
                              <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>Buscando...</div>
                            ) : fornSearchResults.length === 0 ? (
                              <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>Nenhum fornecedor encontrado</div>
                            ) : fornSearchResults.map(f => (
                              <div
                                key={f.id}
                                onClick={() => selectFornecedor(f)}
                                style={{
                                  padding: '10px 12px', cursor: 'pointer',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                                  transition: 'background .15s',
                                  background: form.fornecedor_id === f.id ? 'rgba(201,169,110,0.15)' : 'transparent'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,169,110,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = form.fornecedor_id === f.id ? 'rgba(201,169,110,0.15)' : 'transparent'}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', fontSize: 11, background: 'rgba(201,169,110,0.1)', padding: '1px 6px', borderRadius: 4 }}>{f.codigo || '—'}</span>
                                    <span style={{ fontWeight: 600 }}>{f.nome}</span>
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                    {f.documento ? f.documento : ''}{f.telefone ? ` • ${f.telefone}` : ''}
                                  </span>
                                </div>
                                <span className={`badge ${f.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : f.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : f.status_financeiro === 'PARCIAL' ? 'badge-warning' : 'badge-gold'}`} style={{ fontSize: 10 }}>
                                  {f.status_financeiro || 'ADIMPLENTE'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowNovoFornecedor(true)} title="Novo Fornecedor">+</button>
                    </div>
                  </div>
                  <div className="form-group"><label className="form-label">Data</label><input type="date" className="form-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Nº Nota</label><input className="form-input" value={form.numero_nota} onChange={e => setForm({ ...form, numero_nota: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Nº Pedido</label><input className="form-input" value={form.numero_pedido} onChange={e => setForm({ ...form, numero_pedido: e.target.value })} /></div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Itens da Compra</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNovoProduto(true)}>+ Novo Produto</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Adicionar Item</button>
                    </div>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item adicionado.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Ref.</th><th>Produto (busca inteligente)</th><th>Qtd</th><th>Valor Unit.</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => {
                          const prodSel = produtos.find(p => p.id === item.produto_id);
                          const results = getFilteredProducts(idx);
                          return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'monospace', fontSize: '13px', minWidth: 80 }}>{prodSel?.referencia || '—'}</td>
                            <td style={{ position: 'relative', minWidth: 240 }}>
                              <input className="form-input" placeholder="🔍 Ref, nome, código ou valor..." value={prodSearches[idx] ?? (prodSel ? `${prodSel.referencia || ''} ${prodSel.nome}`.trim() : '')} onChange={e => handleProdSearch(idx, e.target.value)} onFocus={() => setProdDropdowns(prev => ({...prev, [idx]: true}))} style={{ fontFamily: 'inherit' }} />
                              {prodDropdowns[idx] && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: 'var(--color-bg-secondary, #1a1a2e)', border: '1px solid var(--color-glass-border)', borderRadius: '0 0 8px 8px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                                  {results.length === 0 ? <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>Nenhum produto encontrado</div> : results.slice(0, 10).map(p => (
                                    <div key={p.id} onClick={() => selectProduct(idx, p)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(201,169,110,0.1)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                      <div><span style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'monospace', marginRight: 8 }}>{p.referencia || p.codigo || '—'}</span><span>{p.nome}</span></div>
                                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>{fmt(p.custo_unitario)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td><input type="number" className="form-input" value={item.quantidade} onChange={e => updateCartItem(idx, 'quantidade', parseInt(e.target.value) || 0)} min="1" style={{ width: 80, textAlign: 'right' }} tabIndex={0} /></td>
                            <td><input type="number" step="0.01" className="form-input" value={toReal(item.valor_unitario)} onChange={e => updateCartItem(idx, 'valor_unitario', toCents(e.target.value))} style={{ width: 120, textAlign: 'right', fontFamily: 'monospace' }} tabIndex={0} /></td>
                            <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-gold)' }}>{fmt(item.quantidade * item.valor_unitario)}</td>
                            <td><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeCartItem(idx)} style={{ color: 'var(--color-danger)' }}><Trash2 size={14} /></button></td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div style={{ textAlign: 'right', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(201,169,110,0.08)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{cart.length} ite{cart.length === 1 ? 'm' : 'ns'}</span>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'monospace' }}>Total: <span className="text-gold">{fmt(cartTotal)}</span></span>
                  </div>
                </div>
                {/* Pagamentos */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                    <h4 style={{ fontFamily: 'var(--font-display)' }}>Pagamentos</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addPagamento}><Plus size={14} /> Adicionar Pagamento</button>
                  </div>

                  {pagamentos.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum pagamento definido.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {pagamentos.map((pag, idx) => (
                        <div key={pag.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', background: 'rgba(255,255,255,0.02)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Forma</label>
                            <select className="form-select" value={pag.forma_pagamento} onChange={e => updatePagamento(idx, 'forma_pagamento', e.target.value)}>
                              {formasPagamento.map(fp => <option key={fp.id} value={fp.nome}>{fp.nome}</option>)}
                              {formasPagamento.length === 0 && <option value="PIX">PIX</option>}
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Valor (R$)</label>
                            <input type="number" step="0.01" className="form-input" value={toReal(pag.valor)} onChange={e => updatePagamento(idx, 'valor', toCents(e.target.value))} style={{ width: 100 }} required />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Parcelas</label>
                            <input type="number" className="form-input" value={pag.parcelas} onChange={e => updatePagamento(idx, 'parcelas', parseInt(e.target.value) || 1)} min="1" max="24" style={{ width: 80 }} />
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
                      <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        Diferença de {fmt(Math.abs(cartTotal - pagamentosTotal))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={pagamentosTotal !== cartTotal || cartTotal === 0}>Finalizar Compra</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNovoFornecedor && (
        <div className="modal-backdrop" onClick={() => setShowNovoFornecedor(false)} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">Novo Fornecedor Rápido</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowNovoFornecedor(false)}><X size={20} /></button></div>
            <form onSubmit={handleSaveNovoFornecedor}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome Completo *</label><input className="form-input" value={novoFornecedorForm.nome} onChange={e => setNovoFornecedorForm({...novoFornecedorForm, nome: e.target.value})} required autoFocus /></div>
                <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={novoFornecedorForm.telefone} onChange={e => setNovoFornecedorForm({...novoFornecedorForm, telefone: e.target.value})} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNovoFornecedor(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Fornecedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNovoProduto && (
        <div className="modal-backdrop" onClick={() => setShowNovoProduto(false)} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">Novo Produto Rápido</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowNovoProduto(false)}><X size={20} /></button></div>
            <form onSubmit={handleSaveNovoProduto}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome do Produto *</label><input className="form-input" value={novoProdutoForm.nome} onChange={e => setNovoProdutoForm({...novoProdutoForm, nome: e.target.value})} required autoFocus /></div>
                <div className="form-group"><label className="form-label">Custo Unitário (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={novoProdutoForm.custo_unitario} onChange={e => setNovoProdutoForm({...novoProdutoForm, custo_unitario: e.target.value})} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNovoProduto(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Produto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
