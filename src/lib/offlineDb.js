/**
 * offlineDb.js — Camada de armazenamento local via IndexedDB
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • CRUD genérico em qualquer object store
 *   • Armazenar cursors de delta sync (_sync_cursor)
 *   • Gerenciar fila de mutações offline (_mutation_queue)
 *   • Merge inteligente respeitando `updated_at` (Last-Write-Wins local)
 *
 * REGRA: Nenhuma lógica de rede ou Supabase vive aqui — apenas IndexedDB.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const DB_NAME = 'una-aura-offline';
const DB_VERSION = 2; // Bump para novo schema

// Todas as stores do app. Se precisar de mais, adicione aqui.
const STORES = [
  'produtos',
  'clientes',
  'vendas',
  'vendas_itens',
  'vendedores',
  'contas_receber',
  'contas_pagar',
  'empresa',
  'fornecedores',
  'veiculos_bloqueados',
  'ocorrencias_agente',
  'colaboradores',
  'audit_logs',
  // Stores internos do Sync Engine
  '_mutation_queue',  // Fila de mutações pendentes
  '_sync_cursor',     // Timestamps de delta sync por tabela
  '_meta',            // Metadados gerais
];

let _db = null;

// ─── Open / Upgrade ─────────────────────────────────────────────────────────

function _openDb() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      for (const name of STORES) {
        if (!database.objectStoreNames.contains(name)) {
          const keyPath = name.startsWith('_') ? 'key' : 'id';
          const store = database.createObjectStore(name, { keyPath });
          // Índice em updated_at para buscas delta em stores de dados
          if (!name.startsWith('_')) {
            store.createIndex('updated_at', 'updated_at', { unique: false });
          }
          // Índice de timestamp na fila de mutações
          if (name === '_mutation_queue') {
            store.createIndex('created_at', 'created_at', { unique: false });
          }
        }
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onclose = () => { _db = null; };
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── CRUD Genérico ──────────────────────────────────────────────────────────

/** Retorna todos os registros de uma store */
export async function getAll(storeName) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

/** Busca um registro por ID */
export async function getById(storeName, id) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

/** Insere ou atualiza um registro */
export async function put(storeName, data) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const r = store.put(data);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Insere ou atualiza múltiplos registros em lote (1 transaction) */
export async function putAll(storeName, items) {
  if (!items || items.length === 0) return;
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove um registro por ID */
export async function remove(storeName, id) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/** Limpa todos os registros de uma store */
export async function clear(storeName) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const r = store.clear();
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

/** Conta registros em uma store */
export async function count(storeName) {
  const db = await _openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const r = store.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ─── Merge com Last-Write-Wins ──────────────────────────────────────────────

/**
 * Merge inteligente: só sobrescreve se o registro remoto é mais recente.
 * Registros com is_deleted=true são removidos do cache local.
 *
 * @param {string} storeName
 * @param {Array} remoteRecords - Registros vindos do servidor
 * @returns {{ merged: number, deleted: number, skipped: number }}
 */
export async function mergeRecords(storeName, remoteRecords) {
  if (!remoteRecords || remoteRecords.length === 0) {
    return { merged: 0, deleted: 0, skipped: 0 };
  }

  const db = await _openDb();
  let merged = 0, deleted = 0, skipped = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const remote of remoteRecords) {
      const getReq = store.get(remote.id);
      getReq.onsuccess = () => {
        const local = getReq.result;

        // Soft delete: remover do cache local
        if (remote.is_deleted) {
          if (local) store.delete(remote.id);
          deleted++;
          return;
        }

        // Last-Write-Wins: pula se o local é mais recente
        if (local && local.updated_at && remote.updated_at) {
          if (new Date(local.updated_at) > new Date(remote.updated_at)) {
            skipped++;
            return;
          }
        }

        store.put(remote);
        merged++;
      };
    }

    tx.oncomplete = () => resolve({ merged, deleted, skipped });
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Delta Sync Cursors ─────────────────────────────────────────────────────

/** Salva o cursor de delta sync (último updated_at recebido) */
export async function setSyncCursor(tableName, timestamp) {
  return put('_sync_cursor', {
    key: tableName,
    value: timestamp,
    savedAt: new Date().toISOString(),
  });
}

/** Retorna o cursor de delta sync para uma tabela (ou null se nunca sincronizou) */
export async function getSyncCursor(tableName) {
  const record = await getById('_sync_cursor', tableName);
  return record?.value || null;
}

/** Limpa o cursor de delta (força full reload na próxima sync) */
export async function clearSyncCursor(tableName) {
  return remove('_sync_cursor', tableName);
}

// ─── Mutation Queue (Fila de Mutações Offline) ──────────────────────────────

/**
 * Enfileira uma operação de escrita pendente.
 * @param {{ table: string, operation: 'INSERT'|'UPDATE'|'DELETE', payload: object, recordId?: string }} op
 */
export async function enqueueMutation(op) {
  const entry = {
    key: `mut_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    table: op.table,
    operation: op.operation,
    payload: op.payload,
    recordId: op.recordId || null,
    createdAt: new Date().toISOString(),
    retries: 0,
    lastError: null,
    nextRetryAt: null,
  };
  return put('_mutation_queue', entry);
}

/** Retorna todas as mutações pendentes, em ordem cronológica */
export async function getPendingMutations() {
  const ops = await getAll('_mutation_queue');
  return ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Remove uma mutação processada com sucesso */
export async function dequeueMutation(key) {
  return remove('_mutation_queue', key);
}

/** Incrementa retry count + aplica exponential backoff timestamp */
export async function markMutationRetry(key, error) {
  const op = await getById('_mutation_queue', key);
  if (!op) return null;

  op.retries = (op.retries || 0) + 1;
  op.lastError = error?.message || String(error);
  // Exponential backoff: 2^retries * 1000ms (max 5min)
  const delayMs = Math.min(Math.pow(2, op.retries) * 1000, 5 * 60 * 1000);
  op.nextRetryAt = new Date(Date.now() + delayMs).toISOString();

  await put('_mutation_queue', op);
  return op;
}

/** Retorna mutações que estão prontas para retry (nextRetryAt <= now) */
export async function getRetryableMutations() {
  const all = await getPendingMutations();
  const now = new Date().toISOString();
  return all.filter(op => !op.nextRetryAt || op.nextRetryAt <= now);
}

/** Contagem de mutações pendentes */
export async function getMutationCount() {
  return count('_mutation_queue');
}

// ─── Legacy compat (meta helpers) ───────────────────────────────────────────

export async function setLastSync(tableName, timestamp = new Date().toISOString()) {
  return put('_meta', { key: `lastSync_${tableName}`, value: timestamp });
}

export async function getLastSync(tableName) {
  const record = await getById('_meta', `lastSync_${tableName}`);
  return record?.value || null;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export default {
  getAll,
  getById,
  put,
  putAll,
  remove,
  clear,
  count,
  mergeRecords,
  setSyncCursor,
  getSyncCursor,
  clearSyncCursor,
  enqueueMutation,
  getPendingMutations,
  dequeueMutation,
  markMutationRetry,
  getRetryableMutations,
  getMutationCount,
  setLastSync,
  getLastSync,
};
