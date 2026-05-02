-- ============================================================================
-- SYNC ENGINE v4 — Schema SQL para Supabase (UNA AURA ERP)
-- ============================================================================
-- Execute este script no SQL Editor do Supabase Dashboard.
-- 
-- PROJETO: UNA AURA — Sistema ERP de gestão comercial (semijoias)
--
-- TABELAS EXISTENTES NO BANCO:
--   • vendas, vendas_itens          (módulo Vendas)
--   • compras, compras_itens        (módulo Compras)
--   • produtos                      (módulo Estoque/Catálogo)
--   • clientes                      (módulo Clientes/CRM)
--   • vendedores                    (módulo Empresa — Sócios & Vendedores)
--   • fornecedores                  (módulo Fornecedores)
--   • contas_receber                (módulo Financeiro — A Receber)
--   • contas_pagar                  (módulo Financeiro — A Pagar)
--   • contas_bancarias              (módulo Empresa — Contas Bancárias)
--   • contas_financeiras            (módulo Financeiro — Contas Financeiras)
--   • formas_pagamento              (módulo Empresa — Formas de Pagamento)
--   • movimentacoes_financeiras     (módulo Conciliação Bancária)
--   • cobrancas_log                 (módulo Inadimplência — Log de Cobranças)
--   • empresa                       (módulo Empresa — Dados Cadastrais)
--   • users                         (autenticação — perfis de usuário)
--
-- REQUISITOS para Delta Sync funcionar:
--   1. id UUID (chave primária)
--   2. created_at TIMESTAMPTZ (data de criação, imutável)
--   3. updated_at TIMESTAMPTZ (atualizado automaticamente por trigger)
--   4. is_deleted BOOLEAN (soft delete para Delta Sync)
--
-- ESTE SCRIPT (v4):
--   • Cria a função trigger update_updated_at_column()
--   • Adiciona colunas is_deleted + updated_at em TODAS as tabelas do UNA AURA
--   • Cria índices otimizados para Delta Sync
--   • Habilita Supabase Realtime em todas as tabelas
--   • Cria RPC get_delta_changes() para sync paginado com cursor
--   • Cria RPC get_sync_stats() para monitoramento
--   • Backfill de registros existentes
-- ============================================================================

-- 1. Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 2. FUNÇÃO TRIGGER — updated_at automático (timestamp do SERVIDOR)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. SYNC COLUMNS + TRIGGERS + ÍNDICES — Aplicado a todas as tabelas
-- ============================================================================

