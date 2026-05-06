import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useLoadingSafetyGuard } from '../hooks/useLoadingSafety';
import { Plus, Search, Edit2, Trash2, Truck, Phone, Mail, X, Eye, ShoppingCart, RotateCcw, DollarSign } from 'lucide-react';
import { formatMoney } from '../lib/money';

export default function Fornecedores() {
  const { addToast } = useToast();
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
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
    // Fetch suppliers along with their purchases, devolutions, and credits to calculate totals
    const { data, error } = await supabase.from('fornecedores').select(`
      *,
      compras(id, codigo, data, total, status, numero_nota),
      devolucoes_fornecedor(id, codigo, data, total, status, motivo),
      creditos_fornecedor(id, tipo, valor, is_deleted)
    `).eq('is_deleted', false).order('created_at', { ascending: false });
    
    if (!error) {
      // Calculate totals for each supplier
      const fornecedoresComTotais = (data || []).map(f => {
        const compras = f.compras || [];
        const creditos = (f.creditos_fornecedor || []).filter(c => !c.is_deleted);
        
        const totalCompras = compras.reduce((s, c) => s + (c.total || 0), 0);
        const totalPagamentos = compras.filter(c => c.status === 'finalizada' || c.status === 'PAGO').reduce((s, c) => s + (c.total || 0), 0);
        
        const totalCreditos = creditos.filter(c => c.tipo === 'credito').reduce((s, c) => s + (c.valor || 0), 0);
        const totalDebitos = creditos.filter(c => c.tipo === 'debito').reduce((s, c) => s + (c.valor || 0), 0);
        const saldoCredito = totalCreditos - totalDebitos;

        return {
          ...f,
          totais: {
            compras: totalCompras,
            pagamentos: totalPagamentos,
            creditos_gerados: totalCreditos,
            saldo_credito: saldoCredito
          }
        };
      });
      setFornecedores(fornecedoresComTotais);
    }
    setLoading(false);
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

  function openView(f) {
    setViewing(f);
    setShowViewModal(true);
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
      const { error } = await supabase.from('fornecedores').insert(payload);
      if (error) return addToast('Erro ao cadastrar: ' + error.message, 'error');
      addToast('Fornecedor cadastrado!');
    }
    setShowModal(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    const { error } = await supabase.from('fornecedores').update({ is_deleted: true }).eq('id', id);
    if (error) return addToast('Erro: ' + error.message, 'error');
    addToast('Fornecedor excluído.');
    load();
  }

  const filtered = fornecedores.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = f.nome.toLowerCase().includes(q) ||
      (f.codigo || '').toLowerCase().includes(q) ||
      (f.documento || '').includes(search) ||
      (f.status_financeiro || '').toLowerCase().includes(q) ||
      (f.email || '').toLowerCase().includes(q) ||
      (f.telefone || '').includes(search) ||
      (f.cidade || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'todos' || f.status_financeiro === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalAdimplentes = fornecedores.filter(f => f.status_financeiro === 'ADIMPLENTE').length;
  const totalInadimplentes = fornecedores.filter(f => f.status_financeiro === 'INADIMPLENTE').length;
  const totalParciais = fornecedores.filter(f => f.status_financeiro === 'PARCIAL').length;

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'todos' ? '2px solid var(--color-gold)' : 'none' }} onClick={() => setStatusFilter('todos')}>
          <div className="kpi-icon"><Truck size={20} /></div>
          <div className="kpi-label">Total Fornecedores</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{fornecedores.length}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'ADIMPLENTE' ? '2px solid var(--color-success)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'ADIMPLENTE' ? 'todos' : 'ADIMPLENTE')}>
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><Truck size={20} /></div>
          <div className="kpi-label">Adimplentes</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{totalAdimplentes}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'INADIMPLENTE' ? '2px solid var(--color-danger)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'INADIMPLENTE' ? 'todos' : 'INADIMPLENTE')}>
          <div className="kpi-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><Truck size={20} /></div>
          <div className="kpi-label">Inadimplentes</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-danger)' }}>{totalInadimplentes}</div>
        </div>
        <div className="kpi-card" style={{ cursor: 'pointer', outline: statusFilter === 'PARCIAL' ? '2px solid var(--color-warning)' : 'none' }} onClick={() => setStatusFilter(statusFilter === 'PARCIAL' ? 'todos' : 'PARCIAL')}>
          <div className="kpi-icon" style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--color-warning)' }}><Truck size={20} /></div>
          <div className="kpi-label">Parciais</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-warning)' }}>{totalParciais}</div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="🔍 Buscar por nome, código, documento, status ou telefone..."
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
                <th style={{ width: 100 }}>Código</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Total Compras</th>
                <th style={{ textAlign: 'right' }}>Total Pagto.</th>
                <th style={{ textAlign: 'right' }}>Crédito Disp.</th>
                <th>Telefone</th>
                <th style={{ width: 120, textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-gold)', background: 'rgba(201,169,110,0.1)', padding: '2px 8px', borderRadius: 6, fontSize: 13 }}>{f.codigo || '—'}</span></td>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{f.nome}</td>
                  <td><span className={`badge ${f.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : f.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : 'badge-warning'}`}>{f.status_financeiro || '—'}</span></td>
                  <td><span className="badge badge-gold">{f.tipo}</span></td>
                  
                  {/* Novos campos de totais */}
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatMoney(f.totais.compras)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-success)' }}>{formatMoney(f.totais.pagamentos)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: f.totais.saldo_credito > 0 ? 700 : 400, color: f.totais.saldo_credito > 0 ? 'var(--color-gold)' : 'inherit' }}>
                    {formatMoney(f.totais.saldo_credito)}
                  </td>

                  <td>{f.telefone ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={13} /> {f.telefone}</span> : '—'}</td>
                  
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyItems: 'center' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Visualizar" onClick={() => openView(f)} style={{ color: 'var(--color-info)' }}><Eye size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => openEdit(f)}><Edit2 size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Excluir" onClick={() => handleDelete(f.id)} style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Edição/Novo */}
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

      {/* Modal Visualização */}
      {showViewModal && viewing && (
        <div className="modal-backdrop" onClick={() => setShowViewModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(201,169,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={20} style={{ color: 'var(--color-gold)' }} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>{viewing.nome}</h3>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{viewing.codigo || 'S/C'}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowViewModal(false)}><X size={20} /></button>
            </div>
            
            <div className="modal-body" style={{ padding: 'var(--space-5)' }}>
              
              {/* Infos Principais */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Status Financeiro</div>
                  <span className={`badge ${viewing.status_financeiro === 'ADIMPLENTE' ? 'badge-success' : viewing.status_financeiro === 'INADIMPLENTE' ? 'badge-danger' : 'badge-warning'}`}>{viewing.status_financeiro || 'ADIMPLENTE'}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Documento</div>
                  <div style={{ fontWeight: 500 }}>{viewing.documento || '—'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Telefone</div>
                  <div style={{ fontWeight: 500 }}>{viewing.telefone || '—'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Email</div>
                  <div style={{ fontWeight: 500 }}>{viewing.email || '—'}</div>
                </div>
              </div>

              {/* Resumo Financeiro KPI */}
              <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={18} style={{ color: 'var(--color-gold)' }}/> Resumo Financeiro
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: 8 }}>Total Compras</div>
                  <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700 }}>{formatMoney(viewing.totais.compras)}</div>
                </div>
                <div style={{ background: 'rgba(74,222,128,0.05)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(74,222,128,0.1)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--color-success)', marginBottom: 8 }}>Total Pagamentos</div>
                  <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-success)' }}>{formatMoney(viewing.totais.pagamentos)}</div>
                </div>
                <div style={{ background: viewing.totais.saldo_credito > 0 ? 'rgba(201,169,110,0.1)' : 'rgba(255,255,255,0.02)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: viewing.totais.saldo_credito > 0 ? '1px solid rgba(201,169,110,0.3)' : '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '12px', color: viewing.totais.saldo_credito > 0 ? 'var(--color-gold)' : 'var(--color-text-muted)', marginBottom: 8 }}>Crédito Disponível</div>
                  <div style={{ fontSize: '1.25rem', fontFamily: 'monospace', fontWeight: 700, color: viewing.totais.saldo_credito > 0 ? 'var(--color-gold)' : 'inherit' }}>{formatMoney(viewing.totais.saldo_credito)}</div>
                </div>
              </div>

              {/* Histórico: Compras */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingCart size={18} style={{ color: 'var(--color-gold)' }}/> Últimas Compras
                </h4>
                {viewing.compras && viewing.compras.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Nº Nota</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.compras.slice(0, 5).map(c => (
                        <tr key={c.id}>
                          <td>{new Date(c.data).toLocaleDateString('pt-BR')}</td>
                          <td>{c.numero_nota || '—'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatMoney(c.total)}</td>
                          <td>
                            <span className={`badge ${c.status === 'finalizada' || c.status === 'PAGO' ? 'badge-success' : 'badge-warning'}`}>
                              {c.status?.toUpperCase() || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhuma compra registrada para este fornecedor.</p>
                )}
              </div>

              {/* Histórico: Devoluções */}
              <div>
                <h4 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCcw size={18} style={{ color: 'var(--color-gold)' }}/> Últimas Devoluções
                </h4>
                {viewing.devolucoes_fornecedor && viewing.devolucoes_fornecedor.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Código</th>
                        <th>Motivo</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.devolucoes_fornecedor.slice(0, 5).map(d => (
                        <tr key={d.id}>
                          <td>{new Date(d.data).toLocaleDateString('pt-BR')}</td>
                          <td><span style={{ fontFamily: 'monospace', color: 'var(--color-gold)' }}>{d.codigo}</span></td>
                          <td>{d.motivo || '—'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatMoney(d.total)}</td>
                          <td>
                            <span className={`badge ${d.status === 'finalizada' ? 'badge-success' : d.status === 'cancelada' ? 'badge-danger' : 'badge-warning'}`}>
                              {d.status?.toUpperCase() || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>Nenhuma devolução registrada para este fornecedor.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
