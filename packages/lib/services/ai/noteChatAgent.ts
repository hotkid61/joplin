import AiService from './AiService';
import { ChatMessage, ChatToolDefinition, ToolCallRequest, isAiAbortError, throwIfAiAborted } from './types';
import JoplinError from '../../JoplinError';
import Logger from '@joplin/utils/Logger';
import { agentWriteToolIds, agentWorkspaceTools, findAgentTool } from '../mcp/registry';
import { ToolError } from '../mcp/types';
import findFencedBlock from './utils/findFencedBlock';
import type { ChatReply, ChatTurn, NoteContext } from './noteChat';

const logger = Logger.create('noteChatAgent');

export const maxAgentSteps = 12;

// Keep in sync with supportedStructuredBlockTags in noteChat.ts
const structuredBlockTags = ['jsoncanvas', 'mermaid', 'abc', 'fountain'];

export interface AgentToolEvent {
	phase: 'start' | 'end';
	toolName: string;
	summary: string;
	isError?: boolean;
	isWrite?: boolean;
	noteId?: string;
	noteTitle?: string;
}

export type AgentProgressCallback = (event: AgentToolEvent)=> void;

export type AgentWriteConfirmCallback = (info: {
	toolName: string;
	summary: string;
	arguments: Record<string, unknown>;
})=> Promise<boolean>;

interface WriteSuccess {
	toolName: string;
	title: string;
	id: string;
}

const joplinMarkdownNotes = [
	'This note uses Joplin Markdown — CommonMark plus the following extras:',
	'- Checkboxes: `- [ ] todo` and `- [x] done`. Render as interactive checkboxes.',
	'- Internal note links: `[Title](:/NOTE_ID)`. Never invent NOTE_IDs — only reuse ones already in the note or returned by tools.',
	'- Resource references (images, attachments): `![alt](:/RESOURCE_ID)` or `[name](:/RESOURCE_ID)`. Never invent RESOURCE_IDs.',
	'- Math: `$inline$` and `$$block$$` (KaTeX).',
	'- Mermaid / ABC / Fountain / JSONCanvas fenced blocks as in Joplin.',
].join('\n');

const charsPerToken = 4;
const noteBodyTokenBudget = 80000;

const estimateTokens = (text: string) => Math.ceil((text || '').length / charsPerToken);

const estimateMessageTokens = (m: ChatMessage) => {
	let total = estimateTokens(m.content);
	if (m.toolCalls?.length) {
		for (const tc of m.toolCalls) {
			total += estimateTokens(tc.name) + estimateTokens(tc.rawArguments ?? JSON.stringify(tc.arguments));
		}
	}
	return total;
};

const clipTitle = (title: string, max = 60) => {
	const t = title.trim();
	return t.length > max ? `${t.slice(0, max)}…` : t;
};

const parseToolResultFields = (text: string) => {
	try {
		const parsed = JSON.parse(text) as { id?: unknown; title?: unknown };
		return {
			id: typeof parsed.id === 'string' ? parsed.id : '',
			title: typeof parsed.title === 'string' ? parsed.title : '',
		};
	} catch {
		return { id: '', title: '' };
	}
};

