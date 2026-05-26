import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import { Plus, Search, Receipt, X, Trash2, Printer, CheckCircle, DollarSign, TrendingUp, Eye, Edit3, MoreVertical, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatMoney, toCents, toReal, toLocalDateStr, todayStr } from '../lib/money';
import { logActivity } from '../lib/activityLogger';

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

  const subtotal = venda.total + (venda.desconto || 0);
  const discountRow = venda.desconto > 0
    ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:0 14px;font-size:13px;color:#666">
        <span>Subtotal</span>
        <span style="font-family:'Courier New',monospace">${fmt(subtotal)}</span>
       </div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding:0 14px;font-size:13px;color:#d9534f">
        <span>Desconto</span>
        <span style="font-family:'Courier New',monospace;font-weight:700">- ${fmt(venda.desconto)}</span>
       </div>`
    : '';

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
    ${discountRow}
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
  const { isAdmin } = useAuth();
  const [vendas, setVendas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ cliente_id: '', vendedor_id: '', data: todayStr(), numero_pedido: '', observacoes: '', desconto: 0 });
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

  // ─── Row Actions State ─────────────────────────────────────────────
  const [detailVenda, setDetailVenda] = useState(null);   // Modal Visualizar
  const [detailParcelas, setDetailParcelas] = useState([]);
  const [editVenda, setEditVenda] = useState(null);        // Modal Editar
  const [editForm, setEditForm] = useState({});
  const [openMenuId, setOpenMenuId] = useState(null);      // Dropdown menu

  // ─── Row Action Handlers ───────────────────────────────────────────
  async function handleViewDetail(v) {
    const { data: parcelas } = await supabase.from('contas_receber').select('*').eq('venda_id', v.id);
    setDetailParcelas(parcelas || []);
    setDetailVenda(v);
    setOpenMenuId(null);
  }

  async function handleEdit(v) {
    // Load full sale data (items + parcelas)
    const [{ data: itens }, { data: parcelas }] = await Promise.all([
      supabase.from('vendas_itens').select('id, produto_id, quantidade, valor_unitario, produtos(nome, referencia)').eq('venda_id', v.id),
      supabase.from('contas_receber').select('*').eq('venda_id', v.id),
    ]);
    const hasConfirmed = (parcelas || []).some(p => p.status === 'recebido' || p.status === 'confirmado');
    
    setEditForm({
      cliente_id: v.cliente_id || '',
      vendedor_id: v.vendedor_id || '',
      data: v.data || todayStr(),
      observacoes: v.observacoes || '',
      numero_pedido: v.numero_pedido || '',
      _hasConfirmed: hasConfirmed,
      desconto: v.desconto || 0,
    });
    // Populate edit cart
    const editItems = (itens || []).map(i => ({
      produto_id: i.produto_id,
      quantidade: i.quantidade,
      valor_unitario: i.valor_unitario,
      _nome: i.produtos ? `${i.produtos.referencia || ''} ${i.produtos.nome}`.trim() : '',
    }));
    setEditCart(editItems.length > 0 ? editItems : [{ produto_id: '', quantidade: 1, valor_unitario: 0, _nome: '' }]);
    
    // Reconstruct pagamentos from parcelas grouped by forma_pagamento
    const pagMap = {};
    (parcelas || []).forEach(p => {
      const key = p.forma_pagamento || 'pix';
      if (!pagMap[key]) pagMap[key] = { forma_pagamento: key, valor: 0, parcelas: 0, primeiro_vencimento: p.data_vencimento };
      pagMap[key].valor += p.valor;
      pagMap[key].parcelas = Math.max(pagMap[key].parcelas, p.total_parcelas || 1);
      if (p.data_vencimento < pagMap[key].primeiro_vencimento) pagMap[key].primeiro_vencimento = p.data_vencimento;
    });
    const editPags = Object.values(pagMap).map((p, i) => ({ ...p, id: Date.now() + i }));
    setEditPagamentos(editPags.length > 0 ? editPags : []);
    
    setEditVenda(v);
    setOpenMenuId(null);
  }

  // Edit cart & pagamentos state
  const [editCart, setEditCart] = useState([]);
  const [editPagamentos, setEditPagamentos] = useState([]);

  const editCartTotal = editCart.reduce((s, i) => s + (i.quantidade * i.valor_unitario), 0);
  const editPagTotal = editPagamentos.reduce((s, p) => s + (p.valor || 0), 0);

  function addEditCartItem() { setEditCart([...editCart, { produto_id: '', quantidade: 1, valor_unitario: 0, _nome: '' }]); }
  function updateEditCartItem(idx, field, value) {
    const items = [...editCart]; items[idx][field] = value;
    if (field === 'produto_id') {
      const prod = produtos.find(p => p.id === value);
      if (prod) { items[idx].valor_unitario = prod.preco_venda || 0; items[idx]._nome = `${prod.referencia || ''} ${prod.nome}`.trim(); }
    }
    setEditCart(items);
  }
  function removeEditCartItem(idx) { setEditCart(editCart.filter((_, i) => i !== idx)); }
  function addEditPag() {
    const finalTotal = Math.max(0, editCartTotal - (editForm.desconto || 0));
    const rem = Math.max(0, finalTotal - editPagTotal);
    setEditPagamentos([...editPagamentos, { id: Date.now(), forma_pagamento: 'pix', valor: rem, parcelas: 1, primeiro_vencimento: editForm.data || todayStr() }]);
  }
  function updateEditPag(idx, field, value) { const p = [...editPagamentos]; p[idx][field] = value; setEditPagamentos(p); }
  function removeEditPag(idx) { setEditPagamentos(editPagamentos.filter((_, i) => i !== idx)); }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (editCart.length === 0 || editCart.some(i => !i.produto_id)) return addToast('Adicione e selecione todos os produtos', 'error');
    if (editPagamentos.length === 0) return addToast('Adicione ao menos uma forma de pagamento', 'error');
    const finalEditTotal = Math.max(0, editCartTotal - (editForm.desconto || 0));
    if (editPagTotal !== finalEditTotal) return addToast(`Soma pagamentos (${fmt(editPagTotal)}) ≠ total (${fmt(finalEditTotal)})`, 'error');

    const vendaId = editVenda.id;

    // 1. Update venda header
    const { error } = await supabase.from('vendas').update({
      cliente_id: editForm.cliente_id || null,
      vendedor_id: editForm.vendedor_id || null,
      data: editForm.data,
      observacoes: editForm.observacoes,
      total: finalEditTotal,
      desconto: editForm.desconto || 0,
      forma_pagamento: editPagamentos.length > 1 ? 'Múltiplo' : editPagamentos[0].forma_pagamento,
    }).eq('id', vendaId);
    if (error) return addToast('Erro: ' + error.message, 'error');

    // 2. Replace items (delete old, insert new)
    if (!editForm._hasConfirmed) {
      await supabase.from('vendas_itens').delete().eq('venda_id', vendaId);
      const itens = editCart.map(i => ({ venda_id: vendaId, produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario }));
      await supabase.from('vendas_itens').insert(itens);
    }

    // 3. Recreate parcelas (delete pending ones, insert new)
    await supabase.from('contas_receber').delete().eq('venda_id', vendaId).eq('status', 'pendente');
    const parcelasGeradas = [];
    for (const pag of editPagamentos) {
      const numParcelas = parseInt(pag.parcelas) || 1;
      const valorParcela = Math.round(pag.valor / numParcelas);
      const baseVenc = new Date((pag.primeiro_vencimento || editForm.data) + 'T12:00:00');
      for (let i = 0; i < numParcelas; i++) {
        const venc = new Date(baseVenc); venc.setMonth(venc.getMonth() + i);
        const valFinal = i === numParcelas - 1 ? pag.valor - (valorParcela * (numParcelas - 1)) : valorParcela;
        parcelasGeradas.push({
          venda_id: vendaId, cliente_id: editForm.cliente_id || null,
          descricao: `Venda #${editForm.numero_pedido || vendaId.substring(0,8)} - ${fmtPag[pag.forma_pagamento] || pag.forma_pagamento}${numParcelas > 1 ? ` (${i+1}/${numParcelas})` : ''}`,
          valor: valFinal, parcela: i + 1, total_parcelas: numParcelas,
          data_vencimento: toLocalDateStr(venc), forma_pagamento: pag.forma_pagamento, status: 'pendente',
        });
      }
    }
    if (parcelasGeradas.length > 0) await supabase.from('contas_receber').insert(parcelasGeradas);

    logActivity('UPDATE', 'venda', vendaId, `Editou venda #${editForm.numero_pedido || vendaId.substring(0,8)}`);
    addToast('Venda atualizada com sucesso!');
    setEditVenda(null);
    load();
  }

  async function handleDelete(v) {
    if (!isAdmin) return addToast('Apenas administradores podem excluir vendas.', 'error');
    if (!confirm(`Tem certeza que deseja excluir a venda #${v.numero_pedido || v.id.substring(0,8)}? Esta ação não pode ser desfeita.`)) return;
    // Soft delete: mark as deleted
    const { error } = await supabase.from('vendas').update({ is_deleted: true }).eq('id', v.id);
    if (error) return addToast('Erro ao excluir: ' + error.message, 'error');
    // Also soft-delete related items
    await supabase.from('vendas_itens').update({ is_deleted: true }).eq('venda_id', v.id);
    await supabase.from('contas_receber').update({ is_deleted: true }).eq('venda_id', v.id);
    logActivity('DELETE', 'venda', v.id, `Excluiu venda #${v.numero_pedido || v.id.substring(0,8)}`, { total: v.total });
    addToast('Venda excluída com sucesso!');
    setOpenMenuId(null);
    load();
  }

  async function handlePrint(v) {
    const { data: cRec } = await supabase.from('contas_receber').select('*').eq('venda_id', v.id);
    imprimirRecibo({ ...v, _parcelas: cRec || [] }, empresa);
    setOpenMenuId(null);
  }

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
      supabase.from('vendas').select('id, data, numero_pedido, total, status, forma_pagamento, desconto, observacoes, cliente_id, vendedor_id, clientes(nome, documento, telefone, tipo), vendedores(nome), vendas_itens(id, quantidade, valor_unitario, produto_id, produtos(nome, referencia))').order('data', { ascending: false }).limit(100),
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
    const defaultData = form.data || todayStr();
    const finalTotal = Math.max(0, cartTotal - (form.desconto || 0));
    const remanescente = Math.max(0, finalTotal - pagamentosTotal);
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
    setForm({ cliente_id: '', vendedor_id: '', data: todayStr(), numero_pedido: uniqueId, observacoes: '', desconto: 0 });
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
    const finalTotal = Math.max(0, cartTotal - (form.desconto || 0));
    if (pagamentosTotal !== finalTotal) return addToast('A soma dos pagamentos não bate com o total da venda', 'error');
    
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
      total: finalTotal, 
      desconto: form.desconto || 0,
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
        const dataVenc = toLocalDateStr(vencimento);
        
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
      try {
        const { error: rpcErr } = await supabase.rpc('recalcular_status_cliente', { p_cliente_id: form.cliente_id });
        if (rpcErr) throw rpcErr;
      } catch (e) {
        console.error('Erro ao recalcular status do cliente:', e);
        addToast('Aviso: erro ao atualizar status do cliente: ' + (e.message || e), 'error');
      }
    }

    // 6. Concluir
    const { data: vendaCompleta } = await supabase.from('vendas')
      .select('*, clientes(nome), vendedores(nome), vendas_itens(*, produtos(nome))')
      .eq('id', venda.id).single();

    addToast('Venda registrada com sucesso!');
    logActivity('CREATE', 'venda', venda.id, `Venda #${form.numero_pedido || venda.id.substring(0,8)}`, {
      total: finalTotal, itens: cart.length, parcelas: parcelasGeradas.length,
      cliente: vendaCompleta?.clientes?.nome || null,
    });
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
      (v.vendas_itens || []).some(item => 
        (item.produtos?.nome || '').toLowerCase().includes(q) ||
        (item.produtos?.referencia || '').toLowerCase().includes(q)
      ) ||
      fmt(v.total).includes(search);
  });

  // KPIs comerciais
  const totalVendasGeral = vendas.reduce((s, v) => s + (v.total || 0), 0);

  const exportarRelatorioPDF = () => {
    const doc = new jsPDF('landscape');
    
    // Configurações do layout do PDF - Estilo Corporativo Elegante
    doc.setFillColor(13, 13, 18);
    doc.rect(0, 0, doc.internal.pageSize.width, 35, 'F');
    
    doc.setTextColor(201, 169, 110);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text('UNA AURA', 14, 22);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text('Relatório de Vendas', 65, 22);
    
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, doc.internal.pageSize.width - 60, 22);

    let y = 50;
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text('Resumo de Vendas', 14, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    doc.text(`Total de Vendas: ${vendas.length}`, 14, y);
    doc.text(`Faturamento: ${fmt(totalVendasGeral)}`, 90, y);
    doc.text(`Ticket Médio: ${vendas.length > 0 ? fmt(Math.round(totalVendasGeral / vendas.length)) : 'R$ 0,00'}`, 170, y);
    
    y += 20;

    const head = [['Data', 'Cliente', 'Vendedor', 'Pedido', 'Itens', 'Total', 'Status']];
    const body = filtered.map(v => [
      new Date(v.data).toLocaleDateString('pt-BR'),
      v.clientes?.nome || 'Sem cliente',
      v.vendedores?.nome || '—',
      v.numero_pedido || '—',
      v.vendas_itens?.length || 0,
      fmt(v.total),
      v.status
    ]);

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

    doc.save(`UNA_AURA_Vendas_${new Date().toISOString().split('T')[0]}.pdf`);
    addToast('Relatório PDF exportado com sucesso!');
  };

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Vendas</h2><p className="page-subtitle">{vendas.length} vendas registradas</p></div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportarRelatorioPDF} style={{ borderColor: 'var(--color-gold)', color: 'var(--color-gold)' }}>
            <FileText size={18} /> Exportar PDF
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} /> Nova Venda
          </button>
        </div>
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
          <input type="text" className="form-input" placeholder="🔍 Buscar por cliente, produto, referência, pedido, vendedor, status ou valor..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
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
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Visualizar" onClick={() => handleViewDetail(v)} style={{ color: 'var(--color-info)' }}><Eye size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => handleEdit(v)} style={{ color: 'var(--color-gold)' }}><Edit3 size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Imprimir Recibo" onClick={() => handlePrint(v)} style={{ color: 'var(--color-success)' }}><Printer size={15} /></button>
                      {isAdmin && <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => handleDelete(v)} style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>}
                    </div>
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

                  {/* Resumo Financeiro com Desconto */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-4)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-glass-border)',
                    marginBottom: 'var(--space-4)'
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</div>
                      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}>{fmt(cartTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desconto (R$)</div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        max={toReal(cartTotal)} 
                        className="form-input" 
                        value={toReal(form.desconto || 0)} 
                        onChange={e => {
                          const val = toCents(e.target.value);
                          setForm(prev => ({ ...prev, desconto: Math.min(val, cartTotal) }));
                        }}
                        style={{ height: '36px', fontSize: 14, fontFamily: 'monospace', width: '100%', marginTop: 4 }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total a Pagar</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-success)', marginTop: 4 }}>{fmt(Math.max(0, cartTotal - (form.desconto || 0)))}</div>
                    </div>
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
                    {pagamentosTotal !== finalTotal && (
                      <div style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <X size={14}/> Diferença de {fmt(Math.abs(finalTotal - pagamentosTotal))}
                      </div>
                    )}
                    {pagamentosTotal === finalTotal && finalTotal > 0 && (
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
                <button type="submit" className="btn btn-primary" disabled={pagamentosTotal !== finalTotal || cartTotal === 0}>Finalizar Venda</button>
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

      {/* ══════ MODAL: Visualizar Detalhes (Somente Leitura) ══════ */}
      {detailVenda && (
        <div className="modal-backdrop" onClick={() => setDetailVenda(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Eye size={20} style={{ color: 'var(--color-info)' }} /> Detalhes da Venda</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setDetailVenda(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Nº Pedido</div><div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-lg)' }}>{detailVenda.numero_pedido || detailVenda.id?.substring(0,8)}</div></div>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Data</div><div style={{ fontWeight: 600 }}>{new Date(detailVenda.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Status</div><span className={`badge ${detailVenda.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{detailVenda.status}</span></div>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cliente</div><div style={{ fontWeight: 500 }}>{detailVenda.clientes?.nome || 'Consumidor Final'}</div></div>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Vendedor</div><div>{detailVenda.vendedores?.nome || '—'}</div></div>
                <div><div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Pagamento</div><div>{fmtPag[detailVenda.forma_pagamento] || detailVenda.forma_pagamento || '—'}</div></div>
              </div>

              {/* Itens */}
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}><Receipt size={16} /> Itens da Venda</h4>
              <table className="data-table" style={{ marginBottom: 'var(--space-4)' }}>
                <thead><tr><th>Ref.</th><th>Produto</th><th style={{ textAlign: 'center' }}>Qtd</th><th style={{ textAlign: 'right' }}>Unitário</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                <tbody>
                  {(detailVenda.vendas_itens || []).map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', fontSize: 12 }}>{item.produtos?.referencia || '—'}</td>
                      <td>{item.produtos?.nome || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantidade}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(item.valor_unitario)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(item.quantidade * item.valor_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', padding: 'var(--space-3) var(--space-4)', background: 'rgba(74,222,128,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', gap: 4 }}>
                {detailVenda.desconto > 0 && (
                  <>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>Subtotal: {fmt(detailVenda.total + detailVenda.desconto)}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)', fontFamily: 'monospace' }}>Desconto: -{fmt(detailVenda.desconto)}</div>
                  </>
                )}
                <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-success)' }}>Total: {fmt(detailVenda.total)}</span>
              </div>

              {/* Parcelas / Pagamento */}
              {detailParcelas.length > 0 && (
                <>
                  <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}><DollarSign size={16} /> Parcelas / Status do Pagamento</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {detailParcelas.map((p, i) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: 'var(--color-gold)', color: '#FFF', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{p.parcela}/{p.total_parcelas}</span>
                          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{fmtPag[p.forma_pagamento] || p.forma_pagamento}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Venc: {p.data_vencimento ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(p.valor)}</span>
                          <span className={`badge ${p.status === 'recebido' ? 'badge-success' : p.status === 'vencido' ? 'badge-danger' : 'badge-warning'}`}>{p.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detailVenda.observacoes && (
                <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(201,169,110,0.06)', borderLeft: '3px solid var(--color-gold)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
                  <strong style={{ color: 'var(--color-gold)', fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>Observações:</strong>
                  <div style={{ marginTop: 4, fontSize: 'var(--text-sm)' }}>{detailVenda.observacoes}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => handlePrint(detailVenda)}><Printer size={14} /> Imprimir Recibo</button>
              <button className="btn btn-primary" onClick={() => setDetailVenda(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL: Editar Venda Completa ══════ */}
      {editVenda && (
        <div className="modal-backdrop" onClick={() => setEditVenda(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Edit3 size={18} style={{ color: 'var(--color-gold)' }} /> Editar Venda #{editForm.numero_pedido || editVenda.id?.substring(0,8)}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditVenda(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                {editForm._hasConfirmed && (
                  <div style={{ padding: 'var(--space-3)', background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-warning)' }}>
                    ⚠️ Pagamentos já confirmados. Os itens não serão alterados, mas as parcelas pendentes serão recriadas.
                  </div>
                )}

                {/* Header Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Cliente</label>
                    <select className="form-select" value={editForm.cliente_id} onChange={e => setEditForm({ ...editForm, cliente_id: e.target.value })}>
                      <option value="">Sem cliente</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.codigo ? c.codigo + ' ' : ''}{c.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vendedor</label>
                    <select className="form-select" value={editForm.vendedor_id} onChange={e => setEditForm({ ...editForm, vendedor_id: e.target.value })}>
                      <option value="">Sem vendedor</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data</label>
                    <input type="date" className="form-input" value={editForm.data} onChange={e => setEditForm({ ...editForm, data: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Observações</label>
                    <input className="form-input" value={editForm.observacoes} onChange={e => setEditForm({ ...editForm, observacoes: e.target.value })} placeholder="Observações..." />
                  </div>
                </div>

                {/* ── Itens ── */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label className="form-label" style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-gold)' }}>Itens da Venda</label>
                    {!editForm._hasConfirmed && <button type="button" className="btn btn-secondary btn-sm" onClick={addEditCartItem}><Plus size={14} /> Item</button>}
                  </div>
                  {editCart.map((item, idx) => {
                    const prod = produtos.find(p => p.id === item.produto_id);
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 36px', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-glass)', borderRadius: 'var(--radius-sm)' }}>
                        <select className="form-select" value={item.produto_id} onChange={e => updateEditCartItem(idx, 'produto_id', e.target.value)} disabled={editForm._hasConfirmed} style={{ fontSize: 'var(--text-sm)' }}>
                          <option value="">Selecione...</option>
                          {produtos.map(p => <option key={p.id} value={p.id}>{p.referencia ? p.referencia + ' ' : ''}{p.nome}</option>)}
                        </select>
                        <input type="number" min="1" className="form-input" value={item.quantidade} onChange={e => updateEditCartItem(idx, 'quantidade', parseInt(e.target.value) || 1)} disabled={editForm._hasConfirmed} style={{ textAlign: 'center', fontSize: 'var(--text-sm)' }} placeholder="Qtd" />
                        <input type="number" step="0.01" min="0" className="form-input" value={toReal(item.valor_unitario)} onChange={e => updateEditCartItem(idx, 'valor_unitario', toCents(e.target.value))} disabled={editForm._hasConfirmed} style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 'var(--text-sm)' }} placeholder="R$" />
                        {!editForm._hasConfirmed && editCart.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeEditCartItem(idx)} style={{ color: 'var(--color-danger)', padding: 2 }}><Trash2 size={14} /></button>
                        )}
                        {editForm._hasConfirmed && <div />}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-2) 0', fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-gold)' }}>
                    Subtotal: {fmt(editCartTotal)}
                  </div>
                </div>

                {/* ── Pagamentos ── */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label className="form-label" style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-gold)' }}>Formas de Pagamento</label>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addEditPag}><Plus size={14} /> Pagamento</button>
                  </div>

                  {/* Resumo Financeiro com Desconto para Edição */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-4)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-glass-border)',
                    marginBottom: 'var(--space-4)'
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</div>
                      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}>{fmt(editCartTotal)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desconto (R$)</div>
                      <input 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        max={toReal(editCartTotal)} 
                        className="form-input" 
                        value={toReal(editForm.desconto || 0)} 
                        onChange={e => {
                          const val = toCents(e.target.value);
                          setEditForm(prev => ({ ...prev, desconto: Math.min(val, editCartTotal) }));
                        }}
                        style={{ height: '36px', fontSize: 14, fontFamily: 'monospace', width: '100%', marginTop: 4 }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total a Pagar</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-success)', marginTop: 4 }}>{fmt(Math.max(0, editCartTotal - (editForm.desconto || 0)))}</div>
                    </div>
                  </div>

                  {editPagamentos.map((pag, idx) => (
                    <div key={pag.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 70px 120px 36px', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-glass)', borderRadius: 'var(--radius-sm)' }}>
                      <select className="form-select" value={pag.forma_pagamento} onChange={e => updateEditPag(idx, 'forma_pagamento', e.target.value)} style={{ fontSize: 'var(--text-sm)' }}>
                        <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="credito">Crédito</option><option value="debito">Débito</option><option value="boleto">Boleto</option><option value="transferencia">Transferência</option><option value="cheque">Cheque</option><option value="crediario">Crediário</option>
                      </select>
                      <input type="number" step="0.01" min="0" className="form-input" value={toReal(pag.valor)} onChange={e => updateEditPag(idx, 'valor', toCents(e.target.value))} style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 'var(--text-sm)' }} placeholder="R$" />
                      <input type="number" min="1" max="48" className="form-input" value={pag.parcelas} onChange={e => updateEditPag(idx, 'parcelas', parseInt(e.target.value) || 1)} style={{ textAlign: 'center', fontSize: 'var(--text-sm)' }} title="Parcelas" />
                      <input type="date" className="form-input" value={pag.primeiro_vencimento} onChange={e => updateEditPag(idx, 'primeiro_vencimento', e.target.value)} style={{ fontSize: 'var(--text-xs)' }} title="1º Vencimento" />
                      {editPagamentos.length > 1 && (
                        <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeEditPag(idx)} style={{ color: 'var(--color-danger)', padding: 2 }}><Trash2 size={14} /></button>
                      )}
                      {editPagamentos.length <= 1 && <div />}
                    </div>
                  ))}
                  {editPagamentos.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-2) 0', fontFamily: 'monospace', fontWeight: 600, fontSize: 'var(--text-sm)', color: editPagTotal === finalEditTotal ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      Pagamentos: {fmt(editPagTotal)} {editPagTotal !== finalEditTotal && `(falta ${fmt(Math.abs(finalEditTotal - editPagTotal))})`}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditVenda(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={editPagTotal !== finalEditTotal}>Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
