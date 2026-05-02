/**
 * syncEngine.js — Motor de Sincronização Offline-First v3
 * ══════════════════════════════════════════════════════════════════════════════
 * SINGLETON que orquestra:
 *   1. Delta Fetch PAGINADO — busca registros alterados em loop até esgotar
 *   2. Mutation Queue — enfileira escritas offline, exponential backoff + jitter
 *   3. Optimistic UI — atualiza cache local ANTES de ir ao servidor
 *   4. Realtime Integration — recebe updates via `realtimeManager.js`
 *   5. Conflict Resolution — Last-Write-Wins (campo `updated_at`)
 *   6. AsyncMutex — previne corrida de sync simultâneas
 *   7. Idempotência — deduplicação de mutações via chave única
 *   8. Batch emit — coalesce eventos para evitar re-renders excessivos
 *
 * ★ ISOLAMENTO: Este módulo NÃO importa React. Nenhum hook, useState ou
 *   useEffect mora aqui. A comunicação com a UI é via EventTarget (pub/sub).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';
import db from './offlineDb';

// ─── Configuração das tabelas sincronizáveis ────────────────────────────────

/**
 * @typedef {Object} SyncTableConfig
 * @property {string} name - Nome da tabela no Supabase
 * @property {string} [select] - Colunas para SELECT (default: '*')
 * @property {Object} [baseFilter] - Filtros base que sempre se aplicam
 * @property {boolean} [writable] - Se aceita mutações do cliente (default: true)
 * @property {number} [deltaPageSize] - Registros por página no delta (default: 500)
 * @property {boolean} [realtime] - Se escuta Realtime (default: true)
 */
const TABLE_CONFIGS = {
  vendas: {
    name: 'vendas',
    select: '*',
    writable: true,
    realtime: true,
    deltaPageSize: 500,
  },
  vendas_itens: {
    name: 'vendas_itens',
    select: '*',
    writable: true,
    realtime: true,
    deltaPageSize: 500,
  },
  compras: {
    name: 'compras',
    select: '*',
    writable: true,
    realtime: true,
    deltaPageSize: 500,
  },
  compras_itens: {
    name: 'compras_itens',
    select: '*',
    writable: true,
    realtime: true,
    deltaPageSize: 500,
  },
  clientes: {
    name: 'clientes',
    select: '*',
    writable: true,
    realtime: true,
  },
  produtos: {
    name: 'produtos',
    select: '*',
    writable: true,
    realtime: true,
  },

  vendedores: {
    name: 'vendedores',
    select: '*',
    writable: false,
    realtime: true,
  },
  fornecedores: {
    name: 'fornecedores',
    select: '*',
    writable: false,
    realtime: true,
  },
  contas_receber: {
    name: 'contas_receber',
    select: '*',
    writable: true,
    realtime: true,
  },
  contas_pagar: {
    name: 'contas_pagar',
    select: '*',
    writable: true,
    realtime: true,
  },
  contas_bancarias: {
    name: 'contas_bancarias',
    select: '*',
    writable: true,
    realtime: true,
  },
  contas_financeiras: {
    name: 'contas_financeiras',
    select: '*',
    writable: true,
    realtime: true,
  },
  formas_pagamento: {
    name: 'formas_pagamento',
    select: '*',
    writable: true,
    realtime: true,
  },
  movimentacoes_financeiras: {
    name: 'movimentacoes_financeiras',
    select: '*',
    writable: true,
    realtime: true,
  },
  cobrancas_log: {
    name: 'cobrancas_log',
    select: '*',
    writable: true,
    realtime: true,
  },
  empresa: {
    name: 'empresa',
    select: '*',
    writable: false,
    realtime: false,
    deltaPageSize: 10,
  },
};

// ─── Event Bus (desacoplado de React) ───────────────────────────────────────

const _bus = new EventTarget();

// Batch emit: coalesce múltiplos table_updated em um RAF frame
let _pendingTableEmits = new Set();
let _rafScheduled = false;