export const toolActivitySummary = (
	toolName: string,
	args: Record<string, unknown>,
	phase: 'start' | 'end',
	isError?: boolean,
	resultText?: string,
) => {
	if (phase === 'start') {
		switch (toolName) {
		case 'search_notes': {
			const q = String(args.query ?? '').trim();
			const clipped = q.length > 60 ? `${q.slice(0, 60)}…` : q;
			return clipped ? `Searching notes for "${clipped}"…` : 'Searching notes…';
		}
		case 'semantic_search_notes': {
			const q = String(args.query ?? '').trim();
			const clipped = q.length > 60 ? `${q.slice(0, 60)}…` : q;
			return clipped ? `Semantic search: "${clipped}"…` : 'Semantic search…';
		}
		case 'read_note':
			return `Reading note ${String(args.id ?? '').slice(0, 12)}…`;
		case 'list_notebooks':
			return 'Listing notebooks…';
		case 'list_notes':
			return 'Listing notes…';
		case 'list_tags':
			return 'Listing tags…';
		case 'create_note': {
			const title = String(args.title ?? '').trim();
			const clipped = clipTitle(title);
			return clipped ? `Creating note "${clipped}"…` : 'Creating note…';
		}
		case 'update_note':
			return `Updating note ${String(args.id ?? '').slice(0, 12)}…`;
		case 'manage_tags':
			return `Updating tags on note ${String(args.note_id ?? '').slice(0, 12)}…`;
		case 'create_notebook': {
			const title = String(args.title ?? '').trim();
			const clipped = clipTitle(title);
			return clipped ? `Creating notebook "${clipped}"…` : 'Creating notebook…';
		}
		case 'open_note':
			return `Opening note ${String(args.id ?? '').slice(0, 12)}…`;
		case 'get_active_note':
			return 'Reading active note…';
		case 'get_vault_stats':
			return 'Gathering vault stats…';
		case 'get_or_create_daily_note':
			return 'Resolving daily note…';
		default:
			return `Running ${toolName}…`;
		}
	}
	if (isError) return `${toolName} failed`;
	switch (toolName) {
	case 'search_notes':
	case 'semantic_search_notes':
		return 'Search finished';
	case 'read_note': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title);
		const id = fields.id || String(args.id ?? '');
		if (title && id) return `Read note: ${title} (id ${id})`;
		if (id) return `Read note (id ${id})`;
		return 'Finished reading note';
	}
	case 'list_notebooks':
		return 'Listed notebooks';
	case 'list_notes':
		return 'Listed notes';
	case 'list_tags':
		return 'Listed tags';
	case 'create_note': {
		const fromArgs = clipTitle(String(args.title ?? ''));
		const fromResult = parseToolResultFields(resultText || '');
		const title = clipTitle(fromResult.title || fromArgs);
		const id = fromResult.id;
		if (title && id) return `Created note: ${title} (id ${id})`;
		if (title) return `Created note: ${title}`;
		if (id) return `Created note (id ${id})`;
		return 'Created note';
	}
	case 'update_note': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title);
		const id = (fields.id || String(args.id ?? '')).slice(0, 32);
		if (title && id) return `Updated note: ${title} (id ${id})`;
		if (title) return `Updated note: ${title}`;
		return id ? `Updated note ${id}` : 'Updated note';
	}
	case 'manage_tags': {
		const id = String(args.note_id ?? '');
		return id ? `Updated tags on note ${id}` : 'Updated tags';
	}
	case 'create_notebook': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title || String(args.title ?? ''));
		return title ? `Created notebook: ${title}` : 'Created notebook';
	}
	case 'open_note': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title);
		const id = fields.id || String(args.id ?? '');
		if (title && id) return `Opened note: ${title} (id ${id})`;
		return id ? `Opened note ${id}` : 'Opened note';
	}
	case 'get_active_note': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title);
		return title ? `Active note: ${title}` : 'Got active note';
	}
	case 'get_vault_stats':
		return 'Vault stats ready';
	case 'get_or_create_daily_note': {
		const fields = parseToolResultFields(resultText || '');
		const title = clipTitle(fields.title);
		const id = fields.id;
		if (title && id) return `Daily note: ${title} (id ${id})`;
		return title ? `Daily note: ${title}` : 'Daily note ready';
	}
	default:
		return `${toolName} finished`;
	}
};

export const formatWriteSuccessFallback = (writes: WriteSuccess[]) => {
	const lines = writes.map(w => {
		if (w.toolName === 'create_note') {
			if (w.title && w.id) return `Created note: ${w.title} (id ${w.id})`;
			if (w.title) return `Created note: ${w.title}`;
			if (w.id) return `Created note (id ${w.id})`;
			return 'Created note';
		}
		if (w.id) return `Updated note ${w.id}`;
		return 'Updated note';
	});
	return lines.join('\n');
};

