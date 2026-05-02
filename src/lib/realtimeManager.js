/**
 * realtimeManager.js — Gerenciador de canais Supabase Realtime
 * ══════════════════════════════════════════════════════════════════════════════
 * Responsabilidades:
 *   • Inscrever em tabelas configuradas para Realtime
 *   • DEBOUNCE de eventos para evitar gargalos de renderização
 *   • Encaminhar eventos processados ao syncEngine.applyRealtimeEvent()
 *   • Reconectar automaticamente em caso de falha de WebSocket
 *
 * ★ ISOLAMENTO: Não importa React. Comunicação com syncEngine via import direto.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { supabase } from './supabase';
import syncEngine from './syncEngine';

// ─── Configuração ───────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;             // Agrupa eventos rápidos em lotes
const RECONNECT_DELAY = 5000;        // Delay de reconexão (ms)
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Estado ─────────────────────────────────────────────────────────────────

let _channels = {};                  // { tableName: RealtimeChannel }
let _debounceTimers = {};            // { tableName: timeout }
let _pendingEvents = {};             // { tableName: [{ eventType, payload }] }
let _initialized = false;
let _reconnectAttempts = 0;

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
        _reconnectAttempts = 0;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`[RealtimeManager] ✗ Canal ${tableName}: ${status}`);
        _scheduleReconnect(tableName);
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

  for (const { eventType, payload } of events) {
    try {
      await syncEngine.applyRealtimeEvent(tableName, eventType, payload);
    } catch (err) {
      console.error(`[RealtimeManager] Erro ao aplicar evento ${eventType} em ${tableName}:`, err);
    }
  }
}

// ─── Reconexão automática ───────────────────────────────────────────────────

function _scheduleReconnect(tableName) {
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[RealtimeManager] Max reconexões atingido para ${tableName}`);
    return;
  }

  _reconnectAttempts++;
  const delay = RECONNECT_DELAY * _reconnectAttempts; // Linear backoff

  console.log(`[RealtimeManager] Reconectando ${tableName} em ${delay}ms (tentativa ${_reconnectAttempts})`);

  setTimeout(() => {
    // Remove canal antigo
    if (_channels[tableName]) {
      supabase.removeChannel(_channels[tableName]);
      delete _channels[tableName];
    }
    // Re-inscreve
    _subscribeTable(tableName);
  }, delay);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove todas as inscrições Realtime. Chamado no destroy do engine.
 */
export function destroy() {
  for (const [name, channel] of Object.entries(_channels)) {
    supabase.removeChannel(channel);
  }
  _channels = {};

  // Limpa timers
  for (const timer of Object.values(_debounceTimers)) {
    clearTimeout(timer);
  }
  _debounceTimers = {};
  _pendingEvents = {};

  _initialized = false;
  _reconnectAttempts = 0;
  console.log('[RealtimeManager] Destruído');
}

/**
 * Força re-inscrição em todas as tabelas (útil após reconexão de rede).
 */
export function reconnectAll() {
  destroy();
  initialize();
}

// ─── Export ─────────────────────────────────────────────────────────────────

export default {
  initialize,
  destroy,
  reconnectAll,
};
