import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import { NoteEntity } from '../../database/types';
import { McpTool, ToolError } from '../types';

interface Input {
	notebook_id?: string;
	limit?: number;
	offset?: number;
}

const defaultLimit = 50;
const maxLimit = 200;

const resolveNotebookId = async (raw: string) => {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	if (/^default$/i.test(trimmed)) {
		const folder = await Folder.defaultFolder();
		if (!folder) throw new ToolError('No default notebook available.');
		return folder.id;
	}

	const byId = await Folder.load(trimmed);
	if (byId) return byId.id;

	const byTitle = await Folder.loadByTitle(trimmed);
	if (byTitle) return byTitle.id;

	throw new ToolError(`Notebook not found: "${trimmed}". Pass a notebook id or title from list_notebooks.`);
};

const tool: McpTool = {
	id: 'list_notes',
	description: [
		'List notes in a notebook (folder). Returns id, title, updated_time, and is_todo for each note.',
		'Pass notebook_id as a notebook id or title. Omit notebook_id to list notes in the default notebook.',
		'Does not return note bodies — use read_note for content.',
	].join(' '),
	inputSchema: {
		type: 'object',
		properties: {
			notebook_id: {
				type: 'string',
				description: 'Notebook id or title. Omit to use the default notebook.',
			},
			limit: {
				type: 'integer',
				description: 'Maximum notes to return.',
				minimum: 1,
				maximum: maxLimit,
				default: defaultLimit,
			},
			offset: {
				type: 'integer',
				description: 'Skip this many notes (for paging).',
				minimum: 0,
				default: 0,
			},
		},
	},
	handler: async (input: Input) => {
		const notebookId = input.notebook_id
			? await resolveNotebookId(String(input.notebook_id))
			: (await Folder.defaultFolder())?.id;
		if (!notebookId) throw new ToolError('No notebook available.');

		const folder = await Folder.load(notebookId);
		if (!folder) throw new ToolError(`Notebook not found: ${notebookId}`);

		const limit = Math.min(Math.max(input.limit ?? defaultLimit, 1), maxLimit);
		const offset = Math.max(0, input.offset ?? 0);
		const notes = await Note.previews(notebookId, {
			fields: ['id', 'title', 'updated_time', 'is_todo', 'todo_completed'],
			order: [{ by: 'user_updated_time', dir: 'DESC' }],
		}) as NoteEntity[];

		const page = notes.slice(offset, offset + limit);
		return {
			notebook_id: notebookId,
			notebook_title: folder.title,
			total: notes.length,
			offset,
			notes: page.map(n => ({
				id: n.id,
				title: n.title,
				updated_time: n.updated_time,
				is_todo: !!n.is_todo,
				todo_completed: !!n.todo_completed,
			})),
		};
	},
};

export default tool;
