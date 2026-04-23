/**
 * offlineDb.js — Camada de armazenamento local via IndexedDB
 * Gerencia o cache local para operação offline do UNA AURA ERP.
 */

const DB_NAME = 'una-aura-offline';
const DB_VERSION = 1;

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
  '_sync_queue',
  '_meta',
];

let dbInstance = null;

/**
 * Abre (ou cria) o banco IndexedDB
 */
function openDb() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const keyPath = storeName.startsWith('_') ? 'key' : 'id';
          db.createObjectStore(storeName, { keyPath });
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;

      // Se a conexão é fechada inesperadamente, limpa a referência
      dbInstance.onclose = () => { dbInstance = null; };
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Retorna todos os registros de uma store
 */
export async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Busca um registro por ID
 */
export async function getById(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Insere ou atualiza um registro
 */
export async function put(storeName, data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Insere ou atualiza múltiplos registros em lote
 */
export async function putAll(storeName, items) {
  if (!items || items.length === 0) return;
  const db = await openDb();
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

/**
 * Remove um registro por ID
 */
export async function remove(storeName, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Limpa todos os registros de uma store
 */
export async function clear(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Conta registros em uma store
 */
export async function count(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Meta helpers ───────────────────────────────────────────────────────────

/**
 * Salva timestamp da última sincronização para uma tabela
 */
export async function setLastSync(tableName, timestamp = new Date().toISOString()) {
  return put('_meta', { key: `lastSync_${tableName}`, value: timestamp });
}

/**
 * Retorna timestamp da última sincronização
 */
export async function getLastSync(tableName) {
  const record = await getById('_meta', `lastSync_${tableName}`);
  return record?.value || null;
}

// ─── Sync Queue helpers ─────────────────────────────────────────────────────

/**
 * Adiciona uma operação à fila de sincronização
 * @param {{ table: string, operation: 'INSERT'|'UPDATE'|'DELETE', payload: object, localId?: string }} op
 */
export async function enqueueOp(op) {
  const entry = {
    key: `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ...op,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  return put('_sync_queue', entry);
}

/**
 * Retorna todas as operações pendentes, em ordem
 */
export async function getPendingOps() {
  const ops = await getAll('_sync_queue');
  return ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Remove uma operação da fila (processada com sucesso)
 */
export async function dequeueOp(key) {
  return remove('_sync_queue', key);
}

/**
 * Incrementa retry e atualiza a operação
 */
export async function retryOp(key) {
  const op = await getById('_sync_queue', key);
  if (op) {
    op.retries = (op.retries || 0) + 1;
    op.lastRetry = new Date().toISOString();
    await put('_sync_queue', op);
  }
  return op;
}

export default {
  getAll,
  getById,
  put,
  putAll,
  remove,
  clear,
  count,
  setLastSync,
  getLastSync,
  enqueueOp,
  getPendingOps,
  dequeueOp,
  retryOp,
};
