import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import Tag from '../../../models/Tag';
import { ALL_NOTES_FILTER_ID } from '../../../reserved-ids';
import { McpTool } from '../types';

const tool: McpTool = {
	id: 'get_vault_stats',
	description: 'Return high-level counts for this profile: notebooks, notes, tags, and todos. Useful for a quick vault overview.',
	inputSchema: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		const [notebookCount, noteCount, tags] = await Promise.all([
			Folder.count(),
			Note.count(),
			Tag.allWithNotes(),
		]);

		const openTodos = await Note.previews(ALL_NOTES_FILTER_ID, {
			fields: ['id'],
			itemTypes: ['todo'],
			showCompletedTodos: false,
		});

		return {
			notebook_count: notebookCount,
			note_count: noteCount,
			tag_count: tags.length,
			open_todo_count: openTodos.length,
		};
	},
};

export default tool;
