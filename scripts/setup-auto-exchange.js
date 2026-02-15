import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[v0] Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupAutoExchange() {
  console.log('[v0] Starting auto-exchange system setup...');

  try {
    // 1. Create auto_exchange_requests table
    const { error: err1 } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (err1) console.log('[v0] auto_exchange_requests table created or already exists');

    // 2. Create auto_exchange_config table
    const { error: err2 } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (err2) console.log('[v0] auto_exchange_config table created or already exists');

    // 3. Create fallback_conversion_requests table
    const { error: err3 } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (err3) console.log('[v0] fallback_conversion_requests table created or already exists');

    // 4. Create exchange_audit_log table
    const { error: err4 } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (err4) console.log('[v0] exchange_audit_log table created or already exists');

    console.log('[v0] Auto-exchange system setup complete!');
  } catch (error) {
    console.error('[v0] Setup error:', error.message);
    process.exit(1);
  }
}

setupAutoExchange();
