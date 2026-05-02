/**
 * useSyncTable.js — Hook React para consumir dados de uma tabela sincronizada
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Lê dados do cache local (IndexedDB) INSTANTANEAMENTE
 *   • Escuta eventos do SyncEngine para re-renderizar quando a tabela muda
 *   • NUNCA bloqueia a UI — dados do cache são imediatos
 *   • Suporta filtros locais e ordenação
 *
 * Uso:
 *   const { data, loading, isStale, refresh } = useSyncTable('clientes', {
 *     filter: { ativo: true },
 *     orderBy: 'nome',
 *   });
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import syncEngine from '../lib/syncEngine';
import db from '../lib/offlineDb';

/**
 * @param {string} tableName - Nome da tabela sincronizada
 * @param {Object} [options]
 * @param {Object} [options.filter] - Filtros simples { coluna: valor }
 * @param {Function} [options.filterFn] - Filtro avançado (record) => boolean
 * @param {string} [options.orderBy] - Coluna para ordenação
 * @param {boolean} [options.ascending] - Direção (default: true)
 * @param {number} [options.limit] - Limitar resultados
 *
 * @returns {{ data: Array, loading: boolean, isStale: boolean, error: string|null, refresh: Function }}
 */
export function useSyncTable(tableName, options = {}) {
  const {
    filter = {},
    filterFn = null,
    orderBy = null,
    ascending = true,
    limit = 0,
  } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState(null);

  // Ref para evitar closures stale em subscriptions
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Serializa filtros para dependency (evita loops infinitos)
  const filterKey = JSON.stringify(filter);

  /**
   * Lê dados do cache local e aplica filtros/ordenação.
   * Essa é uma operação SÍNCRONA do ponto de vista da UI
   * (IndexedDB é muito rápido, ~1-5ms para 1000 registros).
   */
  const loadFromCache = useCallback(async () => {
    try {
      let records = await syncEngine.getCached(tableName);

      // Filtros simples
      const currentFilter = optionsRef.current.filter || {};
      for (const [key, value] of Object.entries(currentFilter)) {
        records = records.filter(r => r[key] === value);
      }

      // Filtro avançado
      const currentFilterFn = optionsRef.current.filterFn;
      if (currentFilterFn) {
        records = records.filter(currentFilterFn);
      }

      // Ordenação
      const currentOrderBy = optionsRef.current.orderBy;
      if (currentOrderBy) {
        const asc = optionsRef.current.ascending !== false;
        records.sort((a, b) => {
          const va = a[currentOrderBy] ?? '';
          const vb = b[currentOrderBy] ?? '';
          if (typeof va === 'string') {
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
          }
          return asc ? va - vb : vb - va;
        });
      }

      // Limite
      const currentLimit = optionsRef.current.limit;
      if (currentLimit > 0) {
        records = records.slice(0, currentLimit);
      }

      setData(records);
      setError(null);
    } catch (err) {
      console.error(`[useSyncTable] Erro lendo cache de "${tableName}":`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName, filterKey]);

  // ── Carregamento inicial ──
  useEffect(() => {
    setLoading(true);
    loadFromCache();
  }, [loadFromCache]);

  // ── Escuta eventos do SyncEngine ──
  useEffect(() => {
    // Quando a tabela é atualizada (delta sync, realtime, ou mutação local)
    const unsub1 = syncEngine.subscribe('table_updated', (detail) => {
      if (detail.table === tableName) {
        loadFromCache();
      }
    });

    // Quando um sync completo termina
    const unsub2 = syncEngine.subscribe('sync_end', () => {
      loadFromCache();
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [tableName, loadFromCache]);

  // ── Refresh manual ──
  const refresh = useCallback(async () => {
    setIsStale(true);
    try {
      if (navigator.onLine) {
        await syncEngine.deltaSync(tableName);
      }
      await loadFromCache();
    } finally {
      setIsStale(false);
    }
  }, [tableName, loadFromCache]);

  return {
    data,
    loading,
    isStale,
    error,
    refresh,
  };
}

export default useSyncTable;
