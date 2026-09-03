import { formatTranscriptBlock, aiChatsNotebookTitle } from './chatTranscript';

describe('chatTranscript', () => {

	test('formatTranscriptBlock includes role heading and body', () => {
		const block = formatTranscriptBlock({
			role: 'user',
			text: 'update the briefing note title',
		}, new Date('2026-09-03T18:00:00.000Z'));
		expect(block).toContain('### User · 2026-09-03T18:00:00.000Z');
		expect(block).toContain('update the briefing note title');
	});

	test('exports the vault notebook title used for persistence', () => {
		expect(aiChatsNotebookTitle).toBe('_AI Chats');
	});

});
