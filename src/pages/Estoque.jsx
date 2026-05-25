import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, Package, X, Upload, Image as ImageIcon, DollarSign, TrendingUp, AlertTriangle, Eye } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';
import { useSyncTable } from '../hooks/useSyncTable';
import syncEngine from '../lib/syncEngine';

export default function Estoque() {
  const { addToast } = useToast();
  
  // Consome a tabela sincronizada IndexedDB de produtos instantaneamente!
  const { data: produtos, loading } = useSyncTable('produtos', {
    filter: { ativo: true },
    orderBy: 'nome'
  });

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome:'',codigo:'',referencia:'',categoria:'',descricao:'',custo_unitario:'',preco_venda:'',estoque_minimo:'5',imagens:[] });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // Estados para o Histórico de Compras (Ação Detalhes)
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Compatibilidade com chamadas herdadas no código
  async function load() {}

  function openNew() { setEditing(null); setForm({ nome:'',codigo:'',referencia:'',categoria:'',descricao:'',custo_unitario:'',preco_venda:'',estoque_minimo:'5',imagens:[] }); setShowModal(true); }

  function openEdit(p) {
    setEditing(p);
    setForm({ nome:p.nome||'',codigo:p.codigo||'',referencia:p.referencia||'',categoria:p.categoria||'',descricao:p.descricao||'',custo_unitario:p.custo_unitario?toReal(p.custo_unitario).toString():'',preco_venda:p.preco_venda?toReal(p.preco_venda).toString():'',estoque_minimo:p.estoque_minimo?.toString()||'5',imagens:p.imagens||[] });
    setShowModal(true);
  }

  async function openDetalhes(product) {
    setSelectedProduct(product);
    setShowDetalhes(true);
    setLoadingDetalhes(true);
    try {
      // Busca do cache IndexedDB instantaneamente sem requisições lentas de rede!
      const [items, comps, forns, vItens, vends, clis] = await Promise.all([
        syncEngine.getCached('compras_itens'),
        syncEngine.getCached('compras'),
        syncEngine.getCached('fornecedores'),
        syncEngine.getCached('vendas_itens'),
        syncEngine.getCached('vendas'),
        syncEngine.getCached('clientes')
      ]);

      const history = items
        .filter(item => item.produto_id === product.id && !item.is_deleted)
        .map(item => {
          const compra = comps.find(c => c.id === item.compra_id && !c.is_deleted);
          if (!compra) return null;
          const fornecedor = forns.find(f => f.id === compra.fornecedor_id);
          return {
            id: item.id,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            compra_codigo: compra.codigo,
            numero_nota: compra.numero_nota,
            compra_data: compra.data,
            compra_status: compra.status,
            fornecedor_nome: fornecedor ? fornecedor.nome : 'FORNECEDOR DESCONHECIDO'
          };
        })
        .filter(Boolean);

      // Ordena por data mais recente
      history.sort((a, b) => new Date(b.compra_data) - new Date(a.compra_data));

      setPurchaseHistory(history);

      const sHistory = vItens
        .filter(item => item.produto_id === product.id && !item.is_deleted)
        .map(item => {
          const venda = vends.find(v => v.id === item.venda_id && !v.is_deleted);
          if (!venda) return null;
          const cliente = clis.find(c => c.id === venda.cliente_id);
          return {
            id: item.id,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            venda_data: venda.data,
            venda_status: venda.status,
            cliente_nome: cliente ? cliente.nome : 'CLIENTE DESCONHECIDO'
          };
        })
        .filter(Boolean);

      sHistory.sort((a, b) => new Date(b.venda_data) - new Date(a.venda_data));
      setSalesHistory(sHistory);
    } catch (err) {
      console.error('Erro ao carregar detalhes de compras:', err);
      addToast('Erro ao carregar histórico de compras', 'error');
    } finally {
      setLoadingDetalhes(false);
    }
  }

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const urls = [...form.imagens];
    for (const file of files) {
      const path = `${Date.now()}_${Math.random().toString(36).substr(2)}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('produtos_imagens').upload(path, file);
      if (error) { addToast('Erro upload: '+error.message,'error'); continue; }
      const { data: { publicUrl } } = supabase.storage.from('produtos_imagens').getPublicUrl(path);
      urls.push(publicUrl);
    }
    setForm({ ...form, imagens: urls });
    setUploading(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.nome.trim()) return addToast('Nome obrigatório','error');
    const payload = { 
      nome: (form.nome || '').toUpperCase(),
      codigo: form.codigo?.trim() ? form.codigo.trim().toUpperCase() : null,
      referencia: form.referencia?.trim() ? form.referencia.trim().toUpperCase() : null,
      categoria: form.categoria || null,
      descricao: form.descricao ? form.descricao.toUpperCase() : null,
      custo_unitario: toCents(form.custo_unitario), 
      preco_venda: toCents(form.preco_venda), 
      estoque_minimo: parseInt(form.estoque_minimo)||5,
      imagens: form.imagens || []
    };
    if (editing) {
      const res = await syncEngine.mutate('produtos', 'UPDATE', payload, editing.id);
      if (!res.success) return addToast('Erro: ' + (res.error || 'Erro ao salvar'),'error');
      addToast('Produto atualizado!');
    } else {
      const res = await syncEngine.mutate('produtos', 'INSERT', payload);
      if (!res.success) return addToast('Erro: ' + (res.error || 'Erro ao cadastrar'),'error');
      addToast('Produto cadastrado!');
    }
    setShowModal(false);
  }

  async function handleDelete(id) {
    if (!confirm('Excluir?')) return;
    const res = await syncEngine.mutate('produtos', 'UPDATE', { ativo: false }, id);
    if (!res.success) return addToast('Erro: ' + (res.error || 'Erro ao excluir'),'error');
    addToast('Produto removido.');
  }

  const fmt = formatMoney;
  const categories = [...new Set(produtos.map(p=>p.categoria).filter(Boolean))];
  const filtered = produtos.filter(p => {
    const ms = p.nome.toLowerCase().includes(search.toLowerCase()) || (p.codigo||'').toLowerCase().includes(search.toLowerCase()) || (p.referencia||'').toLowerCase().includes(search.toLowerCase());
    return ms && (!catFilter || p.categoria === catFilter);
  });
  const totalCusto = produtos.reduce((s,p)=>s+(p.custo_unitario||0)*(p.quantidade_estoque||0),0);
  const totalVenda = produtos.reduce((s,p)=>s+(p.preco_venda||0)*(p.quantidade_estoque||0),0);
  const alertas = produtos.filter(p=>(p.quantidade_estoque||0)<=(p.estoque_minimo||5)).length;

  if (loading) return <div className="dashboard-loading"><div className="spinner spinner-lg"/></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title">Estoque</h2><p className="page-subtitle">{produtos.length} produtos</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={18}/> Novo Produto</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'var(--space-4)',marginBottom:'var(--space-6)'}}>
        <div className="kpi-card"><div className="kpi-icon"><DollarSign size={20}/></div><div className="kpi-label">Custo em Estoque</div><div className="kpi-value" style={{fontSize:'var(--text-xl)'}}>{fmt(totalCusto)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'var(--color-success-bg)',color:'var(--color-success)'}}><TrendingUp size={20}/></div><div className="kpi-label">Potencial Venda</div><div className="kpi-value" style={{fontSize:'var(--text-xl)'}}>{fmt(totalVenda)}</div></div>
        <div className="kpi-card"><div className="kpi-icon" style={{background:'var(--color-warning-bg)',color:'var(--color-warning)'}}><AlertTriangle size={20}/></div><div className="kpi-label">Em Alerta</div><div className="kpi-value" style={{fontSize:'var(--text-xl)'}}>{alertas}</div></div>
      </div>
      <div className="glass-card" style={{padding:'var(--space-4)',marginBottom:'var(--space-4)',display:'flex',gap:'var(--space-4)',flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:200}}>
          <Search size={18} style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',color:'var(--color-text-muted)'}}/>
          <input type="text" className="form-input" placeholder="🔍 Buscar por referência, nome ou código do produto..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:'40px'}}/>
        </div>
        <select className="form-select" value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{maxWidth:200}}>
          <option value="">Todas categorias</option>
          {categories.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {filtered.length===0 ? (
        <div className="empty-state"><div className="empty-icon"><Package size={28}/></div><div className="empty-title">Nenhum produto</div><div className="empty-text">Cadastre produtos para começar.</div></div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'var(--space-4)'}}>
          {filtered.map(p=>{
            const isLow=(p.quantidade_estoque||0)<=(p.estoque_minimo||5);
            const margem=p.preco_venda>0?((p.preco_venda-p.custo_unitario)/p.preco_venda*100):0;
            return (
              <div key={p.id} className="glass-card" style={{overflow:'hidden'}}>
                <div style={{height:160,background:'var(--color-glass)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',position:'relative'}}>
                  {p.imagens?.length>0 ? <img src={p.imagens[0]} alt={p.nome} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <ImageIcon size={40} style={{color:'var(--color-text-muted)'}}/>}
                  {p.referencia && (
                    <div style={{ position:'absolute', top: 10, left: 10, background: 'linear-gradient(135deg, rgba(184,145,58,0.95), rgba(201,169,110,0.9))', padding: '6px 14px', borderRadius: 8, boxShadow: '0 4px 16px rgba(184,145,58,0.4)' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#FFF', letterSpacing: '1.5px', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{p.referencia}</span>
                    </div>
                  )}
                </div>
                <div style={{padding:'var(--space-4)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'var(--space-2)'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:'var(--text-base)'}}>{p.nome}</div>
                      {p.codigo&&<div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>Cód: {p.codigo}</div>}
                    </div>
                    {p.categoria&&<span className="badge badge-gold">{p.categoria}</span>}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'var(--space-2)',fontSize:'var(--text-sm)'}}>
                    <span className="text-muted">Custo: {fmt(p.custo_unitario)}</span>
                    <span style={{fontWeight:700,color:'var(--color-gold)',fontFamily:'monospace',fontSize:'var(--text-base)'}}>{fmt(p.preco_venda)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span className={`badge ${isLow?'badge-danger':'badge-success'}`}>{p.quantidade_estoque||0} un.</span>
                    <span style={{fontSize:'var(--text-xs)',color:margem>0?'var(--color-success)':'var(--color-text-muted)'}}>Margem: {margem.toFixed(0)}%</span>
                  </div>
                  <div style={{display:'flex',gap:'4px',marginTop:'var(--space-3)',justifyContent:'flex-end'}}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetalhes(p)} style={{color:'var(--color-info)'}}><Eye size={14}/> Detalhes</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(p)}><Edit2 size={14}/> Editar</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>handleDelete(p.id)} style={{color:'var(--color-danger)'}}><Trash2 size={14}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showModal&&(
        <div className="modal-backdrop" onClick={()=>setShowModal(false)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">{editing?'Editar':'Novo'} Produto</h3><button className="btn btn-ghost btn-icon" onClick={()=>setShowModal(false)}><X size={20}/></button></div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'var(--space-4)'}}>
                <div className="form-group" style={{gridColumn:'span 2'}}><label className="form-label">Nome *</label><input className="form-input" value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} required/></div>
                <div className="form-group"><label className="form-label">Código</label><input className="form-input" value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Referência</label><input className="form-input" value={form.referencia} onChange={e=>setForm({...form,referencia:e.target.value})}/></div>
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select className="form-select" value={form.categoria} onChange={e => {
                    if (e.target.value === 'NEW') {
                      const nova = window.prompt('Digite o nome da nova categoria:');
                      if (nova && nova.trim()) setForm({...form, categoria: nova.trim().toUpperCase()});
                    } else {
                      setForm({...form, categoria: e.target.value.toUpperCase()});
                    }
                  }}>
                    <option value="">Selecione...</option>
                    <option value="NEW" style={{fontWeight: 'bold', color: 'var(--color-gold)'}}>+ Nova Categoria</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    {form.categoria && form.categoria !== 'NEW' && !categories.includes(form.categoria) && (
                      <option value={form.categoria}>{form.categoria}</option>
                    )}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Estoque Mínimo</label><input type="number" className="form-input" value={form.estoque_minimo} onChange={e=>setForm({...form,estoque_minimo:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Custo (R$)</label><input type="number" step="0.01" className="form-input" value={form.custo_unitario} onChange={e=>setForm({...form,custo_unitario:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Preço Venda (R$)</label><input type="number" step="0.01" className="form-input" value={form.preco_venda} onChange={e=>setForm({...form,preco_venda:e.target.value})}/></div>
                <div className="form-group" style={{gridColumn:'span 2'}}><label className="form-label">Descrição</label><textarea className="form-input" rows={2} value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} style={{resize:'vertical'}}/></div>
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label className="form-label">Imagens</label>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'8px'}}>
                    {form.imagens.map((url,i)=>(
                      <div key={i} style={{position:'relative',width:70,height:70,borderRadius:8,overflow:'hidden',border:'1px solid var(--color-glass-border)'}}>
                        <img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        <button type="button" onClick={()=>{const imgs=[...form.imagens];imgs.splice(i,1);setForm({...form,imagens:imgs});}} style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,.6)',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',border:'none',cursor:'pointer',fontSize:11}}>×</button>
                      </div>
                    ))}
                  </div>
                  <input type="file" accept="image/*" multiple ref={fileRef} onChange={handleImageUpload} style={{display:'none'}}/>
                  <button type="button" className="btn btn-secondary" onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?<div className="spinner" style={{width:16,height:16}}/>:<><Upload size={16}/> Upload</>}</button>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing?'Salvar':'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes de Compras */}
      {showDetalhes && selectedProduct && (
        <div className="modal-backdrop" onClick={() => setShowDetalhes(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(201,169,110,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={18} style={{ color: 'var(--color-gold)' }} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Detalhes do Produto</h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {selectedProduct.nome} {selectedProduct.referencia ? `(Ref: ${selectedProduct.referencia})` : ''}
                  </span>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowDetalhes(false)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingDetalhes ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
                  <div className="spinner spinner-lg" />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  {/* Seção Vendas */}
                  <div>
                    <h4 style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <TrendingUp size={16} /> Histórico de Vendas
                    </h4>
                    {salesHistory.length === 0 ? (
                      <div className="empty-state" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                        <div className="empty-text">Nenhuma venda encontrada para este produto.</div>
                      </div>
                    ) : (
                      <div style={{ overflow: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                          <thead style={{ background: 'var(--bg-surface-tertiary)' }}>
                            <tr>
                              <th>Cliente</th>
                              <th style={{ textAlign: 'center' }}>Data</th>
                              <th style={{ textAlign: 'center' }}>Qtde</th>
                              <th style={{ textAlign: 'right' }}>Valor Unit.</th>
                              <th style={{ textAlign: 'right' }}>Total Venda</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesHistory.map(item => (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 500 }}>{item.cliente_nome}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                                  {new Date(item.venda_data + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.quantidade}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                  {fmt(item.valor_unitario)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-gold)' }}>
                                  {fmt(item.quantidade * item.valor_unitario)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Seção Compras */}
                  <div>
                    <h4 style={{ margin: '0 0 var(--space-3) 0', color: 'var(--color-info)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Package size={16} /> Histórico de Compras
                    </h4>
                    {purchaseHistory.length === 0 ? (
                      <div className="empty-state" style={{ padding: 'var(--space-4)', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                        <div className="empty-text">Nenhuma compra encontrada para este produto.</div>
                      </div>
                    ) : (
                      <div style={{ overflow: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <table className="data-table" style={{ margin: 0 }}>
                          <thead style={{ background: 'var(--bg-surface-tertiary)' }}>
                            <tr>
                              <th>Fornecedor</th>
                              <th style={{ textAlign: 'center' }}>Nota Fiscal</th>
                              <th style={{ textAlign: 'right' }}>Valor Unitário</th>
                              <th style={{ textAlign: 'center' }}>Data</th>
                              <th style={{ textAlign: 'center' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {purchaseHistory.map(item => (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 500 }}>{item.fornecedor_nome}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.numero_nota || 'S/N'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-gold)' }}>
                                  {fmt(item.valor_unitario)}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                                  {new Date(item.compra_data + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`badge ${item.compra_status === 'finalizada' ? 'badge-success' : 'badge-warning'}`}>
                                    {item.compra_status === 'finalizada' ? 'QUITADA' : 'PENDENTE'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDetalhes(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
