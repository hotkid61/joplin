import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import Tag from '../../../models/Tag';
import { utils as commandUtils } from '../../CommandService';
import { stateUtils } from '../../../reducer';
import { McpTool, ToolError } from '../types';

const tool: McpTool = {
	id: 'get_active_note',
	description: 'Return the note currently open / selected in the UI (id, title, notebook, tags). Use when the user says "this note" or "the open note".',
	inputSchema: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		let noteId: string | null = null;
		try {
			const state = commandUtils.store?.getState?.();
			if (state) {
				noteId = stateUtils.selectedNoteId(state);
			}
		} catch {
			// Store may be unavailable in headless / test contexts.
		}

		if (!noteId) {
			throw new ToolError('No note is currently selected in the UI.');
		}

		const note = await Note.load(noteId);
		if (!note || note.is_conflict || (note.deleted_time && note.deleted_time > 0)) {
			throw new ToolError(`Active note not found: ${noteId}`);
		}

		const folder = note.parent_id ? await Folder.load(note.parent_id) : null;
		const tags = await Tag.tagsByNoteId(note.id);

		return {
			id: note.id,
			title: note.title,
			notebook_id: note.parent_id,
			notebook_title: folder ? folder.title : null,
			tags: tags.map(t => t.title),
			is_todo: !!note.is_todo,
			todo_completed: !!note.todo_completed,
			body_length: (note.body ?? '').length,
			updated_time: note.updated_time,
		};
	},
};

export default tool;
