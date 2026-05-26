/**
 * FloatingSyncButton.jsx — FAB de Sincronização Manual
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Botão flutuante para forçar sincronização manual
 *   • 4 estados visuais: idle, syncing, success, error
 *   • Badge com contagem de operações pendentes
 *   • Toast notification elegante com feedback do resultado
 *   • Tooltip informativo no hover
 *   • Mobile-safe: posicionado acima do botão do WhatsApp
 *
 * ★ Design alto padrão: glassmorphism, gradientes dourados, micro-animações.
 * ★ Respeita o design system da UNA AURA (CSS custom properties).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSync } from '../contexts/SyncProvider';
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import './FloatingSyncButton.css';

export default function FloatingSyncButton() {
  const {
    isOnline,
    isSyncing,
    pendingOps,
    syncStatus,
    syncError,
    syncNow,
    lastSyncAt,
  } = useSync();

  const [toast, setToast] = useState(null);     // { type: 'success'|'error', message: string }
  const [isExiting, setIsExiting] = useState(false);
  const toastTimerRef = useRef(null);
  const exitTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  // ── Determinar estado visual ──
  const getVisualState = useCallback(() => {
    if (!isOnline) return 'offline';
    if (syncStatus === 'syncing' || isSyncing) return 'syncing';
    if (syncStatus === 'success') return 'success';
    if (syncStatus === 'error') return 'error';
    return 'idle';
  }, [isOnline, syncStatus, isSyncing]);

  const visualState = getVisualState();

  // ── Handler de click ──
  const handleClick = useCallback(async () => {
    // Prevenir click durante syncing
    if (visualState === 'syncing') return;

    // Limpar toast anterior
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setToast(null);
    setIsExiting(false);

    const result = await syncNow();

    if (result) {
      if (result.ok) {
        showToast('success', 'Dados atualizados com sucesso');
      } else if (result.offline) {
        showToast('error', 'Sem conexão. Tente quando tiver rede.');
      } else {
        showToast('error', result.error || 'Falha na sincronização. Tente novamente.');
      }
    }
  }, [visualState, syncNow]);

  // ── Toast com auto-dismiss ──
  const showToast = useCallback((type, message) => {
    setIsExiting(false);
    setToast({ type, message });

    // Inicia exit animation antes de remover
    exitTimerRef.current = setTimeout(() => {
      setIsExiting(true);
    }, 3200);

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      setIsExiting(false);
    }, 3600);
  }, []);

  // ── Ícone baseado no estado ──
  const renderIcon = () => {
    switch (visualState) {
      case 'offline':
        return <CloudOff size={20} />;
      case 'syncing':
        return <RefreshCw size={20} />;
      case 'success':
        return <Check size={20} strokeWidth={2.5} />;
      case 'error':
        return <AlertTriangle size={20} />;
      default:
        return <Cloud size={20} />;
    }
  };

  // ── Tooltip text ──
  const getTooltipText = () => {
    if (!isOnline) return 'Modo offline';
    if (visualState === 'syncing') return 'Sincronizando...';
    if (pendingOps > 0) return `${pendingOps} operação${pendingOps > 1 ? 'ões' : ''} pendente${pendingOps > 1 ? 's' : ''}`;
    if (lastSyncAt) {
      const diff = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 1000);
      if (diff < 60) return 'Sincronizado agora';
      if (diff < 3600) return `Sync: ${Math.floor(diff / 60)} min atrás`;
      return 'Toque para sincronizar';
    }
    return 'Sincronizar dados';
  };

  return (
    <div className={`fab-sync fab-sync--${visualState}`}>
      {/* Toast de Feedback */}
      {toast && (
        <div
          className={`fab-sync__toast fab-sync__toast--${toast.type}${isExiting ? ' fab-sync__toast-exit' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="fab-sync__toast-icon">
            {toast.type === 'success' ? (
              <Check size={14} strokeWidth={2.5} />
            ) : (
              <AlertTriangle size={14} />
            )}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Botão Principal */}
      <button
        className="fab-sync__button"
        onClick={handleClick}
        disabled={visualState === 'syncing'}
        aria-label={getTooltipText()}
        title=""
        id="fab-sync-button"
      >
        <span className="fab-sync__icon">
          {renderIcon()}
        </span>

        {/* Badge de Pendentes */}
        {pendingOps > 0 && visualState !== 'success' && (
          <span className="fab-sync__badge" aria-label={`${pendingOps} pendentes`}>
            {pendingOps > 99 ? '99+' : pendingOps}
          </span>
        )}
      </button>
    </div>
  );
}
