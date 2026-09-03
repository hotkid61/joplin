import * as React from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Dispatch } from 'redux';
import { _ } from '@joplin/lib/locale';
import Setting from '@joplin/lib/models/Setting';
import Note from '@joplin/lib/models/Note';
import CommandService from '@joplin/lib/services/CommandService';
import Logger from '@joplin/utils/Logger';
import { basename } from '@joplin/utils/path';
import { stateUtils } from '@joplin/lib/reducer';
import { AiChatMessage, AppState } from '../../app.reducer';
import { runNoteChat, ChatTurn } from '@joplin/lib/services/ai/noteChat';
import { applyAnchorEdits } from '@joplin/lib/services/ai/applyNoteEdits';
import { chatAvailability } from '@joplin/lib/services/ai/availability';
import listChatModels from '@joplin/lib/services/ai/listChatModels';
import {
	appendChatTranscriptSafe,
	createChatTranscriptNote,
	listChatTranscriptThreads,
	loadChatTranscriptThread,
	ChatThreadSummary,
} from '@joplin/lib/services/ai/chatTranscript';
import {
	ChatAttachmentExtracted,
	extractChatAttachment,
	formatAttachmentDisplayLine,
	formatAttachmentsForPrompt,
	isSupportedChatAttachmentPath,
	supportedChatAttachmentExtensions,
} from '@joplin/lib/services/ai/chatAttachments';
import { isAiAbortError } from '@joplin/lib/services/ai/types';
import {
	agentWorkspaceToolIds,
	agentWriteToolIds,
	setAgentToolEnabled,
} from '@joplin/lib/services/mcp/registry';
import { WindowIdContext } from '../NewWindowOrIFrame';
import AiService from '@joplin/lib/services/ai/AiService';
import bridge from '../../services/bridge';

const logger = Logger.create('ChatPanel');

interface Props {
	themeId: number;
	available: boolean;
	unavailableHint: string;
	providerType: string;
	chatModel: string;
	chatBaseUrl: string;
	noteId: string | null;
	noteTitle: string;
	noteIsEncrypted: boolean;
	messages: AiChatMessage[];
	agentMode: boolean;
	includeRelatedNotes: boolean;
	confirmWrites: boolean;
	enabledTools: Record<string, boolean>;
	dispatch: Dispatch;
}

interface PendingAttachment {
	id: string;
	fileName: string;
	filePath: string;
	extracting: boolean;
	extracted?: ChatAttachmentExtracted;
	error?: string;
}

const disclosureSetting = 'ai.chat.disclosureAcknowledged';

let nextMessageId = 0;
const makeId = () => `m-${Date.now()}-${++nextMessageId}`;

const noteIdFromToolText = (text: string) => {
	const m = (text || '').match(/\bid\s+([a-f0-9]{32})\b/i) || (text || '').match(/\b([a-f0-9]{32})\b/i);
	return m ? m[1] : '';
};

const suggestedPrompts = (agentMode: boolean) => {
	if (agentMode) {
		return [
			_('Summarize related notes for Friday'),
			_('Draft a Friday Brief from vault context'),
			_('List open asks and owners'),
			_('Open today\'s daily note'),
		];
	}
	return [
		_('Summarize this note'),
		_('Extract action items'),
		_('Rewrite more concisely'),
		_('What am I missing?'),
	];
};

const estimateContextTokens = (noteBody: string, history: ChatTurn[], userText: string) => {
	const chars = (noteBody || '').length
		+ history.reduce((sum, t) => sum + (t.content || '').length, 0)
		+ (userText || '').length;
	return Math.ceil(chars / 4);
};

const editsSummary = (applied: number, missed: number) => {
	if (applied + missed === 0) return '';
	if (missed === 0) return _('%d edit(s) applied.', applied);
	return _('%d edit(s) applied, %d could not be placed automatically.', applied, missed);
};

const emptyHint = (agentMode: boolean, includeRelatedNotes: boolean) => {
	if (agentMode) {
		return _('Agent mode is on: the assistant can search your vault and create or update notes. Ask it to find something and change another note.');
	}
	if (includeRelatedNotes) {
		return _('Ask about this note or related notes in your vault. Select text in the editor first to scope edits to that selection.');
	}
	return _('Ask about this note, or request changes. Select text in the editor first to scope the request to that selection.');
};

const placeholderHint = (agentMode: boolean, includeRelatedNotes: boolean) => {
	if (agentMode) return _('Ask the agent to search or edit notes…');
	if (includeRelatedNotes) return _('Ask about this note or your vault…');
	return _('Ask about this note, or request a change…');
};

