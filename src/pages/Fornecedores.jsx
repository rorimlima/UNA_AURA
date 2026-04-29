import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, Truck, Phone, Mail, X } from 'lucide-react';

export default function Fornecedores() {
  const { addToast } = useToast();
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      nome: '', tipo: 'PJ', documento: '', data_fundacao: '',
      endereco: '', cidade: '', estado: 'SP', cep: '',
      telefone: '', email: '', observacoes: ''
    };
  }

  useEffect(() => { load(); }, []);

  async function load() {
    const { data, error } = await supabase.from('fornecedores').select('*').order('created_at', { ascending: false });
    if (!error) setFornecedores(data || []);
    setLoading(false);
  }

  /** Gera código único: FOR-0001 */
  async function gerarCodigoFornecedor() {
    const { count } = await supabase.from('fornecedores').select('*', { count: 'exact', head: true });
    const seq = (count || 0) + 1;
    return `FOR-${String(seq).padStart(4, '0')}`;
  }

  function openNew() { setEditing(null); setForm(emptyForm()); setShowModal(true); }

  function openEdit(f) {
    setEditing(f);
    setForm({
      nome: f.nome || '', tipo: f.tipo || 'PJ', documento: f.documento || '',
      data_fundacao: f.data_fundacao || '', endereco: f.endereco || '',
      cidade: f.cidade || '', estado: f.estado || 'SP', cep: f.cep || '',
      telefone: f.telefone || '', email: f.email || '', observacoes: f.observacoes || ''
    });
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nome.trim()) return addToast('Nome é obrigatório', 'error');
    const payload = { ...form };
    if (editing) {
      const { error } = await supabase.from('fornecedores').update(payload).eq('id', editing.id);
      if (error) return addToast('Erro ao atualizar: ' + error.message, 'error');
      addToast('Fornecedor atualizado!');
    } else {
      if (!payload.codigo) payload.codigo = await gerarCodigoFornecedor();
      if (!payload.status_financeiro) payload.status_financeiro = 'ADIMPLENTE';
      const { error } = await supabase.from('fornecedores').insert(payload);
      if (error) return addToast('Erro ao cadastrar: ' + error.message, 'error');
      addToast('Fornecedor cadastrado!');
    }
    setShowModal(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    const { error } = await supabase.from('fornecedores').delete().eq('id', id);
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast('Fornecedor excluído.');
    load();
  }

  const filtered = fornecedores.filter(f =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.codigo || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.documento || '').includes(search)
  );

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Fornecedores</h2>
          <p className="page-subtitle">{fornecedores.length} fornecedores cadastrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Fornecedor</button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="Buscar por nome, código (FOR-0001) ou documento..."
            value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Truck size={28} /></div>
          <div className="empty-title">Nenhum fornecedor encontrado</div>
          <div className="empty-text">Cadastre seus fornecedores para registrar compras.</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Código</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Telefone</th>
                <th>Email</th>
                <th style={{ width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', background: 'rgba(201,169,110,0.1)', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>{f.codigo || '—'}</span></td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{f.nome}</td>
                  <td><span className={`badge ${f.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : f.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : 'badge-warning'}`}>{f.status_financeiro || '—'}</span></td>
                  <td><span className="badge badge-gold">{f.tipo}</span></td>
                  <td>{f.documento || '—'}</td>
                  <td>{f.telefone ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={13} /> {f.telefone}</span> : '—'}</td>
                  <td>{f.email ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={13} /> {f.email}</span> : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(f)}><Edit2 size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(f.id)} style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nome *</label>
                  <input className="form-input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{form.tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
                  <input className="form-input" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{form.tipo === 'PJ' ? 'Data de Fundação' : 'Data de Nascimento'}</label>
                  <input type="date" className="form-input" value={form.data_fundacao} onChange={e => setForm({ ...form, data_fundacao: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone</label>
                  <input className="form-input" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">E-mail</label>
                  <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Endereço</label>
                  <input className="form-input" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <input className="form-input" value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} maxLength={2} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={3} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
