import { mockAiService } from './mockAiService';

describe('mockAiService.chat', () => {
  it('returns a keyword-matched response for a recognizable message', async () => {
    const reply = await mockAiService.chat('I am so stressed about my workload today');
    expect(reply).toMatch(/control/i);
  });

  it('returns a non-empty default response for an unrecognized message', async () => {
    const reply = await mockAiService.chat('what is the weather pattern in the pacific northwest');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('rotates through default responses on repeated unrecognized messages', async () => {
    const first = await mockAiService.chat('completely unrelated query one');
    const second = await mockAiService.chat('completely unrelated query two');
    expect(first).not.toBe(second);
  });
});

describe('mockAiService.detectMood', () => {
  it('returns null for empty content', async () => {
    const result = await mockAiService.detectMood('   ');
    expect(result).toBeNull();
  });

  it('detects ANGRY from keywords', async () => {
    const result = await mockAiService.detectMood('I am so angry and furious right now');
    expect(result?.primaryMood).toBe('ANGRY');
  });
});

// The editor-toolbar helpers. These assert the mocks are real, input-dependent
// transforms rather than fixed strings - the same bar the rest of this repo
// holds mocks to.
describe('mockAiService editor helpers', () => {
  it('summarize derives from the input and reports a real word count', async () => {
    const summary = await mockAiService.summarize('I finished the redesign today. It felt great.');
    expect(summary).toContain('I finished the redesign today.');
    expect(summary).toMatch(/8 words/);
  });

  it('rephrase produces different text that still reflects the input', async () => {
    const input = 'Today was a productive day';
    const rephrased = await mockAiService.rephrase(input);
    expect(rephrased).not.toBe(input);
    expect(rephrased.toLowerCase()).toContain('today was a productive day');
  });

  it('fixGrammar capitalizes a standalone "i" and tidies spacing', async () => {
    const corrected = await mockAiService.fixGrammar('i went out  today ,and i was happy.It was fun');
    expect(corrected).toContain('I went out');
    expect(corrected).not.toMatch(/\s,/);
    expect(corrected).not.toMatch(/ {2,}/);
    expect(corrected).toContain('. It was fun');
  });

  it('generateTags includes the detected mood and strips nothing unexpected', async () => {
    const tags = await mockAiService.generateTags('I am so grateful and thankful today');
    expect(tags).toContain('grateful');
    expect(tags).toEqual(expect.arrayContaining(['journal', 'reflection']));
    tags.forEach((t) => expect(t).not.toContain('#'));
  });

  it('returns empty results for blank content instead of inventing output', async () => {
    expect(await mockAiService.summarize('   ')).toBe('');
    expect(await mockAiService.rephrase('   ')).toBe('');
    expect(await mockAiService.fixGrammar('   ')).toBe('');
    expect(await mockAiService.generateTags('   ')).toEqual([]);
  });
});
