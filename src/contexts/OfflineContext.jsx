/**
 * OfflineContext.jsx — Contexto global para gerenciamento do modo offline.
 * Provê estado de conexão, contagem de operações pendentes e controle de sync.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import syncManager from '../lib/syncManager';
import db from '../lib/offlineDb';

const OfflineContext = createContext({});

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const initialSyncDone = useRef(false);

  // Escuta mudanças de conexão
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Escuta eventos do sync manager
  useEffect(() => {
    const unsubscribe = syncManager.onSyncChange((event) => {
      switch (event.type) {
        case 'sync_start':
          setIsSyncing(true);
          setSyncError(null);
          break;
        case 'sync_complete':
          setIsSyncing(false);
          setLastSync(new Date().toISOString());
          if (event.failed > 0) {
            setSyncError(`${event.failed} tabela(s) com erro`);
          }
          _refreshPendingCount();
          break;
        case 'queue_add':
        case 'queue_processed':
          _refreshPendingCount();
          break;
        case 'online':
          setIsOnline(true);
          break;
        case 'offline':
          setIsOnline(false);
          break;
      }
    });

    // Ativa auto-sync
    syncManager.enableAutoSync();

    return () => {
      unsubscribe();
      syncManager.disableAutoSync();
    };
  }, []);

  // Sincronização inicial ao carregar a app (com timeout de segurança)
  useEffect(() => {
    if (!initialSyncDone.current && isOnline) {
      initialSyncDone.current = true;
      // Pequeno delay para não bloquear o render inicial
      const timer = setTimeout(() => {
        syncManager.syncAll().catch(console.error);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Ao retornar ao app (visibility change), fazer sync leve se necessário
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && navigator.onLine && !isSyncing) {
        // Só re-sincroniza se faz mais de 5 minutos desde o último sync
        const last = lastSync ? new Date(lastSync) : null;
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (!last || last < fiveMinAgo) {
          // Delay para estabilizar conexão ao voltar
          setTimeout(() => {
            if (document.visibilityState === 'visible') {
              syncManager.syncAll().catch(console.error);
            }
          }, 1500);
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isSyncing, lastSync]);

  // Atualiza contagem de operações pendentes
  async function _refreshPendingCount() {
    try {
      const count = await syncManager.getPendingCount();
      setPendingOps(count);
    } catch (e) {
      console.error('[OfflineContext] Erro ao contar ops pendentes:', e);
    }
  }

  // Força sincronização manual
  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncError('Sem conexão com a internet');
      return;
    }
    try {
      await syncManager.syncAll();
    } catch (err) {
      setSyncError(err.message);
    }
  }, []);

  // Refresh da contagem periodicamente (reduzido para 60s)
  useEffect(() => {
    _refreshPendingCount();
    const interval = setInterval(_refreshPendingCount, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <OfflineContext.Provider value={{
      isOnline,
      isSyncing,
      pendingOps,
      lastSync,
      syncError,
      syncNow,
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
