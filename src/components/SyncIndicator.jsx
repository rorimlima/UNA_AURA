/**
 * SyncIndicator.jsx — Indicador passivo de sincronização
 * ══════════════════════════════════════════════════════════════════════════════
 * ★ NUNCA bloqueia a UI. É um ícone discreto no canto da tela.
 *   - Verde pulsante: sincronizando em background
 *   - Laranja: mutações pendentes na fila
 *   - Vermelho: offline
 *   - Invisível: tudo ok e ocioso
 *
 * Posicionamento: fixed bottom-right, z-index alto mas não-modal.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { useSync } from '../contexts/SyncProvider';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';

export function SyncIndicator() {
  const { isOnline, isSyncing, pendingOps, syncError } = useSync();

  // Sem nada para mostrar — fica invisível
  if (isOnline && !isSyncing && pendingOps === 0 && !syncError) {
    return null;
  }

  let icon, label, className;

  if (!isOnline) {
    icon = <CloudOff size={16} />;
    label = 'Offline';
    className = 'sync-indicator offline';
  } else if (isSyncing) {
    icon = <RefreshCw size={16} className="sync-spin" />;
    label = 'Sincronizando...';
    className = 'sync-indicator syncing';
  } else if (pendingOps > 0) {
    icon = <Cloud size={16} />;
    label = `${pendingOps} pendente${pendingOps > 1 ? 's' : ''}`;
    className = 'sync-indicator pending';
  } else if (syncError) {
    icon = <AlertCircle size={16} />;
    label = 'Erro de sync';
    className = 'sync-indicator error';
  }

  return (
    <div
      className={className}
      title={syncError || label}
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'white',
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: 0.9,
        backdropFilter: 'blur(8px)',
        transition: 'all 0.3s ease',
      }}
    >
      {icon}
      <span>{label}</span>

      <style>{`
        .sync-indicator.offline {
          background: rgba(220, 53, 69, 0.85);
        }
        .sync-indicator.syncing {
          background: rgba(40, 167, 69, 0.85);
        }
        .sync-indicator.pending {
          background: rgba(255, 165, 0, 0.85);
        }
        .sync-indicator.error {
          background: rgba(220, 53, 69, 0.7);
        }
        .sync-spin {
          animation: sync-rotate 1s linear infinite;
        }
        @keyframes sync-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default SyncIndicator;
