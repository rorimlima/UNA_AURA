import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, UserCheck, Phone, X, Camera, TrendingUp, Calendar, DollarSign, Award } from 'lucide-react';
import { formatMoney } from '../lib/money';

export default function Vendedores() {
  const { addToast } = useToast();
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [selectedVendedor, setSelectedVendedor] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  function emptyForm() {
    return { nome: '', telefone: '', email: '', cpf: '', comissao_pct: 0, foto_url: '' };
  }

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('vendedores').select('*').eq('ativo', true).order('nome');
    // Para cada vendedor, buscar total de vendas
    const vendedoresComVendas = await Promise.all((data || []).map(async (v) => {
      const { data: vendas } = await supabase.from('vendas').select('total').eq('vendedor_id', v.id);
      const totalFaturado = (vendas || []).reduce((s, vd) => s + (vd.total || 0), 0);
      const qtdVendas = (vendas || []).length;
      return { ...v, totalFaturado, qtdVendas };
    }));
    setVendedores(vendedoresComVendas);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(emptyForm()); setShowModal(true); }

  function openEdit(v) {
    setEditing(v);
    setForm({ nome: v.nome || '', telefone: v.telefone || '', email: v.email || '', cpf: v.cpf || '', comissao_pct: v.comissao_pct || 0, foto_url: v.foto_url || '' });
    setShowModal(true);
  }

  async function handleUploadFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `vendedor_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
    if (error) { addToast('Erro no upload: ' + error.message, 'error'); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    setForm(prev => ({ ...prev, foto_url: urlData.publicUrl }));
    setUploading(false);
    addToast('Foto enviada!');
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nome.trim()) return addToast('Nome é obrigatório', 'error');
    const payload = { ...form, comissao_pct: Number(form.comissao_pct) || 0 };
    if (editing) {
      const { error } = await supabase.from('vendedores').update(payload).eq('id', editing.id);
      if (error) return addToast('Erro: ' + error.message, 'error');
      addToast('Vendedor atualizado!');
    } else {
      const { error } = await supabase.from('vendedores').insert({ ...payload, ativo: true });
      if (error) return addToast('Erro: ' + error.message, 'error');
      addToast('Vendedor cadastrado!');
    }
    setShowModal(false); load();
  }

  async function handleDelete(id) {
    if (!confirm('Desativar este vendedor?')) return;
    await supabase.from('vendedores').update({ ativo: false }).eq('id', id);
    addToast('Vendedor desativado.'); load();
  }

  async function openHistorico(v) {
    setSelectedVendedor(v);
    setHistLoading(true);
    const { data: vendas } = await supabase
      .from('vendas')
      .select('id, data, total, numero_pedido, status, clientes(nome)')
      .eq('vendedor_id', v.id)
      .order('data', { ascending: false });

    // Agrupar por mês/ano
    const meses = {};
    (vendas || []).forEach(vd => {
      const d = new Date(vd.data);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      if (!meses[key]) meses[key] = { label, total: 0, qtd: 0, vendas: [] };
      meses[key].total += vd.total || 0;
      meses[key].qtd += 1;
      meses[key].vendas.push(vd);
    });
    const sorted = Object.entries(meses).sort(([a], [b]) => b.localeCompare(a)).map(([k, v]) => ({ key: k, ...v }));
    setHistorico(sorted);
    setHistLoading(false);
  }

  const fmt = formatMoney;

  const filtered = vendedores.filter(v => {
    const q = search.toLowerCase();
    return v.nome.toLowerCase().includes(q) || (v.telefone || '').includes(search) || (v.cpf || '').includes(search);
  });

  const totalGeral = vendedores.reduce((s, v) => s + (v.totalFaturado || 0), 0);
  const melhorVendedor = vendedores.length > 0 ? vendedores.reduce((best, v) => v.totalFaturado > (best.totalFaturado || 0) ? v : best, vendedores[0]) : null;

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Vendedores</h2><p className="page-subtitle">{vendedores.length} vendedores ativos</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Vendedor</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card">
          <div className="kpi-icon"><UserCheck size={20} /></div>
          <div className="kpi-label">Equipe Ativa</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{vendedores.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}><DollarSign size={20} /></div>
          <div className="kpi-label">Faturamento Total</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{fmt(totalGeral)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)' }}><Award size={20} /></div>
          <div className="kpi-label">Top Vendedor</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gold)' }}>{melhorVendedor?.nome || '—'}</div>
        </div>
      </div>

      {/* Search */}
      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input type="text" className="form-input" placeholder="🔍 Buscar por nome, telefone ou CPF..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
        </div>
      </div>

      {/* Cards de vendedores */}
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><UserCheck size={28} /></div><div className="empty-title">Nenhum vendedor</div><div className="empty-text">Cadastre seus vendedores.</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
          {filtered.map(v => (
            <div key={v.id} className="glass-card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                {v.foto_url ? (
                  <img src={v.foto_url} alt={v.nome} style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', objectFit: 'cover', border: '2px solid var(--color-gold)' }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-gold), rgba(201,169,110,0.6))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff' }}>
                    {(v.nome || 'V').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>{v.nome}</div>
                  {v.telefone && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {v.telefone}</div>}
                  {v.comissao_pct > 0 && <span className="badge badge-gold" style={{ fontSize: 10, marginTop: 2 }}>{v.comissao_pct}% comissão</span>}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-glass-border)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vendas</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{v.qtdVendas || 0}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faturado</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', fontFamily: 'monospace', color: 'var(--color-success)' }}>{fmt(v.totalFaturado || 0)}</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto' }}>
                <button className="btn btn-sm" style={{ flex: 1, background: 'rgba(201,169,110,0.1)', color: 'var(--color-gold)', border: '1px solid rgba(201,169,110,0.2)' }} onClick={() => openHistorico(v)}>
                  <TrendingUp size={14} /> Histórico
                </button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(v)} title="Editar"><Edit2 size={15} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(v.id)} title="Desativar" style={{ color: 'var(--color-danger)' }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Cadastro */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar Vendedor' : 'Novo Vendedor'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Foto */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <label style={{ cursor: 'pointer', position: 'relative' }}>
                    {form.foto_url ? (
                      <img src={form.foto_url} alt="Foto" style={{ width: 80, height: 80, borderRadius: 'var(--radius-full)', objectFit: 'cover', border: '3px solid var(--color-gold)' }} />
                    ) : (
                      <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-gold), rgba(201,169,110,0.4))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px dashed var(--color-gold)' }}>
                        <Camera size={28} style={{ color: '#fff' }} />
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handleUploadFoto} style={{ display: 'none' }} />
                    {uploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}
                  </label>
                </div>
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Clique para adicionar foto</p>

                <div className="form-group">
                  <label className="form-label">Nome *</label>
                  <input className="form-input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Celular</label>
                    <input className="form-input" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(99) 99999-9999" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CPF</label>
                    <input className="form-input" value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Comissão %</label>
                    <input type="number" className="form-input" value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} min={0} max={100} step={0.5} />
                  </div>
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

      {/* Modal Histórico */}
      {selectedVendedor && (
        <div className="modal-backdrop" onClick={() => setSelectedVendedor(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                {selectedVendedor.foto_url ? (
                  <img src={selectedVendedor.foto_url} alt="" style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', objectFit: 'cover', border: '2px solid var(--color-gold)' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-gold), rgba(201,169,110,0.6))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff' }}>{(selectedVendedor.nome || 'V').charAt(0)}</div>
                )}
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Histórico — {selectedVendedor.nome}</h3>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{selectedVendedor.qtdVendas || 0} vendas • {fmt(selectedVendedor.totalFaturado || 0)} faturado</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedVendedor(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: 500, overflowY: 'auto' }}>
              {histLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}><div className="spinner" /></div>
              ) : historico.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-muted)' }}>Nenhuma venda registrada.</div>
              ) : historico.map(mes => (
                <div key={mes.key} style={{ marginBottom: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(201,169,110,0.08)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-gold)' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {mes.label}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{mes.qtd} vendas</span>
                      <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--color-success)' }}>{fmt(mes.total)}</span>
                    </div>
                  </div>
                  <table className="data-table" style={{ fontSize: 13 }}>
                    <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th></tr></thead>
                    <tbody>
                      {mes.vendas.map(vd => (
                        <tr key={vd.id}>
                          <td>{new Date(vd.data).toLocaleDateString('pt-BR')}</td>
                          <td>{vd.numero_pedido || '—'}</td>
                          <td>{vd.clientes?.nome || 'Sem cliente'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-success)' }}>{fmt(vd.total)}</td>
                          <td><span className={`badge ${vd.status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>{vd.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
