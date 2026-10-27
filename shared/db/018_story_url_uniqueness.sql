-- A publisher item may surface through multiple feeds. Its canonical URL remains
-- one raw mention and must not become a second outlet or a second cluster.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_url_unique ON stories(url);
