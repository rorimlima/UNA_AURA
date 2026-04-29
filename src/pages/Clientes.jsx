import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, Users, Phone, Mail, X, FileText } from 'lucide-react';
import FichaClienteModal from '../components/FichaClienteModal';
import { maskCPF, maskCNPJ, maskPhone } from '../lib/money';

export default function Clientes() {
  const { addToast } = useToast();
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [selectedFicha, setSelectedFicha] = useState(null);

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
      .order('created_at', { ascending: false });
    if (!error) setClientes(data || []);
    setLoading(false);
  }

  const [statusFilter, setStatusFilter] = useState('todos');

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
      // Código gerado automaticamente pelo trigger do banco
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

  const filtered = clientes.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.nome.toLowerCase().includes(q) ||
      (c.codigo || '').toLowerCase().includes(q) ||
      (c.documento || '').includes(search) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.telefone || '').includes(search) ||
      (c.cidade || '').toLowerCase().includes(q) ||
      (c.status_financeiro || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'todos' || c.status_financeiro === statusFilter;
    return matchSearch && matchStatus;
  });

  // KPIs de clientes
  const totalAdimplentes = clientes.filter(c => c.status_financeiro === 'ADIMPLENTE').length;
  const totalInadimplentes = clientes.filter(c => c.status_financeiro === 'INADIMPLENTE').length;
  const totalParciais = clientes.filter(c => c.status_financeiro === 'PARCIAL').length;

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

      {/* KPIs de Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'todos' ? '2px solid var(--color-gold)' : 'none' }} onClick={() => setStatusFilter('todos')}>
          <div className="kpi-icon"><Users size={20} /></div>
          <div className="kpi-label">Total Clientes</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{clientes.length}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'ADIMPLENTE' ? '2px solid var(--color-success)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'ADIMPLENTE' ? 'todos' : 'ADIMPLENTE')}>
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><Users size={20} /></div>
          <div className="kpi-label">Adimplentes</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{totalAdimplentes}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'INADIMPLENTE' ? '2px solid var(--color-danger)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'INADIMPLENTE' ? 'todos' : 'INADIMPLENTE')}>
          <div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><Users size={20} /></div>
          <div className="kpi-label">Inadimplentes</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-danger)' }}>{totalInadimplentes}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'PARCIAL' ? '2px solid var(--color-warning)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'PARCIAL' ? 'todos' : 'PARCIAL')}>
          <div className="kpi-icon" style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--color-warning)' }}><Users size={20} /></div>
          <div className="kpi-label">Parciais</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-warning)' }}>{totalParciais}</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar por nome, código (CLI-0001), documento, telefone, status ou cidade..."
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
                <th style={{ width: 110 }}>Código</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Telefone</th>
                <th>Status Fin.</th>
                <th style={{ width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', background: 'rgba(201,169,110,0.1)', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>{c.codigo || '—'}</span></td>
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
                    <span className={`badge ${c.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : c.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : c.status_financeiro === 'PARCIAL' ? 'badge-warning' : 'badge-gold'}`} style={{ fontSize: 11 }}>
                      {c.status_financeiro || 'ADIMPLENTE'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedFicha(c)} title="Ficha Completa">
                        <FileText size={15} className="text-primary" />
                      </button>
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

      {/* Ficha Completa Modal */}
      {selectedFicha && (
        <FichaClienteModal 
          cliente={selectedFicha} 
          onClose={() => setSelectedFicha(null)} 
        />
      )}
    </div>
  );
}