/** @param {'sync_start'|'sync_end'|'table_updated'|'queue_change'|'error'|'online'|'offline'} type */
function _emit(type, detail = {}) {
  if (type === 'table_updated') {
    // Coalesce: agrupa emits da mesma tabela no mesmo frame
    _pendingTableEmits.add(detail.table || 'unknown');
    if (!_rafScheduled) {
      _rafScheduled = true;
      // Usa setTimeout como fallback para ambientes sem RAF (SSR)
      const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      schedule(() => {
        _rafScheduled = false;
        const tables = [..._pendingTableEmits];
        _pendingTableEmits.clear();
        for (const table of tables) {
          _bus.dispatchEvent(new CustomEvent('table_updated', { detail: { table, ...detail } }));
        }
      });
    }
    return;
  }
  _bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Subscreve a eventos do engine. Retorna unsubscribe function. */
export function subscribe(type, handler) {
  const wrapped = (e) => handler(e.detail);
  _bus.addEventListener(type, wrapped);
  return () => _bus.removeEventListener(type, wrapped);
}

// ─── AsyncMutex — Previne sync simultâneas ──────────────────────────────────

const MUTEX_TIMEOUT = 60_000; // Auto-release após 60s

class AsyncMutex {
  constructor() {
    this._locked = false;
    this._lockedAt = null;
    this._queue = [];
  }

  async acquire() {
    // Auto-release se travado por mais de MUTEX_TIMEOUT
    if (this._locked && this._lockedAt && (Date.now() - this._lockedAt > MUTEX_TIMEOUT)) {
      console.warn('[Mutex] Auto-release após timeout');
      this._locked = false;
      this._lockedAt = null;
    }

    if (this._locked) {
      // Espera na fila com timeout de 30s
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Mutex acquire timeout'));
        }, 30_000);
        this._queue.push(() => {
          clearTimeout(timer);
          this._locked = true;
          this._lockedAt = Date.now();
          resolve();
        });
      });
    }

    this._locked = true;
    this._lockedAt = Date.now();
  }

  release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._locked = false;
      this._lockedAt = null;
    }
  }

  get isLocked() {
    return this._locked;
  }
}

// ─── State ──────────────────────────────────────────────────────────────────

const _syncMutex = new AsyncMutex();
let _initialized = false;
const MAX_MUTATION_RETRIES = 8;
const QUEUE_PROCESS_INTERVAL = 15_000; // 15s
const SYNC_TIMEOUT = 20_000; // 20s per table
let _queueIntervalId = null;

// ─── 1. DELTA FETCH — Busca inteligente com paginação ───────────────────────

/**
 * Faz o Delta Sync de uma tabela com PAGINAÇÃO COMPLETA:
 *   • Na PRIMEIRA vez (sem cursor): full load → salva tudo no cache
 *   • Nas PRÓXIMAS: busca apenas WHERE updated_at > cursor
 *   • Registros com is_deleted = true são REMOVIDOS do cache local
 *   • Pagina até não haver mais registros (evita perda de deltas)
 *
 * @param {string} tableName
 * @returns {Promise<{ count: number, isInitial: boolean, pages: number }>}
 */
