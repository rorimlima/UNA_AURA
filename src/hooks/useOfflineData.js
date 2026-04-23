/**
 * useOfflineData.js — Hook para buscar dados com suporte offline.
 * Busca primeiro do IndexedDB (instantâneo), depois atualiza do Supabase em background.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import db from '../lib/offlineDb';
import syncManager from '../lib/syncManager';

/**
 * Hook reutilizável para acessar dados com fallback offline.
 *
 * @param {string} table - Nome da tabela
 * @param {object} [options]
 * @param {string} [options.select] - Colunas/relações para select (padrão: '*')
 * @param {object} [options.filter] - Filtros { coluna: valor }
 * @param {string} [options.orderBy] - Coluna para ordenação
 * @param {boolean} [options.ascending] - Direção da ordenação (padrão: true)
 * @param {boolean} [options.skipRemote] - Pula a busca remota (só local)
 *
 * @returns {{ data: Array, loading: boolean, error: string|null, refresh: Function, save: Function, remove: Function, isFromCache: boolean }}
 */
export function useOfflineData(table, options = {}) {
  const { select = '*', filter = {}, orderBy, ascending = true, skipRemote = false } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Aplica filtros locais nos dados do cache
  function applyLocalFilters(items) {
    let filtered = [...items];

    // Filtros simples (key=value)
    for (const [key, value] of Object.entries(filter)) {
      filtered = filtered.filter(item => item[key] === value);
    }

    // Ordenação local
    if (orderBy) {
      filtered.sort((a, b) => {
        const va = a[orderBy] || '';
        const vb = b[orderBy] || '';
        if (typeof va === 'string') {
          return ascending ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return ascending ? va - vb : vb - va;
      });
    }

    return filtered;
  }

  // Carrega dados
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Busca do cache local primeiro (resposta instantânea)
      const cached = await db.getAll(table);
      if (cached.length > 0) {
        setData(applyLocalFilters(cached));
        setIsFromCache(true);
        setLoading(false); // Libera a UI imediatamente
      }

      // 2. Se online e não skipRemote, busca do Supabase em background
      if (navigator.onLine && !skipRemote) {
        try {
          let query = supabase.from(table).select(select);

          // Aplica filtros remotos
          for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
          }

          if (orderBy) {
            query = query.order(orderBy, { ascending });
          }

          const { data: remoteData, error: remoteError } = await query;

          if (remoteError) throw remoteError;

          if (remoteData) {
            // Atualiza cache local
            await db.clear(table);
            await db.putAll(table, remoteData);
            await db.setLastSync(table);

            setData(remoteData);
            setIsFromCache(false);
          }
        } catch (remoteErr) {
          console.warn(`[useOfflineData] Falha remota para "${table}", usando cache:`, remoteErr);
          // Não atualiza error se já temos cache
          if (cached.length === 0) {
            setError(`Offline: ${remoteErr.message}`);
          }
        }
      } else if (cached.length === 0) {
        // Sem cache e sem internet
        setError('Sem dados em cache e sem conexão');
      }
    } catch (err) {
      console.error(`[useOfflineData] Erro ao carregar "${table}":`, err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [table, select, JSON.stringify(filter), orderBy, ascending, skipRemote]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Salva registro (com suporte offline)
  const save = useCallback(async (payload, id = null) => {
    const operation = id ? 'UPDATE' : 'INSERT';

    // Gera ID temporário para INSERT se necessário
    if (!id && !payload.id) {
      payload.id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    const result = await syncManager.executeOrQueue(table, operation, payload, id || payload.id);

    // Refresh dos dados locais
    await loadData();

    return result;
  }, [table, loadData]);

  // Remove registro (com suporte offline)
  const remove = useCallback(async (id) => {
    const result = await syncManager.executeOrQueue(table, 'DELETE', {}, id);
    await loadData();
    return result;
  }, [table, loadData]);

  return {
    data,
    loading,
    error,
    refresh: loadData,
    save,
    remove,
    isFromCache,
  };
}

export default useOfflineData;
