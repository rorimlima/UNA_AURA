/**
 * realtimeManager.js — Gerenciador de canais Supabase Realtime v3
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Inscrever em tabelas configuradas para Realtime
 *   • DEBOUNCE de eventos para evitar gargalos de renderização
 *   • Encaminhar eventos processados ao syncEngine.applyRealtimeEvent()
 *   • Reconectar automaticamente com exponential backoff
 *   • Heartbeat para detectar conexões zumbi
 *   • Auto-reconexão no visibilitychange
 *
 * ★ ISOLAMENTO: Não importa React. Comunicação com syncEngine via import direto.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';
import syncEngine from './syncEngine';

// ─── Configuração ───────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;             // Agrupa eventos rápidos em lotes
const RECONNECT_BASE_DELAY = 3000;   // Delay base de reconexão (ms)
const MAX_RECONNECT_ATTEMPTS = 15;
const HEARTBEAT_INTERVAL = 30_000;   // 30s — detecta conexões zumbi

// ─── Estado ─────────────────────────────────────────────────────────────────

let _channels = {};                  // { tableName: RealtimeChannel }
let _debounceTimers = {};            // { tableName: timeout }
let _pendingEvents = {};             // { tableName: [{ eventType, payload }] }
let _initialized = false;
let _reconnectAttempts = {};         // { tableName: number } — por tabela
let _heartbeatId = null;

// ─── Inicialização ──────────────────────────────────────────────────────────

/**
 * Inscreve a aplicação nos canais Realtime de todas as tabelas configuradas.
 * Deve ser chamado UMA VEZ no boot do app (pelo SyncProvider).
 */
export function initialize() {
  if (_initialized) return;
  _initialized = true;

  const tables = syncEngine.getConfiguredTables();

  for (const tableName of tables) {
    const config = syncEngine.getTableConfig(tableName);
    if (!config || config.realtime === false) continue;

    _subscribeTable(tableName);
  }

  // Inicia heartbeat para detectar conexões zumbi
  _startHeartbeat();

  // Re-inscreve ao voltar da inatividade
  document.addEventListener('visibilitychange', _handleVisibility);

  console.log(`[RealtimeManager] ✅ Inscrito em ${Object.keys(_channels).length} tabelas`);
}

/**
 * Inscreve em uma tabela específica.
 */
function _subscribeTable(tableName) {
  // Evita duplicação
  if (_channels[tableName]) return;

  const channel = supabase
    .channel(`sync_${tableName}`)
    .on(
      'postgres_changes',
      {
        event: '*',       // INSERT, UPDATE, DELETE
        schema: 'public',
        table: tableName,
      },
      (payload) => {
        _handleEvent(tableName, payload);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[RealtimeManager] ✓ Canal ${tableName} ativo`);
        _reconnectAttempts[tableName] = 0;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[RealtimeManager] ✗ Canal ${tableName}: ${status}`);
        _scheduleReconnect(tableName);
      } else if (status === 'CLOSED') {
        console.log(`[RealtimeManager] Canal ${tableName} fechado`);
        delete _channels[tableName];
      }
    });

  _channels[tableName] = channel;
}

// ─── Handler de eventos (com DEBOUNCE) ──────────────────────────────────────

/**
 * Recebe um evento Realtime e o coloca na fila de debounce.
 * Após DEBOUNCE_MS sem novos eventos para a mesma tabela,
 * processa todos os eventos acumulados de uma vez.
 */
function _handleEvent(tableName, rawPayload) {
  const { eventType, new: newRecord, old: oldRecord } = rawPayload;

  // Determina o payload final
  let payload;
  if (eventType === 'DELETE') {
    payload = oldRecord;
  } else {
    payload = newRecord;
  }

  if (!payload || !payload.id) {
    console.warn(`[RealtimeManager] Evento sem ID para ${tableName}:`, rawPayload);
    return;
  }

  // Acumula na fila de debounce
  if (!_pendingEvents[tableName]) {
    _pendingEvents[tableName] = [];
  }

  // Deduplica: se já tem evento para o mesmo ID, substitui com o mais recente
  const idx = _pendingEvents[tableName].findIndex(e => e.payload.id === payload.id);
  if (idx >= 0) {
    _pendingEvents[tableName][idx] = { eventType, payload };
  } else {
    _pendingEvents[tableName].push({ eventType, payload });
  }

  // Reseta o timer de debounce
  if (_debounceTimers[tableName]) {
    clearTimeout(_debounceTimers[tableName]);
  }

  _debounceTimers[tableName] = setTimeout(() => {
    _flushEvents(tableName);
  }, DEBOUNCE_MS);
}

/**
 * Processa todos os eventos acumulados para uma tabela (após debounce).
 * Encaminha para o syncEngine.applyRealtimeEvent com LWW.
 */