export async function deltaSync(tableName) {
  const config = TABLE_CONFIGS[tableName];
  if (!config) {
    console.warn(`[SyncEngine] Tabela "${tableName}" não configurada.`);
    return { count: 0, isInitial: false, pages: 0 };
  }

  let cursor = await db.getSyncCursor(tableName);
  const isInitial = !cursor;
  const pageSize = config.deltaPageSize || 500;
  let totalFetched = 0;
  let pages = 0;

  try {
    // ── LOOP PAGINADO — busca até não haver mais registros ──
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from(config.name)
        .select(config.select || '*')
        .order('updated_at', { ascending: true })
        .limit(pageSize);

      // Aplica filtros base da config
      if (config.baseFilter) {
        for (const [col, val] of Object.entries(config.baseFilter)) {
          query = query.eq(col, val);
        }
      }

      // Delta: apenas registros mais novos que o cursor
      // Usa >= para capturar registros com o MESMO timestamp (microsegundos)
      // mas evita duplicatas via merge LWW no IndexedDB
      if (cursor) {
        query = query.gt('updated_at', cursor);
      }

      // Timeout de 20s para evitar travamento
      const result = await Promise.race([
        query,
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`Timeout: deltaSync ${tableName}`)), SYNC_TIMEOUT)
        ),
      ]);

      const { data, error } = result;
      if (error) throw error;

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      pages++;
      totalFetched += data.length;

      if (isInitial && pages === 1) {
        // Primeira página do load inicial: limpa e carrega
        await db.clear(tableName);
        const nonDeleted = data.filter(r => !r.is_deleted);
        await db.putAll(tableName, nonDeleted);
      } else if (isInitial) {
        // Páginas subsequentes do load inicial
        const nonDeleted = data.filter(r => !r.is_deleted);
        await db.putAll(tableName, nonDeleted);
      } else {
        // Delta: merge inteligente com LWW
        await db.mergeRecords(tableName, data);
      }

      // Atualiza o cursor para o updated_at mais recente desta página
      const latestTs = data.reduce((max, r) => {
        return r.updated_at > max ? r.updated_at : max;
      }, cursor || '');

      if (latestTs) {
        cursor = latestTs;
        await db.setSyncCursor(tableName, latestTs);
      }

      // Se recebeu menos que o pageSize, não há mais páginas
      if (data.length < pageSize) {
        hasMore = false;
      }
    }

    if (totalFetched > 0) {
      console.log(`[SyncEngine] ✓ ${tableName}: ${totalFetched} registros em ${pages} página(s) (${isInitial ? 'initial' : 'delta'})`);
      _emit('table_updated', { table: tableName, count: totalFetched, isInitial });
    } else {
      console.log(`[SyncEngine] ✓ ${tableName}: sem alterações`);
    }

    return { count: totalFetched, isInitial, pages };
  } catch (err) {
    console.error(`[SyncEngine] ✗ deltaSync(${tableName}):`, err.message);
    _emit('error', { table: tableName, error: err.message });
    return { count: 0, isInitial, pages, error: err.message };
  }
}

/**
 * Sincroniza TODAS as tabelas configuradas em paralelo.
 * Usa AsyncMutex para evitar corrida de sync simultâneas.
 */
export async function syncAll() {
  // Verifica conectividade real (não apenas navigator.onLine)
  if (!await _isReallyOnline()) {
    console.log('[SyncEngine] Sem conectividade real, abortando sync.');
    return { success: 0, failed: 0 };
  }

  try {
    await _syncMutex.acquire();
  } catch (err) {
    console.log('[SyncEngine] Sync já em andamento (mutex), ignorando.');
    return { success: 0, failed: 0 };
  }

  _emit('sync_start');

  const tables = Object.keys(TABLE_CONFIGS);
  let success = 0;
  let failed = 0;

  try {
    // Paraleliza para velocidade em mobile
    const results = await Promise.allSettled(
      tables.map(t => deltaSync(t))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.error) success++;
      else failed++;
    }

    // Processa fila de mutações pendentes
    await processQueue();

    console.log(`[SyncEngine] Sync completo: ${success}/${tables.length} ok`);
  } finally {
    _syncMutex.release();
    _emit('sync_end', { success, failed, total: tables.length });
  }

  return { success, failed };
}

// ─── 2. MUTATION QUEUE — Escritas Optimistic + Fila ─────────────────────────

/**
 * Executa uma mutação de forma Optimistic:
 *   1. Aplica no cache local IMEDIATAMENTE
 *   2. Tenta enviar ao Supabase
 *   3. Se falhar, enfileira com exponential backoff + jitter
 *   4. Suporta idempotency key para deduplicação
 *
 * @param {string} table - Nome da tabela
 * @param {'INSERT'|'UPDATE'|'DELETE'} operation
 * @param {object} payload - Dados da operação
 * @param {string} [recordId] - ID do registro (para UPDATE/DELETE)
 * @returns {Promise<{ success: boolean, data?: any, queued?: boolean }>}
 */