export const buildAgentToolDefinitions = (): ChatToolDefinition[] => {
	return agentWorkspaceTools().map(t => ({
		name: t.id,
		description: t.description,
		parameters: t.inputSchema as Record<string, unknown>,
	}));
};

// LM Studio prompt templates for some models treat JSON numbers as sequences
// and crash ("Unknown test: sequence" / Channel Error). Stringify numeric
// leaves so tool results stay valid JSON without bare numbers.
const jsonSafeForLocalModels = (value: unknown): unknown => {
	if (typeof value === 'number' || typeof value === 'bigint') return String(value);
	if (Array.isArray(value)) return value.map(jsonSafeForLocalModels);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			out[key] = jsonSafeForLocalModels(child);
		}
		return out;
	}
	return value;
};

const serialiseToolResult = (payload: unknown) => {
	if (payload === null || payload === undefined) return '';
	if (typeof payload === 'string') return payload;
	return JSON.stringify(jsonSafeForLocalModels(payload), null, 2);
};

export const invokeAgentTool = async (call: ToolCallRequest) => {
	const tool = findAgentTool(call.name);
	if (!tool) {
		return { ok: false as const, text: `Unknown or disallowed tool '${call.name}'. delete_note is not available in AI Chat agent mode.` };
	}
	try {
		const payload = await tool.handler(call.arguments ?? {});
		return { ok: true as const, text: serialiseToolResult(payload) };
	} catch (error) {
		if (error instanceof ToolError) {
			return { ok: false as const, text: error.message };
		}
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`Agent tool ${call.name} failed:`, error);
		return { ok: false as const, text: `Tool error: ${message}` };
	}
};

// User turns that clearly ask to mutate vault content (create/edit/rename/etc.).
export const userLooksLikeWriteRequest = (text: string) => {
	const t = (text || '').trim();
	if (!t) return false;
	// cSpell:disable
	return /\b(?:create|update|edit|append|save|rename|revert|undo|restore|rewrite|replace|delete|move)\b|\b(?:change|set|fix)\s+(?:the\s+)?(?:title|body|name|note)\b|\b(?:add|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:note|notebook|heading|paragraph|section|todo|tag)\b|\bnew\s+note\b|\bchange\s+it\s+back\b/i.test(t);
	// cSpell:enable
};

// Casual turns that must never trigger tools or the write-claim guard.
export const isCasualNonTaskMessage = (text: string) => {
	const t = (text || '').trim();
	if (!t) return false;
	// cSpell:disable
	if (/^(hi|hello|hey|howdy|yo|sup|hiya|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|thx|cheers|ok|okay|cool|great|nice)[\s!.?]*$/i.test(t)) {
		return true;
	}
	return /\b(?:what(?:\s+\w+){0,4}\s+tools?\b|which\s+tools?\b|tools?\s+(?:can|do)\s+you\b|what\s+can\s+you\s+(?:do|call|use)\b|your\s+capabilities\b|list\s+(?:your\s+)?tools?\b)/i.test(t)
		&& !userLooksLikeWriteRequest(t);
	// cSpell:enable
};

