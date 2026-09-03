import Logger from '@joplin/utils/Logger';
import Setting from '../../models/Setting';
import Note from '../../models/Note';
import SearchService from './SearchService';
import SearchEngineUtils from '../search/SearchEngineUtils';
import { embeddingAvailability } from './availability';

const logger = Logger.create('relatedNotesContext');

export interface RelatedNoteExcerpt {
	noteId: string;
	title: string;
	excerpt: string;
	source: 'semantic' | 'keyword';
}

const maxResults = 5;
const maxExcerptChars = 1200;

const truncate = (text: string, maxChars: number) => {
	const normalised = text.replace(/\s+/g, ' ').trim();
	if (normalised.length <= maxChars) return normalised;
	return `${normalised.slice(0, maxChars).trimEnd()}…`;
};

const trySemantic = async (query: string, excludeNoteId: string | null | undefined) => {
	const availability = embeddingAvailability();
	if (!availability.available) return [] as RelatedNoteExcerpt[];

	const hits = await SearchService.instance().search({
		query: { text: query },
		relevance: 'normal',
	});

	const byNote = new Map<string, RelatedNoteExcerpt>();
	for (const hit of hits) {
		if (excludeNoteId && hit.noteId === excludeNoteId) continue;
		if (byNote.has(hit.noteId)) continue;
		byNote.set(hit.noteId, {
			noteId: hit.noteId,
			title: '',
			excerpt: truncate(hit.chunkText, maxExcerptChars),
			source: 'semantic',
		});
		if (byNote.size >= maxResults) break;
	}

	if (!byNote.size) return [];

	const notes = await Note.byIds([...byNote.keys()], { fields: ['id', 'title'] });
	for (const note of notes) {
		const entry = byNote.get(note.id);
		if (entry) entry.title = note.title || '';
	}

	return [...byNote.values()];
};

const tryKeyword = async (query: string, excludeNoteId: string | null | undefined) => {
	// Drop filter-like tokens so plain chat questions still search usefully.
	const keywords = query
		.split(/\s+/)
		.filter(t => t && !t.includes(':') && !t.startsWith('-') && t.length > 2)
		.map(t => t.replace(/^["*]+|["*]+$/g, ''))
		.filter(Boolean)
		.slice(0, 8);

	if (!keywords.length) return [] as RelatedNoteExcerpt[];

	const { notes } = await SearchEngineUtils.notesForQuery(keywords.join(' '), false, {
		fields: ['id', 'title', 'body'],
	});

	const out: RelatedNoteExcerpt[] = [];
	for (const note of notes) {
		if (excludeNoteId && note.id === excludeNoteId) continue;
		out.push({
			noteId: note.id,
			title: note.title || '',
			excerpt: truncate(note.body || '', maxExcerptChars),
			source: 'keyword',
		});
		if (out.length >= maxResults) break;
	}
	return out;
};

// Soft-failing vault retrieval for in-app chat. Prefers local embeddings;
// falls back to FTS keyword search when the index is unavailable.
export const fetchRelatedNoteExcerpts = async (
	query: string,
	excludeNoteId: string | null | undefined,
): Promise<RelatedNoteExcerpt[]> => {
	try {
		if (!Setting.value('ai.chat.includeRelatedNotes')) return [];
	} catch {
		return [];
	}

	if (!query.trim()) return [];

	try {
		const semantic = await trySemantic(query, excludeNoteId);
		if (semantic.length) return semantic;
	} catch (error) {
		logger.info('Semantic related-note lookup failed; falling back to keyword search:', error);
	}

	try {
		return await tryKeyword(query, excludeNoteId);
	} catch (error) {
		logger.info('Keyword related-note lookup failed:', error);
		return [];
	}
};