export async function mutate(table, operation, payload, recordId) {
  const config = TABLE_CONFIGS[table];
  if (config && config.writable === false) {
    console.error(`[SyncEngine] Tabela "${table}" é read-only.`);
    return { success: false, error: 'Tabela somente leitura' };
  }

  // ── Gerar idempotency key para deduplicação ──
  const idempotencyKey = `${table}_${operation}_${recordId || payload.id || ''}_${Date.now()}`;

  // ── 1. Optimistic update no cache local ──
  const now = new Date().toISOString();

  if (operation === 'INSERT') {
    if (!payload.id) {
      payload.id = crypto.randomUUID
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }
    payload.created_at = payload.created_at || now;
    payload.updated_at = now;
    payload.is_deleted = false;
    await db.put(table, payload);
  } else if (operation === 'UPDATE') {
    if (!recordId) return { success: false, error: 'ID necessário para UPDATE' };
    payload.updated_at = now;
    // Merge com dados existentes no cache
    const existing = await db.getById(table, recordId);
    const merged = { ...existing, ...payload, id: recordId };
    await db.put(table, merged);
  } else if (operation === 'DELETE') {
    if (!recordId) return { success: false, error: 'ID necessário para DELETE' };
    // Soft delete local: marca como is_deleted (para convergir com servidor)
    const existing = await db.getById(table, recordId);
    if (existing) {
      existing.is_deleted = true;
      existing.updated_at = now;
      await db.put(table, existing);
    }
    // Também remove fisicamente do cache (a UI não deve ver registros deletados)
    await db.remove(table, recordId);
  }

  // Notifica a UI que a tabela mudou
  _emit('table_updated', { table, source: 'local_mutation', operation, recordId: recordId || payload.id });

  // ── 2. Tenta enviar ao servidor ──

  if (!navigator.onLine) {
    await db.enqueueMutation({
      table, operation, payload,
      recordId: recordId || payload.id,
      idempotencyKey,
    });
    _emit('queue_change', { table, pending: await db.getMutationCount() });
    return { success: false, queued: true };
  }

  try {
    const result = await _executeRemote(table, operation, payload, recordId || payload.id);

    // Se o servidor retornou dados, atualiza o cache com a versão autoritativa
    if (result && result.length > 0 && operation !== 'DELETE') {
      await db.put(table, result[0]);
      // Atualiza o cursor para capturar esse updated_at
      if (result[0].updated_at) {
        const currentCursor = await db.getSyncCursor(table);
        if (!currentCursor || result[0].updated_at > currentCursor) {
          await db.setSyncCursor(table, result[0].updated_at);
        }
      }
      // Emit novamente com dados autoritativos do servidor
      _emit('table_updated', { table, source: 'server_confirm', operation, recordId: recordId || payload.id });
    }

    return { success: true, data: result };
  } catch (err) {
    console.warn(`[SyncEngine] Falha remota, enfileirando:`, err.message);
    await db.enqueueMutation({
      table, operation, payload,
      recordId: recordId || payload.id,
      idempotencyKey,
    });
    _emit('queue_change', { table, pending: await db.getMutationCount() });
    return { success: false, queued: true, error: err.message };
  }
}

/**
 * Executa a operação diretamente no Supabase.
 * Para DELETE, faz SOFT DELETE (UPDATE is_deleted = true).
 */
async function _executeRemote(table, operation, payload, recordId) {
  switch (operation) {
    case 'INSERT': {
      // Remove campos locais temporários
      const clean = { ...payload };
      delete clean._localOnly;
      const { data, error } = await supabase.from(table).insert(clean).select();
      if (error) throw error;
      return data;
    }
    case 'UPDATE': {
      const clean = { ...payload };
      delete clean._localOnly;
      delete clean.id; // Não enviar ID no body do UPDATE
      const { data, error } = await supabase.from(table).update(clean).eq('id', recordId).select();
      if (error) throw error;
      return data;
    }
    case 'DELETE': {
      // ★ SOFT DELETE: marca is_deleted = true no servidor
      const { data, error } = await supabase
        .from(table)
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', recordId)
        .select();
      if (error) throw error;
      return data;
    }
    default:
      throw new Error(`Operação desconhecida: ${operation}`);
  }
}

