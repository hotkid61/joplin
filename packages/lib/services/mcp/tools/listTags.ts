import Tag from '../../../models/Tag';
import { McpTool } from '../types';

const tool: McpTool = {
	id: 'list_tags',
	description: [
		'List all tags that have at least one note attached, with their ids and titles.',
		'This does not return the notes themselves. To get every note with a tag, call search_notes with query `tag:TAG_TITLE` (preferred) or list_notes with tag:"TAG_TITLE".',
		'Do not pass a tag id to list_notes as notebook_id.',
	].join(' '),
	inputSchema: {
		type: 'object',
		properties: {},
	},
	handler: async () => {
		const tags = await Tag.allWithNotes();
		return {
			tags: tags.map(t => ({ id: t.id, title: t.title })),
		};
	},
};

export default tool;
