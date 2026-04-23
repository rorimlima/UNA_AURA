/**
 * syncManager.js — Motor de sincronização Supabase ↔ IndexedDB
 * Gerencia download de dados, fila de mutações offline e auto-sync.
 */

import { supabase } from './supabase';
import db from './offlineDb';

// ─── Configuração das tabelas sincronizáveis ────────────────────────────────

const SYNC_TABLES = [
  {
    name: 'produtos',
    query: () => supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
    bidirectional: true,
  },
  {
    name: 'clientes',
    query: () => supabase.from('clientes').select('*').order('nome'),
    bidirectional: true,
  },
  {
    name: 'vendas',
    query: () => supabase.from('vendas').select('*, clientes(nome), vendedores(nome), vendas_itens(*, produtos(nome))').order('data', { ascending: false }),
    bidirectional: true,
  },
  {
    name: 'vendedores',
    query: () => supabase.from('vendedores').select('*').eq('ativo', true).order('nome'),
    bidirectional: false,
  },
  {
    name: 'fornecedores',
    query: () => supabase.from('fornecedores').select('*').order('nome'),
    bidirectional: false,
  },
  {
    name: 'contas_receber',
    query: () => supabase.from('contas_receber').select('*').order('data_vencimento', { ascending: false }),
    bidirectional: true,
  },
  {
    name: 'contas_pagar',
    query: () => supabase.from('contas_pagar').select('*').order('data_vencimento', { ascending: false }),
    bidirectional: true,
  },
  {
    name: 'empresa',
    query: () => supabase.from('empresa').select('*').limit(1),
    bidirectional: false,
  },
];

// ─── Estado global ──────────────────────────────────────────────────────────

let _isSyncing = false;
let _listeners = [];
const MAX_RETRIES = 5;

/**
 * Registra um listener para mudanças de estado do sync
 */
export function onSyncChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function _notify(event) {
  for (const fn of _listeners) {
    try { fn(event); } catch (e) { console.error('[SyncManager] listener error:', e); }
  }
}

// ─── Download: Supabase → IndexedDB ─────────────────────────────────────────

/**
 * Sincroniza uma tabela específica do Supabase para o cache local
 */
export async function syncTable(tableName) {
  const config = SYNC_TABLES.find(t => t.name === tableName);
  if (!config) {
    console.warn(`[SyncManager] Tabela "${tableName}" não configurada para sync.`);
    return false;
  }

  try {
    const { data, error } = await config.query();
    if (error) throw error;

    // Limpa e recarrega (full sync simples para datasets pequenos)
    await db.clear(tableName);
    if (data && data.length > 0) {
      await db.putAll(tableName, data);
    }
    await db.setLastSync(tableName);

    console.log(`[SyncManager] ✓ ${tableName}: ${data?.length || 0} registros`);
    return true;
  } catch (err) {
    console.error(`[SyncManager] ✗ Erro sincronizando ${tableName}:`, err);
    return false;
  }
}

/**
 * Sincroniza TODAS as tabelas (download completo)
 */
export async function syncAll() {
  if (_isSyncing) {
    console.log('[SyncManager] Sincronização já em andamento, ignorando...');
    return;
  }

  _isSyncing = true;
  _notify({ type: 'sync_start' });

  const results = {};
  let success = 0;
  let failed = 0;

  for (const table of SYNC_TABLES) {
    const ok = await syncTable(table.name);
    results[table.name] = ok;
    if (ok) success++; else failed++;
  }

  // Processa fila de operações pendentes
  await processQueue();

  _isSyncing = false;
  _notify({ type: 'sync_complete', results, success, failed });

  console.log(`[SyncManager] Sincronização completa: ${success} ok, ${failed} falhas`);
  return results;
}

// ─── Upload: Fila de mutações offline → Supabase ────────────────────────────

/**
 * Adiciona uma operação de escrita à fila de sincronização.
 * Se estiver online, tenta executar imediatamente.
 * Se offline, enfileira para posterior processamento.
 *
 * @param {string} table - Nome da tabela
 * @param {'INSERT'|'UPDATE'|'DELETE'} operation - Tipo de operação
 * @param {object} payload - Dados da operação
 * @param {string} [id] - ID do registro (para UPDATE/DELETE)
 * @returns {{ success: boolean, data?: any }} resultado
 */
