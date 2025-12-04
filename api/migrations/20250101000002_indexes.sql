-- Indexes for performance

CREATE INDEX idx_user_plays_user_did ON user_plays (user_did);
CREATE INDEX idx_user_plays_played_at ON user_plays (played_at);
CREATE INDEX idx_user_plays_artists ON user_plays USING GIN (artists);
CREATE INDEX idx_wrapped_cache_created ON wrapped_cache (created_at);
