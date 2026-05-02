-- ============================================================================
-- SYNC ENGINE v2 — Schema SQL para Supabase
-- ============================================================================
-- Execute este script no SQL Editor do Supabase Dashboard.
-- 
-- REQUISITOS para Delta Sync funcionar:
--   1. id UUID (chave primária)
--   2. created_at TIMESTAMPTZ (data de criação, imutável)
--   3. updated_at TIMESTAMPTZ (atualizado automaticamente por trigger)
--   4. is_deleted BOOLEAN (soft delete para Delta Sync)
--
-- ESTE SCRIPT:
--   • Cria a função trigger update_updated_at_column()
--   • Adiciona colunas is_deleted + updated_at em todas as tabelas do app
--   • Cria índices otimizados para Delta Sync
--   • Habilita Supabase Realtime em todas as tabelas
--   • Cria RPC get_delta_changes() para sync paginado
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
-- 3. MACRO: Adiciona colunas de sync + trigger + índices em uma tabela
-- ============================================================================
-- Uso manual: ALTER TABLE + CREATE INDEX + CREATE TRIGGER
-- Abaixo, aplicado a todas as tabelas do sistema.

-- ── vendas ──────────────────────────────────────────────────────────────────
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendas_updated_at ON vendas (updated_at);
CREATE INDEX IF NOT EXISTS idx_vendas_is_deleted ON vendas (is_deleted) WHERE is_deleted = TRUE;

DROP TRIGGER IF EXISTS update_vendas_updated_at ON vendas;
CREATE TRIGGER update_vendas_updated_at
BEFORE UPDATE ON vendas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── vendas_itens ────────────────────────────────────────────────────────────
ALTER TABLE vendas_itens ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE vendas_itens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendas_itens_updated_at ON vendas_itens (updated_at);

DROP TRIGGER IF EXISTS update_vendas_itens_updated_at ON vendas_itens;
CREATE TRIGGER update_vendas_itens_updated_at
BEFORE UPDATE ON vendas_itens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── produtos ────────────────────────────────────────────────────────────────
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_produtos_updated_at ON produtos (updated_at);
CREATE INDEX IF NOT EXISTS idx_produtos_is_deleted ON produtos (is_deleted) WHERE is_deleted = TRUE;

DROP TRIGGER IF EXISTS update_produtos_updated_at ON produtos;
CREATE TRIGGER update_produtos_updated_at
BEFORE UPDATE ON produtos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── clientes ────────────────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_clientes_updated_at ON clientes (updated_at);
CREATE INDEX IF NOT EXISTS idx_clientes_is_deleted ON clientes (is_deleted) WHERE is_deleted = TRUE;

DROP TRIGGER IF EXISTS update_clientes_updated_at ON clientes;
CREATE TRIGGER update_clientes_updated_at
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── veiculos_bloqueados ─────────────────────────────────────────────────────
ALTER TABLE veiculos_bloqueados ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE veiculos_bloqueados ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_veiculos_bloqueados_updated_at ON veiculos_bloqueados (updated_at);
CREATE INDEX IF NOT EXISTS idx_veiculos_bloqueados_is_deleted ON veiculos_bloqueados (is_deleted) WHERE is_deleted = TRUE;

DROP TRIGGER IF EXISTS update_veiculos_bloqueados_updated_at ON veiculos_bloqueados;
CREATE TRIGGER update_veiculos_bloqueados_updated_at
BEFORE UPDATE ON veiculos_bloqueados
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

-- ── empresa ─────────────────────────────────────────────────────────────────
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_empresa_updated_at ON empresa (updated_at);

DROP TRIGGER IF EXISTS update_empresa_updated_at ON empresa;
CREATE TRIGGER update_empresa_updated_at
BEFORE UPDATE ON empresa
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── ocorrencias_agente ──────────────────────────────────────────────────────
ALTER TABLE ocorrencias_agente ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE ocorrencias_agente ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ocorrencias_agente_updated_at ON ocorrencias_agente (updated_at);

DROP TRIGGER IF EXISTS update_ocorrencias_agente_updated_at ON ocorrencias_agente;
CREATE TRIGGER update_ocorrencias_agente_updated_at
BEFORE UPDATE ON ocorrencias_agente
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── colaboradores ───────────────────────────────────────────────────────────
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_colaboradores_updated_at ON colaboradores (updated_at);

DROP TRIGGER IF EXISTS update_colaboradores_updated_at ON colaboradores;
CREATE TRIGGER update_colaboradores_updated_at
BEFORE UPDATE ON colaboradores
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── audit_logs ──────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_logs_updated_at ON audit_logs (updated_at);

DROP TRIGGER IF EXISTS update_audit_logs_updated_at ON audit_logs;
CREATE TRIGGER update_audit_logs_updated_at
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. HABILITAR REALTIME NAS TABELAS
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendas', 'vendas_itens', 'produtos', 'clientes',
    'veiculos_bloqueados', 'vendedores', 'fornecedores',
    'contas_receber', 'contas_pagar', 'empresa',
    'ocorrencias_agente', 'colaboradores', 'audit_logs'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- Tabela já está na publicação
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 5. RPC: get_delta_changes — Delta Sync com paginação
-- ============================================================================
-- Retorna apenas registros alterados desde um timestamp.
-- Inclui registros com is_deleted=true para que o cliente possa removê-los.
-- Ordena por updated_at ASC para cursor pagination consistente.
--
-- Uso no cliente:
--   const { data } = await supabase.rpc('get_delta_changes', {
--     p_table: 'clientes',
--     p_since: '2025-01-01T00:00:00Z',
--     p_limit: 500
--   });

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
-- 6. BACKFILL: Setar updated_at em registros existentes que são NULL
-- ============================================================================
-- Sem isso, registros antigos teriam updated_at NULL e não seriam 
-- capturados no primeiro delta sync.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vendas', 'vendas_itens', 'produtos', 'clientes',
    'veiculos_bloqueados', 'vendedores', 'fornecedores',
    'contas_receber', 'contas_pagar', 'empresa',
    'ocorrencias_agente', 'colaboradores', 'audit_logs'
  ])
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL', t);
    EXCEPTION
      WHEN undefined_column THEN NULL; -- created_at pode não existir em todas
      WHEN undefined_table THEN NULL;  -- tabela pode não existir ainda
    END;
  END LOOP;
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Após executar este script:
-- 1. Verifique que todas as tabelas aparecem no Supabase Realtime (Database > Replication)
-- 2. Verifique que os triggers updated_at estão ativos (Database > Triggers)
-- 3. Teste o RPC: SELECT * FROM get_delta_changes('clientes', '2000-01-01', 10);
