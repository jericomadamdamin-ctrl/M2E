
-- Insert daily_oil_reward setting
INSERT INTO public.global_game_settings (key, value, description)
VALUES ('daily_oil_reward', 5, 'Amount of Oil users claim daily')
ON CONFLICT (key) DO NOTHING;