export async function executeOrQueue(table, operation, payload, id) {
  // Salva localmente primeiro (otimistic update)
  if (operation === 'INSERT' || operation === 'UPDATE') {
    const localData = { ...payload };
    if (id) localData.id = id;
    await db.put(table, localData);
  } else if (operation === 'DELETE' && id) {
    await db.remove(table, id);
  }

  if (navigator.onLine) {
    // Tenta executar diretamente
    try {
      const result = await _executeOp(table, operation, payload, id);
      return { success: true, data: result };
    } catch (err) {
      console.warn(`[SyncManager] Falha ao executar online, enfileirando:`, err);
      // Falha online → enfileira
      await db.enqueueOp({ table, operation, payload, localId: id });
      _notify({ type: 'queue_add' });
      return { success: false, queued: true };
    }
  } else {
    // Offline → enfileira
    await db.enqueueOp({ table, operation, payload, localId: id });
    _notify({ type: 'queue_add' });
    return { success: false, queued: true };
  }
}

/**
 * Executa uma operação diretamente no Supabase
 */
async function _executeOp(table, operation, payload, id) {
  let result;

  switch (operation) {
    case 'INSERT': {
      const { data, error } = await supabase.from(table).insert(payload).select();
      if (error) throw error;
      result = data;
      break;
    }
    case 'UPDATE': {
      if (!id) throw new Error('ID necessário para UPDATE');
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select();
      if (error) throw error;
      result = data;
      break;
    }
    case 'DELETE': {
      if (!id) throw new Error('ID necessário para DELETE');
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      result = null;
      break;
    }
    default:
      throw new Error(`Operação desconhecida: ${operation}`);
  }

  return result;
}

/**
 * Processa todas as operações pendentes na fila
 */
export async function processQueue() {
  const ops = await db.getPendingOps();
  if (ops.length === 0) return;

  console.log(`[SyncManager] Processando fila: ${ops.length} operações pendentes`);
  _notify({ type: 'queue_processing', count: ops.length });

  let processed = 0;
  let failed = 0;

  for (const op of ops) {
    if (op.retries >= MAX_RETRIES) {
      console.warn(`[SyncManager] Operação excedeu ${MAX_RETRIES} tentativas, descartando:`, op);
      await db.dequeueOp(op.key);
      failed++;
      continue;
    }

    try {
      await _executeOp(op.table, op.operation, op.payload, op.localId);
      await db.dequeueOp(op.key);
      processed++;
    } catch (err) {
      console.error(`[SyncManager] Falha ao processar op ${op.key}:`, err);
      await db.retryOp(op.key);
      failed++;
    }
  }

  _notify({ type: 'queue_processed', processed, failed });
  console.log(`[SyncManager] Fila processada: ${processed} ok, ${failed} falhas`);
}

// ─── Auto-sync ao voltar online ─────────────────────────────────────────────

let _autoSyncEnabled = false;

function _handleOnline() {
  console.log('[SyncManager] 🟢 Conexão restaurada, iniciando sincronização...');
  _notify({ type: 'online' });
  // Delay para estabilizar conexão
  setTimeout(() => syncAll(), 1500);
}

function _handleOffline() {
  console.log('[SyncManager] 🔴 Conexão perdida, modo offline ativado.');
  _notify({ type: 'offline' });
}

/**
 * Ativa o auto-sync (escuta eventos online/offline)
 */
export function enableAutoSync() {
  if (_autoSyncEnabled) return;
  _autoSyncEnabled = true;
  window.addEventListener('online', _handleOnline);
  window.addEventListener('offline', _handleOffline);
  console.log('[SyncManager] Auto-sync ativado');
}

/**
 * Desativa o auto-sync
 */
export function disableAutoSync() {
  _autoSyncEnabled = false;
  window.removeEventListener('online', _handleOnline);
  window.removeEventListener('offline', _handleOffline);
}

/**
 * Retorna se está sincronizando
 */
export function isSyncing() {
  return _isSyncing;
}

/**
 * Retorna dados do cache local (para uso offline)
 */
export async function getCachedData(tableName) {
  return db.getAll(tableName);
}

/**
 * Retorna a contagem de operações pendentes
 */
export async function getPendingCount() {
  return db.count('_sync_queue');
}

export default {
  syncTable,
  syncAll,
  executeOrQueue,
  processQueue,
  enableAutoSync,
  disableAutoSync,
  onSyncChange,
  isSyncing,
  getCachedData,
  getPendingCount,
};
