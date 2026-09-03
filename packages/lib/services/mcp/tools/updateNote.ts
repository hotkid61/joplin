import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import { NoteEntity } from '../../database/types';
import { McpTool, ToolError } from '../types';

interface ReplaceTextOp {
	find: string;
	replace: string;
}

interface Input {
	id?: string;
	title?: string;
	body?: string;
	append?: string;
	prepend?: string;
	replace_text?: ReplaceTextOp;
	notebook_id?: string;
	todo_completed?: boolean;
}

// Models often invent notebook_id: "default" after reading create_note docs.
// Resolve real folders by id, title, or the default-folder alias; never require
// a move for title/body-only updates.
const resolveNotebookId = async (raw: string) => {
	const trimmed = raw.trim();
	if (!trimmed) {
		throw new ToolError('notebook_id must not be empty — omit it unless you are moving the note');
	}

	if (/^default$/i.test(trimmed)) {
		const folder = await Folder.defaultFolder();
		if (!folder) {
			throw new ToolError('No notebook available to resolve "default". Pass a real notebook id from list_notebooks, or omit notebook_id.');
		}
		return folder.id;
	}

	const byId = await Folder.load(trimmed);
	if (byId) return byId.id;

	const byTitle = await Folder.loadByTitle(trimmed);
	if (byTitle) return byTitle.id;

	throw new ToolError(
		`Notebook not found: "${trimmed}". Pass a notebook id from list_notebooks, or a notebook title. Omit notebook_id entirely unless you are moving the note — do not invent values like "default".`,
	);
};

const tool: McpTool = {
	id: 'update_note',
	description: [
		'Update an existing note. Only the fields you pass are changed; omitted fields keep their current value.',
		'',
		'For title-only or body-only edits, pass id + the fields to change. Do NOT pass notebook_id unless you are moving the note to another notebook.',
		'Never invent notebook_id values such as "default" — omit the field to leave the note where it is.',
		'',
		'For body changes, prefer the partial operations over passing a full body:',
		'  append        — append text to the end of the body',
		'  prepend       — insert text at the start of the body',
		'  replace_text  — replace a single exact match of "find" with "replace" (errors if the text is missing or appears more than once)',
		'',
		'Pass "body" only for full rewrites; it overrides the partial operations.',
	].join('\n'),
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The note id to update.' },
			title: { type: 'string', description: 'New title.' },
			body: { type: 'string', description: 'Full replacement body. Use the partial ops below for small edits.' },
			append: { type: 'string', description: 'Text to append to the end of the existing body.' },
			prepend: { type: 'string', description: 'Text to insert at the start of the existing body.' },
			replace_text: {
				type: 'object',
				description: 'Find/replace a single occurrence in the existing body. Errors if "find" is missing or matches multiple times.',
				properties: {
					find: { type: 'string' },
					replace: { type: 'string' },
				},
				required: ['find', 'replace'],
			},
			notebook_id: {
				type: 'string',
				description: 'Optional. Move the note by notebook id or title. Omit for title/body updates. Do not pass "default".',
			},
			todo_completed: { type: 'boolean', description: 'For to-do notes: mark as completed (true) or open (false).' },
		},
		required: ['id'],
	},
	handler: async (input: Input) => {
		if (!input.id) throw new ToolError('Missing "id" parameter');

		const existing = await Note.load(input.id);
		if (!existing || existing.is_conflict || (existing.deleted_time && existing.deleted_time > 0)) {
			throw new ToolError(`Note not found: ${input.id}`);
		}

		const patch: NoteEntity = { id: input.id };
		if (input.title !== undefined) patch.title = input.title;
		if (input.todo_completed !== undefined) patch.todo_completed = input.todo_completed ? Date.now() : 0;

		if (input.notebook_id !== undefined && String(input.notebook_id).trim() !== '') {
			patch.parent_id = await resolveNotebookId(String(input.notebook_id));
		}

		let nextBody = existing.body ?? '';
		let bodyChanged = false;
		if (input.body !== undefined) {
			nextBody = input.body;
			bodyChanged = true;
		} else {
			if (input.prepend) {
				nextBody = `${input.prepend}${nextBody}`;
				bodyChanged = true;
			}
			if (input.append) {
				nextBody = `${nextBody}${input.append}`;
				bodyChanged = true;
			}
			if (input.replace_text) {
				const { find, replace } = input.replace_text;
				if (!find) throw new ToolError('"replace_text.find" must not be empty');
				const firstIdx = nextBody.indexOf(find);
				if (firstIdx < 0) throw new ToolError('replace_text: "find" string not found in body');
				if (nextBody.indexOf(find, firstIdx + 1) >= 0) {
					throw new ToolError('replace_text: "find" string appears more than once; pass more context to make it unique');
				}
				nextBody = `${nextBody.slice(0, firstIdx)}${replace ?? ''}${nextBody.slice(firstIdx + find.length)}`;
				bodyChanged = true;
			}
		}
		if (bodyChanged) patch.body = nextBody;

		const saved = await Note.save(patch);

		return {
			id: saved.id,
			title: saved.title,
			updated_time: saved.updated_time,
			notebook_id: saved.parent_id,
		};
	},
};

export default tool;
