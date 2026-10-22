-- ORA-3315: Ergebnis der VIES-UID-Prüfung am Kunden speichern.
--
-- uid_vies_status:     "" (nie geprüft) | valid | invalid | unavailable | format_error
-- uid_vies_checked_at: Zeitpunkt der letzten Prüfung (NULL = nie geprüft)
--
-- Beides optional — das Anlegen eines Kunden funktioniert ohne Prüfung weiter.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS uid_vies_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS uid_vies_checked_at timestamptz;