const formatChatError = (error: { message?: string }) => {
	const msg = error?.message || '';
	// cSpell:disable
	if (/channel.?error|jinja|prompt.?template|UndefinedValue|unknown test:\s*sequence|rejected agent tool/i.test(msg)) {
		// cSpell:enable
		return _('This model rejected agent tool calling (LM Studio Channel Error / broken tool template). Switch to a tool-capable model, or disable Agent mode in Settings → AI.');
	}
	if (/network timeout|request timed out|body-timeout|request-timeout/i.test(msg)) {
		return _('The AI request timed out before a reply arrived. Try a shorter ask, or keep create_note bodies concise.');
	}
	return msg || _('Something went wrong.');
};

const agentToolLabel = (id: string) => {
	switch (id) {
	case 'search_notes':
		return _('Search notes');
	case 'semantic_search_notes':
		return _('Semantic search');
	case 'read_note':
		return _('Read note');
	case 'list_notebooks':
		return _('List notebooks');
	case 'list_notes':
		return _('List notes');
	case 'list_tags':
		return _('List tags');
	case 'create_note':
		return _('Create note');
	case 'update_note':
		return _('Update note');
	case 'manage_tags':
		return _('Manage tags');
	case 'create_notebook':
		return _('Create notebook');
	case 'open_note':
		return _('Open note');
	case 'get_active_note':
		return _('Active note');
	case 'get_vault_stats':
		return _('Vault stats');
	case 'get_or_create_daily_note':
		return _('Daily note');
	default:
		return id;
	}
};

const attachmentAcceptExtensions = supportedChatAttachmentExtensions.map(ext => `.${ext}`);

