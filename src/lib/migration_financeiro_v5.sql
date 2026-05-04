-- ============================================================================
-- MIGRATION v5 — Módulo Financeiro Avançado + Vendas Actions (UNA AURA ERP)
-- ============================================================================
-- Execute no SQL Editor do Supabase Dashboard
--
-- NOVAS TABELAS:
--   • configuracao_taxas    — Taxas por forma de pagamento
--   • pagamentos            — Registro de pagamentos com split automático
--
-- ALTERAÇÕES:
--   • contas_receber: +conta_destino_id, +status_lancamento (pendente/confirmado)
--   • contas_pagar:   +conta_origem_id,  +status_lancamento (pendente/confirmado)
--   • contas_financeiras: +saldo_inicial (se não existir)
-- ============================================================================

-- ============================================================================
-- 1. TABELA: configuracao_taxas
-- ============================================================================
CREATE TABLE IF NOT EXISTS configuracao_taxas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  forma_pagamento TEXT NOT NULL UNIQUE,
  percentual_taxa NUMERIC(6,4) NOT NULL DEFAULT 0,
  prazo_recebimento_dias INTEGER NOT NULL DEFAULT 0,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Dados iniciais de configuração de taxas
INSERT INTO configuracao_taxas (forma_pagamento, percentual_taxa, prazo_recebimento_dias) VALUES
  ('credito',       3.49,  30),
  ('debito',        1.99,   1),
  ('pix',           0.00,   0),
  ('transferencia', 0.00,   0),
  ('boleto',        1.50,   1),
  ('dinheiro',      0.00,   0),
  ('cheque',        0.00,   0),
  ('crediario',     0.00,   0)
ON CONFLICT (forma_pagamento) DO NOTHING;

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_configuracao_taxas_updated_at ON configuracao_taxas;
CREATE TRIGGER update_configuracao_taxas_updated_at
BEFORE UPDATE ON configuracao_taxas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índice delta sync
CREATE INDEX IF NOT EXISTS idx_configuracao_taxas_updated_at ON configuracao_taxas (updated_at);

-- ============================================================================
-- 2. TABELA: pagamentos (registro de cada pagamento com split)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pagamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venda_id UUID REFERENCES vendas(id) ON DELETE CASCADE,
  forma_pagamento TEXT NOT NULL,
  valor_total INTEGER NOT NULL DEFAULT 0,
  percentual_taxa NUMERIC(6,4) DEFAULT 0,
  valor_taxa INTEGER DEFAULT 0,
  valor_liquido INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'cancelado')),
  conta_receber_id UUID,
  conta_pagar_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_pagamentos_updated_at ON pagamentos;
CREATE TRIGGER update_pagamentos_updated_at
BEFORE UPDATE ON pagamentos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX IF NOT EXISTS idx_pagamentos_updated_at ON pagamentos (updated_at);
CREATE INDEX IF NOT EXISTS idx_pagamentos_venda_id ON pagamentos (venda_id);

-- ============================================================================
-- 3. ADICIONAR COLUNAS EM contas_receber
-- ============================================================================
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS conta_destino_id UUID REFERENCES contas_financeiras(id);
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS status_lancamento TEXT DEFAULT 'pendente' CHECK (status_lancamento IN ('pendente', 'confirmado'));

-- ============================================================================
-- 4. ADICIONAR COLUNAS EM contas_pagar
-- ============================================================================
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS conta_origem_id UUID REFERENCES contas_financeiras(id);
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS status_lancamento TEXT DEFAULT 'pendente' CHECK (status_lancamento IN ('pendente', 'confirmado'));

-- ============================================================================
-- 5. GARANTIR COLUNAS EM contas_financeiras
-- ============================================================================
ALTER TABLE contas_financeiras ADD COLUMN IF NOT EXISTS saldo_inicial INTEGER DEFAULT 0;