// ─── 3. QUEUE PROCESSOR — Exponential Backoff + Jitter ──────────────────────

/**
 * Processa a fila de mutações pendentes.
 * Respeita o `nextRetryAt` para exponential backoff.
 */
export async function processQueue() {
  if (!navigator.onLine) return;

  const ops = await db.getRetryableMutations();
  if (ops.length === 0) return;

  console.log(`[SyncEngine] Processando fila: ${ops.length} mutações`);
  _emit('queue_change', { processing: true, count: ops.length });

  let processed = 0;
  let failed = 0;

  for (const op of ops) {
    // Discard se excedeu max retries
    if (op.retries >= MAX_MUTATION_RETRIES) {
      console.warn(`[SyncEngine] Descartando mutação após ${MAX_MUTATION_RETRIES} tentativas:`, op);
      await db.dequeueMutation(op.key);
      _emit('error', {
        type: 'mutation_discarded',
        table: op.table,
        operation: op.operation,
        error: op.lastError,
      });
      failed++;
      continue;
    }

    try {
      await _executeRemote(op.table, op.operation, op.payload, op.recordId);
      await db.dequeueMutation(op.key);
      processed++;
    } catch (err) {
      console.error(`[SyncEngine] Retry falhou (${op.retries + 1}/${MAX_MUTATION_RETRIES}):`, err.message);
      await db.markMutationRetry(op.key, err);
      failed++;
    }
  }

  const remaining = await db.getMutationCount();
  _emit('queue_change', { processing: false, processed, failed, remaining });
  console.log(`[SyncEngine] Fila: ${processed} processados, ${failed} falharam, ${remaining} restantes`);
}

// ─── 4. NETWORK LISTENERS & AUTO-SYNC ───────────────────────────────────────

let _autoSyncActive = false;
let _lastSyncTimestamp = 0;
const MIN_SYNC_INTERVAL = 120_000; // 2 minutos entre syncs automáticos

/**
 * Verifica conectividade REAL (não apenas navigator.onLine).
 * navigator.onLine retorna true em captive portals e redes sem internet.
 */
async function _isReallyOnline() {
  if (!navigator.onLine) return false;

  try {
    // Tenta um HEAD request leve ao Supabase para validar conectividade
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const url = supabase.supabaseUrl || '';
    if (!url) return navigator.onLine;

    const resp = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': supabase.supabaseKey || '',
      },
    });
    return resp.ok || resp.status === 400 || resp.status === 401;
  } catch {
    // Se o fetch falhou, provavelmente sem internet
    return false;
  }
}

function _onOnline() {
  console.log('[SyncEngine] 🟢 Online — sincronizando...');
  _emit('online');
  // Delay para estabilizar conexão
  setTimeout(() => {
    processQueue();
    syncAll();
  }, 2000);
}

function _onOffline() {
  console.log('[SyncEngine] 🔴 Offline');
  _emit('offline');
}

/**
 * Inicializa o Sync Engine:
 *   • Registra listeners de rede
 *   • Inicia timer da fila de mutações
 *   • Faz sync inicial se online
 */
export function initialize() {
  if (_initialized) return;
  _initialized = true;

  // Network listeners
  window.addEventListener('online', _onOnline);
  window.addEventListener('offline', _onOffline);
  _autoSyncActive = true;

  // Timer de processamento da fila (exponential backoff retry loop)
  _queueIntervalId = setInterval(() => {
    if (navigator.onLine) processQueue();
  }, QUEUE_PROCESS_INTERVAL);

  // Visibility change: re-sync ao voltar ao app
  document.addEventListener('visibilitychange', _handleVisibility);

  // Sync inicial com delay para não bloquear o render
  if (navigator.onLine) {
    setTimeout(() => syncAll(), 1500);
  }

  console.log('[SyncEngine] ✅ Inicializado v3');
}

