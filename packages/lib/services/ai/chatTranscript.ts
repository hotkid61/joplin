import Folder from '../../models/Folder';
import Note from '../../models/Note';
import Logger from '@joplin/utils/Logger';

const logger = Logger.create('chatTranscript');

export const aiChatsNotebookTitle = '_AI Chats';

export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'error' | 'system';

export interface TranscriptEntry {
	role: TranscriptRole;
	text: string;
}

const ensureAiChatsNotebook = async () => {
	const existing = await Folder.loadByTitle(aiChatsNotebookTitle);
	if (existing && !(existing.deleted_time && existing.deleted_time > 0)) {
		return existing;
	}
	return Folder.save({ title: aiChatsNotebookTitle });
};

const formatStamp = (d = new Date()) => {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const roleHeading = (role: TranscriptRole) => {
	switch (role) {
	case 'user':
		return 'User';
	case 'assistant':
		return 'Assistant';
	case 'tool':
		return 'Tool';
	case 'error':
		return 'Error';
	default:
		return 'System';
	}
};

export const formatTranscriptBlock = (entry: TranscriptEntry, at = new Date()) => {
	const time = at.toISOString();
	return [
		`### ${roleHeading(entry.role)} · ${time}`,
		'',
		entry.text.trim() || '_(empty)_',
		'',
	].join('\n');
};

// Creates a new thread note under _AI Chats. Call on first send / after Reset.
export const createChatTranscriptNote = async (label?: string) => {
	const folder = await ensureAiChatsNotebook();
	const title = label?.trim() || `AI Chat — ${formatStamp()}`;
	const body = [
		`# ${title}`,
		'',
		'_Auto-saved AI Chat transcript. Searchable in your vault; safe to delete._',
		'',
	].join('\n');
	const saved = await Note.save({
		title,
		body,
		parent_id: folder.id,
	});
	return { id: saved.id, title: saved.title || title, folderId: folder.id };
};

export const appendChatTranscriptEntries = async (noteId: string, entries: TranscriptEntry[]) => {
	if (!noteId || !entries.length) return;
	const note = await Note.load(noteId);
	if (!note || note.is_conflict || (note.deleted_time && note.deleted_time > 0)) {
		throw new Error(`Chat transcript note not found: ${noteId}`);
	}
	const blocks = entries.map(e => formatTranscriptBlock(e)).join('\n');
	const nextBody = `${note.body || ''}${note.body?.endsWith('\n') ? '' : '\n'}${blocks}`;
	await Note.save({ id: noteId, body: nextBody });
};

export const appendChatTranscriptSafe = async (noteId: string | null | undefined, entries: TranscriptEntry[]) => {
	if (!noteId || !entries.length) return;
	try {
		await appendChatTranscriptEntries(noteId, entries);
	} catch (error) {
		logger.warn('Failed to append chat transcript:', error);
	}
};

export default {
	aiChatsNotebookTitle,
	createChatTranscriptNote,
	appendChatTranscriptEntries,
	appendChatTranscriptSafe,
	formatTranscriptBlock,
};
