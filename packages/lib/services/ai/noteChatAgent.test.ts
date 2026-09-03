import Setting from '../../models/Setting';
import { _internal } from './noteChatAgent';
import { agentWorkspaceToolIds, isAgentToolEnabled, setAgentToolEnabled } from '../mcp/registry';

describe('noteChatAgent', () => {

	test('buildAgentToolDefinitions exposes search/read/write and omits delete', () => {
		const defs = _internal.buildAgentToolDefinitions();
		const names = defs.map(d => d.name);
		expect(names).toEqual(expect.arrayContaining([...agentWorkspaceToolIds]));
		expect(names).not.toContain('delete_note');
		expect(names).not.toContain('create_notebook');
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
		});
		expect(prompt).toContain('currentNoteId01');
		expect(prompt).toContain('Never delete notes');
		expect(prompt).toContain('Body text');
		expect(prompt).toContain('keep the body concise');
		expect(prompt).not.toContain('"edits"');
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

});
