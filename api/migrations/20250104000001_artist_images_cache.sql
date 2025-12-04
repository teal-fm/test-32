-- Create artist images cache table
CREATE TABLE IF NOT EXISTS artist_images (
    mb_id TEXT PRIMARY KEY,
    image_url TEXT,
    image_source TEXT, -- 'spotify', 'fanart', or NULL if no image found
    cached_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artist_images_cached_at ON artist_images(cached_at);
