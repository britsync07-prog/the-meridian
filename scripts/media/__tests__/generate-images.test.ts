import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generate-images.mjs', () => {
  it('marks variants ready through the supported D1 query endpoint only after generation', () => {
    const script = readFileSync(resolve('scripts/media/generate-images.mjs'), 'utf8');
    expect(script).toContain("UPDATE images SET status = 'ready' WHERE source_url = ?");
    expect(script).toContain('/d1/database/${CF_D1_DATABASE_ID}/query');
    expect(script).toContain('!payload.success || !payload.result?.[0]?.success');
    expect(script.indexOf('await markImageReady(image.source_url)')).toBeGreaterThan(script.indexOf('await sharp(input).resize'));
    expect(script).toContain('Promise.all(images.slice(start, start + 6).map(generateImage))');
  });
});
