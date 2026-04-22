import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Edit2, Trash2, Package, X, Upload, Image as ImageIcon, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { formatMoney, toCents, toReal } from '../lib/money';

export default function Estoque() {
  const { addToast } = useToast();
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome:'',codigo:'',referencia:'',categoria:'',descricao:'',custo_unitario:'',preco_venda:'',estoque_minimo:'5',imagens:[] });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome');
    setProdutos(data || []);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm({ nome:'',codigo:'',referencia:'',categoria:'',descricao:'',custo_unitario:'',preco_venda:'',estoque_minimo:'5',imagens:[] }); setShowModal(true); }

  function openEdit(p) {
    setEditing(p);
    setForm({ nome:p.nome||'',codigo:p.codigo||'',referencia:p.referencia||'',categoria:p.categoria||'',descricao:p.descricao||'',custo_unitario:p.custo_unitario?toReal(p.custo_unitario).toString():'',preco_venda:p.preco_venda?toReal(p.preco_venda).toString():'',estoque_minimo:p.estoque_minimo?.toString()||'5',imagens:p.imagens||[] });
    setShowModal(true);
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
    const payload = { ...form, custo_unitario: toCents(form.custo_unitario), preco_venda: toCents(form.preco_venda), estoque_minimo: parseInt(form.estoque_minimo)||5 };
    if (editing) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', editing.id);
      if (error) return addToast('Erro: '+error.message,'error');
      addToast('Produto atualizado!');
    } else {
      const { error } = await supabase.from('produtos').insert(payload);
      if (error) return addToast('Erro: '+error.message,'error');
      addToast('Produto cadastrado!');
    }
    setShowModal(false); load();
  }

  async function handleDelete(id) {
    if (!confirm('Excluir?')) return;
    await supabase.from('produtos').update({ ativo: false }).eq('id', id);
    addToast('Produto removido.'); load();
  }

  const fmt = formatMoney;
  const categories = [...new Set(produtos.map(p=>p.categoria).filter(Boolean))];
  const filtered = produtos.filter(p => {
    const ms = p.nome.toLowerCase().includes(search.toLowerCase()) || (p.codigo||'').toLowerCase().includes(search.toLowerCase());
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
          <input type="text" className="form-input" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:'40px'}}/>
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
                <div style={{height:160,background:'var(--color-glass)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                  {p.imagens?.length>0 ? <img src={p.imagens[0]} alt={p.nome} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <ImageIcon size={40} style={{color:'var(--color-text-muted)'}}/>}
                </div>
                <div style={{padding:'var(--space-4)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'var(--space-2)'}}>
                    <div><div style={{fontWeight:600}}>{p.nome}</div>{p.codigo&&<div style={{fontSize:'var(--text-xs)',color:'var(--color-text-muted)'}}>Cód: {p.codigo}</div>}</div>
                    {p.categoria&&<span className="badge badge-gold">{p.categoria}</span>}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'var(--space-2)',fontSize:'var(--text-sm)'}}>
                    <span className="text-muted">Custo: {fmt(p.custo_unitario)}</span>
                    <span style={{fontWeight:600,color:'var(--color-gold)'}}>{fmt(p.preco_venda)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span className={`badge ${isLow?'badge-danger':'badge-success'}`}>{p.quantidade_estoque||0} un.</span>
                    <span style={{fontSize:'var(--text-xs)',color:margem>0?'var(--color-success)':'var(--color-text-muted)'}}>Margem: {margem.toFixed(0)}%</span>
                  </div>
                  <div style={{display:'flex',gap:'4px',marginTop:'var(--space-3)',justifyContent:'flex-end'}}>
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
                <div className="form-group"><label className="form-label">Categoria</label><input className="form-input" value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})} placeholder="Ex: Anéis, Colares"/></div>
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
    </div>
  );
}
