-- Automatic Diamond to WLD Exchange System
-- Phase 1: Database schema with RLS policies and audit trail

-- Main auto-exchange requests table
CREATE TABLE IF NOT EXISTS public.auto_exchange_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  diamond_amount NUMERIC NOT NULL CHECK (diamond_amount > 0),
  wld_target_amount NUMERIC NOT NULL CHECK (wld_target_amount > 0),
  slippage_tolerance NUMERIC NOT NULL DEFAULT 1.0 CHECK (slippage_tolerance >= 0.1 AND slippage_tolerance <= 5.0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executing','completed','failed','fallback','cancelled')),
  tx_hash TEXT,
  wld_received NUMERIC,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_exchange_requests ENABLE ROW LEVEL SECURITY;

-- User auto-exchange configuration
CREATE TABLE IF NOT EXISTS public.auto_exchange_config (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  slippage_tolerance NUMERIC NOT NULL DEFAULT 1.0 CHECK (slippage_tolerance >= 0.1 AND slippage_tolerance <= 5.0),
  min_wld_amount NUMERIC DEFAULT 10 CHECK (min_wld_amount IS NULL OR min_wld_amount > 0),
  auto_retry BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_exchange_config ENABLE ROW LEVEL SECURITY;

-- Fallback conversion tracking
CREATE TABLE IF NOT EXISTS public.fallback_conversion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_exchange_request_id UUID NOT NULL REFERENCES public.auto_exchange_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  diamond_amount NUMERIC NOT NULL,
  fallback_reason TEXT NOT NULL,
  cashout_request_id UUID REFERENCES public.cashout_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fallback_conversion_requests ENABLE ROW LEVEL SECURITY;

-- Audit log for compliance and debugging
CREATE TABLE IF NOT EXISTS public.exchange_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  request_id UUID REFERENCES public.auto_exchange_requests(id) ON DELETE SET NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_audit_log ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_auto_exchange_requests_user_id_status ON public.auto_exchange_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_exchange_requests_created_at ON public.auto_exchange_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_exchange_requests_tx_hash ON public.auto_exchange_requests(tx_hash);
CREATE INDEX IF NOT EXISTS idx_auto_exchange_config_user_id ON public.auto_exchange_config(user_id);
CREATE INDEX IF NOT EXISTS idx_fallback_conversion_requests_user_id ON public.fallback_conversion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_fallback_conversion_requests_auto_exchange_id ON public.fallback_conversion_requests(auto_exchange_request_id);
CREATE INDEX IF NOT EXISTS idx_exchange_audit_log_user_id ON public.exchange_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_audit_log_timestamp ON public.exchange_audit_log(timestamp DESC);

-- Updated-at triggers
CREATE OR REPLACE FUNCTION public.touch_exchange_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS touch_auto_exchange_requests ON public.auto_exchange_requests;
CREATE TRIGGER touch_auto_exchange_requests
BEFORE UPDATE ON public.auto_exchange_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_exchange_updated_at();

DROP TRIGGER IF EXISTS touch_auto_exchange_config ON public.auto_exchange_config;
CREATE TRIGGER touch_auto_exchange_config
BEFORE UPDATE ON public.auto_exchange_config
FOR EACH ROW
EXECUTE FUNCTION public.touch_exchange_updated_at();

DROP TRIGGER IF EXISTS touch_fallback_conversion_requests ON public.fallback_conversion_requests;
CREATE TRIGGER touch_fallback_conversion_requests
BEFORE UPDATE ON public.fallback_conversion_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_exchange_updated_at();

-- RLS Policies

-- auto_exchange_requests: owner read/insert, backend functions write
CREATE POLICY "Auto exchange read"
ON public.auto_exchange_requests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Auto exchange insert"
ON public.auto_exchange_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- auto_exchange_config: owner read/write
CREATE POLICY "Auto exchange config read"
ON public.auto_exchange_config FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Auto exchange config insert"
ON public.auto_exchange_config FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Auto exchange config update"
ON public.auto_exchange_config FOR UPDATE
USING (auth.uid() = user_id);

-- fallback_conversion_requests: owner read
CREATE POLICY "Fallback conversion read"
ON public.fallback_conversion_requests FOR SELECT
USING (auth.uid() = user_id);

-- exchange_audit_log: owner read
CREATE POLICY "Exchange audit log read"
ON public.exchange_audit_log FOR SELECT
USING (auth.uid() = user_id);

-- Grant service role access for backend functions
GRANT ALL ON public.auto_exchange_requests TO service_role;
GRANT ALL ON public.auto_exchange_config TO service_role;
GRANT ALL ON public.fallback_conversion_requests TO service_role;
GRANT ALL ON public.exchange_audit_log TO service_role;
