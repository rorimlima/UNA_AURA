import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import {
  Building2, Upload, Save, Plus, Trash2, Edit2, X, Check,
  User, Phone, Mail, MapPin, Hash, Percent, Camera,
  CreditCard, Landmark, DollarSign
} from 'lucide-react';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function maskCNPJ(v) {
  return v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
}
function maskCPF(v) {
  return v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
}
function maskCEP(v) {
  return v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2');
}
function maskPhone(v) {
  return v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{4})$/,'$1-$2');
}

const EMPTY_EMPRESA = { nome:'', razao_social:'', cnpj:'', telefone:'', email:'', endereco:'', numero:'', complemento:'', bairro:'', cidade:'', estado:'SP', cep:'', logo_url:'' };
const EMPTY_VENDEDOR = { nome:'', cpf:'', email:'', telefone:'', comissao_pct:0, ativo:true };
const EMPTY_CONTA = { nome:'', banco:'', codigo_banco:'', agencia:'', numero_conta:'', tipo_conta:'corrente', titular:'', saldo_inicial:0 };
const EMPTY_FORMA = { nome:'', tipo:'a_vista', pagamento_imediato:true };

export default function Empresa() {
  const { addToast } = useToast();
  const [empresa, setEmpresa] = useState(EMPTY_EMPRESA);
  const [empresaId, setEmpresaId] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [showVendedorModal, setShowVendedorModal] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState(null);
  const [vendedorForm, setVendedorForm] = useState(EMPTY_VENDEDOR);
  const [showContaModal, setShowContaModal] = useState(false);
  const [editingConta, setEditingConta] = useState(null);
  const [contaForm, setContaForm] = useState(EMPTY_CONTA);
  const [showFormaModal, setShowFormaModal] = useState(false);
  const [editingForma, setEditingForma] = useState(null);
  const [formaForm, setFormaForm] = useState(EMPTY_FORMA);
  const fileInputRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: emp }, { data: vend }, { data: contas }, { data: formas }] = await Promise.all([
      supabase.from('empresa').select('*').limit(1).maybeSingle(),
      supabase.from('vendedores').select('*').order('nome'),
      supabase.from('contas_bancarias').select('*').order('nome'),
      supabase.from('formas_pagamento').select('*').order('nome'),
    ]);
    if (emp) { setEmpresa(emp); setEmpresaId(emp.id); }
    setVendedores(vend || []);
    setContasBancarias(contas || []);
    setFormasPagamento(formas || []);
    setLoading(false);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return addToast('Imagem muito grande (máx. 3MB)', 'error');
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `logo.${ext}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    if (error) { addToast('Erro no upload: ' + error.message, 'error'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
    setEmpresa(prev => ({ ...prev, logo_url: publicUrl + '?t=' + Date.now() }));
    setUploading(false);
    addToast('Logo enviada com sucesso!');
  }

  async function handleCEP(cep) {
    const raw = cep.replace(/\D/g,'');
    if (raw.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setEmpresa(prev => ({
          ...prev,
          endereco: data.logradouro || prev.endereco,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
        addToast('Endereço preenchido via CEP!');
      }
    } catch {}
    setCepLoading(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...empresa };
    delete payload.id; delete payload.created_at; delete payload.updated_at;
    let error;
    if (empresaId) {
      ({ error } = await supabase.from('empresa').update(payload).eq('id', empresaId));
    } else {
      const { data, error: e2 } = await supabase.from('empresa').insert(payload).select().single();
      error = e2;
      if (data) setEmpresaId(data.id);
    }
    if (error) addToast('Erro ao salvar: ' + error.message, 'error');
    else addToast('Dados da empresa salvos!');
    setSaving(false);
  }

  function openNewVendedor() { setEditingVendedor(null); setVendedorForm(EMPTY_VENDEDOR); setShowVendedorModal(true); }
  function openEditVendedor(v) { setEditingVendedor(v); setVendedorForm({ ...v }); setShowVendedorModal(true); }

  async function saveVendedor(e) {
    e.preventDefault();
    const payload = { ...vendedorForm };
    let error;
    if (editingVendedor) {
      ({ error } = await supabase.from('vendedores').update(payload).eq('id', editingVendedor.id));
    } else {
      delete payload.id;
      ({ error } = await supabase.from('vendedores').insert(payload));
    }
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast(editingVendedor ? 'Vendedor atualizado!' : 'Vendedor cadastrado!');
    setShowVendedorModal(false);
    load();
  }

  async function deleteVendedor(id) {
    if (!confirm('Remover este vendedor?')) return;
    await supabase.from('vendedores').delete().eq('id', id);
    addToast('Vendedor removido.');
    load();
  }

  async function toggleAtivo(v) {
    await supabase.from('vendedores').update({ ativo: !v.ativo }).eq('id', v.id);
    load();
  }

  // ── Contas Bancárias ──
  function openNewConta() { setEditingConta(null); setContaForm(EMPTY_CONTA); setShowContaModal(true); }
  function openEditConta(c) { setEditingConta(c); setContaForm({ ...c }); setShowContaModal(true); }

  async function saveConta(e) {
    e.preventDefault();
    if (!contaForm.nome || !contaForm.banco || !contaForm.agencia || !contaForm.numero_conta)
      return addToast('Preencha nome, banco, agência e conta', 'error');
    const payload = { ...contaForm, saldo_atual: contaForm.saldo_inicial };
    let error;
    if (editingConta) {
      ({ error } = await supabase.from('contas_bancarias').update(payload).eq('id', editingConta.id));
    } else {
      delete payload.id;
      ({ error } = await supabase.from('contas_bancarias').insert(payload));
    }
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast(editingConta ? 'Conta atualizada!' : 'Conta cadastrada!');
    setShowContaModal(false); load();
  }

  async function deleteConta(id) {
    if (!confirm('Remover esta conta bancária?')) return;
    await supabase.from('contas_bancarias').delete().eq('id', id);
    addToast('Conta removida.'); load();
  }

  async function toggleContaAtiva(c) {
    await supabase.from('contas_bancarias').update({ ativa: !c.ativa }).eq('id', c.id);
    load();
  }

  // ── Formas de Pagamento ──
  function openNewForma() { setEditingForma(null); setFormaForm(EMPTY_FORMA); setShowFormaModal(true); }
  function openEditForma(f) { setEditingForma(f); setFormaForm({ ...f }); setShowFormaModal(true); }

  async function saveForma(e) {
    e.preventDefault();
    if (!formaForm.nome) return addToast('Informe o nome da forma de pagamento', 'error');
    const payload = { ...formaForm };
    let error;
    if (editingForma) {
      ({ error } = await supabase.from('formas_pagamento').update(payload).eq('id', editingForma.id));
    } else {
      delete payload.id;
      ({ error } = await supabase.from('formas_pagamento').insert(payload));
    }
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast(editingForma ? 'Forma atualizada!' : 'Forma cadastrada!');
    setShowFormaModal(false); load();
  }

  async function deleteForma(id) {
    if (!confirm('Remover esta forma de pagamento?')) return;
    await supabase.from('formas_pagamento').delete().eq('id', id);
    addToast('Forma removida.'); load();
  }

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">Dados da Empresa</h2>
          <p className="page-subtitle">Configurações gerais · logo usada em PDFs e relatórios</p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Logo + Nome Section */}
        <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
            <Building2 size={18} className="text-gold" /> Identidade da Empresa
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Logo upload */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 140, height: 140, borderRadius: 'var(--radius-xl)',
                  border: '2px dashed var(--color-gold)',
                  background: 'rgba(201,169,110,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                  transition: 'all 0.2s'
                }}
                title="Clique para enviar a logo"
              >
                {empresa.logo_url ? (
                  <>
                    <img src={empresa.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="logo-overlay">
                      <Camera size={28} color="white" />
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {uploading ? <div className="spinner" /> : <><Upload size={28} /><div style={{ fontSize: 'var(--text-xs)', marginTop: 8 }}>Enviar Logo</div></>}
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>PNG, SVG ou JPG<br/>Máx. 3MB</span>
            </div>

            {/* Nome e Razão Social */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', minWidth: 300 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nome Fantasia *</label>
                <input className="form-input" value={empresa.nome} onChange={e => setEmpresa({ ...empresa, nome: e.target.value })} required placeholder="Ex.: UNA AURA Semijoias" />
              </div>
              <div className="form-group">
                <label className="form-label">Razão Social</label>
                <input className="form-input" value={empresa.razao_social} onChange={e => setEmpresa({ ...empresa, razao_social: e.target.value })} placeholder="Ex.: Una Aura Ltda." />
              </div>
              <div className="form-group">
                <label className="form-label"><Hash size={14} /> CNPJ</label>
                <input className="form-input" value={empresa.cnpj} onChange={e => setEmpresa({ ...empresa, cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0001-00" maxLength={18} />
              </div>
              <div className="form-group">
                <label className="form-label"><Phone size={14} /> Telefone</label>
                <input className="form-input" value={empresa.telefone} onChange={e => setEmpresa({ ...empresa, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
              <div className="form-group">
                <label className="form-label"><Mail size={14} /> E-mail</label>
                <input type="email" className="form-input" value={empresa.email} onChange={e => setEmpresa({ ...empresa, email: e.target.value })} placeholder="contato@empresa.com" />
              </div>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="glass-card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>
            <MapPin size={18} className="text-gold" /> Endereço
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">CEP {cepLoading && <span style={{ color: 'var(--color-gold)', fontSize: 11 }}>buscando...</span>}</label>
              <input className="form-input" value={empresa.cep} maxLength={9}
                onChange={e => { const v = maskCEP(e.target.value); setEmpresa({ ...empresa, cep: v }); if (v.replace(/\D/g,'').length === 8) handleCEP(v); }}
                placeholder="00000-000" />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Logradouro</label>
              <input className="form-input" value={empresa.endereco} onChange={e => setEmpresa({ ...empresa, endereco: e.target.value })} placeholder="Rua, Av., Travessa..." />
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-input" value={empresa.numero} onChange={e => setEmpresa({ ...empresa, numero: e.target.value })} placeholder="123" />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-input" value={empresa.complemento} onChange={e => setEmpresa({ ...empresa, complemento: e.target.value })} placeholder="Sala, Apto..." />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-input" value={empresa.bairro} onChange={e => setEmpresa({ ...empresa, bairro: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-input" value={empresa.cidade} onChange={e => setEmpresa({ ...empresa, cidade: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={empresa.estado} onChange={e => setEmpresa({ ...empresa, estado: e.target.value })}>
                {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-8)' }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <div className="spinner" /> : <><Save size={18} /> Salvar Dados da Empresa</>}
          </button>
        </div>
      </form>

      {/* Vendedores / Sócios */}
      <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h3 className="card-title">
            <User size={18} className="text-gold" /> Sócios & Vendedores
          </h3>
          <button className="btn btn-primary" onClick={openNewVendedor}>
            <Plus size={16} /> Novo Vendedor
          </button>
        </div>

        {vendedores.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><User size={28} /></div>
            <div className="empty-title">Nenhum vendedor</div>
            <div className="empty-text">Cadastre sócios e vendedores para usar nos registros de vendas.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th><th>CPF</th><th>E-mail</th><th>Telefone</th>
                  <th style={{ textAlign: 'center' }}>Comissão</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{v.nome}</td>
                    <td>{v.cpf || '—'}</td>
                    <td>{v.email || '—'}</td>
                    <td>{v.telefone || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-gold">
                        <Percent size={10} /> {v.comissao_pct || 0}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => toggleAtivo(v)}
                        className={`badge ${v.ativo ? 'badge-success' : 'badge-warning'}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                      >
                        {v.ativo ? <><Check size={10} /> Ativo</> : 'Inativo'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditVendedor(v)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteVendedor(v.id)} style={{ color: 'var(--color-danger)' }} title="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Contas Bancárias ── */}
      <div className="glass-card" style={{ padding: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h3 className="card-title"><Landmark size={18} className="text-gold" /> Contas Bancárias</h3>
          <button className="btn btn-primary" onClick={openNewConta}><Plus size={16} /> Nova Conta</button>
        </div>
        {contasBancarias.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Landmark size={28} /></div><div className="empty-title">Nenhuma conta bancária</div><div className="empty-text">Cadastre as contas para usar na conciliação bancária.</div></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Nome</th><th>Banco</th><th>Agência</th><th>Conta</th><th>Tipo</th><th style={{ textAlign:'center' }}>Status</th><th></th></tr></thead>
              <tbody>
                {contasBancarias.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight:600 }}>{c.nome}</td>
                    <td>{c.banco}{c.codigo_banco ? ` (${c.codigo_banco})` : ''}</td>
                    <td style={{ fontFamily:'monospace' }}>{c.agencia}</td>
                    <td style={{ fontFamily:'monospace' }}>{c.numero_conta}</td>
                    <td><span className="badge badge-gold">{c.tipo_conta}</span></td>
                    <td style={{ textAlign:'center' }}>
                      <button onClick={() => toggleContaAtiva(c)} className={`badge ${c.ativa ? 'badge-success' : 'badge-warning'}`} style={{ border:'none', cursor:'pointer' }}>
                        {c.ativa ? <><Check size={10} /> Ativa</> : 'Inativa'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:'var(--space-1)' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditConta(c)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteConta(c.id)} style={{ color:'var(--color-danger)' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Formas de Pagamento ── */}
      <div className="glass-card" style={{ padding: 'var(--space-6)', marginTop: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <h3 className="card-title"><CreditCard size={18} className="text-gold" /> Formas de Pagamento</h3>
          <button className="btn btn-primary" onClick={openNewForma}><Plus size={16} /> Nova Forma</button>
        </div>
        {formasPagamento.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><DollarSign size={28} /></div><div className="empty-title">Nenhuma forma cadastrada</div></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Nome</th><th>Tipo</th><th style={{ textAlign:'center' }}>Pgto Imediato</th><th style={{ textAlign:'center' }}>Status</th><th></th></tr></thead>
              <tbody>
                {formasPagamento.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight:600 }}>{f.nome}</td>
                    <td><span className="badge badge-gold">{f.tipo}</span></td>
                    <td style={{ textAlign:'center' }}>{f.pagamento_imediato ? <span className="badge badge-success">Sim</span> : <span className="badge badge-warning">Não</span>}</td>
                    <td style={{ textAlign:'center' }}>
                      <span className={`badge ${f.ativa ? 'badge-success' : 'badge-warning'}`}>{f.ativa ? 'Ativa' : 'Inativa'}</span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:'var(--space-1)' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditForma(f)}><Edit2 size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteForma(f.id)} style={{ color:'var(--color-danger)' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Vendedor */}
      {showVendedorModal && (
        <div className="modal-backdrop" onClick={() => setShowVendedorModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowVendedorModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveVendedor}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Nome Completo *</label>
                    <input className="form-input" value={vendedorForm.nome} onChange={e => setVendedorForm({ ...vendedorForm, nome: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CPF</label>
                    <input className="form-input" value={vendedorForm.cpf} onChange={e => setVendedorForm({ ...vendedorForm, cpf: maskCPF(e.target.value) })} maxLength={14} placeholder="000.000.000-00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><Percent size={13} /> Comissão (%)</label>
                    <input type="number" step="0.01" min="0" max="100" className="form-input" value={vendedorForm.comissao_pct} onChange={e => setVendedorForm({ ...vendedorForm, comissao_pct: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input type="email" className="form-input" value={vendedorForm.email} onChange={e => setVendedorForm({ ...vendedorForm, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Telefone</label>
                    <input className="form-input" value={vendedorForm.telefone} onChange={e => setVendedorForm({ ...vendedorForm, telefone: maskPhone(e.target.value) })} maxLength={15} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={vendedorForm.ativo ? 'true' : 'false'} onChange={e => setVendedorForm({ ...vendedorForm, ativo: e.target.value === 'true' })}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowVendedorModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Save size={16} /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Conta Bancária */}
      {showContaModal && (
        <div className="modal-backdrop" onClick={() => setShowContaModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header"><h3 className="modal-title">{editingConta ? 'Editar Conta' : 'Nova Conta Bancária'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowContaModal(false)}><X size={20} /></button></div>
            <form onSubmit={saveConta}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-4)' }}>
                  <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Nome da Conta *</label><input className="form-input" value={contaForm.nome} onChange={e => setContaForm({...contaForm, nome: e.target.value})} placeholder="Ex: Conta Principal Bradesco" required /></div>
                  <div className="form-group"><label className="form-label">Banco *</label><input className="form-input" value={contaForm.banco} onChange={e => setContaForm({...contaForm, banco: e.target.value})} placeholder="Ex: Bradesco" required /></div>
                  <div className="form-group"><label className="form-label">Código do Banco</label><input className="form-input" value={contaForm.codigo_banco} onChange={e => setContaForm({...contaForm, codigo_banco: e.target.value})} placeholder="Ex: 237" /></div>
                  <div className="form-group"><label className="form-label">Agência *</label><input className="form-input" value={contaForm.agencia} onChange={e => setContaForm({...contaForm, agencia: e.target.value})} placeholder="Ex: 1234-5" required /></div>
                  <div className="form-group"><label className="form-label">Número da Conta *</label><input className="form-input" value={contaForm.numero_conta} onChange={e => setContaForm({...contaForm, numero_conta: e.target.value})} placeholder="Ex: 12345-6" required /></div>
                  <div className="form-group"><label className="form-label">Tipo de Conta</label><select className="form-select" value={contaForm.tipo_conta} onChange={e => setContaForm({...contaForm, tipo_conta: e.target.value})}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="investimento">Investimento</option><option value="pagamento">Pagamento</option></select></div>
                  <div className="form-group"><label className="form-label">Titular</label><input className="form-input" value={contaForm.titular} onChange={e => setContaForm({...contaForm, titular: e.target.value})} placeholder="Nome do titular" /></div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowContaModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary"><Save size={16} /> Salvar</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Forma de Pagamento */}
      {showFormaModal && (
        <div className="modal-backdrop" onClick={() => setShowFormaModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3 className="modal-title">{editingForma ? 'Editar Forma' : 'Nova Forma de Pagamento'}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowFormaModal(false)}><X size={20} /></button></div>
            <form onSubmit={saveForma}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={formaForm.nome} onChange={e => setFormaForm({...formaForm, nome: e.target.value})} placeholder="Ex: PIX, Boleto, Cartão..." required autoFocus /></div>
                <div className="form-group"><label className="form-label">Tipo</label><select className="form-select" value={formaForm.tipo} onChange={e => setFormaForm({...formaForm, tipo: e.target.value})}><option value="a_vista">À Vista</option><option value="a_prazo">A Prazo</option><option value="digital">Digital</option><option value="outros">Outros</option></select></div>
                <div className="form-group"><label className="form-label">Pagamento Imediato?</label><select className="form-select" value={formaForm.pagamento_imediato ? 'true' : 'false'} onChange={e => setFormaForm({...formaForm, pagamento_imediato: e.target.value === 'true'})}><option value="true">Sim (quitado na hora)</option><option value="false">Não (gera conta a pagar)</option></select></div>
                <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={formaForm.ativa ? 'true' : 'false'} onChange={e => setFormaForm({...formaForm, ativa: e.target.value === 'true'})}><option value="true">Ativa</option><option value="false">Inativa</option></select></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowFormaModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary"><Save size={16} /> Salvar</button></div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .logo-overlay { opacity: 0 !important; }
        div[title="Clique para enviar a logo"]:hover .logo-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
