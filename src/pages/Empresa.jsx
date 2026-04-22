import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import {
  Building2, Upload, Save, Plus, Trash2, Edit2, X, Check,
  User, Phone, Mail, MapPin, Hash, Percent, Camera
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

export default function Empresa() {
  const { addToast } = useToast();
  const [empresa, setEmpresa] = useState(EMPTY_EMPRESA);
  const [empresaId, setEmpresaId] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [showVendedorModal, setShowVendedorModal] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState(null);
  const [vendedorForm, setVendedorForm] = useState(EMPTY_VENDEDOR);
  const fileInputRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: emp }, { data: vend }] = await Promise.all([
      supabase.from('empresa').select('*').limit(1).maybeSingle(),
      supabase.from('vendedores').select('*').order('nome'),
    ]);
    if (emp) { setEmpresa(emp); setEmpresaId(emp.id); }
    setVendedores(vend || []);
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

      <style>{`
        .logo-overlay { opacity: 0 !important; }
        div[title="Clique para enviar a logo"]:hover .logo-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
