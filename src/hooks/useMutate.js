/**
 * useMutate.js — Hook React para escritas Optimistic no Sync Engine
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Expor funções insert/update/remove com API simples
 *   • Atualizar cache local e UI IMEDIATAMENTE (optimistic)
 *   • Enfileirar para servidor em background
 *   • Retornar status da última operação
 *
 * Uso:
 *   const { insert, update, remove, status } = useMutate('clientes');
 *
 *   await insert({ nome: 'João', email: 'joao@mail.com' });
 *   await update(id, { nome: 'João Silva' });
 *   await remove(id);
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback } from 'react';
import syncEngine from '../lib/syncEngine';

/**
 * @param {string} tableName - Nome da tabela
 * @returns {{ insert: Function, update: Function, remove: Function, status: Object }}
 */
export function useMutate(tableName) {
  const [status, setStatus] = useState({
    loading: false,
    error: null,
    lastOp: null,
    queued: false,
  });

  /**
   * INSERT — cria um novo registro.
   * O ID é gerado automaticamente se não fornecido.
   */
  const insert = useCallback(async (payload) => {
    setStatus({ loading: true, error: null, lastOp: 'INSERT', queued: false });
    try {
      const result = await syncEngine.mutate(tableName, 'INSERT', { ...payload });
      setStatus({
        loading: false,
        error: result.error || null,
        lastOp: 'INSERT',
        queued: !!result.queued,
      });
      return result;
    } catch (err) {
      setStatus({ loading: false, error: err.message, lastOp: 'INSERT', queued: false });
      return { success: false, error: err.message };
    }
  }, [tableName]);

  /**
   * UPDATE — atualiza campos de um registro existente.
   * Faz merge com os dados atuais do cache.
   */
  const update = useCallback(async (recordId, payload) => {
    setStatus({ loading: true, error: null, lastOp: 'UPDATE', queued: false });
    try {
      const result = await syncEngine.mutate(tableName, 'UPDATE', { ...payload }, recordId);
      setStatus({
        loading: false,
        error: result.error || null,
        lastOp: 'UPDATE',
        queued: !!result.queued,
      });
      return result;
    } catch (err) {
      setStatus({ loading: false, error: err.message, lastOp: 'UPDATE', queued: false });
      return { success: false, error: err.message };
    }
  }, [tableName]);

  /**
   * REMOVE — soft delete de um registro.
   * Remove do cache local e envia is_deleted=true ao servidor.
   */
  const remove = useCallback(async (recordId) => {
    setStatus({ loading: true, error: null, lastOp: 'DELETE', queued: false });
    try {
      const result = await syncEngine.mutate(tableName, 'DELETE', {}, recordId);
      setStatus({
        loading: false,
        error: result.error || null,
        lastOp: 'DELETE',
        queued: !!result.queued,
      });
      return result;
    } catch (err) {
      setStatus({ loading: false, error: err.message, lastOp: 'DELETE', queued: false });
      return { success: false, error: err.message };
    }
  }, [tableName]);

  return {
    insert,
    update,
    remove,
    status,
  };
}

export default useMutate;
