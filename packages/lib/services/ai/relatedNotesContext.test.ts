import Setting from '../../models/Setting';
import { setupDatabaseAndSynchronizer, switchClient } from '../../testing/test-utils';
import { fetchRelatedNoteExcerpts } from './relatedNotesContext';

describe('relatedNotesContext', () => {

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	test('returns empty when includeRelatedNotes is off', async () => {
		Setting.setValue('ai.chat.includeRelatedNotes', false);
		const results = await fetchRelatedNoteExcerpts('EUCOM contract status', null);
		expect(results).toEqual([]);
	});

	test('returns empty for blank query even when enabled', async () => {
		Setting.setValue('ai.chat.includeRelatedNotes', true);
		const results = await fetchRelatedNoteExcerpts('   ', null);
		expect(results).toEqual([]);
	});

});
