import { describe, expect, it } from 'vitest';
import { cleanCandidateText, decodeHtmlEntities } from '../src/ingest/text';

describe('cleanCandidateText', () => {
  it('removes <script>...</script> and <style>...</style> blocks completely', () => {
    const input =
      '<p>Breaking news: <b>Prime Minister</b> speaks.</p><script>alert(1)</script><style>body { color: red; }</style>';
    const cleaned = cleanCandidateText(input);
    expect(cleaned).toBe('Breaking news: Prime Minister speaks.');
    expect(cleaned).not.toContain('alert(1)');
    expect(cleaned).not.toContain('color: red');
  });

  it('strips all HTML tags leaving inner text', () => {
    const input = '<div><h1>Title</h1><p>Paragraph with <a href="https://example.com">a link</a> and <em>emphasis</em>.</p></div>';
    expect(cleanCandidateText(input)).toBe('Title Paragraph with a link and emphasis.');
  });

  it('decodes XML/HTML entities correctly', () => {
    const input = 'AT&amp;T &quot;unveils&quot; new plans &#x27;today&#x27; &lt;tech&gt; &amp; telecom &nbsp; update';
    expect(cleanCandidateText(input)).toBe("AT&T \"unveils\" new plans 'today' <tech> & telecom   update".replace(/\s+/g, ' ').trim());
  });

  it('decodes common entities including dashes and ellipsis', () => {
    const input = 'Wait&hellip; here comes a dash &ndash; or an em-dash &mdash; right now.';
    expect(decodeHtmlEntities(input)).toBe('Wait… here comes a dash – or an em-dash — right now.');
  });

  it('decodes decimal numeric entities', () => {
    expect(decodeHtmlEntities('Copyright &#169; 2026')).toBe('Copyright © 2026');
  });

  it('collapses consecutive whitespace and trims leading/trailing spaces', () => {
    const input = '   \n\t  Multiple   lines \r\n and \t tabs   everywhere.   \n';
    expect(cleanCandidateText(input)).toBe('Multiple lines and tabs everywhere.');
  });

  it('handles empty or undefined strings safely without throwing', () => {
    expect(cleanCandidateText('')).toBe('');
    expect(cleanCandidateText(null)).toBe('');
    expect(cleanCandidateText(undefined)).toBe('');
    expect(decodeHtmlEntities('')).toBe('');
  });
});
