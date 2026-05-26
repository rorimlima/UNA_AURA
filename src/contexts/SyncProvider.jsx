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
  // ★ Estado granular para o FAB: 'idle' | 'syncing' | 'success' | 'error'
  const [syncStatus, setSyncStatus] = useState('idle');

  const initialized = useRef(false);
  const statusTimerRef = useRef(null);

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
        setSyncStatus('idle');
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

  // Cleanup do timer de status ao desmontar
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // ── Forçar sync manual (com feedback granular para o FAB) ──
  const syncNow = useCallback(async () => {
    // Limpa timer anterior
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    if (!navigator.onLine) {
      setSyncStatus('error');
      setSyncError('Sem conexão com a internet');
      statusTimerRef.current = setTimeout(() => {
        setSyncStatus('idle');
        setSyncError(null);
      }, 4_000);
      return { ok: false, offline: true };
    }

    setSyncStatus('syncing');

    try {
      const result = await syncEngine.forceSyncNow();

      if (result.ok) {
        setSyncStatus('success');
        setSyncError(null);
      } else {
        setSyncStatus('error');
        setSyncError(result.error || result.offline ? 'Sem conexão' : 'Falha na sincronização');
      }

      // Auto-reset para idle após 3s
      statusTimerRef.current = setTimeout(() => {
        setSyncStatus('idle');
        // Limpa erro apenas se era de sync (não de mutação descartada)
        setSyncError(prev => prev === 'Sem conexão' || prev === 'Falha na sincronização' ? null : prev);
      }, 3_000);

      // Atualiza contagem de pendentes
      const pending = await syncEngine.getPendingCount().catch(() => 0);
      setPendingOps(pending);

      return result;
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message);
      statusTimerRef.current = setTimeout(() => {
        setSyncStatus('idle');
      }, 4_000);
      return { ok: false, error: err.message };
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
      setSyncStatus('idle');
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
      syncStatus,
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
