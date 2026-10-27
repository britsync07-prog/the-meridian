-- Raw mentions reference cluster 0 until curation assigns a real cluster.
-- This permanent sentinel satisfies the stories.cluster_id foreign key.
INSERT OR IGNORE INTO clusters (
  id, slug, canonical_headline, canonical_excerpt, primary_section_id,
  section_confidence, section_method, published_at, first_seen_at, last_seen_at,
  outlet_count, mention_count, trending_score, is_prominent, updated_at
) VALUES (
  0, '_unclustered', 'Unclustered raw mention', NULL, NULL,
  0, 'rules', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z',
  0, 0, 0, 0, '1970-01-01T00:00:00.000Z'
);
