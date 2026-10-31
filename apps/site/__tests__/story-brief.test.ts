import { describe, expect, it } from 'vitest';
import { buildStoryBrief } from '../src/lib/story-brief.js';

describe('story brief', () => {
  const base = {
    sectionName: 'Business',
    publishedAt: '2026-10-31T08:00:00Z',
    excerpt: 'The policy will take effect next month, according to the published report.',
    entities: ['London'],
    language: 'en' as const,
  };

  it('shows source-backed context, facts, and distinct outlet coverage', () => {
    const brief = buildStoryBrief({
      ...base,
      sources: [{ sourceName: 'Reuters' }, { sourceName: 'BBC News' }, { sourceName: 'Reuters' }],
    });

    expect(brief.reportedContext).toBe(base.excerpt);
    expect(brief.keyFacts).toEqual(expect.arrayContaining([
      { label: 'Coverage', value: '2 outlets: Reuters, BBC News' },
      { label: 'People and places', value: 'London' },
    ]));
    expect(brief.disclosure).toContain('Automated Meridian Brief');
  });

  it('keeps an absent excerpt absent instead of inventing detail', () => {
    const brief = buildStoryBrief({ ...base, excerpt: null, sources: [{ sourceName: 'Reuters' }] });
    expect(brief.reportedContext).toBeNull();
    expect(brief.coverage).toContain('1 outlet');
  });
});
