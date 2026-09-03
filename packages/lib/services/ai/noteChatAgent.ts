import AiService from './AiService';
import { ChatMessage, ChatToolDefinition, ToolCallRequest } from './types';
import JoplinError from '../../JoplinError';
import Logger from '@joplin/utils/Logger';
import { agentWriteToolIds, agentWorkspaceTools, findAgentTool } from '../mcp/registry';
import { ToolError } from '../mcp/types';
import findFencedBlock from './utils/findFencedBlock';
import type { ChatReply, ChatTurn, NoteContext } from './noteChat';

const logger = Logger.create('noteChatAgent');

export const maxAgentSteps = 8;

// Keep in sync with supportedStructuredBlockTags in noteChat.ts
const structuredBlockTags = ['jsoncanvas', 'mermaid', 'abc', 'fountain'];

export interface AgentToolEvent {
	phase: 'start' | 'end';
	toolName: string;
	summary: string;
	isError?: boolean;
	isWrite?: boolean;
}

export type AgentProgressCallback = (event: AgentToolEvent)=> void;

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
		case 'list_tags':
			return 'Listing tags…';
		case 'create_note': {
			const title = String(args.title ?? '').trim();
			const clipped = clipTitle(title);
			return clipped ? `Creating note "${clipped}"…` : 'Creating note…';
		}
		case 'update_note':
			return `Updating note ${String(args.id ?? '').slice(0, 12)}…`;
		default:
			return `Running ${toolName}…`;
		}
	}
	if (isError) return `${toolName} failed`;
	switch (toolName) {
	case 'search_notes':
	case 'semantic_search_notes':
		return 'Search finished';
	case 'read_note':
		return 'Finished reading note';
	case 'list_notebooks':
		return 'Listed notebooks';
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
		const id = String(args.id ?? '').slice(0, 12);
		return id ? `Updated note ${id}` : 'Updated note';
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

const agentSystemPrompt = (note: NoteContext) => {
	const lines: string[] = [
		'You are an agent inside Booz Allen Notes (Joplin). You can search the vault, read notes, and create or update notes using tools.',
		'',
		'Use tools when you need information outside the current note, or when the user asks you to change another note.',
		'Prefer search_notes / read_note over guessing. Prefer update_note append or replace_text over rewriting an entire body.',
		'When calling create_note, keep the body concise (about one to two pages / under ~2000 words). Prefer a clear outline over a very long dump — long tool arguments often time out on local models.',
		'Never delete notes. There is no delete tool.',
		'After tools finish, reply to the user in plain language (not JSON). Summarise what you changed.',
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

export const runNoteChatAgent = async (
	note: NoteContext,
	history: ChatTurn[],
	userMessage: string,
	onProgress?: AgentProgressCallback,
): Promise<ChatReply> => {
	const tools = buildAgentToolDefinitions();
	if (!tools.length) {
		throw new JoplinError(
			'No agent tools are enabled. Open the Tools menu in AI Chat and enable at least one tool.',
			'aiAgentNoTools',
		);
	}

	const messages: ChatMessage[] = [
		{ role: 'system', content: agentSystemPrompt(note) },
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

	const replyFromWritesOrThrow = (error: unknown): ChatReply => {
		if (writeSuccesses.length) {
			logger.warn('Agent chat failed after successful write(s); returning local success summary.', error);
			return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
		}
		throw error;
	};

	for (let step = 0; step < maxAgentSteps; step++) {
		let result;
		try {
			result = await AiService.instance().chat(messages, { tools });
		} catch (error) {
			return replyFromWritesOrThrow(error);
		}

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
			if (text) return { reply: text, edits: [] };
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
				const isWrite = agentWriteToolIds.has(call.name);
				const startSummary = toolActivitySummary(call.name, call.arguments, 'start');
				onProgress?.({
					phase: 'start',
					toolName: call.name,
					summary: startSummary,
					isWrite,
				});

				const invoked = await invokeAgentTool(call);
				const endSummary = toolActivitySummary(call.name, call.arguments, 'end', !invoked.ok, invoked.text);
				onProgress?.({
					phase: 'end',
					toolName: call.name,
					summary: endSummary,
					isError: !invoked.ok,
					isWrite,
				});

				if (invoked.ok && isWrite) {
					const fields = parseToolResultFields(invoked.text);
					writeSuccesses.push({
						toolName: call.name,
						title: fields.title || String(call.arguments?.title ?? '').trim(),
						id: fields.id || String(call.arguments?.id ?? '').trim(),
					});
				}

				messages.push({
					role: 'tool',
					toolCallId: call.id,
					content: invoked.text,
				});
			}
			continue;
		}

		const text = (result.text || '').trim();
		if (text) return { reply: text, edits: [] };
		if (writeSuccesses.length) return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
		return { reply: '', edits: [] };
	}

	if (writeSuccesses.length) {
		return { reply: formatWriteSuccessFallback(writeSuccesses), edits: [] };
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
	maxAgentSteps,
};
