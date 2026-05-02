/**
 * activityLogger.js — Registro centralizado de atividades do sistema.
 * 
 * Uso:
 *   import { logActivity } from '../lib/activityLogger';
 *   await logActivity('CREATE', 'venda', venda.id, `Venda #${venda.numero_pedido}`, { total: venda.total });
 */

import { supabase } from './supabase';

/**
 * Registra uma atividade no banco de dados.
 * 
 * @param {'CREATE'|'UPDATE'|'DELETE'|'LOGIN'|'LOGOUT'|'PRINT'|'EXPORT'|'VIEW'|'PAYMENT'|'SYNC'} action - Tipo de ação
 * @param {string} entity - Entidade afetada (ex: 'venda', 'cliente', 'produto')
 * @param {string} entityId - ID do registro afetado
 * @param {string} entityLabel - Nome/código legível (ex: 'Venda #PD-KAB123')
 * @param {Object} details - Dados extras (campos alterados, valores, etc.)
 */
export async function logActivity(action, entity, entityId = null, entityLabel = null, details = {}) {
  try {
    // Buscar dados do usuário logado
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.warn('[ActivityLogger] Sem sessão ativa, log não registrado');
      return;
    }

    // Buscar perfil do usuário (name) do banco
    let userName = session.user.email;
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', session.user.id)
        .single();
      if (profile?.name) userName = profile.name;
    } catch (_) { /* silencioso — usa email como fallback */ }

    await supabase.from('activity_logs').insert({
      user_id: session.user.id,
      user_name: userName,
      user_email: session.user.email,
      action,
      entity,
      entity_id: entityId,
      entity_label: entityLabel,
      details,
      user_agent: navigator.userAgent?.substring(0, 200),
    });
  } catch (err) {
    // Log silencioso — nunca interrompe o fluxo do usuário
    console.warn('[ActivityLogger] Erro ao registrar log:', err?.message || err);
  }
}

/**
 * Labels amigáveis para ações
 */
export const ACTION_LABELS = {
  CREATE: '➕ Criou',
  UPDATE: '✏️ Editou',
  DELETE: '🗑️ Excluiu',
  LOGIN: '🔑 Login',
  LOGOUT: '🚪 Logout',
  PRINT: '🖨️ Imprimiu',
  EXPORT: '📄 Exportou',
  VIEW: '👁️ Visualizou',
  PAYMENT: '💰 Pagamento',
  SYNC: '🔄 Sincronizou',
};

/**
 * Labels amigáveis para entidades
 */
export const ENTITY_LABELS = {
  venda: '🛒 Venda',
  cliente: '👤 Cliente',
  produto: '📦 Produto',
  compra: '🛍️ Compra',
  fornecedor: '🏭 Fornecedor',
  vendedor: '🤝 Vendedor',
  financeiro: '💳 Financeiro',
  conta_receber: '📥 Conta a Receber',
  conta_pagar: '📤 Conta a Pagar',
  empresa: '🏢 Empresa',
  sistema: '⚙️ Sistema',
  auth: '🔐 Autenticação',
};
