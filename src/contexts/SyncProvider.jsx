/**
 * SyncProvider.jsx — Contexto global de sincronização v3
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Inicializa o SyncEngine e RealtimeManager UMA VEZ no boot
 *   • Expõe estado reativo (isOnline, isSyncing, pendingOps) via Context
 *   • Escuta eventos do SyncEngine sem causar re-renders excessivos
 *   • Provê syncNow() para forçar sincronização manual
 *   • Error boundary: erros do engine não crasham o app
 *   • resetAll() para logout
 *
 * ★ NUNCA renderiza overlays modais — apenas indicadores passivos.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import syncEngine from '../lib/syncEngine';
import realtimeManager from '../lib/realtimeManager';
import { useAuth } from './AuthContext';

const SyncContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingOps: 0,
  lastSyncAt: null,
  syncError: null,
  syncNow: () => {},
  resetSync: () => {},
});

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const initialized = useRef(false);

  // ── Boot: Inicializa SyncEngine + Realtime somente quando AUTENTICADO ──
  useEffect(() => {
    // Não inicializa se não tem usuário autenticado
    if (!user) {
      // Se já estava inicializado e o user fez logout, limpa tudo
      if (initialized.current) {
        try {
          syncEngine.destroy();
          realtimeManager.destroy();
        } catch (_) { /* cleanup seguro */ }
        initialized.current = false;
        setPendingOps(0);
        setLastSyncAt(null);
        setSyncError(null);
        setIsSyncing(false);
      }
      return;
    }

    if (initialized.current) return;
    initialized.current = true;

    // Inicialização lazy: não bloqueia o primeiro render
    const timer = setTimeout(() => {
      try {
        syncEngine.initialize();
        realtimeManager.initialize();
      } catch (err) {
        console.error('[SyncProvider] Erro na inicialização:', err);
        setSyncError('Erro ao inicializar sincronização');
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [user]);

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
      } else {
        setSyncError(null);
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
        // Auto-clear após 10s
        setTimeout(() => setSyncError(null), 10_000);
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
      try {
        const count = await syncEngine.getPendingCount();
        setPendingOps(count);
      } catch (_) { /* silenciar erros de count */ }
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Forçar sync manual ──
  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncError('Sem conexão com a internet');
      setTimeout(() => setSyncError(null), 5_000);
      return;
    }
    try {
      await syncEngine.syncAll();
    } catch (err) {
      setSyncError(err.message);
    }
  }, []);

  // ── Reset completo (para logout) ──
  const resetSync = useCallback(async () => {
    try {
      await syncEngine.resetAll();
      setPendingOps(0);
      setLastSyncAt(null);
      setSyncError(null);
      setIsSyncing(false);
    } catch (err) {
      console.error('[SyncProvider] Erro no reset:', err);
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
      resetSync,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook para acessar o estado de sincronização.
 * Retorna: { isOnline, isSyncing, pendingOps, lastSyncAt, syncError, syncNow, resetSync }
 */
export function useSync() {
  return useContext(SyncContext);
}

export default SyncProvider;
