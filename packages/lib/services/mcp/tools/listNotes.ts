import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import Tag from '../../../models/Tag';
import { NoteEntity } from '../../database/types';
import { McpTool, ToolError } from '../types';

interface Input {
	notebook_id?: string;
	tag?: string;
	limit?: number;
	offset?: number;
}

const defaultLimit = 50;
const maxLimit = 200;

const coerceInt = (value: unknown, fallback: number) => {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value);
		if (Number.isFinite(n)) return Math.trunc(n);
	}
	return fallback;
};

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

	const tagById = await Tag.load(trimmed);
	const tag = tagById || await Tag.loadByTitle(trimmed);
	if (tag) {
		throw new ToolError(
			`"${trimmed}" is a tag (title: "${tag.title}"), not a notebook. To list notes with that tag, call search_notes with query "tag:${tag.title}" or list_notes with tag:"${tag.title}".`,
		);
	}

	throw new ToolError(`Notebook not found: "${trimmed}". Pass a notebook id or title from list_notebooks.`);
};

const resolveTag = async (raw: string) => {
	const trimmed = raw.trim();
	if (!trimmed) throw new ToolError('Empty "tag" parameter.');

	const byId = await Tag.load(trimmed);
	if (byId) return byId;

	const byTitle = await Tag.loadByTitle(trimmed);
	if (byTitle) return byTitle;

	throw new ToolError(`Tag not found: "${trimmed}". Pass a tag title or id from list_tags.`);
};

const mapNotes = (notes: NoteEntity[]) => notes.map(n => ({
	id: n.id,
	title: n.title,
	updated_time: n.updated_time,
	is_todo: !!n.is_todo,
	todo_completed: !!n.todo_completed,
}));

const tool: McpTool = {
	id: 'list_notes',
	description: [
		'List notes in a notebook, or all notes with a given tag.',
		'Pass notebook_id (notebook id or title) to list a notebook. Pass tag (tag title or id) to list every note with that tag across the vault.',
		'If both are set, returns notes that are in that notebook AND have that tag.',
		'Omit both to list notes in the default notebook.',
		'For "every note tagged X", prefer search_notes with query `tag:X` (or this tool with tag:"X") — do not pass a tag id as notebook_id.',
		'Does not return note bodies — use read_note for content.',
	].join(' '),
	inputSchema: {
		type: 'object',
		properties: {
			notebook_id: {
				type: 'string',
				description: 'Notebook id or title. Omit to use the default notebook (unless tag is set).',
			},
			tag: {
				type: 'string',
				description: 'Tag title or id. When set, lists notes that have this tag (vault-wide unless notebook_id is also set).',
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
		const limit = Math.min(Math.max(coerceInt(input.limit, defaultLimit), 1), maxLimit);
		const offset = Math.max(0, coerceInt(input.offset, 0));
		const tagRaw = input.tag !== undefined && input.tag !== null ? String(input.tag).trim() : '';

		if (tagRaw) {
			const tag = await resolveTag(tagRaw);
			let notes = await Tag.notes(tag.id, {
				fields: ['id', 'title', 'updated_time', 'is_todo', 'todo_completed', 'parent_id'],
				order: [{ by: 'user_updated_time', dir: 'DESC' }],
			}) as NoteEntity[];

			let notebookId: string | undefined;
			let notebookTitle: string | null = null;
			if (input.notebook_id) {
				notebookId = await resolveNotebookId(String(input.notebook_id));
				if (notebookId) {
					notes = notes.filter(n => n.parent_id === notebookId);
					const folder = await Folder.load(notebookId);
					notebookTitle = folder?.title ?? null;
				}
			}

			const page = notes.slice(offset, offset + limit);
			return {
				tag_id: tag.id,
				tag_title: tag.title,
				notebook_id: notebookId ?? null,
				notebook_title: notebookTitle,
				total: notes.length,
				offset,
				notes: mapNotes(page),
			};
		}

		const notebookId = input.notebook_id
			? await resolveNotebookId(String(input.notebook_id))
			: (await Folder.defaultFolder())?.id;
		if (!notebookId) throw new ToolError('No notebook available.');

		const folder = await Folder.load(notebookId);
		if (!folder) throw new ToolError(`Notebook not found: ${notebookId}`);

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
			notes: mapNotes(page),
		};
	},
};

export default tool;
