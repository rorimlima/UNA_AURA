/**
 * useLoadingSafety.js — Hook de segurança contra loading infinito.
 * 
 * Protege contra estados de loading que ficam "presos" quando:
 * - O Vercel/Supabase hiberna a conexão
 * - O usuário sai da aba e volta depois
 * - Uma requisição fica pendurada sem retorno
 * 
 * Uso:
 *   const { loading, setLoading } = useLoadingSafety(loadData, { timeout: 30000 });
 * 
 * Ou para wrapping simples:
 *   useLoadingSafetyGuard(loading, setLoading, { timeout: 30000 });
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Guard hook — monitora um par [loading, setLoading] existente e aplica:
 * 1. Safety timer: se loading ficar true por mais de `timeout` ms, força reset
 * 2. Visibility change: ao voltar para a aba, se estava em loading, força reset
 * 3. AbortController ref para cancelar fetches pendentes
 */
export function useLoadingSafetyGuard(loading, setLoading, options = {}) {
  const { timeout = 30000 } = options;
  const abortControllerRef = useRef(null);

  // 1. Safety timer — se ficou mais de `timeout` em loading, força reset
  useEffect(() => {
    if (loading) {
      const safetyTimer = setTimeout(() => {
        console.warn('[LoadingSafety] ⏰ Timeout atingido, forçando reset do loading');
        abortControllerRef.current?.abort();
        setLoading(false);
      }, timeout);

      return () => clearTimeout(safetyTimer);
    }
  }, [loading, setLoading, timeout]);

  // 2. Visibility change — ao voltar para a aba, se estava em loading, reseta
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && loading) {
        console.warn('[LoadingSafety] 👁 Aba reativada durante loading, forçando reset');
        abortControllerRef.current?.abort();
        setLoading(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loading, setLoading]);

  return { abortControllerRef };
}

/**
 * Cria um AbortController com timeout automático para uso em fetches.
 * 
 * Uso:
 *   const { controller, cleanup } = createTimedAbortController(30000);
 *   try {
 *     const res = await fetch(url, { signal: controller.signal });
 *   } finally {
 *     cleanup();
 *   }
 */
export function createTimedAbortController(timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

export default useLoadingSafetyGuard;
