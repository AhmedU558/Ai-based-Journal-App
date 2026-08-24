-- Neither table was ever mapped to a JPA entity/repository anywhere in
-- ai-service - orphaned schema, never written to. Same treatment as
-- goal_tracking in V2.
DROP TABLE IF EXISTS detected_habits;
DROP TABLE IF EXISTS ai_journal_summaries;
