import Note from '../../../models/Note';
import Folder from '../../../models/Folder';
import CommandService from '../../CommandService';
import { McpTool, ToolError } from '../types';

interface Input {
	date?: string;
	open?: boolean;
}

const dailyNotebookTitle = 'Daily notes';

const formatDateTitle = (d: Date) => {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseDate = (raw?: string) => {
	if (!raw || !raw.trim()) return new Date();
	const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) throw new ToolError('date must be YYYY-MM-DD');
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (Number.isNaN(d.getTime())) throw new ToolError('Invalid date');
	return d;
};

const ensureDailyNotebook = async () => {
	const existing = await Folder.loadByTitle(dailyNotebookTitle);
	if (existing && !(existing.deleted_time && existing.deleted_time > 0)) {
		return existing;
	}
	return Folder.save({ title: dailyNotebookTitle });
};

const tool: McpTool = {
	id: 'get_or_create_daily_note',
	description: [
		'Get or create a daily note for a calendar day (default: today).',
		`Notes live in the "${dailyNotebookTitle}" notebook with titles like YYYY-MM-DD.`,
		'Returns the note id/title and whether it was newly created. Optionally open it in the UI.',
	].join(' '),
	inputSchema: {
		type: 'object',
		properties: {
			date: {
				type: 'string',
				description: 'Calendar day as YYYY-MM-DD. Defaults to today.',
			},
			open: {
				type: 'boolean',
				description: 'If true, open the daily note in the UI after resolving it.',
				default: false,
			},
		},
	},
	handler: async (input: Input) => {
		const day = parseDate(input.date);
		const title = formatDateTitle(day);
		const folder = await ensureDailyNotebook();

		const notes = await Note.previews(folder.id, {
			fields: ['id', 'title', 'body', 'updated_time'],
			conditions: ['title = ?'],
			conditionsParams: [title],
		});

		let note = notes.find(n => n.title === title) ?? null;
		let created = false;
		if (!note) {
			const body = [
				`# ${title}`,
				'',
				'_Daily note_',
				'',
			].join('\n');
			note = await Note.save({
				title,
				body,
				parent_id: folder.id,
			});
			created = true;
		}

		if (input.open) {
			try {
				await CommandService.instance().execute('openNote', note.id);
			} catch {
				// Opening is best-effort; still return the note.
			}
		}

		return {
			id: note.id,
			title: note.title,
			notebook_id: folder.id,
			notebook_title: folder.title,
			created,
			opened: !!input.open,
		};
	},
};

export default tool;
