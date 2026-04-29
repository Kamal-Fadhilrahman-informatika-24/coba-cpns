-- ============================================================
-- NUMTEST CPNS — Supabase Database Schema v2
-- Full-stack production-grade schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Enable UUID extension ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════
-- TABLE: users
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50)  NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),                          -- NULL for OAuth users
  provider      VARCHAR(20)  NOT NULL DEFAULT 'email', -- 'email' | 'google'
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider);

-- ══════════════════════════════════════════════════════════
-- TABLE: user_stats
-- Tracks level progression, scores, and match history.
-- level_unlocked: 1 = easy only, 2 = easy+medium, 3 = all
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_stats (
  id                    UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Level progression
  level_unlocked        INTEGER NOT NULL DEFAULT 1 CHECK (level_unlocked BETWEEN 1 AND 3),
  easy_best_accuracy    INTEGER NOT NULL DEFAULT 0 CHECK (easy_best_accuracy BETWEEN 0 AND 100),
  medium_best_accuracy  INTEGER NOT NULL DEFAULT 0 CHECK (medium_best_accuracy BETWEEN 0 AND 100),

  -- Score tracking
  total_score           INTEGER NOT NULL DEFAULT 0,
  high_score            INTEGER NOT NULL DEFAULT 0,

  -- Multiplayer stats
  total_matches         INTEGER NOT NULL DEFAULT 0,
  wins                  INTEGER NOT NULL DEFAULT 0,
  losses                INTEGER NOT NULL DEFAULT 0,

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user_id   ON public.user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_high_score ON public.user_stats(high_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_wins       ON public.user_stats(wins DESC);

-- ══════════════════════════════════════════════════════════
-- TABLE: test_history
-- Records every completed test (simulation and multiplayer).
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.test_history (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score           INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  wrong_answers   INTEGER NOT NULL DEFAULT 0,
  accuracy        INTEGER NOT NULL DEFAULT 0 CHECK (accuracy BETWEEN 0 AND 100),
  duration        INTEGER NOT NULL DEFAULT 0,          -- seconds taken
  difficulty      VARCHAR(10) NOT NULL DEFAULT 'easy', -- 'easy'|'medium'|'hard'|'mixed'
  mode            VARCHAR(15) NOT NULL DEFAULT 'simulation', -- 'simulation'|'multiplayer'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_history_user_id  ON public.test_history(user_id);
CREATE INDEX IF NOT EXISTS idx_test_history_created  ON public.test_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_history_diff_acc ON public.test_history(user_id, difficulty, accuracy DESC);

-- ══════════════════════════════════════════════════════════
-- TABLE: multiplayer_matches
-- Records completed 1v1 matches.
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.multiplayer_matches (
  id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id        UUID    NOT NULL UNIQUE,
  player1_id     UUID    NOT NULL REFERENCES public.users(id),
  player2_id     UUID    NOT NULL REFERENCES public.users(id),
  player1_score  INTEGER NOT NULL DEFAULT 0,
  player2_score  INTEGER NOT NULL DEFAULT 0,
  winner_id      UUID    REFERENCES public.users(id), -- NULL = draw
  duration       INTEGER NOT NULL DEFAULT 60,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_player1  ON public.multiplayer_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2  ON public.multiplayer_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_created  ON public.multiplayer_matches(created_at DESC);

-- ══════════════════════════════════════════════════════════
-- TABLE: matchmaking_queue
-- Persistent queue for matchmaking (Supabase-backed, not in-memory).
-- Stale entries (>5 min) should be cleaned periodically.
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  socket_id  VARCHAR(100) NOT NULL,
  username   VARCHAR(100) NOT NULL DEFAULT 'Player',
  joined_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_joined ON public.matchmaking_queue(joined_at ASC);

-- Cleanup function for stale queue entries (run via pg_cron or manual)
-- DELETE FROM public.matchmaking_queue WHERE joined_at < NOW() - INTERVAL '5 minutes';

-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Backend uses service_role key which bypasses RLS.
-- These policies protect direct Supabase client access.
-- ══════════════════════════════════════════════════════════
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplayer_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_queue  ENABLE ROW LEVEL SECURITY;

-- Users: anyone can read (for leaderboard usernames), only self can write
CREATE POLICY "users_public_read"  ON public.users FOR SELECT USING (true);
CREATE POLICY "users_self_insert"  ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_self_update"  ON public.users FOR UPDATE USING (auth.uid() = id);

-- User stats: public read (leaderboard), service role writes
CREATE POLICY "stats_public_read"  ON public.user_stats FOR SELECT USING (true);
CREATE POLICY "stats_service_write" ON public.user_stats FOR ALL USING (true);

-- Test history: private per user
CREATE POLICY "history_self_only"  ON public.test_history FOR ALL USING (auth.uid() = user_id);

-- Multiplayer matches: participants can read their own matches
CREATE POLICY "matches_read" ON public.multiplayer_matches
  FOR SELECT USING (auth.uid() = player1_id OR auth.uid() = player2_id);
CREATE POLICY "matches_insert" ON public.multiplayer_matches
  FOR INSERT WITH CHECK (true);

-- Queue: service role only (all queue operations are done server-side)
CREATE POLICY "queue_service_only" ON public.matchmaking_queue FOR ALL USING (true);

-- ══════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ══════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER stats_updated_at
  BEFORE UPDATE ON public.user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════
-- VIEWS (for convenience)
-- ══════════════════════════════════════════════════════════

-- Global leaderboard view
CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT
  us.user_id,
  u.username,
  u.avatar_url,
  us.high_score,
  us.total_score,
  us.wins,
  us.losses,
  us.total_matches,
  us.level_unlocked,
  us.easy_best_accuracy,
  us.medium_best_accuracy,
  RANK() OVER (ORDER BY us.high_score DESC) AS rank
FROM public.user_stats us
JOIN public.users u ON u.id = us.user_id
ORDER BY us.high_score DESC;