// Single-window for v1: mapStateToProps hard-codes defaultWindowId and the
// toggle writes to the app-wide layout. A second window would mirror the main.
const ChatPanel: React.FC<Props> = (props) => {
	const { dispatch, messages } = props;
	const [input, setInput] = useState('');
	const [sending, setSending] = useState(false);
	const [statusText, setStatusText] = useState('');
	const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
	const [modelMenuOpen, setModelMenuOpen] = useState(false);
	const [threadsMenuOpen, setThreadsMenuOpen] = useState(false);
	const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
	const [threadsLoading, setThreadsLoading] = useState(false);
	const [contextTokens, setContextTokens] = useState(0);
	const [modelOptions, setModelOptions] = useState<string[]>([]);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelCustom, setModelCustom] = useState('');
	const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
	const [disclosureShown, setDisclosureShown] = useState<boolean>(() => {
		try {
			return !!Setting.value(disclosureSetting);
		} catch {
			return false;
		}
	});

	const lastNoteIdRef = useRef<string | null>(props.noteId);
	const messagesLengthRef = useRef(messages.length);
	messagesLengthRef.current = messages.length;
	// Lets async work detect note switches without re-running its closure.
	const noteIdRef = useRef(props.noteId);
	noteIdRef.current = props.noteId;
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const toolsMenuRef = useRef<HTMLDivElement>(null);
	const modelMenuRef = useRef<HTMLDivElement>(null);
	const threadsMenuRef = useRef<HTMLDivElement>(null);
	const transcriptNoteIdRef = useRef<string | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	// Bumped on Reset / Stop / unmount so an in-flight reply can detect it should
	// abort instead of landing in a cleared or destroyed conversation.
	const generationRef = useRef(0);
	useEffect(() => () => {
		generationRef.current++;
		abortControllerRef.current?.abort();
	}, []);

	const windowId = useContext(WindowIdContext);

	const appendMessage = useCallback((message: AiChatMessage) => {
		dispatch({ type: 'AI_CHAT_APPEND', windowId, message });
	}, [dispatch, windowId]);

	// Drop a separator when the active note changes mid-conversation. Skip
	// the first ever opened note (no prior context to separate from).
	useEffect(() => {
		const prev = lastNoteIdRef.current;
		lastNoteIdRef.current = props.noteId;
		if (prev === null || prev === props.noteId || !props.noteId) return;
		if (messagesLengthRef.current === 0) return;
		appendMessage({
			id: makeId(),
			role: 'separator',
			text: _('— now viewing: %s —', props.noteTitle || _('(untitled)')),
		});
	}, [props.noteId, props.noteTitle, appendMessage]);

	useEffect(() => {
		if (messages.length === 0 && !statusText) return;
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, statusText]);

	useEffect(() => {
		if (!toolsMenuOpen && !modelMenuOpen && !threadsMenuOpen) return undefined;
		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (toolsMenuOpen && toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
				setToolsMenuOpen(false);
			}
			if (modelMenuOpen && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
				setModelMenuOpen(false);
			}
			if (threadsMenuOpen && threadsMenuRef.current && !threadsMenuRef.current.contains(target)) {
				setThreadsMenuOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setToolsMenuOpen(false);
				setModelMenuOpen(false);
				setThreadsMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [toolsMenuOpen, modelMenuOpen, threadsMenuOpen]);

	useEffect(() => {
		if (!modelMenuOpen) return undefined;
		let cancelled = false;
		const load = async () => {
			setModelsLoading(true);
			const models = await listChatModels();
			if (cancelled) return;
			const current = (props.chatModel || '').trim();
			const merged = current && !models.includes(current) ? [current, ...models] : models;
			setModelOptions(merged);
			setModelsLoading(false);
		};
		void load();
		return () => { cancelled = true; };
	}, [modelMenuOpen, props.chatModel, props.chatBaseUrl, props.providerType]);

	const conversationTurns = useMemo<ChatTurn[]>(() => {
		return messages
			.filter(m => m.role === 'user' || m.role === 'assistant')
			.map(m => ({
				role: m.role as 'user' | 'assistant',
				content: m.modelContent || m.text,
			}));
	}, [messages]);

	const toolRows = useMemo(() => {
		return agentWorkspaceToolIds.map(id => {
			const explicit = props.enabledTools?.[id];
			return {
				id,
				label: agentToolLabel(id),
				isWrite: agentWriteToolIds.has(id),
				enabled: explicit === undefined ? true : !!explicit,
			};
		});
	}, [props.enabledTools]);

	const enabledToolCount = toolRows.filter(t => t.enabled).length;

	useEffect(() => {
		let cancelled = false;
		const run = async () => {
			let body = '';
			if (props.noteId) {
				try {
					const note = await Note.load(props.noteId);
					body = note?.body || '';
				} catch {
					body = '';
				}
			}
			if (cancelled) return;
			setContextTokens(estimateContextTokens(body, conversationTurns, input));
		};
		void run();
		return () => { cancelled = true; };
	}, [props.noteId, conversationTurns, input]);

	const attachmentsReady = attachments.length > 0 && attachments.every(a => !a.extracting && !!a.extracted && !a.error);
	const canSend = (!!input.trim() || attachmentsReady) && !sending && !attachments.some(a => a.extracting);

	// Joplin Cloud is remote but the user already consented via sync setup.
	const requiresDisclosure = props.providerType !== 'joplin-cloud';
	const showDisclosure = requiresDisclosure && !disclosureShown && messages.length === 0;

	const handleToggleTool = useCallback((id: string, enabled: boolean) => {
		setAgentToolEnabled(id, enabled);
	}, []);

	const handleSelectModel = useCallback((modelId: string) => {
		const next = modelId.trim();
		if (!next) return;
		Setting.setValue('ai.chat.model', next);
		AiService.instance().invalidateProvider();
		setModelMenuOpen(false);
		setModelCustom('');
	}, []);

	const handleSetAgentMode = useCallback((enabled: boolean) => {
		Setting.setValue('ai.chat.agentMode', enabled);
		setModelMenuOpen(false);
	}, []);

	const handleOpenNote = useCallback(async (noteId: string) => {
		if (!noteId) return;
		try {
			await CommandService.instance().execute('openNote', noteId);
		} catch (error) {
			logger.warn('Open note from chat failed:', error);
		}
	}, []);

	const handleOpenThreads = useCallback(async () => {
		setThreadsMenuOpen(open => !open);
		setToolsMenuOpen(false);
		setModelMenuOpen(false);
		setThreadsLoading(true);
		try {
			const list = await listChatTranscriptThreads(40);
			setThreads(list);
		} catch (error) {
			logger.warn('List chat threads failed:', error);
			setThreads([]);
		} finally {
			setThreadsLoading(false);
		}
	}, []);

	const handleLoadThread = useCallback(async (threadId: string) => {
		try {
			const loaded = await loadChatTranscriptThread(threadId);
			transcriptNoteIdRef.current = loaded.id;
			const mapped: AiChatMessage[] = loaded.messages.map(m => ({
				id: makeId(),
				role: m.role,
				text: m.text,
				noteId: m.role === 'tool' ? noteIdFromToolText(m.text) : undefined,
			}));
			dispatch({ type: 'AI_CHAT_SET', windowId, messages: mapped });
			setThreadsMenuOpen(false);
		} catch (error) {
			logger.warn('Load chat thread failed:', error);
			appendMessage({
				id: makeId(),
				role: 'error',
				text: _('Could not load that chat thread.'),
			});
		}
	}, [dispatch, windowId, appendMessage]);

	const ensureTranscriptNote = useCallback(async () => {
		if (transcriptNoteIdRef.current) return transcriptNoteIdRef.current;
		const created = await createChatTranscriptNote();
		transcriptNoteIdRef.current = created.id;
		return created.id;
	}, []);

	const handleRemoveAttachment = useCallback((id: string) => {
		setAttachments(prev => prev.filter(a => a.id !== id));
	}, []);

	const handleAttach = useCallback(async () => {
		if (sending) return;
		const paths = await bridge().showOpenDialog({
			properties: ['openFile', 'multiSelections'],
			filters: [
				{ name: _('Documents'), extensions: [...supportedChatAttachmentExtensions] },
				{ name: _('All files'), extensions: ['*'] },
			],
		});
		if (!paths?.length) return;

		const accepted = paths.filter(p => isSupportedChatAttachmentPath(p));
		const rejected = paths.filter(p => !isSupportedChatAttachmentPath(p));
		if (rejected.length) {
			appendMessage({
				id: makeId(),
				role: 'error',
				text: _('Unsupported file type(s): %s. Supported: %s',
					rejected.map(p => basename(p)).join(', '),
					attachmentAcceptExtensions.join(', ')),
			});
		}
		if (!accepted.length) return;

		const pending: PendingAttachment[] = accepted.map(filePath => ({
			id: makeId(),
			fileName: basename(filePath),
			filePath,
			extracting: true,
		}));
		setAttachments(prev => [...prev, ...pending]);

		for (const item of pending) {
			try {
				const extracted = await extractChatAttachment(item.filePath);
				setAttachments(prev => prev.map(a => (
					a.id === item.id
						? { ...a, extracting: false, extracted }
						: a
				)));
			} catch (error) {
				logger.warn('Attachment extract failed:', error);
				const message = error instanceof Error ? error.message : String(error);
				setAttachments(prev => prev.map(a => (
					a.id === item.id
						? { ...a, extracting: false, error: message }
						: a
				)));
			}
		}
	}, [sending, appendMessage]);

	const handleStop = useCallback(() => {
		abortControllerRef.current?.abort();
		generationRef.current++;
		setSending(false);
		setStatusText('');
		appendMessage({ id: makeId(), role: 'error', text: _('Stopped.') });
		void appendChatTranscriptSafe(transcriptNoteIdRef.current, [{ role: 'error', text: _('Stopped.') }]);
	}, [appendMessage]);

	const handleSend = useCallback(async () => {
		const text = input.trim();
		const readyAttachments = attachments
			.filter(a => a.extracted && !a.error)
			.map(a => a.extracted as ChatAttachmentExtracted);
		if ((!text && !readyAttachments.length) || sending) return;
		if (attachments.some(a => a.extracting)) return;
		if (!props.noteId) {
			appendMessage({ id: makeId(), role: 'error', text: _('Open a note to start chatting.') });
			return;
		}

		const startGeneration = generationRef.current;
		const noteIdAtStart = props.noteId;
		const controller = new AbortController();
		abortControllerRef.current = controller;
		setSending(true);
		setStatusText(props.agentMode ? _('Agent thinking…') : '');
		setInput('');
		setAttachments([]);
		setToolsMenuOpen(false);
		setModelMenuOpen(false);

		const attachmentLine = formatAttachmentDisplayLine(readyAttachments.map(a => a.fileName));
		const displayText = [text, attachmentLine].filter(Boolean).join('\n\n');
		const attachmentBlock = formatAttachmentsForPrompt(readyAttachments);
		const modelText = [text, attachmentBlock].filter(Boolean).join('\n\n');

		// Captured so we can roll it back on failure — otherwise a retry would
		// send the prior user turn as history alongside the new prompt.
		const userTurnId = makeId();
		appendMessage({
			id: userTurnId,
			role: 'user',
			text: displayText || attachmentLine || _('(attachment)'),
			modelContent: modelText,
		});

		let toolActivitySeen = false;
		const toolSummaries: string[] = [];

		try {
			const transcriptId = await ensureTranscriptNote();
			await appendChatTranscriptSafe(transcriptId, [{ role: 'user', text: displayText || modelText }]);

			const note = await Note.load(props.noteId);
			if (!note) throw new Error(`Note not found: ${props.noteId}`);

			let selection = '';
			try {
				selection = await CommandService.instance().execute('selectedText') || '';
			} catch {
				// Editor may not be ready; treat as no selection.
			}

			const reply = await runNoteChat({
				title: note.title || '',
				body: note.body || '',
				selection: selection || null,
				noteId: props.noteId,
			}, conversationTurns, modelText, (event) => {
				if (generationRef.current !== startGeneration) return;
				setStatusText(event.summary);
				if (event.phase === 'end') {
					toolActivitySeen = true;
					toolSummaries.push(event.summary);
					appendMessage({
						id: makeId(),
						role: 'tool',
						text: event.summary,
						isWrite: event.isWrite,
						isError: event.isError,
						noteId: event.noteId || noteIdFromToolText(event.summary) || undefined,
						noteTitle: event.noteTitle,
					});
				}
			}, controller.signal, props.confirmWrites ? async (info) => {
				const ok = bridge().showConfirmMessageBox(
					_('Allow agent to run %s?\n\n%s', info.toolName, info.summary),
					{ title: _('Confirm agent write') },
				);
				return !!ok;
			} : undefined);

			if (generationRef.current !== startGeneration) return;

			let editsApplied = 0;
			let editsMissed = 0;
			if (reply.edits.length > 0) {
				// Editor commands run against the focused editor, which may now
				// be a different note. Refuse rather than mutate the wrong one.
				if (noteIdRef.current !== noteIdAtStart) {
					appendMessage({
						id: makeId(),
						role: 'error',
						text: _('You switched notes while the request was running; edits were not applied. Try again.'),
					});
				} else {
					// Re-read live body: the user may have typed while the
					// request was in flight, and we don't want to overwrite that.
					const fresh = await Note.load(noteIdAtStart);
					const liveBody = fresh?.body ?? '';

					if (liveBody !== (note.body || '')) {
						appendMessage({
							id: makeId(),
							role: 'error',
							text: _('The note changed while the request was running; edits were not applied. Try again.'),
						});
					} else {
						const selectionEdits = reply.edits.filter(e => e.op === 'replaceSelection');
						const anchorEdits = reply.edits.filter(e => e.op !== 'replaceSelection');

						for (const edit of selectionEdits) {
							if (edit.op !== 'replaceSelection') continue;
							if (!selection) {
								editsMissed++;
								continue;
							}
							await CommandService.instance().executeInWindow('replaceSelection', {
								windowId,
								args: [edit.text],
							});
							editsApplied++;
						}

						if (anchorEdits.length > 0) {
							const cursorPos = selection ? Math.max(0, liveBody.indexOf(selection)) : 0;
							const { newBody, appliedEdits } = applyAnchorEdits(liveBody, anchorEdits, cursorPos);
							const missed = appliedEdits.filter(e => e.status !== 'applied').length;
							editsMissed += missed;
							editsApplied += appliedEdits.length - missed;
							if (newBody !== liveBody) {
								await CommandService.instance().executeInWindow('editor.setText', {
									windowId,
									args: [newBody],
								});
							}
						}
					}
				}
			}

			if (generationRef.current !== startGeneration) return;

			const assistantText = reply.reply || _('(no message)');
			appendMessage({
				id: makeId(),
				role: 'assistant',
				text: assistantText,
				editsApplied,
				editsMissed,
				citations: (reply.relatedNotes || []).map(r => ({
					noteId: r.noteId,
					title: r.title || _('(untitled)'),
				})),
			});
			if (reply.warning) {
				appendMessage({ id: makeId(), role: 'error', text: reply.warning });
			}

			const transcriptEntries = [
				...toolSummaries.map(summary => ({ role: 'tool' as const, text: summary })),
				{ role: 'assistant' as const, text: assistantText },
				...(reply.warning ? [{ role: 'error' as const, text: reply.warning }] : []),
			];
			await appendChatTranscriptSafe(transcriptId, transcriptEntries);
		} catch (error) {
			logger.warn('Chat failed:', error);
			if (generationRef.current !== startGeneration) return;
			if (isAiAbortError(error)) {
				// Stop button already cleared busy state / logged "Stopped."
				return;
			}
			// If tools already ran, keep the user turn so the transcript stays
			// coherent with tool rows that were already appended.
			if (!toolActivitySeen) {
				dispatch({ type: 'AI_CHAT_REMOVE', windowId, id: userTurnId });
				setInput(text);
				if (readyAttachments.length) {
					setAttachments(readyAttachments.map(extracted => ({
						id: makeId(),
						fileName: extracted.fileName,
						filePath: '',
						extracting: false,
						extracted,
					})));
				}
			}
			const errText = formatChatError(error);
			appendMessage({ id: makeId(), role: 'error', text: errText });
			await appendChatTranscriptSafe(transcriptNoteIdRef.current, [{ role: 'error', text: errText }]);
		} finally {
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
			if (generationRef.current === startGeneration) {
				setSending(false);
				setStatusText('');
			}
		}
	}, [input, attachments, sending, props.noteId, props.agentMode, props.confirmWrites, conversationTurns, windowId, appendMessage, dispatch, ensureTranscriptNote]);

	const handleAcknowledgeDisclosure = useCallback(() => {
		Setting.setValue(disclosureSetting, true);
		setDisclosureShown(true);
	}, []);

	const handleReset = useCallback(() => {
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		generationRef.current++;
		setSending(false);
		setStatusText('');
		setToolsMenuOpen(false);
		setModelMenuOpen(false);
		setThreadsMenuOpen(false);
		setAttachments([]);
		transcriptNoteIdRef.current = null;
		dispatch({ type: 'AI_CHAT_RESET', windowId: windowId });
	}, [dispatch, windowId]);

	const handleRetryLast = useCallback(() => {
		if (sending) return;
		const lastUser = [...messages].reverse().find(m => m.role === 'user');
		if (!lastUser) return;
		setInput(lastUser.modelContent || lastUser.text);
	}, [sending, messages]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Don't send while an IME composition is in flight — Enter commits
		// the composition for CJK / accented input.
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (canSend) void handleSend();
		}
	}, [handleSend, canSend]);

	if (!props.available) {
		return (
			<div className='chat-panel'>
				<div className='header'>
					<span className='title'>{_('AI Chat')}</span>
				</div>
				<div className='disabled-message'>
					{props.unavailableHint}
				</div>
			</div>
		);
	}

	if (props.noteIsEncrypted) {
		return (
			<div className='chat-panel'>
				<div className='header'>
					<span className='title'>{_('AI Chat')}</span>
				</div>
				<div className='disabled-message'>
					{_('This note is encrypted and cannot be used with AI Chat.')}
				</div>
			</div>
		);
	}

	return (
		<div className='chat-panel'>
			<div className='header'>
				<span className='title'>{_('AI Chat')}</span>
				<div className='header-actions'>
					<div className='threads-toolbar' ref={threadsMenuRef}>
						<button
							type='button'
							className='threads-toggle'
							aria-expanded={threadsMenuOpen}
							aria-haspopup='true'
							onClick={() => { void handleOpenThreads(); }}
							title={_('Past AI chats')}
						>
							{_('Chats')}
						</button>
						{threadsMenuOpen && (
							<div className='threads-menu' role='menu'>
								<div className='threads-menu-title'>{_('Past chats')}</div>
								{threadsLoading ? (
									<div className='threads-menu-hint'>{_('Loading…')}</div>
								) : threads.length ? (
									<ul className='threads-menu-list'>
										{threads.map(t => (
											<li key={t.id}>
												<button
													type='button'
													className={`threads-menu-item ${t.id === transcriptNoteIdRef.current ? '-active' : ''}`}
													onClick={() => { void handleLoadThread(t.id); }}
												>
													{t.title}
												</button>
											</li>
										))}
									</ul>
								) : (
									<div className='threads-menu-hint'>{_('No saved chats yet. Send a message to create one under _AI Chats.')}</div>
								)}
								<button
									type='button'
									className='threads-new'
									onClick={() => {
										handleReset();
										setThreadsMenuOpen(false);
									}}
								>
									{_('New chat')}
								</button>
							</div>
						)}
					</div>
					<div className='model-toolbar' ref={modelMenuRef}>
						<button
							type='button'
							className='model-toggle'
							aria-expanded={modelMenuOpen}
							aria-haspopup='true'
							onClick={() => {
								setModelMenuOpen(open => !open);
								setToolsMenuOpen(false);
								setThreadsMenuOpen(false);
							}}
							title={_('Switch chat model')}
						>
							<span className='model-label'>{_('Model')}</span>
							<span className='model-value'>{props.chatModel || _('(none)')}</span>
						</button>
						{modelMenuOpen && (
							<div className='model-menu' role='menu'>
								<div className='model-menu-title'>{_('Chat model')}</div>
								{modelsLoading ? (
									<div className='model-menu-hint'>{_('Loading models…')}</div>
								) : modelOptions.length > 0 ? (
									<ul className='model-menu-list'>
										{modelOptions.map(id => (
											<li key={id}>
												<button
													type='button'
													className={`model-menu-item ${id === props.chatModel ? '-active' : ''}`}
													onClick={() => handleSelectModel(id)}
												>
													{id}
												</button>
											</li>
										))}
									</ul>
								) : (
									<div className='model-menu-hint'>
										{_('Could not list models from the endpoint. Enter a model id below, or set it in Settings → AI.')}
									</div>
								)}
								<div className='model-preset-row'>
									<button
										type='button'
										className={`model-preset ${!props.agentMode ? '-active' : ''}`}
										onClick={() => handleSetAgentMode(false)}
									>
										{_('Chat')}
									</button>
									<button
										type='button'
										className={`model-preset ${props.agentMode ? '-active' : ''}`}
										onClick={() => handleSetAgentMode(true)}
									>
										{_('Agent')}
									</button>
								</div>
								<div className='model-custom-row'>
									<input
										type='text'
										className='model-custom-input'
										value={modelCustom}
										onChange={(e) => setModelCustom(e.target.value)}
										placeholder={_('Custom model id…')}
										aria-label={_('Custom model id')}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												handleSelectModel(modelCustom);
											}
										}}
									/>
									<button
										type='button'
										className='model-custom-apply'
										onClick={() => handleSelectModel(modelCustom)}
										disabled={!modelCustom.trim()}
									>
										{_('Use')}
									</button>
								</div>
							</div>
						)}
					</div>
					{props.agentMode && (
						<div className='agent-toolbar' ref={toolsMenuRef}>
							<span className='agent-badge' title={_('Agent can search and edit notes')}>{_('Agent')}</span>
							<button
								type='button'
								className='tools-toggle'
								aria-expanded={toolsMenuOpen}
								aria-haspopup='true'
								onClick={() => {
									setToolsMenuOpen(open => !open);
									setModelMenuOpen(false);
								}}
								title={_('Choose which tools the agent may use')}
							>
								{_('Tools')}
								<span className='tools-count'>{enabledToolCount}/{toolRows.length}</span>
							</button>
							{toolsMenuOpen && (
								<div className='tools-menu' role='menu'>
									<div className='tools-menu-title'>{_('Available tools')}</div>
									{toolRows.map(tool => (
										<label key={tool.id} className={`tools-menu-row ${tool.isWrite ? '-write' : ''}`}>
											<input
												type='checkbox'
												checked={tool.enabled}
												onChange={(e) => handleToggleTool(tool.id, e.target.checked)}
											/>
											<span className='tools-menu-label'>
												{tool.label}
												{tool.isWrite ? (
													<span className='tools-write-tag'>{_('write')}</span>
												) : null}
											</span>
										</label>
									))}
									<div className='tools-menu-hint'>
										{_('Writes can create or change notes across your vault. Turn a tool off to hide it from the model.')}
									</div>
								</div>
							)}
						</div>
					)}
					{messages.length > 0 && (
						<button type='button' className='reset' onClick={handleReset}>{_('Reset')}</button>
					)}
				</div>
			</div>
			<div className='messages'>
				{messages.length === 0 && (
					<div className='empty'>
						<div className='empty-hint'>{emptyHint(props.agentMode, props.includeRelatedNotes)}</div>
						<div className='suggested-prompts' aria-label={_('Suggested prompts')}>
							{suggestedPrompts(props.agentMode).map(prompt => (
								<button
									key={prompt}
									type='button'
									className='suggested-prompt'
									onClick={() => setInput(prompt)}
								>
									{prompt}
								</button>
							))}
						</div>
					</div>
				)}
				{messages.map(m => {
					if (m.role === 'separator') {
						return <div key={m.id} className='separator'>{m.text}</div>;
					}
					if (m.role === 'error') {
						return <div key={m.id} className='error'>{m.text}</div>;
					}
					if (m.role === 'tool') {
						const className = [
							'tool-activity',
							m.isWrite ? '-write' : '',
							m.isError ? '-error' : '',
							m.noteId ? '-clickable' : '',
						].filter(Boolean).join(' ');
						const noteId = m.noteId || noteIdFromToolText(m.text);
						if (noteId) {
							return (
								<button
									key={m.id}
									type='button'
									className={className}
									onClick={() => { void handleOpenNote(noteId); }}
									title={_('Open note')}
								>
									{m.text}
								</button>
							);
						}
						return <div key={m.id} className={className}>{m.text}</div>;
					}
					const summary = m.role === 'assistant' ? editsSummary(m.editsApplied ?? 0, m.editsMissed ?? 0) : '';
					return (
						<div key={m.id} className={`turn -${m.role}`}>
							<div className='content'>{m.text}</div>
							{summary && (
								<div className='meta'>
									{(m.editsMissed ?? 0) > 0
										? <span className='warning'>{summary}</span>
										: <span>{summary}</span>}
								</div>
							)}
							{m.role === 'assistant' && m.citations && m.citations.length > 0 && (
								<div className='citation-chips' aria-label={_('Sources')}>
									{m.citations.map(c => (
										<button
											key={`${m.id}-${c.noteId}`}
											type='button'
											className='citation-chip'
											onClick={() => { void handleOpenNote(c.noteId); }}
											title={c.title}
										>
											{c.title}
										</button>
									))}
								</div>
							)}
							{m.role === 'user' && !sending && [...messages].reverse().find(x => x.role === 'user')?.id === m.id && (
								<button
									type='button'
									className='retry'
									onClick={handleRetryLast}
									title={_('Edit and retry')}
								>
									{_('Retry')}
								</button>
							)}
						</div>
					);
				})}
				{statusText && (
					<div className='tool-activity -pending'>{statusText}</div>
				)}
				<div ref={messagesEndRef} />
			</div>
			<div className='composer'>
				<div className='composer-meta'>
					<span className='context-meter' title={_('Rough prompt size estimate')}>
						{_('~%d tokens', contextTokens)}
					</span>
					{props.agentMode && props.confirmWrites && (
						<span className='confirm-writes-hint'>{_('Writes require confirm')}</span>
					)}
				</div>
				{showDisclosure && (
					<div className='disclosure'>
						{_('Your note will be sent to the configured AI provider (%s).', props.providerType)}
						{' '}
						<a href='#' onClick={(e) => { e.preventDefault(); handleAcknowledgeDisclosure(); }}>{_('Don\'t show again')}</a>
					</div>
				)}
				{attachments.length > 0 && (
					<div className='attachment-chips' aria-label={_('Attachments')}>
						{attachments.map(a => (
							<span
								key={a.id}
								className={`attachment-chip ${a.error ? '-error' : ''} ${a.extracting ? '-pending' : ''}`}
								title={a.error || a.filePath}
							>
								<span className='attachment-chip-name'>
									{a.extracting ? _('Reading %s…', a.fileName) : a.fileName}
								</span>
								<button
									type='button'
									className='attachment-chip-remove'
									onClick={() => handleRemoveAttachment(a.id)}
									aria-label={_('Remove %s', a.fileName)}
									disabled={sending}
								>
									×
								</button>
							</span>
						))}
					</div>
				)}
				<div className='input-wrapper'>
					<button
						type='button'
						className='attach'
						onClick={() => { void handleAttach(); }}
						disabled={sending}
						aria-label={_('Attach document')}
						title={_('Attach document (pdf, txt, md, csv)')}
					>
						<i className='fas fa-paperclip' aria-hidden='true' />
					</button>
					<textarea
						className='input'
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholderHint(props.agentMode, props.includeRelatedNotes)}
						aria-label={_('Chat message')}
					/>
					{sending ? (
						<button
							type='button'
							className='stop'
							onClick={handleStop}
							aria-label={_('Stop')}
							title={_('Stop')}
						>
							<i className='fas fa-stop' aria-hidden='true' />
						</button>
					) : (
						<button
							type='button'
							className='send'
							onClick={() => { void handleSend(); }}
							disabled={!canSend}
							aria-label={_('Send')}
							title={_('Send')}
						>
							<i className='fas fa-paper-plane' aria-hidden='true' />
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

interface OwnProps {
	windowId: string;
}

const mapStateToProps = (state: AppState, ownProps: OwnProps) => {
	const windowState = stateUtils.windowStateById(state, ownProps.windowId);
	const noteId = stateUtils.selectedNoteId(windowState);
	const note = noteId ? windowState.notes.find(n => n.id === noteId) : null;
	const availability = chatAvailability();
	return {
		themeId: state.settings.theme,
		available: availability.available,
		unavailableHint: availability.hint ?? '',
		providerType: state.settings['ai.chat.providerType'] || 'openai-compatible',
		chatModel: state.settings['ai.chat.model'] || '',
		chatBaseUrl: state.settings['ai.chat.baseUrl'] || '',
		noteId,
		noteTitle: note?.title || '',
		noteIsEncrypted: !!note?.encryption_applied,
		messages: windowState.aiChatMessages || [],
		agentMode: !!state.settings['ai.chat.agentMode'],
		includeRelatedNotes: !!state.settings['ai.chat.includeRelatedNotes'],
		confirmWrites: !!state.settings['ai.chat.confirmWrites'],
		enabledTools: (state.settings['ai.chat.enabledTools'] || {}) as Record<string, boolean>,
	};
};

export default connect(mapStateToProps)(ChatPanel);
