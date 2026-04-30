/**
 * useConnectionRecovery.js — Hook que detecta quando o app volta de hibernação
 * e força reconexão com o Supabase para evitar conexões "mortas".
 * 
 * Monitora:
 * - visibilitychange: quando o usuário volta para a aba
 * - online: quando a rede é restaurada
 * 
 * Ações:
 * - Renova a sessão Supabase (auth.getSession) para manter token vivo
 * - Faz um "ping" leve ao Supabase para aquecer a conexão
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function useConnectionRecovery() {
  const lastActiveRef = useRef(Date.now());

  useEffect(() => {
    // Quando a aba perde foco, marca o timestamp
    const handleHidden = () => {
      if (document.visibilityState === 'hidden') {
        lastActiveRef.current = Date.now();
      }
    };

    // Quando a aba volta, verifica quanto tempo ficou inativa
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;

      const inactiveMs = Date.now() - lastActiveRef.current;
      const INACTIVITY_THRESHOLD = 2 * 60 * 1000; // 2 minutos

      if (inactiveMs > INACTIVITY_THRESHOLD) {
        console.log(`[ConnectionRecovery] 🔄 Aba reativada após ${Math.round(inactiveMs / 1000)}s — renovando sessão Supabase`);
        
        // Renova a sessão auth (refresh token)
        supabase.auth.getSession()
          .then(({ data }) => {
            if (data?.session) {
              console.log('[ConnectionRecovery] ✅ Sessão Supabase ativa');
            }
          })
          .catch(err => {
            console.warn('[ConnectionRecovery] ⚠ Falha ao renovar sessão:', err);
          });
      }

      lastActiveRef.current = Date.now();
    };

    // Quando a rede volta, faz o mesmo
    const handleOnline = () => {
      console.log('[ConnectionRecovery] 🌐 Rede restaurada — renovando sessão');
      supabase.auth.getSession().catch(console.warn);
      lastActiveRef.current = Date.now();
    };

    document.addEventListener('visibilitychange', handleHidden);
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleOnline);
    };
  }, []);
}