function _handleVisibility() {
  if (document.visibilityState !== 'visible') return;
  if (!navigator.onLine || _syncMutex.isLocked) return;

  // Só re-sync se faz mais de MIN_SYNC_INTERVAL
  if (Date.now() - _lastSyncTimestamp < MIN_SYNC_INTERVAL) return;

  setTimeout(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      _lastSyncTimestamp = Date.now();
      processQueue();
      syncAll();
    }
  }, 1500);
}

/** Desliga o engine (cleanup) */
export function destroy() {
  window.removeEventListener('online', _onOnline);
  window.removeEventListener('offline', _onOffline);
  document.removeEventListener('visibilitychange', _handleVisibility);
  if (_queueIntervalId) clearInterval(_queueIntervalId);
  _initialized = false;
  _autoSyncActive = false;
  console.log('[SyncEngine] Destruído');
}

// ─── 5. APLICAR EVENTO REALTIME ─────────────────────────────────────────────

/**
 * Chamado pelo realtimeManager quando chega um evento debounced.
 * Aplica LWW antes de atualizar o cache.
 *
 * @param {string} table
 * @param {'INSERT'|'UPDATE'|'DELETE'} eventType
 * @param {object} payload - new record from Realtime
 */
export async function applyRealtimeEvent(table, eventType, payload) {
  if (!payload) return;

  if (eventType === 'DELETE' || payload.is_deleted) {
    await db.remove(table, payload.id);
    _emit('table_updated', { table, source: 'realtime', operation: 'DELETE', recordId: payload.id });
    return;
  }

  // Last-Write-Wins: verifica se o local é mais recente
  const local = await db.getById(table, payload.id);
  if (local && local.updated_at && payload.updated_at) {
    if (new Date(local.updated_at) > new Date(payload.updated_at)) {
      console.log(`[SyncEngine] LWW: local mais recente para ${table}/${payload.id}, ignorando realtime`);
      return;
    }
  }

  await db.put(table, payload);

  // Atualiza cursor se necessário
  if (payload.updated_at) {
    const cursor = await db.getSyncCursor(table);
    if (!cursor || payload.updated_at > cursor) {
      await db.setSyncCursor(table, payload.updated_at);
    }
  }

  _emit('table_updated', { table, source: 'realtime', operation: eventType, recordId: payload.id });
}

// ─── 6. UTILITÁRIOS PÚBLICOS ────────────────────────────────────────────────

/** Retorna dados do cache local para uma tabela (exclui soft-deleted) */
export async function getCached(tableName) {
  const all = await db.getAll(tableName);
  return all.filter(r => !r.is_deleted);
}

/** Retorna se está sincronizando */
export function isSyncing() {
  return _syncMutex.isLocked;
}

/** Retorna a contagem de mutações pendentes */
export async function getPendingCount() {
  return db.getMutationCount();
}

/** Retorna configuração de uma tabela */
export function getTableConfig(tableName) {
  return TABLE_CONFIGS[tableName] || null;
}

/** Retorna nomes de todas as tabelas configuradas */
export function getConfiguredTables() {
  return Object.keys(TABLE_CONFIGS);
}

/** Força um full reload de uma tabela (limpa cursor) */
export async function forceFullReload(tableName) {
  await db.clearSyncCursor(tableName);
  await db.clear(tableName);
  return deltaSync(tableName);
}

/**
 * Reseta TUDO — limpa cache, cursors e fila de mutações.
 * Usar apenas em logout ou debug.
 */
export async function resetAll() {
  destroy();
  await db.clearAll();
  _lastSyncTimestamp = 0;
  console.log('[SyncEngine] Reset completo');
}

// ─── Default Export ─────────────────────────────────────────────────────────

export default {
  initialize,
  destroy,
  syncAll,
  deltaSync,
  mutate,
  processQueue,
  applyRealtimeEvent,
  getCached,
  isSyncing,
  getPendingCount,
  getTableConfig,
  getConfiguredTables,
  forceFullReload,
  resetAll,
  subscribe,
};
