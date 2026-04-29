import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Receipt, X, Trash2, Printer, CheckCircle, DollarSign, TrendingUp } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';

const fmt = formatMoney;
const fmtPag = { pix: 'PIX', dinheiro: 'Dinheiro', credito: 'Cartão Crédito', debito: 'Cartão Débito', boleto: 'Boleto', transferencia: 'Transferência', cheque: 'Cheque', crediario: 'Crediário' };

// ─── Recibo Premium PDF (print) ──────────────────────────────────────────────
function imprimirRecibo(venda, empresa) {
  const logoHtml = empresa?.logo_url
    ? `<img src="${empresa.logo_url}" alt="logo" style="height:72px;object-fit:contain;"/>`
    : `<div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#B8913A">UNA AURA</div>`;

  const itensHtml = (venda.vendas_itens || []).map((i, idx) =>
    `<tr style="background:${idx % 2 === 0 ? '#FAFAF7' : '#FFFFFF'}">
      <td style="padding:10px 14px;font-size:13px;color:#444">${i.produtos?.referencia ? `<span style="font-family:'Courier New',monospace;font-weight:700;color:#B8913A;font-size:11px;margin-right:6px">${i.produtos.referencia}</span>` : ''}${i.produtos?.nome || '—'}</td>
      <td style="padding:10px 14px;text-align:center;font-size:13px;color:#666">${i.quantidade}</td>
      <td style="padding:10px 14px;text-align:right;font-size:13px;font-family:'Courier New',monospace;color:#666">${fmt(i.valor_unitario)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:13px;font-family:'Courier New',monospace;font-weight:700;color:#1a1a2e">${fmt(i.quantidade * i.valor_unitario)}</td>
    </tr>`
  ).join('');

  const totalItens = (venda.vendas_itens || []).reduce((s, i) => s + i.quantidade, 0);

  const parcelasHtml = venda._parcelas?.length > 0
    ? `<div style="margin-top:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B8913A;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #E8E4DC">Condições de Pagamento</div>
        ${venda._parcelas.map((p, i) =>
          `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${i % 2 === 0 ? '#FAFAF7' : '#FFF'};border-radius:6px;margin-bottom:2px;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="background:#B8913A;color:#FFF;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${i + 1}/${venda._parcelas.length}</span>
              <span style="color:#666">${fmtPag[p.forma_pagamento] || p.forma_pagamento}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:12px;color:#999">Venc: ${new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              <span style="font-family:'Courier New',monospace;font-weight:700;color:#1a1a2e">${fmt(p.valor)}</span>
            </div>
          </div>`
        ).join('')}
      </div>`
    : '';

  const endParts = [empresa?.endereco, empresa?.numero, empresa?.bairro, empresa?.cidade, empresa?.estado].filter(Boolean);
  const enderecoEmpresa = endParts.join(', ');

  const dataVenda = new Date(venda.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Recibo #${venda.numero_pedido || venda.id?.substring(0,8)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',Arial,sans-serif;max-width:680px;margin:0 auto;padding:0;color:#1a1a2e;background:#FFF}
    @media print{body{padding:0;margin:0}@page{margin:15mm 10mm}}
  </style></head><body>

  <!-- Borda superior dourada -->
  <div style="height:6px;background:linear-gradient(90deg,#A68B4B,#C9A96E,#E2C992,#C9A96E,#A68B4B)"></div>

  <!-- Header Empresa -->
  <div style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #E8E4DC">
    ${logoHtml}
    <div style="margin-top:8px;font-size:11px;color:#999;letter-spacing:0.5px">
      ${empresa?.cnpj ? `CNPJ: ${empresa.cnpj}` : ''}
      ${empresa?.cnpj && enderecoEmpresa ? ' · ' : ''}
      ${enderecoEmpresa}
    </div>
    ${empresa?.telefone || empresa?.email ? `<div style="font-size:11px;color:#999;margin-top:2px">${[empresa?.telefone, empresa?.email].filter(Boolean).join(' · ')}</div>` : ''}
  </div>

  <!-- Título do Recibo -->
  <div style="padding:20px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E8E4DC">
    <div>
      <div style="font-size:22px;font-weight:800;color:#1a1a2e;letter-spacing:-0.5px">RECIBO DE VENDA</div>
      <div style="font-size:12px;color:#999;margin-top:2px">Documento não fiscal</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B8913A">Nº Pedido</div>
      <div style="font-size:20px;font-weight:800;color:#B8913A;font-family:'Courier New',monospace">${venda.numero_pedido || venda.id?.substring(0,8)}</div>
    </div>
  </div>

  <!-- Info Grid -->
  <div style="padding:16px 32px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;border-bottom:1px solid #E8E4DC;background:#FAFAF7">
    <div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#B8913A;margin-bottom:4px">Data</div>
      <div style="font-size:14px;font-weight:600;color:#333">${dataVenda}</div>
    </div>
    <div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#B8913A;margin-bottom:4px">Cliente</div>
      <div style="font-size:14px;font-weight:600;color:#333">${venda.clientes?.nome || 'Consumidor Final'}</div>
      ${venda.clientes?.documento ? `<div style="font-size:11px;color:#888;margin-top:2px">${venda.clientes.tipo === 'PF' ? 'CPF' : 'CNPJ'}: ${venda.clientes.documento}</div>` : ''}
      ${venda.clientes?.telefone ? `<div style="font-size:11px;color:#888">Tel: ${venda.clientes.telefone}</div>` : ''}
    </div>
    <div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#B8913A;margin-bottom:4px">Vendedor</div>
      <div style="font-size:14px;font-weight:600;color:#333">${venda.vendedores?.nome || '—'}</div>
    </div>
  </div>

  <!-- Tabela de Itens -->
  <div style="padding:20px 32px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B8913A;margin-bottom:12px">Itens da Venda</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid #C9A96E">
          <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999">Produto</th>
          <th style="padding:8px 14px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999">Qtd</th>
          <th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999">Unitário</th>
          <th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itensHtml}</tbody>
    </table>

    <!-- Total -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:14px 18px;background:linear-gradient(135deg,#B8913A,#C9A96E);border-radius:10px;color:#FFF">
      <div>
        <span style="font-size:12px;opacity:0.85">${totalItens} ite${totalItens === 1 ? 'm' : 'ns'}</span>
      </div>
      <div style="font-size:22px;font-weight:800;font-family:'Courier New',monospace;letter-spacing:1px">${fmt(venda.total)}</div>
    </div>

    ${parcelasHtml}

    ${venda.observacoes ? `<div style="margin-top:16px;padding:14px 16px;background:#FFFDE7;border-left:3px solid #C9A96E;border-radius:0 8px 8px 0;font-size:13px;color:#555"><strong style="color:#B8913A">Observações:</strong> ${venda.observacoes}</div>` : ''}
  </div>

  <!-- Assinaturas -->
  <div style="padding:30px 32px 10px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
    <div style="text-align:center">
      <div style="border-top:1px solid #ccc;padding-top:8px;font-size:12px;color:#666">Assinatura do Vendedor</div>
    </div>
    <div style="text-align:center">
      <div style="border-top:1px solid #ccc;padding-top:8px;font-size:12px;color:#666">Assinatura do Cliente</div>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 32px 20px;border-top:1px solid #E8E4DC;margin-top:16px">
    <div style="font-size:11px;color:#bbb;line-height:1.6">
      ${empresa?.nome || 'UNA AURA'} ${empresa?.email ? ' · ' + empresa.email : ''}
      <br/>Obrigada pela preferência! ✨
      <br/><span style="font-size:10px;color:#ddd">Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  </div>

  <!-- Borda inferior dourada -->
  <div style="height:6px;background:linear-gradient(90deg,#A68B4B,#C9A96E,#E2C992,#C9A96E,#A68B4B)"></div>

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
  const [showNovoCliente, setShowNovoCliente] = useState(false);
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: '', telefone: '' });
  const [showNovoProduto, setShowNovoProduto] = useState(false);
  const [novoProdutoForm, setNovoProdutoForm] = useState({ nome: '', preco_venda: '' });
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteResults, setClienteResults] = useState([]);
  const [clienteSearchLoading, setClienteSearchLoading] = useState(false);
  const clienteDropdownRef = useRef(null);
  const clienteSearchTimer = useRef(null);
  const [prodSearches, setProdSearches] = useState({});
  const [prodDropdowns, setProdDropdowns] = useState({});
  const searchTimers = useRef({});

  // Close client dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(e.target)) {
        setShowClienteDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Smart client search — live Supabase query with debounce
  function handleClienteSearch(value) {
    setClienteSearch(value);
    setShowClienteDropdown(true);
    if (!value) {
      setForm(prev => ({ ...prev, cliente_id: '' }));
      setClienteResults(clientes.slice(0, 15));
      return;
    }
    clearTimeout(clienteSearchTimer.current);
    clienteSearchTimer.current = setTimeout(async () => {
      setClienteSearchLoading(true);
      const q = value.trim();
      const { data } = await supabase
        .from('clientes')
        .select('id, nome, codigo, tipo, documento, telefone, email, status_financeiro')
        .or(`nome.ilike.%${q}%,codigo.ilike.%${q}%,documento.ilike.%${q}%,telefone.ilike.%${q}%`)
        .order('nome')
        .limit(15);
      setClienteResults(data || []);
      setClienteSearchLoading(false);
    }, 300);
  }

  // Load initial client results when dropdown opens
  function handleClienteFocus() {
    setShowClienteDropdown(true);
    if (clienteResults.length === 0 && !clienteSearch) {
      setClienteResults(clientes.slice(0, 15));
    }
  }

  function selectCliente(c) {
    setForm(prev => ({ ...prev, cliente_id: c.id }));
    setClienteSearch(`${c.codigo ? c.codigo + ' ' : ''}${c.nome}`.trim());
    setShowClienteDropdown(false);
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
      toReal(p.preco_venda).toFixed(2).includes(q)
    );
  }

  function selectProduct(idx, prod) {
    updateCartItem(idx, 'produto_id', prod.id);
    setProdSearches(prev => ({ ...prev, [idx]: `${prod.referencia || ''} ${prod.nome}`.trim() }));
    setProdDropdowns(prev => ({ ...prev, [idx]: false }));
  }

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: v }, { data: c }, { data: p }, { data: vend }, { data: emp }] = await Promise.all([
      supabase.from('vendas').select('id, data, numero_pedido, total, status, forma_pagamento, observacoes, cliente_id, vendedor_id, clientes(nome, documento, telefone, tipo), vendedores(nome), vendas_itens(id, quantidade, valor_unitario, produto_id, produtos(nome, referencia))').order('data', { ascending: false }).limit(100),
      supabase.from('clientes').select('id, nome, codigo, tipo, documento, telefone, email, status_financeiro').order('nome'),
      supabase.from('produtos').select('id, nome, codigo, referencia, preco_venda, quantidade_estoque').eq('ativo', true).order('nome'),
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
    setClienteSearch('');
    setProdSearches({});
    setProdDropdowns({});
    setShowModal(true);
  }

  async function handleSaveNovoCliente(e) {
    e.preventDefault();
    if (!novoClienteForm.nome) return addToast('Nome obrigatório', 'error');
    const { data, error } = await supabase.from('clientes').insert({ nome: novoClienteForm.nome, telefone: novoClienteForm.telefone }).select().single();
    if (error) return addToast('Erro: ' + error.message, 'error');
    setClientes([...clientes, data].sort((a,b)=>a.nome.localeCompare(b.nome)));
    setForm({ ...form, cliente_id: data.id });
    setClienteSearch(data.nome);
    setShowClienteDropdown(false);
    setShowNovoCliente(false);
    setNovoClienteForm({ nome: '', telefone: '' });
    addToast('Cliente cadastrado!');
  }

  async function handleSaveNovoProduto(e) {
    e.preventDefault();
    if (!novoProdutoForm.nome) return addToast('Nome obrigatório', 'error');
    const { data, error } = await supabase.from('produtos').insert({ nome: novoProdutoForm.nome, preco_venda: toCents(novoProdutoForm.preco_venda || '0'), ativo: true }).select().single();
    if (error) return addToast('Erro: ' + error.message, 'error');
    setProdutos([...produtos, data].sort((a,b)=>a.nome.localeCompare(b.nome)));
    setCart([...cart, { produto_id: data.id, quantidade: 1, valor_unitario: data.preco_venda }]);
    setShowNovoProduto(false);
    setNovoProdutoForm({ nome: '', preco_venda: '' });
    addToast('Produto cadastrado!');
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

    // 4. Gerar parcelas para CADA pagamento adicionado (BATCH INSERT otimizado)
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

        parcelasGeradas.push({
          venda_id: venda.id, 
          cliente_id: form.cliente_id || null,
          descricao: `Venda #${form.numero_pedido || venda.id.substring(0, 8)} - ${fmtPag[pag.forma_pagamento] || pag.forma_pagamento} ${parcelas > 1 ? `(${i + 1}/${parcelas})` : ''}`,
          valor: valFinal, 
          parcela: i + 1, 
          total_parcelas: parcelas,
          data_vencimento: dataVenc, 
          forma_pagamento: pag.forma_pagamento, 
          status: 'pendente'
        });
      }
    }
    // Batch insert — 1 query ao invés de N queries individuais
    if (parcelasGeradas.length > 0) {
      await supabase.from('contas_receber').insert(parcelasGeradas);
    }

    // 5. Recalcular status financeiro do cliente
    if (form.cliente_id) {
      await supabase.rpc('recalcular_status_cliente', { p_cliente_id: form.cliente_id }).catch(() => {});
    }

    // 6. Concluir
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

  const filtered = vendas.filter(v => {
    const q = search.toLowerCase();
    return (v.clientes?.nome || '').toLowerCase().includes(q) ||
      (v.numero_pedido || '').toLowerCase().includes(q) ||
      (v.vendedores?.nome || '').toLowerCase().includes(q) ||
      (v.status || '').toLowerCase().includes(q) ||
      fmt(v.total).includes(search);
  });

  // KPIs comerciais
  const totalVendasGeral = vendas.reduce((s, v) => s + (v.total || 0), 0);

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Vendas</h2><p className="page-subtitle">{vendas.length} vendas registradas</p></div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Nova Venda
        </button>
      </div>

      {/* KPIs de Vendas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card"><div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><TrendingUp size={20} /></div><div className="kpi-label">Faturamento Total</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace', color: 'var(--color-success)' }}>{fmt(totalVendasGeral)}</div></div>
        <div className="kpi-card"><div className="kpi-icon"><Receipt size={20} /></div><div className="kpi-label">Ticket Médio</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)', fontFamily: 'monospace' }}>{vendas.length > 0 ? fmt(Math.round(totalVendasGeral / vendas.length)) : 'R$ 0,00'}</div></div>
        <div className="kpi-card"><div className="kpi-icon"><DollarSign size={20} /></div><div className="kpi-label">Total de Vendas</div><div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{vendas.length}</div></div>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="🔍 Buscar por cliente, pedido, vendedor, status ou valor..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><Receipt size={28} /></div><div className="empty-title">Nenhuma venda</div><div className="empty-text">Registre a primeira venda.</div></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Pedido</th><th>Itens</th><th style={{ textAlign: 'right' }}>Total (R$)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.data).toLocaleDateString('pt-BR')}</td>
                  <td style={{ fontWeight: 500 }}>{v.clientes?.nome || 'Sem cliente'}</td>
                  <td style={{ color: 'var(--color-text-muted)' }}>{v.vendedores?.nome || '—'}</td>
                  <td>{v.numero_pedido || '—'}</td>
                  <td>{v.vendas_itens?.length || 0}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-success)', textAlign: 'right' }}>{fmt(v.total)}</td>
                  <td><span className={`badge ${v.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{v.status}</span></td>
                  <td>
                    <button className="btn btn-sm" title="Gerar Recibo" style={{ background: 'rgba(201,169,110,0.1)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.2)', gap: '4px', fontWeight: 600 }} onClick={async () => {
                      const { data: cRec } = await supabase.from('contas_receber').select('*').eq('venda_id', v.id);
                      imprimirRecibo({ ...v, _parcelas: cRec || [] }, empresa);
                    }}>
                      <Printer size={13} /> Recibo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-gold)' }}>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Filtrado:</td>
                <td style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 'var(--text-base)', color: 'var(--color-gold)', textAlign: 'right' }}>{fmt(filtered.reduce((s, v) => s + (v.total || 0), 0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div ref={clienteDropdownRef} style={{ position: 'relative', flex: 1 }}>
                        <input className="form-input" placeholder="🔍 Buscar por nome, código (CLI-0001), CPF/CNPJ ou telefone..." value={clienteSearch} onChange={e => handleClienteSearch(e.target.value)} onFocus={handleClienteFocus} autoComplete="off" />
                        {showClienteDropdown && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: 'var(--color-bg-secondary, #1a1a2e)', border: '1px solid var(--color-glass-border)', borderRadius: '0 0 8px 8px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                            <div onClick={() => { setForm(prev => ({...prev, cliente_id: ''})); setClienteSearch('Sem cliente'); setShowClienteDropdown(false); }} style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--color-text-muted)', fontStyle: 'italic', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Sem cliente</div>
                            {clienteSearchLoading ? (
                              <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>Buscando...</div>
                            ) : clienteResults.length === 0 ? (
                              <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>Nenhum cliente encontrado</div>
                            ) : clienteResults.map(c => (
                              <div key={c.id} onClick={() => selectCliente(c)} style={{
                                padding: '10px 12px', cursor: 'pointer',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background .15s',
                                background: form.cliente_id === c.id ? 'rgba(201,169,110,0.15)' : 'transparent'
                              }} onMouseEnter={e => e.currentTarget.style.background='rgba(201,169,110,0.1)'} onMouseLeave={e => e.currentTarget.style.background = form.cliente_id === c.id ? 'rgba(201,169,110,0.15)' : 'transparent'}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', fontSize: 11, background: 'rgba(201,169,110,0.1)', padding: '1px 6px', borderRadius: 4 }}>{c.codigo || '—'}</span>
                                    <span style={{ fontWeight: 600 }}>{c.nome}</span>
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                    {c.documento ? c.documento : ''}{c.telefone ? ` • ${c.telefone}` : ''}
                                  </span>
                                </div>
                                <span className={`badge ${c.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : c.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : c.status_financeiro === 'PARCIAL' ? 'badge-warning' : 'badge-gold'}`} style={{ fontSize: 10 }}>{c.status_financeiro || 'ADIMPLENTE'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowNovoCliente(true)} title="Novo Cliente">+</button>
                    </div>
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNovoProduto(true)}>+ Novo Produto</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addToCart}><Plus size={14} /> Item</button>
                    </div>
                  </div>
                  {cart.length === 0 ? <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhum item.</p> : (
                    <table className="data-table">
                      <thead><tr><th>Ref.</th><th>Produto (busca inteligente)</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr></thead>
                      <tbody>
                        {cart.map((item, idx) => {
                          const prodSel = produtos.find(p => p.id === item.produto_id);
                          const results = getFilteredProducts(idx);
                          return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'monospace', fontSize: 13, minWidth: 80 }}>{prodSel?.referencia || '—'}</td>
                            <td style={{ position: 'relative', minWidth: 240 }}>
                              <input className="form-input" placeholder="🔍 Ref, nome, código ou valor..." value={prodSearches[idx] ?? (prodSel ? `${prodSel.referencia || ''} ${prodSel.nome}`.trim() : '')} onChange={e => handleProdSearch(idx, e.target.value)} onFocus={() => setProdDropdowns(prev => ({...prev, [idx]: true}))} />
                              {prodDropdowns[idx] && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto', background: 'var(--color-bg-secondary, #1a1a2e)', border: '1px solid var(--color-glass-border)', borderRadius: '0 0 8px 8px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                                  {results.length === 0 ? <div style={{ padding: 12, color: 'var(--color-text-muted)', fontSize: 13 }}>Nenhum produto encontrado</div> : results.slice(0, 10).map(p => (
                                    <div key={p.id} onClick={() => selectProduct(idx, p)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(201,169,110,0.1)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                      <div><span style={{ fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'monospace', marginRight: 8 }}>{p.referencia || p.codigo || '—'}</span><span>{p.nome}</span><span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>({p.quantidade_estoque || 0} un.)</span></div>
                                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{fmt(p.preco_venda)}</span>
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
                  <div style={{ textAlign: 'right', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(74,222,128,0.08)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{cart.length} ite{cart.length === 1 ? 'm' : 'ns'}</span>
                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'monospace' }}>Total: <span style={{ color: 'var(--color-success)' }}>{fmt(cartTotal)}</span></span>
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

      {showNovoCliente && (
        <div className="modal-backdrop" onClick={() => setShowNovoCliente(false)} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">Novo Cliente Rápido</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowNovoCliente(false)}><X size={20} /></button></div>
            <form onSubmit={handleSaveNovoCliente}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome Completo *</label><input className="form-input" value={novoClienteForm.nome} onChange={e => setNovoClienteForm({...novoClienteForm, nome: e.target.value})} required autoFocus /></div>
                <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm({...novoClienteForm, telefone: e.target.value})} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNovoCliente(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar Cliente</button>
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
                <div className="form-group"><label className="form-label">Preço de Venda (R$)</label><input type="number" step="0.01" min="0" className="form-input" value={novoProdutoForm.preco_venda} onChange={e => setNovoProdutoForm({...novoProdutoForm, preco_venda: e.target.value})} /></div>
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
