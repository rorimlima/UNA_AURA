/**
 * syncManager.js — COMPATIBILIDADE RETROATIVA
 * ══════════════════════════════════════════════════════════════════════════════
 * Este arquivo redireciona chamadas legadas para o novo syncEngine.js.
 * Módulos que ainda importam de './syncManager' continuarão funcionando.
 *
 * ★ NÃO EDITE ESTE ARQUIVO — use syncEngine.js para nova lógica.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import syncEngine from './syncEngine';
import db from './offlineDb';

// Mapeia APIs legadas para o novo engine

export function onSyncChange(fn) {
  // Converte o novo EventTarget para a API antiga de callback
  const unsubs = [];
  unsubs.push(syncEngine.subscribe('sync_start', () => fn({ type: 'sync_start' })));
  unsubs.push(syncEngine.subscribe('sync_end', (detail) => fn({ type: 'sync_complete', ...detail })));
  unsubs.push(syncEngine.subscribe('queue_change', (detail) => fn({ type: 'queue_add', ...detail })));
  unsubs.push(syncEngine.subscribe('online', () => fn({ type: 'online' })));
  unsubs.push(syncEngine.subscribe('offline', () => fn({ type: 'offline' })));

  return () => unsubs.forEach(u => u());
}

export async function syncTable(tableName) {
  const result = await syncEngine.deltaSync(tableName);
  return !result.error;
}

export async function syncAll() {
  const result = await syncEngine.syncAll();
  return result;
}

export async function executeOrQueue(table, operation, payload, id) {
  const result = await syncEngine.mutate(table, operation, payload, id);
  return result;
}

export async function processQueue() {
  return syncEngine.processQueue();
}

export function enableAutoSync() {
  syncEngine.initialize();
}

export function disableAutoSync() {
  syncEngine.destroy();
}

export function isSyncing() {
  return syncEngine.isSyncing();
}

export async function getCachedData(tableName) {
  return syncEngine.getCached(tableName);
}

export async function getPendingCount() {
  return syncEngine.getPendingCount();
}

export async function resetAll() {
  return syncEngine.resetAll();
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
  resetAll,
};
