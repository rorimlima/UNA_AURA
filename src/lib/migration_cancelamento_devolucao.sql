-- ============================================================================
-- MIGRATION: Fix Supplier Return Cancellation Effects (UNA AURA ERP)
-- ============================================================================

-- 1. Update fn_gerar_credito_devolucao to handle return cancellation
CREATE OR REPLACE FUNCTION public.fn_gerar_credito_devolucao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Só gera crédito quando status muda para 'finalizada' e gerar_credito = true
  IF NEW.status = 'finalizada' 
     AND (OLD.status IS DISTINCT FROM 'finalizada')
     AND NEW.gerar_credito = true
     AND NEW.total > 0 THEN
    
    INSERT INTO public.creditos_fornecedor (
      fornecedor_id, devolucao_id, tipo, valor, descricao
    ) VALUES (
      NEW.fornecedor_id,
      NEW.id,
      'credito',
      NEW.total,
      'Crédito gerado pela devolução #' || NEW.codigo
    );
  END IF;
  
  -- Se cancelar uma devolução, remove/inativa o crédito gerado por ela
  IF NEW.status = 'cancelada' THEN
    UPDATE public.creditos_fornecedor
    SET is_deleted = true,
        updated_at = now()
    WHERE devolucao_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 2. Retroactively fix already cancelled returns with active credits
UPDATE public.creditos_fornecedor c
SET is_deleted = true,
    updated_at = now()
FROM public.devolucoes_fornecedor d
WHERE c.devolucao_id = d.id
  AND d.status = 'cancelada'
  AND c.is_deleted = false;
