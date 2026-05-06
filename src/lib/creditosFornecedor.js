/**
 * UNA AURA — SDK de Créditos de Fornecedor
 * 
 * Módulo para gerenciar devoluções ao fornecedor e créditos gerados.
 * Fluxo: Devolução → Crédito → Aplicação como desconto em nova compra
 */
import { supabase } from './supabase';

// ─── DEVOLUÇÕES ──────────────────────────────────────────

/**
 * Lista todas as devoluções com dados do fornecedor e itens
 */
export async function listarDevolucoes() {
  const { data, error } = await supabase
    .from('devolucoes_fornecedor')
    .select(`
      *,
      fornecedores(id, nome, codigo),
      itens_devolucao_fornecedor(*, produtos(id, nome, codigo, referencia))
    `)
    .eq('is_deleted', false)
    .order('data', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Busca uma devolução por ID com todos os detalhes
 */
export async function getDevolucao(id) {
  const { data, error } = await supabase
    .from('devolucoes_fornecedor')
    .select(`
      *,
      fornecedores(id, nome, codigo),
      compras(id, codigo, numero_nota),
      itens_devolucao_fornecedor(*, produtos(id, nome, codigo, referencia, custo_unitario))
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Cria uma nova devolução com itens
 * @param {Object} devolucao - { fornecedor_id, compra_id?, motivo, observacoes, gerar_credito }
 * @param {Array} itens - [{ produto_id, quantidade, valor_unitario }]
 * @returns {{ devolucao, itens }}
 */
export async function criarDevolucao(devolucao, itens) {
  // Calcular total
  const total = itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0);

  // Inserir devolução
  const { data: dev, error: devErr } = await supabase
    .from('devolucoes_fornecedor')
    .insert({
      fornecedor_id: devolucao.fornecedor_id,
      compra_id: devolucao.compra_id || null,
      motivo: devolucao.motivo || null,
      observacoes: devolucao.observacoes || null,
      gerar_credito: devolucao.gerar_credito !== false,
      total,
      status: 'rascunho',
    })
    .select()
    .single();

  if (devErr) throw devErr;

  // Inserir itens
  const itensPayload = itens.map(item => ({
    devolucao_id: dev.id,
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
  }));

  const { data: itensData, error: itensErr } = await supabase
    .from('itens_devolucao_fornecedor')
    .insert(itensPayload)
    .select();

  if (itensErr) throw itensErr;

  return { devolucao: dev, itens: itensData };
}

/**
 * Finaliza uma devolução — dispara triggers de crédito e estoque
 */
export async function finalizarDevolucao(id) {
  const { data, error } = await supabase
    .from('devolucoes_fornecedor')
    .update({ status: 'finalizada' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Cancela uma devolução
 */
export async function cancelarDevolucao(id) {
  const { data, error } = await supabase
    .from('devolucoes_fornecedor')
    .update({ status: 'cancelada' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Exclui uma devolução (somente rascunho)
 */
export async function excluirDevolucao(id) {
  // Excluir itens primeiro (CASCADE cuida, mas vamos ser explícitos)
  await supabase.from('itens_devolucao_fornecedor').delete().eq('devolucao_id', id);
  const { error } = await supabase.from('devolucoes_fornecedor').delete().eq('id', id);
  if (error) throw error;
}

// ─── CRÉDITOS ────────────────────────────────────────────

/**
 * Consulta o saldo de crédito de um fornecedor via RPC
 * @returns {number} Saldo em centavos
 */
export async function getSaldoCredito(fornecedorId) {
  const { data, error } = await supabase
    .rpc('fn_saldo_credito_fornecedor', { p_fornecedor_id: fornecedorId });

  if (error) throw error;
  return data || 0;
}

/**
 * Aplica crédito do fornecedor como desconto em uma compra
 * @returns {number} Novo saldo restante em centavos
 */
export async function aplicarCredito(compraId, fornecedorId, valor) {
  const { data, error } = await supabase
    .rpc('fn_aplicar_credito_compra', {
      p_compra_id: compraId,
      p_fornecedor_id: fornecedorId,
      p_valor: valor,
    });

  if (error) throw error;
  return data || 0;
}

/**
 * Lista o histórico de créditos/débitos de um fornecedor
 */
export async function listarCreditos(fornecedorId) {
  const { data, error } = await supabase
    .from('creditos_fornecedor')
    .select(`
      *,
      devolucoes_fornecedor(codigo, data, motivo),
      compras(codigo, numero_nota)
    `)
    .eq('fornecedor_id', fornecedorId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Busca o resumo de créditos da view (todos os fornecedores com saldo > 0)
 */
export async function getResumoCreditos() {
  const { data, error } = await supabase
    .from('vw_creditos_fornecedor_resumo')
    .select('*')
    .gt('saldo_disponivel', 0)
    .order('saldo_disponivel', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Busca compras de um fornecedor para referenciar na devolução
 */
export async function getComprasFornecedor(fornecedorId) {
  const { data, error } = await supabase
    .from('compras')
    .select('id, codigo, data, numero_nota, total, compras_itens(*, produtos(id, nome, referencia, custo_unitario))')
    .eq('fornecedor_id', fornecedorId)
    .eq('is_deleted', false)
    .in('status', ['finalizada', 'PAGO'])
    .order('data', { ascending: false });

  if (error) throw error;
  return data || [];
}