-- ============================================================================
-- 6. FUNÇÃO: calcular_saldo_atual
--    Calcula o saldo dinâmico de uma conta financeira
-- ============================================================================
CREATE OR REPLACE FUNCTION calcular_saldo_atual(p_conta_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_saldo_inicial INTEGER;
  v_total_receber INTEGER;
  v_total_pagar INTEGER;
BEGIN
  SELECT COALESCE(saldo_inicial, 0) INTO v_saldo_inicial
  FROM contas_financeiras WHERE id = p_conta_id;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_receber
  FROM contas_receber
  WHERE conta_destino_id = p_conta_id
    AND status_lancamento = 'confirmado'
    AND COALESCE(is_deleted, FALSE) = FALSE;

  SELECT COALESCE(SUM(valor), 0) INTO v_total_pagar
  FROM contas_pagar
  WHERE conta_origem_id = p_conta_id
    AND status_lancamento = 'confirmado'
    AND COALESCE(is_deleted, FALSE) = FALSE;

  RETURN v_saldo_inicial + v_total_receber - v_total_pagar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. TRIGGER: Atualizar saldo_atual em contas_financeiras quando
--    contas_receber ou contas_pagar mudam status_lancamento
-- ============================================================================
CREATE OR REPLACE FUNCTION atualizar_saldo_conta_receber()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar conta antiga (se mudou)
  IF OLD.conta_destino_id IS NOT NULL AND (
    OLD.conta_destino_id IS DISTINCT FROM NEW.conta_destino_id OR
    OLD.status_lancamento IS DISTINCT FROM NEW.status_lancamento OR
    OLD.valor IS DISTINCT FROM NEW.valor
  ) THEN
    UPDATE contas_financeiras SET saldo_atual = calcular_saldo_atual(OLD.conta_destino_id)
    WHERE id = OLD.conta_destino_id;
  END IF;

  -- Atualizar conta nova
  IF NEW.conta_destino_id IS NOT NULL THEN
    UPDATE contas_financeiras SET saldo_atual = calcular_saldo_atual(NEW.conta_destino_id)
    WHERE id = NEW.conta_destino_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_saldo_receber ON contas_receber;
CREATE TRIGGER trg_saldo_receber
AFTER INSERT OR UPDATE ON contas_receber
FOR EACH ROW EXECUTE FUNCTION atualizar_saldo_conta_receber();

CREATE OR REPLACE FUNCTION atualizar_saldo_conta_pagar()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar conta antiga
  IF OLD.conta_origem_id IS NOT NULL AND (
    OLD.conta_origem_id IS DISTINCT FROM NEW.conta_origem_id OR
    OLD.status_lancamento IS DISTINCT FROM NEW.status_lancamento OR
    OLD.valor IS DISTINCT FROM NEW.valor
  ) THEN
    UPDATE contas_financeiras SET saldo_atual = calcular_saldo_atual(OLD.conta_origem_id)
    WHERE id = OLD.conta_origem_id;
  END IF;

  -- Atualizar conta nova
  IF NEW.conta_origem_id IS NOT NULL THEN
    UPDATE contas_financeiras SET saldo_atual = calcular_saldo_atual(NEW.conta_origem_id)
    WHERE id = NEW.conta_origem_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_saldo_pagar ON contas_pagar;
CREATE TRIGGER trg_saldo_pagar
AFTER INSERT OR UPDATE ON contas_pagar
FOR EACH ROW EXECUTE FUNCTION atualizar_saldo_conta_pagar();

-- ============================================================================
-- 8. HABILITAR REALTIME nas novas tabelas
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE configuracao_taxas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE pagamentos;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================================
-- 9. BACKFILL: status_lancamento para registros existentes
-- ============================================================================
UPDATE contas_receber SET status_lancamento = 'pendente' WHERE status_lancamento IS NULL;
UPDATE contas_pagar SET status_lancamento = 'pendente' WHERE status_lancamento IS NULL;

-- ============================================================================
-- FIM DA MIGRATION v5 — Módulo Financeiro Avançado
-- ============================================================================
-- Após executar:
-- 1. Verifique as novas tabelas no Supabase Dashboard
-- 2. Teste: SELECT calcular_saldo_atual('<uuid_conta>');
-- 3. Confira os triggers de saldo automático
-- 4. As taxas padrão foram inseridas em configuracao_taxas
