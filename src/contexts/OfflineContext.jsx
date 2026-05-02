/**
 * OfflineContext.jsx — COMPATIBILIDADE RETROATIVA
 * ══════════════════════════════════════════════════════════════════════════════
 * Redireciona para o novo SyncProvider.
 * Módulos que importam useOffline continuarão funcionando.
 *
 * ★ Para novo código, use: import { useSync } from '../contexts/SyncProvider'
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SyncProvider, useSync } from './SyncProvider';

// Re-exporta SyncProvider como OfflineProvider
export const OfflineProvider = SyncProvider;

// Re-exporta useSync com API compatível
export function useOffline() {
  const sync = useSync();
  return {
    isOnline: sync.isOnline,
    isSyncing: sync.isSyncing,
    pendingOps: sync.pendingOps,
    lastSync: sync.lastSyncAt,
    syncError: sync.syncError,
    syncNow: sync.syncNow,
    resetSync: sync.resetSync,
  };
}
