
-- 1. Add new columns to player_state
ALTER TABLE public.player_state 
ADD COLUMN IF NOT EXISTS total_converted_oil NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;

-- 2. Update exchange_minerals_atomic to track total_converted_oil
CREATE OR REPLACE FUNCTION public.exchange_minerals_atomic(
  p_user_id UUID,
  p_mineral_type TEXT,
  p_amount NUMERIC,
  p_oil_value NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_mineral NUMERIC;
  v_oil_gain NUMERIC;
  v_current_minerals JSONB;
  v_new_minerals JSONB;
BEGIN
  -- Lock Player State
  SELECT minerals INTO v_current_minerals FROM public.player_state WHERE user_id = p_user_id FOR UPDATE;
  
  v_current_mineral := COALESCE((v_current_minerals->>p_mineral_type)::numeric, 0);
  
  IF v_current_mineral < p_amount THEN
    RAISE EXCEPTION 'Insufficient minerals';
  END IF;

  v_oil_gain := p_amount * p_oil_value;
  v_new_minerals := jsonb_set(
    v_current_minerals, 
    ARRAY[p_mineral_type], 
    to_jsonb(v_current_mineral - p_amount)
  );

  -- Execute Exchange
  UPDATE public.player_state 
  SET 
    oil_balance = oil_balance + v_oil_gain,
    minerals = v_new_minerals,
    total_converted_oil = COALESCE(total_converted_oil, 0) + v_oil_gain
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true, 
    'oil_added', v_oil_gain,
    'new_mineral_amount', v_current_mineral - p_amount
  );
END;
$$;

-- 3. Create claim_daily_reward RPC
CREATE OR REPLACE FUNCTION public.claim_daily_reward(
  p_user_id UUID,
  p_reward_amount NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last_claim TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_new_balance NUMERIC;
BEGIN
  -- Lock Player State
  SELECT last_daily_claim, oil_balance INTO v_last_claim, v_new_balance FROM public.player_state WHERE user_id = p_user_id FOR UPDATE;
  
  -- Check if recently claimed (within last 24 hours)
  IF v_last_claim IS NOT NULL AND v_now < (v_last_claim + INTERVAL '24 hours') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Daily reward already claimed');
  END IF;

  -- Update State
  UPDATE public.player_state
  SET 
    oil_balance = oil_balance + p_reward_amount,
    last_daily_claim = v_now
  WHERE user_id = p_user_id
  RETURNING oil_balance INTO v_new_balance;

  RETURN jsonb_build_object(
    'ok', true,
    'new_balance', v_new_balance,
    'next_claim', v_now + INTERVAL '24 hours'
  );
END;
$$;