// Detect assistant prose that asserts a create/update/revert already happened.
// Kept tight: bare "was created" / historical narration must NOT match (greetings
// often mention that a note or transcript was created).
export const claimsUnverifiedWriteSuccess = (text: string) => {
	const t = (text || '').trim();
	if (!t) return false;
	// cSpell:disable
	return /\bI(?:'ve| have)\s+(?:successfully\s+)?(?:updated|changed|created|reverted|renamed|restored|undone)\b|\b(?:successfully)\s+(?:updated|changed|reverted|created|renamed|restored)\b|\b(?:the\s+)?(?:note|title|body)\s+(?:has been|have been|was|were)\s+(?:successfully\s+)?(?:updated|changed|reverted|renamed|restored|undone)\b|\b(?:updated|changed|reverted|renamed)\s+(?:the\s+)?(?:note|title|body)\b|\b(?:created)\s+(?:the\s+|a\s+)?(?:new\s+)?note\b|\b(?:title|note|body)\b.{0,40}\b(?:has been|have been|was|were)\s+(?:successfully\s+)?(?:updated|changed|reverted|renamed|restored)\b|\b(?:changed|reverted|restored)\s+(?:it\s+)?back\b/i.test(t);
	// cSpell:enable
};

// Only run the false-success post-check when the user asked to write, or the
// assistant clearly claims a write while write tools were offered.
export const shouldEnforceWriteClaim = (
	userMessage: string,
	assistantText: string,
	opts: { writeToolsOffered: boolean; writeSuccessCount: number },
) => {
	if (opts.writeSuccessCount > 0) return false;
	if (isCasualNonTaskMessage(userMessage)) return false;
	if (!claimsUnverifiedWriteSuccess(assistantText)) return false;
	return userLooksLikeWriteRequest(userMessage) || opts.writeToolsOffered;
};

export const unverifiedWriteSuccessReply =
	'I have not applied that change yet — no successful create_note/update_note tool result in this turn. Ask me again and I will call the tool, or retry the request.';

const falseClaimNudge =
	'SYSTEM REMINDER: You just claimed a create/update/revert/undo succeeded, but no successful create_note or update_note tool result exists in this turn. You MUST call the appropriate tool now. Never claim success without a successful tool result. If you cannot call the tool, say clearly that you have NOT applied the change.';

const agentSystemPrompt = (note: NoteContext, enabledToolNames: string[] = []) => {
	const toolList = enabledToolNames.length
		? enabledToolNames.join(', ')
		: '(none enabled)';
	const lines: string[] = [
		'You are an agent inside Booz Allen Notes (Joplin). You can search the vault, read notes, and create or update notes using tools.',
		'',
		'CRITICAL — when NOT to use tools (reply in natural language with zero tool calls):',
		'- Greetings and small talk ("hi", "hello", "thanks", etc.): just greet back. Do not create, update, list, or search notes.',
		'- Pure Q&A about your capabilities ("what tools can you call?", "what can you do?"): answer from the enabled tool list below. Do not call list_notes or any other tool to answer.',
		'- Never create or update a note unless the user clearly asks to create, edit, save, append, rename, revert, undo, or otherwise change vault content.',
		'- Never write into `_AI Chats` notebook notes or AI Chat transcript notes via tools — those transcripts are auto-persisted by the app. Do not append chat replies into the current note with update_note.',
		'',
		`Enabled tools in this session: ${toolList}`,
		'',
		'Use tools when you need information outside the current note, or when the user asks you to change another note.',
		'Prefer search_notes / read_note / list_notes over guessing. Prefer update_note append or replace_text over rewriting an entire body.',
		'Use open_note to show a note in the UI. Use get_or_create_daily_note for daily notes. Use get_vault_stats for an overview.',
		'',
		'Tagged / multi-document retrieval (CRITICAL):',
		'- To find every note with a tag, call search_notes ONCE with query `tag:TAG_TITLE` (example: `tag:iron-lattice`). Optionally use list_notes with tag:"TAG_TITLE".',
		'- Do NOT discover tagged notes by list_tags → list_notes(notebook_id=tagId) → list_notebooks thrashing. list_notes notebook_id is for notebooks only.',
		'- Then read_note each unique id at most ONCE. Never re-read the same note id in this turn.',
		'- Skip open_note unless the user asked to open/show a note in the UI — it wastes a step during summarisation.',
		'- After you have read the unique notes you need, stop calling tools and answer immediately with a synthesis. Do not search again.',
		'',
		'When calling create_note, keep the body concise (about one to two pages / under ~2000 words). Prefer a clear outline over a very long dump — long tool arguments often time out on local models.',
		'Never delete notes. There is no delete tool.',
		'',
		'CRITICAL — tool results are the only proof of writes:',
		'- For any create, update, rename, revert, undo, or "change it back" request, you MUST call create_note or update_note in THIS turn.',
		'- When the user says "change it back", "revert", or "undo" a title/body change, call update_note with the prior title or body from earlier in this conversation if known. Do not invent a different prior value.',
		'- NEVER claim success (e.g. "has been updated", "changed back", "successfully reverted") unless that tool returned success in THIS turn.',
		'- Listing notebooks or searching is not enough — you still must call update_note to change a title or body.',
		'- For title/body updates, pass only id and the fields to change. Do NOT pass notebook_id unless moving the note. Never invent notebook_id="default".',
		'- If a tool fails, say it failed and quote the error. Do not pretend it worked.',
		'',
		'After tools finish, reply to the user in plain language (not JSON). Summarise only what the tools actually did.',
		'',
		`Current note id: ${note.noteId || '(none)'}`,
		`Current note title: ${note.title || '(untitled)'}`,
		'',
		joplinMarkdownNotes,
		'',
	];

	if (note.selection) {
		lines.push('The user has selected text in the current note:');
		lines.push('--- BEGIN SELECTION ---');
		lines.push(note.selection);
		lines.push('--- END SELECTION ---');
	} else {
		lines.push('Current note body:');
		lines.push('--- BEGIN NOTE ---');
		lines.push(note.body);
		lines.push('--- END NOTE ---');
	}

	if (note.relatedNotes?.length) {
		lines.push('');
		lines.push('Related note excerpts (optional context):');
		for (const related of note.relatedNotes) {
			lines.push(`### ${related.title || '(untitled)'} [id: ${related.noteId}]`);
			lines.push(related.excerpt);
		}
	}

	const hasFenced = structuredBlockTags.some(tag => !!findFencedBlock(note.body, tag, 0));
	if (hasFenced) {
		lines.push('');
		lines.push(`The current note contains structured fence(s) (${structuredBlockTags.join(', ')}). Preserve them when updating.`);
	}

	return lines.join('\n');
};


const readNoteCacheKey = (args: Record<string, unknown>) => {
	const id = String(args.id ?? '').trim();
	if (!id) return '';
	const offset = args.offset ?? 0;
	const maxChars = args.max_chars ?? 0;
	return `${id}|${offset}|${maxChars}`;
};

const extractNoteIdsFromToolPayload = (toolName: string, text: string) => {
	const ids: string[] = [];
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		if (toolName === 'read_note' && typeof parsed.id === 'string') {
			ids.push(parsed.id);
		}
		const lists = [parsed.results, parsed.notes];
		for (const list of lists) {
			if (!Array.isArray(list)) continue;
			for (const item of list) {
				if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
					ids.push((item as { id: string }).id);
				}
			}
		}
	} catch {
		// ignore non-JSON tool payloads
	}
	return ids;
};