async function _flushEvents(tableName) {
  const events = _pendingEvents[tableName] || [];
  _pendingEvents[tableName] = [];

  if (events.length === 0) return;

  console.log(`[RealtimeManager] Flushing ${events.length} eventos para ${tableName}`);

  // Batch: processa todos os eventos de uma vez
  const errors = [];
  for (const { eventType, payload } of events) {
    try {
      await syncEngine.applyRealtimeEvent(tableName, eventType, payload);
    } catch (err) {
      console.error(`[RealtimeManager] Erro ao aplicar evento ${eventType} em ${tableName}:`, err);
      errors.push(err);
    }
  }

  if (errors.length > 0) {
    console.warn(`[RealtimeManager] ${errors.length}/${events.length} eventos com erro em ${tableName}`);
  }
}

// ─── Reconexão automática com Exponential Backoff ───────────────────────────

function _scheduleReconnect(tableName) {
  const attempts = (_reconnectAttempts[tableName] || 0);

  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[RealtimeManager] Max reconexões atingido para ${tableName} (${MAX_RECONNECT_ATTEMPTS})`);
    return;
  }

  _reconnectAttempts[tableName] = attempts + 1;

  // Exponential backoff: 3s * 2^attempts (max 60s) + jitter
  const baseDelay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempts), 60_000);
  const jitter = Math.random() * 0.25 * baseDelay;
  const delay = baseDelay + jitter;

  console.log(`[RealtimeManager] Reconectando ${tableName} em ${Math.round(delay)}ms (tentativa ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

  setTimeout(() => {
    // Remove canal antigo
    if (_channels[tableName]) {
      try {
        supabase.removeChannel(_channels[tableName]);
      } catch (_) { /* canal pode já ter sido removido */ }
      delete _channels[tableName];
    }
    // Re-inscreve
    _subscribeTable(tableName);
  }, delay);
}

// ─── Heartbeat — Detecta conexões zumbi ─────────────────────────────────────

function _startHeartbeat() {
  if (_heartbeatId) clearInterval(_heartbeatId);

  _heartbeatId = setInterval(() => {
    if (!navigator.onLine || !_initialized) return;

    // Verifica se os canais ainda estão ativos
    for (const [tableName, channel] of Object.entries(_channels)) {
      // Se o canal está em estado "joined" mas não recebemos eventos há muito tempo,
      // pode ser uma conexão zumbi. O Supabase Realtime lida com heartbeat internamente,
      // mas verificamos se o canal ainda é referenciável.
      if (!channel) {
        console.warn(`[RealtimeManager] Canal zumbi detectado: ${tableName}, reconectando...`);
        delete _channels[tableName];
        _subscribeTable(tableName);
      }
    }
  }, HEARTBEAT_INTERVAL);
}

// ─── Visibility Change — Re-inscreve ao voltar ao app ───────────────────────

function _handleVisibility() {
  if (document.visibilityState !== 'visible') return;
  if (!navigator.onLine || !_initialized) return;

  // Verifica se os canais ainda estão ativos
  const subscribedCount = Object.keys(_channels).length;
  const expectedTables = syncEngine.getConfiguredTables().filter(t => {
    const config = syncEngine.getTableConfig(t);
    return config && config.realtime !== false;
  });

  if (subscribedCount < expectedTables.length) {
    console.log(`[RealtimeManager] Canais faltando após inatividade (${subscribedCount}/${expectedTables.length}), re-inscrevendo...`);
    for (const t of expectedTables) {
      if (!_channels[t]) {
        _subscribeTable(t);
      }
    }
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove todas as inscrições Realtime. Chamado no destroy do engine.
 */
export function destroy() {
  // Limpa heartbeat
  if (_heartbeatId) {
    clearInterval(_heartbeatId);
    _heartbeatId = null;
  }

  // Remove visibility listener
  document.removeEventListener('visibilitychange', _handleVisibility);

  // Remove canais
  for (const [name, channel] of Object.entries(_channels)) {
    try {
      supabase.removeChannel(channel);
    } catch (_) { /* canal pode já ter sido removido */ }
  }
  _channels = {};

  // Limpa timers de debounce
  for (const timer of Object.values(_debounceTimers)) {
    clearTimeout(timer);
  }
  _debounceTimers = {};
  _pendingEvents = {};

  _initialized = false;
  _reconnectAttempts = {};
  console.log('[RealtimeManager] Destruído');
}

/**
 * Força re-inscrição em todas as tabelas (útil após reconexão de rede).
 */
export function reconnectAll() {
  destroy();
  initialize();
}

/**
 * Retorna o número de canais ativos (para debug/monitoring).
 */
export function getActiveChannelCount() {
  return Object.keys(_channels).length;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export default {
  initialize,
  destroy,
  reconnectAll,
  getActiveChannelCount,
};
