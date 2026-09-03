import { _internal, formatAttachmentDisplayLine, formatAttachmentsForPrompt } from './chatAttachments';

describe('chatAttachments', () => {

	test('formatAttachmentsForPrompt wraps extracted document text', () => {
		const out = formatAttachmentsForPrompt([
			{ fileName: 'brief.md', text: 'Hello vault', truncated: false },
		]);
		expect(out).toContain('BEGIN ATTACHMENT: brief.md');
		expect(out).toContain('Hello vault');
		expect(out).toContain('END ATTACHMENT: brief.md');
	});

	test('formatAttachmentDisplayLine lists file names', () => {
		expect(formatAttachmentDisplayLine(['a.pdf', 'b.txt'])).toBe('📎 a.pdf, b.txt');
		expect(formatAttachmentDisplayLine([])).toBe('');
	});

	test('truncateText caps oversized attachment bodies', () => {
		const long = 'x'.repeat(_internal.maxAttachmentChars + 500);
		const { text, truncated } = _internal.truncateText(long);
		expect(truncated).toBe(true);
		expect(text).toContain('[…truncated…]');
		expect(text.length).toBeLessThan(long.length);
		expect(text.startsWith('x'.repeat(_internal.maxAttachmentChars))).toBe(true);
	});

});