const alreadyReadGuidance =
	'already read this turn — synthesize now. Do not call read_note again for this id; answer from the tool results you already have.';

const synthesizeNowNudge =
	'SYSTEM: You already have the note contents from tool results in this turn. Reply now with your final answer for the user. Do not call any more tools.';

export const runNoteChatAgent = async (
	note: NoteContext,
	history: ChatTurn[],
	userMessage: string,
	onProgress?: AgentProgressCallback,
	signal?: AbortSignal,
	confirmWrite?: AgentWriteConfirmCallback,
): Promise<ChatReply> => {
	throwIfAiAborted(signal);
	const tools = buildAgentToolDefinitions();
	if (!tools.length) {
		throw new JoplinError(
			'No agent tools are enabled. Open the Tools menu in AI Chat and enable at least one tool.',
			'aiAgentNoTools',
		);
	}

	const enabledToolNames = tools.map(t => t.name);
	const writeToolsOffered = enabledToolNames.some(name => agentWriteToolIds.has(name));

	const messages: ChatMessage[] = [
		{ role: 'system', content: agentSystemPrompt(note, enabledToolNames) },
		...history.map<ChatMessage>(t => ({ role: t.role, content: t.content })),
		{ role: 'user', content: userMessage },
	];

	const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
	if (totalTokens > noteBodyTokenBudget) {
		throw new JoplinError(
			'This conversation has grown too large to send. Reset the chat, or select the part of the note you want to ask about.',
			'aiNoteTooLarge',
		);
	}

	const writeSuccesses: WriteSuccess[] = [];
	let falseClaimNudged = false;
	const readNoteCache = new Map<string, string>();
	const uniqueNotesRead = new Set<string>();
	const discoveredNoteIds = new Set<string>();
	let synthesizeNudged = false;


	const replyFromWritesOrThrow = (error: unknown): ChatReply => {
		if (isAiAbortError(error)) throw error;
		if (writeSuccesses.length) {
			logger.warn('Agent chat failed after successful write(s); returning local success summary.', error);
			return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
		}
		throw error;
	};

	const finalizeTextReply = (text: string): ChatReply | 'nudge' => {
		const trimmed = text.trim();
		if (!trimmed) {
			if (writeSuccesses.length) return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
			return { reply: '', edits: [] };
		}
		if (shouldEnforceWriteClaim(userMessage, trimmed, {
			writeToolsOffered,
			writeSuccessCount: writeSuccesses.length,
		})) {
			if (!falseClaimNudged) {
				falseClaimNudged = true;
				logger.warn('Agent claimed write success without a tool result; nudging for a tool call.');
				messages.push({ role: 'assistant', content: trimmed });
				messages.push({ role: 'user', content: falseClaimNudge });
				return 'nudge';
			}
			logger.warn('Agent repeated unverified write-success claim; replacing reply.');
			return {
				reply: unverifiedWriteSuccessReply,
				edits: [],
				warning: 'The assistant claimed a note change without a successful tool call. Nothing was written.',
			};
		}
		return { reply: trimmed, edits: [] };
	};

	for (let step = 0; step < maxAgentSteps; step++) {
		throwIfAiAborted(signal);
		let result;
		try {
			result = await AiService.instance().chat(messages, { tools, signal });
		} catch (error) {
			return replyFromWritesOrThrow(error);
		}
		throwIfAiAborted(signal);

		if (result.toolsDropped) {
			const summary = 'Agent tools are not supported by this model/server (LM Studio Channel Error or broken tool template). Continuing without tools — switch to a tool-capable model, or disable Agent mode in Settings → AI.';
			logger.warn(summary);
			onProgress?.({
				phase: 'end',
				toolName: 'agent_tools',
				summary,
				isError: true,
			});
			const text = (result.text || '').trim();
			if (text) {
				const finalized = finalizeTextReply(text);
				if (finalized === 'nudge') continue;
				return finalized;
			}
			if (writeSuccesses.length) return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
			return { reply: summary, edits: [] };
		}

		if (result.toolCalls?.length) {
			messages.push({
				role: 'assistant',
				content: result.text || '',
				toolCalls: result.toolCalls,
			});

			for (const call of result.toolCalls) {
				throwIfAiAborted(signal);
				const isWrite = agentWriteToolIds.has(call.name);
				const startSummary = toolActivitySummary(call.name, call.arguments, 'start');
				onProgress?.({
					phase: 'start',
					toolName: call.name,
					summary: startSummary,
					isWrite,
				});

				if (isWrite && confirmWrite) {
					const approved = await confirmWrite({
						toolName: call.name,
						summary: startSummary,
						arguments: call.arguments ?? {},
					});
					if (!approved) {
						const deniedText = `Write cancelled by user: ${call.name}`;
						onProgress?.({
							phase: 'end',
							toolName: call.name,
							summary: deniedText,
							isError: true,
							isWrite: true,
						});
						messages.push({
							role: 'tool',
							toolCallId: call.id,
							content: deniedText,
						});
						continue;
					}
				}

				let invoked: { ok: boolean; text: string };
				let usedCache = false;
				if (call.name === 'read_note') {
					const cacheKey = readNoteCacheKey(call.arguments ?? {});
					const cached = cacheKey ? readNoteCache.get(cacheKey) : undefined;
					if (cached) {
						usedCache = true;
						invoked = {
							ok: true,
							text: `${cached}\n\n[${alreadyReadGuidance}]`,
						};
					} else {
						invoked = await invokeAgentTool(call);
						if (invoked.ok && cacheKey) {
							readNoteCache.set(cacheKey, invoked.text);
							const id = String(call.arguments?.id ?? '').trim();
							if (id) uniqueNotesRead.add(id);
						}
					}
				} else {
					invoked = await invokeAgentTool(call);
					if (invoked.ok && (call.name === 'search_notes' || call.name === 'list_notes')) {
						for (const id of extractNoteIdsFromToolPayload(call.name, invoked.text)) {
							discoveredNoteIds.add(id);
						}
					}
				}
				throwIfAiAborted(signal);
				const endSummary = usedCache
					? `Already read note ${String(call.arguments?.id ?? '').slice(0, 12)} this turn`
					: toolActivitySummary(call.name, call.arguments, 'end', !invoked.ok, invoked.text);
				const resultFields = parseToolResultFields(invoked.ok ? invoked.text : '');
				const noteId = resultFields.id
					|| String(call.arguments?.id ?? call.arguments?.note_id ?? '').trim()
					|| undefined;
				const noteTitle = resultFields.title || undefined;
				onProgress?.({
					phase: 'end',
					toolName: call.name,
					summary: endSummary,
					isError: !invoked.ok,
					isWrite,
					noteId,
					noteTitle,
				});

				if (invoked.ok && isWrite) {
					writeSuccesses.push({
						toolName: call.name,
						title: resultFields.title || String(call.arguments?.title ?? '').trim(),
						id: resultFields.id || String(call.arguments?.id ?? call.arguments?.note_id ?? '').trim(),
					});
				}

				messages.push({
					role: 'tool',
					toolCallId: call.id,
					content: invoked.text,
				});
			}

			const discoveredCount = discoveredNoteIds.size;
			const readEnough = uniqueNotesRead.size > 0 && (
				(discoveredCount > 0 && uniqueNotesRead.size >= discoveredCount)
				|| uniqueNotesRead.size >= 3
			);
			if (readEnough && !synthesizeNudged) {
				synthesizeNudged = true;
				messages.push({ role: 'user', content: synthesizeNowNudge });
			}
			continue;
		}

		const text = (result.text || '').trim();
		if (text) {
			const finalized = finalizeTextReply(text);
			if (finalized === 'nudge') continue;
			return finalized;
		}
		if (writeSuccesses.length) return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
		return { reply: '', edits: [] };
	}

	if (writeSuccesses.length) {
		return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
	}

	if (uniqueNotesRead.size > 0) {
		logger.warn('Agent hit max steps after reading notes; forcing a no-tools synthesis pass.');
		messages.push({ role: 'user', content: synthesizeNowNudge });
		try {
			const finalResult = await AiService.instance().chat(messages, { signal });
			const text = (finalResult.text || '').trim();
			if (text) {
				const finalized = finalizeTextReply(text);
				if (finalized !== 'nudge') return finalized;
			}
		} catch (error) {
			return replyFromWritesOrThrow(error);
		}
	}

	throw new JoplinError(
		'The agent used too many tool steps without finishing. Try a simpler request, or reset the chat.',
		'aiAgentMaxSteps',
	);
};

export const _internal = {
	agentSystemPrompt,
	toolActivitySummary,
	buildAgentToolDefinitions,
	invokeAgentTool,
	formatWriteSuccessFallback,
	claimsUnverifiedWriteSuccess,
	userLooksLikeWriteRequest,
	isCasualNonTaskMessage,
	shouldEnforceWriteClaim,
	unverifiedWriteSuccessReply,
	maxAgentSteps,
	readNoteCacheKey,
	extractNoteIdsFromToolPayload,
	alreadyReadGuidance,
	synthesizeNowNudge,
};
