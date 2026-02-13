-- Run this in Supabase SQL Editor to verify the setting exists
SELECT * FROM global_game_settings WHERE key = 'diamond_wld_exchange_rate';

-- If the above returns no rows, run this to add it:
INSERT INTO public.global_game_settings (key, value, description)
VALUES ('diamond_wld_exchange_rate', 0.1, 'Fixed WLD value per diamond for cashout rounds')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- Verify all settings:
SELECT * FROM global_game_settings ORDER BY key;
