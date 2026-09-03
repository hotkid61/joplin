import Note from '../../../models/Note';
import CommandService from '../../CommandService';
import { McpTool, ToolError } from '../types';

interface Input {
	id?: string;
}

const tool: McpTool = {
	id: 'open_note',
	description: 'Open a note in the Booz Allen Notes / Joplin UI by id. Use after search_notes or list_notes when the user should see the note.',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The note id (32-character hex).' },
		},
		required: ['id'],
	},
	handler: async (input: Input) => {
		if (!input.id) throw new ToolError('Missing "id" parameter');

		const note = await Note.load(input.id);
		if (!note || note.is_conflict || (note.deleted_time && note.deleted_time > 0)) {
			throw new ToolError(`Note not found: ${input.id}`);
		}

		try {
			await CommandService.instance().execute('openNote', note.id);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new ToolError(`Could not open note: ${message}`);
		}

		return {
			id: note.id,
			title: note.title,
			opened: true,
		};
	},
};

export default tool;
