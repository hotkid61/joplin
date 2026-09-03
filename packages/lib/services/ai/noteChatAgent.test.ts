import Setting from '../../models/Setting';
import { _internal } from './noteChatAgent';
import { agentWorkspaceToolIds, isAgentToolEnabled, setAgentToolEnabled } from '../mcp/registry';

describe('noteChatAgent', () => {

	test('buildAgentToolDefinitions exposes search/read/write and omits delete', () => {
		const defs = _internal.buildAgentToolDefinitions();
		const names = defs.map(d => d.name);
		expect(names).toEqual(expect.arrayContaining([...agentWorkspaceToolIds]));
		expect(names).not.toContain('delete_note');
		expect(names).toContain('create_notebook');
		expect(names).toContain('list_notes');
		expect(names).toContain('open_note');
		for (const def of defs) {
			expect(def.description.length).toBeGreaterThan(0);
			expect(def.parameters).toBeTruthy();
		}
	});

	test('toolActivitySummary describes search and write actions', () => {
		expect(_internal.toolActivitySummary('search_notes', { query: 'packing list' }, 'start'))
			.toContain('Searching notes');
		expect(_internal.toolActivitySummary('update_note', { id: 'a1b2c3d4e5f6' }, 'start'))
			.toContain('Updating note');
		expect(_internal.toolActivitySummary('update_note', { id: 'a1b2c3d4e5f6' }, 'end'))
			.toBe('Updated note a1b2c3d4e5f6');
		expect(_internal.toolActivitySummary(
			'update_note',
			{ id: 'a1b2c3d4e5f6' },
			'end',
			false,
			JSON.stringify({ id: 'a1b2c3d4e5f6abcd', title: 'Briefing' }),
		)).toBe('Updated note: Briefing (id a1b2c3d4e5f6abcd)');
		expect(_internal.toolActivitySummary('create_note', { title: 'x' }, 'end', true))
			.toBe('create_note failed');
		expect(_internal.toolActivitySummary(
			'create_note',
			{ title: 'Briefing' },
			'end',
			false,
			JSON.stringify({ id: 'b88a1b86eaba4d17851773a02f651f91', title: 'Briefing' }),
		)).toBe('Created note: Briefing (id b88a1b86eaba4d17851773a02f651f91)');
	});

	test('formatWriteSuccessFallback summarises create_note results', () => {
		expect(_internal.formatWriteSuccessFallback([
			{ toolName: 'create_note', title: 'Briefing Note', id: 'abc123' },
		])).toBe('Created note: Briefing Note (id abc123)');
	});

	test('agentSystemPrompt includes current note id and tool guidance', () => {
		const prompt = _internal.agentSystemPrompt({
			title: 'Brief',
			body: 'Body text',
			selection: null,
			noteId: 'currentNoteId01',
		}, ['search_notes', 'create_note', 'update_note']);
		expect(prompt).toContain('currentNoteId01');
		expect(prompt).toContain('Never delete notes');
		expect(prompt).toContain('Body text');
		expect(prompt).toContain('keep the body concise');
		expect(prompt).toContain('NEVER claim success');
		expect(prompt).toContain('change it back');
		expect(prompt).toContain('prior title or body');
		expect(prompt).toContain('notebook_id="default"');
		expect(prompt).toContain('when NOT to use tools');
		expect(prompt).toContain('_AI Chats');
		expect(prompt).toContain('Enabled tools in this session: search_notes, create_note, update_note');
		expect(prompt).not.toContain('"edits"');
		expect(prompt).toContain('tag:TAG_TITLE');
		expect(prompt).toContain('read_note each unique id at most ONCE');
		expect(prompt).toContain('stop calling tools and answer immediately');
	});

	test('claimsUnverifiedWriteSuccess detects success narration without tools', () => {
		expect(_internal.claimsUnverifiedWriteSuccess(
			'The briefing note title has been changed back to "testing actions demo".',
		)).toBe(true);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'The title of the note has been successfully updated back to its original name.',
		)).toBe(true);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'I\'ve updated the note title.',
		)).toBe(true);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'I will now update the note title.',
		)).toBe(false);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'Listed notebooks in the vault.',
		)).toBe(false);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'Hello! This transcript was created automatically.',
		)).toBe(false);
		expect(_internal.claimsUnverifiedWriteSuccess(
			'Hi — I can help you search notes or create notes when you ask.',
		)).toBe(false);
	});

	test('shouldEnforceWriteClaim skips greetings and casual capability questions', () => {
		const claim = 'The note title has been updated.';
		expect(_internal.shouldEnforceWriteClaim('hello', claim, {
			writeToolsOffered: true,
			writeSuccessCount: 0,
		})).toBe(false);
		expect(_internal.shouldEnforceWriteClaim('hi', claim, {
			writeToolsOffered: true,
			writeSuccessCount: 0,
		})).toBe(false);
		expect(_internal.shouldEnforceWriteClaim('what tools can you call?', claim, {
			writeToolsOffered: true,
			writeSuccessCount: 0,
		})).toBe(false);
		expect(_internal.shouldEnforceWriteClaim('change the title back', claim, {
			writeToolsOffered: true,
			writeSuccessCount: 0,
		})).toBe(true);
		expect(_internal.shouldEnforceWriteClaim('please update the note', 'Sure, happy to help.', {
			writeToolsOffered: true,
			writeSuccessCount: 0,
		})).toBe(false);
		expect(_internal.shouldEnforceWriteClaim('please update the note', claim, {
			writeToolsOffered: true,
			writeSuccessCount: 1,
		})).toBe(false);
	});

	test('isCasualNonTaskMessage and userLooksLikeWriteRequest classify turns', () => {
		expect(_internal.isCasualNonTaskMessage('hello')).toBe(true);
		expect(_internal.isCasualNonTaskMessage('Thanks!')).toBe(true);
		expect(_internal.isCasualNonTaskMessage('what tools can you call?')).toBe(true);
		expect(_internal.isCasualNonTaskMessage('create a note titled hello')).toBe(false);
		expect(_internal.userLooksLikeWriteRequest('create a note about packing')).toBe(true);
		expect(_internal.userLooksLikeWriteRequest('hello')).toBe(false);
	});

	test('invokeAgentTool rejects delete_note', async () => {
		const result = await _internal.invokeAgentTool({
			id: 'call_1',
			name: 'delete_note',
			arguments: { id: 'x' },
		});
		expect(result.ok).toBe(false);
		expect(result.text).toContain('disallowed');
	});

	test('enabledTools setting filters agent tool definitions', () => {
		Setting.setValue('ai.chat.enabledTools', {});
		expect(isAgentToolEnabled('create_note')).toBe(true);

		setAgentToolEnabled('create_note', false);
		expect(isAgentToolEnabled('create_note')).toBe(false);
		const names = _internal.buildAgentToolDefinitions().map(d => d.name);
		expect(names).not.toContain('create_note');
		expect(names).toContain('search_notes');

		setAgentToolEnabled('create_note', true);
		expect(_internal.buildAgentToolDefinitions().map(d => d.name)).toContain('create_note');
	});


	test('readNoteCacheKey and extractNoteIdsFromToolPayload support tag retrieval', () => {
		expect(_internal.readNoteCacheKey({ id: 'abc', offset: 0, max_chars: 0 })).toBe('abc|0|0');
		expect(_internal.readNoteCacheKey({ id: 'abc', offset: 10, max_chars: 100 })).toBe('abc|10|100');
		expect(_internal.readNoteCacheKey({})).toBe('');

		const fromSearch = _internal.extractNoteIdsFromToolPayload(
			'search_notes',
			JSON.stringify({ results: [{ id: 'n1', title: 'A' }, { id: 'n2', title: 'B' }], total: 2 }),
		);
		expect(fromSearch).toEqual(['n1', 'n2']);

		const fromList = _internal.extractNoteIdsFromToolPayload(
			'list_notes',
			JSON.stringify({ notes: [{ id: 'n3', title: 'C' }], total: 1 }),
		);
		expect(fromList).toEqual(['n3']);
	});

	test('maxAgentSteps is raised for multi-doc summarisation', () => {
		expect(_internal.maxAgentSteps).toBeGreaterThanOrEqual(12);
		expect(_internal.alreadyReadGuidance).toMatch(/already read/i);
		expect(_internal.synthesizeNowNudge).toMatch(/final answer/i);
	});

});