-- ── vendas ──────────────────────────────────────────────────────────────────
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendas_updated_at ON vendas (updated_at);
CREATE INDEX IF NOT EXISTS idx_vendas_is_deleted ON vendas (is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_vendas_delta ON vendas (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_vendas_updated_at ON vendas;
CREATE TRIGGER update_vendas_updated_at
BEFORE UPDATE ON vendas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── vendas_itens ────────────────────────────────────────────────────────────
ALTER TABLE vendas_itens ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendas_itens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendas_itens_updated_at ON vendas_itens (updated_at);
CREATE INDEX IF NOT EXISTS idx_vendas_itens_delta ON vendas_itens (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_vendas_itens_updated_at ON vendas_itens;
CREATE TRIGGER update_vendas_itens_updated_at
BEFORE UPDATE ON vendas_itens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── compras ─────────────────────────────────────────────────────────────────
ALTER TABLE compras ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_compras_updated_at ON compras (updated_at);
CREATE INDEX IF NOT EXISTS idx_compras_is_deleted ON compras (is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_compras_delta ON compras (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_compras_updated_at ON compras;
CREATE TRIGGER update_compras_updated_at
BEFORE UPDATE ON compras
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── compras_itens ───────────────────────────────────────────────────────────
ALTER TABLE compras_itens ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE compras_itens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_compras_itens_updated_at ON compras_itens (updated_at);
CREATE INDEX IF NOT EXISTS idx_compras_itens_delta ON compras_itens (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_compras_itens_updated_at ON compras_itens;
CREATE TRIGGER update_compras_itens_updated_at
BEFORE UPDATE ON compras_itens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── produtos ────────────────────────────────────────────────────────────────
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_produtos_updated_at ON produtos (updated_at);
CREATE INDEX IF NOT EXISTS idx_produtos_is_deleted ON produtos (is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_produtos_delta ON produtos (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_produtos_updated_at ON produtos;
CREATE TRIGGER update_produtos_updated_at
BEFORE UPDATE ON produtos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── clientes ────────────────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_clientes_updated_at ON clientes (updated_at);
CREATE INDEX IF NOT EXISTS idx_clientes_is_deleted ON clientes (is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_clientes_delta ON clientes (updated_at ASC) WHERE is_deleted = FALSE;

DROP TRIGGER IF EXISTS update_clientes_updated_at ON clientes;
CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── vendedores ──────────────────────────────────────────────────────────────
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendedores_updated_at ON vendedores (updated_at);

DROP TRIGGER IF EXISTS update_vendedores_updated_at ON vendedores;
CREATE TRIGGER update_vendedores_updated_at
BEFORE UPDATE ON vendedores
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── fornecedores ────────────────────────────────────────────────────────────
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_fornecedores_updated_at ON fornecedores (updated_at);

DROP TRIGGER IF EXISTS update_fornecedores_updated_at ON fornecedores;
CREATE TRIGGER update_fornecedores_updated_at
BEFORE UPDATE ON fornecedores
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── contas_receber ──────────────────────────────────────────────────────────
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contas_receber_updated_at ON contas_receber (updated_at);

DROP TRIGGER IF EXISTS update_contas_receber_updated_at ON contas_receber;
CREATE TRIGGER update_contas_receber_updated_at
BEFORE UPDATE ON contas_receber
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── contas_pagar ────────────────────────────────────────────────────────────
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contas_pagar_updated_at ON contas_pagar (updated_at);

DROP TRIGGER IF EXISTS update_contas_pagar_updated_at ON contas_pagar;
CREATE TRIGGER update_contas_pagar_updated_at
BEFORE UPDATE ON contas_pagar
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── contas_bancarias ────────────────────────────────────────────────────────
ALTER TABLE contas_bancarias ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_bancarias ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_updated_at ON contas_bancarias (updated_at);

DROP TRIGGER IF EXISTS update_contas_bancarias_updated_at ON contas_bancarias;
CREATE TRIGGER update_contas_bancarias_updated_at
BEFORE UPDATE ON contas_bancarias
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── contas_financeiras ──────────────────────────────────────────────────────
ALTER TABLE contas_financeiras ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_financeiras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contas_financeiras_updated_at ON contas_financeiras (updated_at);

DROP TRIGGER IF EXISTS update_contas_financeiras_updated_at ON contas_financeiras;
CREATE TRIGGER update_contas_financeiras_updated_at
BEFORE UPDATE ON contas_financeiras
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── formas_pagamento ────────────────────────────────────────────────────────
ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_updated_at ON formas_pagamento (updated_at);

DROP TRIGGER IF EXISTS update_formas_pagamento_updated_at ON formas_pagamento;
CREATE TRIGGER update_formas_pagamento_updated_at
BEFORE UPDATE ON formas_pagamento
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── movimentacoes_financeiras ───────────────────────────────────────────────
ALTER TABLE movimentacoes_financeiras ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE movimentacoes_financeiras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_movimentacoes_financeiras_updated_at ON movimentacoes_financeiras (updated_at);

DROP TRIGGER IF EXISTS update_movimentacoes_financeiras_updated_at ON movimentacoes_financeiras;
CREATE TRIGGER update_movimentacoes_financeiras_updated_at
BEFORE UPDATE ON movimentacoes_financeiras
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── cobrancas_log ───────────────────────────────────────────────────────────
ALTER TABLE cobrancas_log ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE cobrancas_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_cobrancas_log_updated_at ON cobrancas_log (updated_at);

DROP TRIGGER IF EXISTS update_cobrancas_log_updated_at ON cobrancas_log;
CREATE TRIGGER update_cobrancas_log_updated_at
BEFORE UPDATE ON cobrancas_log
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── empresa ─────────────────────────────────────────────────────────────────
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_empresa_updated_at ON empresa (updated_at);

DROP TRIGGER IF EXISTS update_empresa_updated_at ON empresa;
CREATE TRIGGER update_empresa_updated_at
BEFORE UPDATE ON empresa
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── users (perfis de usuário) ───────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at);

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. HABILITAR REALTIME NAS TABELAS
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendas', 'vendas_itens', 'compras', 'compras_itens',
    'produtos', 'clientes', 'vendedores', 'fornecedores',
    'contas_receber', 'contas_pagar',
    'contas_bancarias', 'contas_financeiras',
    'formas_pagamento', 'movimentacoes_financeiras',
    'cobrancas_log', 'empresa', 'users'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 5. RPC: get_delta_changes — Delta Sync com paginação por cursor
-- ============================================================================
CREATE OR REPLACE FUNCTION get_delta_changes(
  p_table TEXT,
  p_since TIMESTAMPTZ,
  p_limit INT DEFAULT 500
)
RETURNS SETOF JSON AS $$
BEGIN
  RETURN QUERY EXECUTE format(
    'SELECT row_to_json(t) FROM %I t WHERE updated_at > $1 ORDER BY updated_at ASC LIMIT $2',
    p_table
  ) USING p_since, p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. RPC: get_sync_stats — Estatísticas de sincronização (debug/monitoring)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sync_stats(p_table TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  EXECUTE format(
    'SELECT json_build_object(
      ''table'', %L,
      ''total'', COUNT(*),
      ''active'', COUNT(*) FILTER (WHERE NOT COALESCE(is_deleted, FALSE)),
      ''deleted'', COUNT(*) FILTER (WHERE is_deleted = TRUE),
      ''last_updated'', MAX(updated_at)
    ) FROM %I',
    p_table, p_table
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. BACKFILL: Setar updated_at em registros existentes que são NULL
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendas', 'vendas_itens', 'compras', 'compras_itens',
    'produtos', 'clientes', 'vendedores', 'fornecedores',
    'contas_receber', 'contas_pagar',
    'contas_bancarias', 'contas_financeiras',
    'formas_pagamento', 'movimentacoes_financeiras',
    'cobrancas_log', 'empresa', 'users'
  ])
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL', t);
    EXCEPTION
      WHEN undefined_column THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 8. BACKFILL: Setar is_deleted = FALSE em registros que são NULL
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendas', 'vendas_itens', 'compras', 'compras_itens',
    'produtos', 'clientes', 'vendedores', 'fornecedores',
    'contas_receber', 'contas_pagar',
    'contas_bancarias', 'contas_financeiras',
    'formas_pagamento', 'movimentacoes_financeiras',
    'cobrancas_log', 'empresa', 'users'
  ])
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET is_deleted = FALSE WHERE is_deleted IS NULL', t);
    EXCEPTION
      WHEN undefined_column THEN NULL;
      WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- FIM DA MIGRATION v4 — UNA AURA ERP
-- ============================================================================
-- Após executar este script:
-- 1. Verifique que todas as tabelas aparecem no Supabase Realtime (Database > Replication)
-- 2. Verifique que os triggers updated_at estão ativos (Database > Triggers)
-- 3. Teste o RPC: SELECT * FROM get_delta_changes('clientes', '2000-01-01', 10);
-- 4. Teste o RPC: SELECT * FROM get_sync_stats('clientes');
-- 5. Verifique os índices delta: \di *_delta* (no psql)
--
-- TABELAS COBERTAS (17 total):
--   vendas, vendas_itens, compras, compras_itens,
--   produtos, clientes, vendedores, fornecedores,
--   contas_receber, contas_pagar,
--   contas_bancarias, contas_financeiras,
--   formas_pagamento, movimentacoes_financeiras,
--   cobrancas_log, empresa, users
