import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, Users, Phone, Mail, X } from 'lucide-react';

export default function Clientes() {
  const { addToast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      nome: '', tipo: 'PF', documento: '', data_nascimento: '',
      endereco: '', cidade: '', estado: 'SP', cep: '',
      telefone: '', email: '', observacoes: ''
    };
  }

  useEffect(() => { loadClientes(); }, []);

  async function loadClientes() {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nome');
    if (!error) setClientes(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      nome: c.nome || '', tipo: c.tipo || 'PF', documento: c.documento || '',
      data_nascimento: c.data_nascimento || '', endereco: c.endereco || '',
      cidade: c.cidade || '', estado: c.estado || 'SP', cep: c.cep || '',
      telefone: c.telefone || '', email: c.email || '', observacoes: c.observacoes || ''
    });
    setShowModal(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nome.trim()) return addToast('Nome é obrigatório', 'error');

    const payload = { ...form };

    if (editing) {
      const { error } = await supabase.from('clientes').update(payload).eq('id', editing.id);
      if (error) return addToast('Erro ao atualizar: ' + error.message, 'error');
      addToast('Cliente atualizado com sucesso!');
    } else {
      const { error } = await supabase.from('clientes').insert(payload);
      if (error) return addToast('Erro ao cadastrar: ' + error.message, 'error');
      addToast('Cliente cadastrado com sucesso!');
    }

    setShowModal(false);
    loadClientes();
  }

  async function handleDelete(id) {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) return addToast('Erro ao excluir: ' + error.message, 'error');
    addToast('Cliente excluído.');
    loadClientes();
  }

  function formatDoc(doc, tipo) {
    if (!doc) return '—';
    if (tipo === 'PF' && doc.length === 11)
      return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (tipo === 'PJ' && doc.length === 14)
      return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return doc;
  }

  const filtered = clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.documento || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Clientes</h2>
          <p className="page-subtitle">{clientes.length} clientes cadastrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Novo Cliente
        </button>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por nome, documento ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Users size={28} /></div>
          <div className="empty-title">Nenhum cliente encontrado</div>
          <div className="empty-text">Cadastre seu primeiro cliente para começar a vender.</div>
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Telefone</th>
                <th>Email</th>
                <th style={{ width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{c.nome}</td>
                  <td><span className="badge badge-gold">{c.tipo}</span></td>
                  <td>{formatDoc(c.documento, c.tipo)}</td>
                  <td>
                    {c.telefone ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={13} /> {c.telefone}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {c.email ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={13} /> {c.email}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(c)} title="Editar">
                        <Edit2 size={15} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(c.id)} title="Excluir"
                        style={{ color: 'var(--color-danger)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
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
                  <input className="form-input" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })}
                    placeholder={form.tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} maxLength={form.tipo === 'PF' ? 14 : 18} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data de Nascimento</label>
                  <input type="date" className="form-input" value={form.data_nascimento} onChange={e => setForm({ ...form, data_nascimento: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone</label>
                  <input className="form-input" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(11) 99999-9999" />
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
