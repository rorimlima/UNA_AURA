import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { ACTION_LABELS, ENTITY_LABELS } from '../lib/activityLogger';
import { Search, Activity, Filter, ChevronDown, ChevronUp, Calendar, User, RefreshCw, Trash2, Clock } from 'lucide-react';

const PAGE_SIZE = 50;

// Badge colors per action type
const actionColors = {
  CREATE: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
  UPDATE: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  DELETE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  LOGIN: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
  LOGOUT: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
  PRINT: { bg: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: 'rgba(201,169,110,0.3)' },
  EXPORT: { bg: 'rgba(201,169,110,0.15)', color: '#C9A96E', border: 'rgba(201,169,110,0.3)' },
  VIEW: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  PAYMENT: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
  SYNC: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
};

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin}min`;
  if (diffHour < 24) return `há ${diffHour}h`;
  if (diffDay < 7) return `há ${diffDay} dia${diffDay > 1 ? 's' : ''}`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Logs() {
  const { addToast } = useToast();
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true);
    const currentPage = reset ? 0 : page;
    if (reset) setPage(0);

    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (filterAction) query = query.eq('action', filterAction);
    if (filterEntity) query = query.eq('entity', filterEntity);
    if (filterDate) {
      query = query.gte('created_at', filterDate + 'T00:00:00');
      query = query.lte('created_at', filterDate + 'T23:59:59');
    }
    if (search) {
      query = query.or(`user_name.ilike.%${search}%,entity_label.ilike.%${search}%,user_email.ilike.%${search}%,entity.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      addToast('Erro ao carregar logs: ' + error.message, 'error');
      setLoading(false);
      return;
    }

    const newLogs = data || [];
    setHasMore(newLogs.length === PAGE_SIZE);
    
    if (reset || currentPage === 0) {
      setLogs(newLogs);
    } else {
      setLogs(prev => [...prev, ...newLogs]);
    }
    setLoading(false);
  }, [page, filterAction, filterEntity, filterDate, search, addToast]);

  useEffect(() => { loadLogs(true); }, [filterAction, filterEntity, filterDate]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => loadLogs(true), 400);
    return () => clearTimeout(timer);
  }, [search]);

  function loadMore() {
    setPage(prev => prev + 1);
  }

  useEffect(() => {
    if (page > 0) loadLogs(false);
  }, [page]);

  // Unique entities and actions for filters
  const allActions = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PRINT', 'EXPORT', 'VIEW', 'PAYMENT', 'SYNC'];
  const allEntities = Object.keys(ENTITY_LABELS);

  // Stats
  const todayLogs = logs.filter(l => {
    const d = new Date(l.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={24} style={{ color: 'var(--color-gold)' }} />
            Logs de Atividade
          </h2>
          <p className="page-subtitle">{logs.length} registros carregados {todayLogs > 0 && `• ${todayLogs} hoje`}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filtros {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button className="btn btn-secondary" onClick={() => loadLogs(true)}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(201,169,110,0.15)', color: 'var(--color-gold)' }}><Activity size={20} /></div>
          <div className="kpi-label">Total de Logs</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{logs.length}{hasMore ? '+' : ''}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Clock size={20} /></div>
          <div className="kpi-label">Ações Hoje</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-success)' }}>{todayLogs}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}><User size={20} /></div>
          <div className="kpi-label">Usuários Ativos</div>
          <div className="kpi-value" style={{ fontSize: 'var(--text-xl)' }}>{new Set(logs.map(l => l.user_email)).size}</div>
        </div>
      </div>

      {/* Search bar */}
      <div className="glass-card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Buscar por usuário, ação, entidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 40 }}
          />
        </div>

        {/* Collapsible Filters */}
        {showFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-glass-border)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Tipo de Ação</label>
              <select className="form-select" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">Todas</option>
                {allActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Entidade</label>
              <select className="form-select" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
                <option value="">Todas</option>
                {allEntities.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Data Específica</label>
              <input type="date" className="form-input" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterAction(''); setFilterEntity(''); setFilterDate(''); setSearch(''); }}>
                <Trash2 size={14} /> Limpar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logs Timeline */}
      {loading && logs.length === 0 ? (
        <div className="dashboard-loading"><div className="spinner spinner-lg" /></div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Activity size={28} /></div>
          <div className="empty-title">Nenhum log encontrado</div>
          <div className="empty-text">As atividades do sistema serão registradas aqui automaticamente.</div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log, idx) => {
              const ac = actionColors[log.action] || actionColors.VIEW;
              const isExpanded = expandedLog === log.id;
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div
                  key={log.id}
                  onClick={() => hasDetails && setExpandedLog(isExpanded ? null : log.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-4)',
                    padding: 'var(--space-4) var(--space-5)',
                    borderBottom: idx < logs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    cursor: hasDetails ? 'pointer' : 'default',
                    transition: 'background .15s',
                    background: isExpanded ? 'rgba(201,169,110,0.04)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (hasDetails) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? 'rgba(201,169,110,0.04)' : 'transparent'; }}
                >
                  {/* Timeline dot */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: ac.bg, border: `1.5px solid ${ac.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 16,
                  }}>
                    {(ACTION_LABELS[log.action] || '📋').charAt(0) === '➕' ? '➕' :
                     (ACTION_LABELS[log.action] || '📋').split(' ')[0]}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: ac.bg, color: ac.color, border: `1px solid ${ac.border}`,
                        letterSpacing: '0.03em', textTransform: 'uppercase',
                      }}>
                        {ACTION_LABELS[log.action]?.split(' ')[1] || log.action}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {ENTITY_LABELS[log.entity] || log.entity}
                      </span>
                      {log.entity_label && (
                        <span style={{
                          fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)',
                          background: 'rgba(255,255,255,0.05)', padding: '1px 8px',
                          borderRadius: 6, fontFamily: 'monospace',
                        }}>
                          {log.entity_label}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} /> {log.user_name || log.user_email}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {timeAgo(log.created_at)}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                        {new Date(log.created_at).toLocaleString('pt-BR', { 
                          day: '2-digit', month: '2-digit', year: '2-digit', 
                          hour: '2-digit', minute: '2-digit', second: '2-digit' 
                        })}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && hasDetails && (
                      <div style={{
                        marginTop: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: 'var(--color-text-secondary)',
                        maxHeight: 200,
                        overflowY: 'auto',
                      }}>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  {hasDetails && (
                    <div style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 4 }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {hasMore && (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', borderTop: '1px solid var(--color-glass-border)' }}>
              <button className="btn btn-secondary" onClick={loadMore} disabled={loading}>
                {loading ? <><div className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} /> Carregando...</> : 'Carregar mais logs'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
