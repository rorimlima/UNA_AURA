/**
 * OfflineIndicator.jsx — Indicador visual de status online/offline
 * ══════════════════════════════════════════════════════════════════════════════
 * Agora usa o SyncProvider ao invés do OfflineContext legado.
 * Mantém a mesma API visual para o Layout.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { useSync } from '../contexts/SyncProvider';
import { RefreshCw, Cloud, CloudOff, AlertTriangle } from 'lucide-react';

const styles = {
  container: {
    position: 'relative',
  },
  offlineBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    animation: 'offlineSlideIn 0.3s ease-out',
    boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
  },
  syncingBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '6px 16px',
    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    animation: 'offlineSlideIn 0.3s ease-out',
  },
  onlineIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    fontSize: '12px',
    color: 'var(--color-success, #22c55e)',
    cursor: 'pointer',
    borderRadius: '20px',
    transition: 'background 0.2s',
    userSelect: 'none',
  },
  spinning: {
    animation: 'offlineSpin 1s linear infinite',
  },
  pendingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.25)',
    fontSize: '11px',
    fontWeight: 700,
  },
  syncBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontWeight: 500,
  },
  lastSyncText: {
    fontSize: '11px',
    opacity: 0.7,
  },
};

// CSS Keyframes injetados uma vez
const injectKeyframes = (() => {
  let injected = false;
  return () => {
    if (injected) return;
    injected = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes offlineSlideIn {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes offlineSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes offlinePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .offline-dot {
        width: 8px; height: 8px; border-radius: 50%;
        display: inline-block; margin-right: 2px;
      }
      .offline-dot-red { background: #ef4444; animation: offlinePulse 1.5s infinite; }
      .offline-dot-green { background: #22c55e; }
      .offline-dot-yellow { background: #f59e0b; animation: offlinePulse 0.8s infinite; }
    `;
    document.head.appendChild(style);
  };
})();

export default function OfflineIndicator() {
  // ★ Usa o novo SyncProvider ao invés do OfflineContext legado
  const { isOnline, isSyncing, pendingOps, lastSyncAt, syncError, syncNow } = useSync();
  const [showTooltip, setShowTooltip] = useState(false);

  injectKeyframes();

  function formatLastSync() {
    if (!lastSyncAt) return 'Nunca';
    const d = new Date(lastSyncAt);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return 'Agora mesmo';
    if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── OFFLINE Banner ───────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div style={styles.container}>
        <div style={styles.offlineBanner}>
          <CloudOff size={16} />
          <span>Modo Offline</span>
          {pendingOps > 0 && (
            <span style={styles.pendingBadge}>
              {pendingOps} pendente{pendingOps > 1 ? 's' : ''}
            </span>
          )}
          <span style={styles.lastSyncText}>
            Última sync: {formatLastSync()}
          </span>
        </div>
      </div>
    );
  }

  // ─── SYNCING Banner ───────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <div style={styles.container}>
        <div style={styles.syncingBanner}>
          <RefreshCw size={15} style={styles.spinning} />
          <span>Sincronizando dados...</span>
          {pendingOps > 0 && (
            <span style={styles.pendingBadge}>{pendingOps}</span>
          )}
        </div>
      </div>
    );
  }

  // ─── ONLINE com pendências ────────────────────────────────────────────────
  if (pendingOps > 0) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.syncingBanner, background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}>
          <AlertTriangle size={15} />
          <span>{pendingOps} operação(ões) pendente(s)</span>
          <button style={styles.syncBtn} onClick={syncNow}>
            <RefreshCw size={13} /> Sincronizar
          </button>
        </div>
      </div>
    );
  }

  // ─── ONLINE sutil ─────────────────────────────────────────────────────────
  return (
    <div
      style={styles.onlineIndicator}
      onClick={() => setShowTooltip(!showTooltip)}
      title={`Online · Última sync: ${formatLastSync()}`}
    >
      <span className="offline-dot offline-dot-green" />
      <Cloud size={14} />
      {showTooltip && (
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: 4 }}>
          Sync: {formatLastSync()}
          {syncError && <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>⚠ {syncError}</span>}
        </span>
      )}
    </div>
  );
}
