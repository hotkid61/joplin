import Folder from '../../models/Folder';
import Note from '../../models/Note';
import Logger from '@joplin/utils/Logger';
import { NoteEntity } from '../database/types';

const logger = Logger.create('chatTranscript');

export const aiChatsNotebookTitle = '_AI Chats';

export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'error' | 'system';

export interface TranscriptEntry {
	role: TranscriptRole;
	text: string;
}

export interface ChatThreadSummary {
	id: string;
	title: string;
	updated_time: number;
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

export const listChatTranscriptThreads = async (limit = 30): Promise<ChatThreadSummary[]> => {
	const folder = await Folder.loadByTitle(aiChatsNotebookTitle);
	if (!folder || (folder.deleted_time && folder.deleted_time > 0)) return [];

	const notes = await Note.previews(folder.id, {
		fields: ['id', 'title', 'updated_time'],
		order: [{ by: 'user_updated_time', dir: 'DESC' }],
	}) as NoteEntity[];

	return notes.slice(0, limit).map(n => ({
		id: n.id,
		title: n.title || '(untitled)',
		updated_time: n.updated_time || 0,
	}));
};

// Very small parser: turns transcript markdown back into chat panel messages.
export const parseTranscriptBodyToMessages = (body: string) => {
	const text = body || '';
	const blocks = text.split(/\n(?=### (?:User|Assistant|Tool|Error) · )/);
	const messages: { role: 'user' | 'assistant' | 'tool' | 'error'; text: string }[] = [];
	for (const block of blocks) {
		const m = block.match(/^### (User|Assistant|Tool|Error) · [^\n]*\n+([\s\S]*)$/);
		if (!m) continue;
		const roleMap = {
			User: 'user',
			Assistant: 'assistant',
			Tool: 'tool',
			Error: 'error',
		} as const;
		const role = roleMap[m[1] as keyof typeof roleMap];
		const content = m[2].trim();
		if (content === '_(empty)_') continue;
		messages.push({ role, text: content });
	}
	return messages;
};

export const loadChatTranscriptThread = async (noteId: string) => {
	const note = await Note.load(noteId);
	if (!note || note.is_conflict || (note.deleted_time && note.deleted_time > 0)) {
		throw new Error(`Chat transcript note not found: ${noteId}`);
	}
	return {
		id: note.id,
		title: note.title || '',
		messages: parseTranscriptBodyToMessages(note.body || ''),
	};
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
	listChatTranscriptThreads,
	loadChatTranscriptThread,
	parseTranscriptBodyToMessages,
	appendChatTranscriptEntries,
	appendChatTranscriptSafe,
	formatTranscriptBlock,
};
