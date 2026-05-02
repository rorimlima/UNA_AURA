/**
 * SyncProvider.jsx — Contexto global de sincronização
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Inicializa o SyncEngine e RealtimeManager UMA VEZ no boot
 *   • Expõe estado reativo (isOnline, isSyncing, pendingOps) via Context
 *   • Escuta eventos do SyncEngine sem causar re-renders excessivos
 *   • Provê syncNow() para forçar sincronização manual
 *
 * ★ NUNCA renderiza overlays modais — apenas indicadores passivos.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import syncEngine from '../lib/syncEngine';
import realtimeManager from '../lib/realtimeManager';

const SyncContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingOps: 0,
  lastSyncAt: null,
  syncError: null,
  syncNow: () => {},
});

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const initialized = useRef(false);

  // ── Boot: Inicializa SyncEngine + Realtime UMA VEZ ──
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    syncEngine.initialize();
    realtimeManager.initialize();

    return () => {
      syncEngine.destroy();
      realtimeManager.destroy();
      initialized.current = false;
    };
  }, []);

  // ── Escuta eventos do SyncEngine ──
  useEffect(() => {
    const unsubs = [];

    unsubs.push(syncEngine.subscribe('sync_start', () => {
      setIsSyncing(true);
      setSyncError(null);
    }));

    unsubs.push(syncEngine.subscribe('sync_end', (detail) => {
      setIsSyncing(false);
      setLastSyncAt(new Date().toISOString());
      if (detail.failed > 0) {
        setSyncError(`${detail.failed}/${detail.total} tabelas com erro`);
      }
    }));

    unsubs.push(syncEngine.subscribe('queue_change', async (detail) => {
      const count = detail.remaining ?? await syncEngine.getPendingCount();
      setPendingOps(count);
    }));

    unsubs.push(syncEngine.subscribe('online', () => setIsOnline(true)));
    unsubs.push(syncEngine.subscribe('offline', () => setIsOnline(false)));

    unsubs.push(syncEngine.subscribe('error', (detail) => {
      if (detail.type === 'mutation_discarded') {
        setSyncError(`Operação descartada: ${detail.table} (${detail.error})`);
      }
    }));

    // Network listeners nativos (redundância com engine)
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      unsubs.forEach(fn => fn());
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Refresh contagem de pendentes periodicamente ──
  useEffect(() => {
    async function refresh() {
      const count = await syncEngine.getPendingCount();
      setPendingOps(count);
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Forçar sync manual ──
  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncError('Sem conexão com a internet');
      return;
    }
    try {
      await syncEngine.syncAll();
    } catch (err) {
      setSyncError(err.message);
    }
  }, []);

  return (
    <SyncContext.Provider value={{
      isOnline,
      isSyncing,
      pendingOps,
      lastSyncAt,
      syncError,
      syncNow,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook para acessar o estado de sincronização.
 * Retorna: { isOnline, isSyncing, pendingOps, lastSyncAt, syncError, syncNow }
 */
export function useSync() {
  return useContext(SyncContext);
}

export default SyncProvider;
