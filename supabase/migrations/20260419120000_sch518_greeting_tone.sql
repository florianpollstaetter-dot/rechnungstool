-- SCH-518: Per-user greeting tone preference.
-- Values: 'motivating' | 'challenging' | 'sarcastic' | 'off'.
-- Controls which pool of greetings the navbar picks from and hides the
-- greeting entirely when set to 'off'.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS greeting_tone text NOT NULL DEFAULT 'motivating';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_greeting_tone_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_greeting_tone_check
      CHECK (greeting_tone IN ('motivating', 'challenging', 'sarcastic', 'off'));
  END IF;
END $$;
