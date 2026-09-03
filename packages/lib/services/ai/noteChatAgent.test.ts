import { _internal } from './noteChatAgent';
import { agentWorkspaceToolIds } from '../mcp/registry';

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
			.toBe('Updated note');
		expect(_internal.toolActivitySummary('create_note', { title: 'x' }, 'end', true))
			.toBe('create_note failed');
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

});
