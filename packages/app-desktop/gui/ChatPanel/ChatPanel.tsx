import * as React from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Dispatch } from 'redux';
import { _ } from '@joplin/lib/locale';
import Setting from '@joplin/lib/models/Setting';
import Note from '@joplin/lib/models/Note';
import CommandService from '@joplin/lib/services/CommandService';
import Logger from '@joplin/utils/Logger';
import { stateUtils } from '@joplin/lib/reducer';
import { AiChatMessage, AppState } from '../../app.reducer';
import { runNoteChat, ChatTurn } from '@joplin/lib/services/ai/noteChat';
import { applyAnchorEdits } from '@joplin/lib/services/ai/applyNoteEdits';
import { chatAvailability } from '@joplin/lib/services/ai/availability';
import {
	agentWorkspaceToolIds,
	agentWriteToolIds,
	setAgentToolEnabled,
} from '@joplin/lib/services/mcp/registry';
import { WindowIdContext } from '../NewWindowOrIFrame';

const logger = Logger.create('ChatPanel');

interface Props {
	themeId: number;
	available: boolean;
	unavailableHint: string;
	providerType: string;
	noteId: string | null;
	noteTitle: string;
	noteIsEncrypted: boolean;
	messages: AiChatMessage[];
	agentMode: boolean;
	includeRelatedNotes: boolean;
	enabledTools: Record<string, boolean>;
	dispatch: Dispatch;
}

const disclosureSetting = 'ai.chat.disclosureAcknowledged';

let nextMessageId = 0;
const makeId = () => `m-${Date.now()}-${++nextMessageId}`;

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
	case 'list_tags':
		return _('List tags');
	case 'create_note':
		return _('Create note');
	case 'update_note':
		return _('Update note');
	default:
		return id;
	}
};

// Single-window for v1: mapStateToProps hard-codes defaultWindowId and the
// toggle writes to the app-wide layout. A second window would mirror the main.
const ChatPanel: React.FC<Props> = (props) => {
	const { dispatch, messages } = props;
	const [input, setInput] = useState('');
	const [sending, setSending] = useState(false);
	const [statusText, setStatusText] = useState('');
	const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
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

	// Bumped on Reset / unmount so an in-flight reply can detect it should
	// abort instead of landing in a cleared or destroyed conversation.
	const generationRef = useRef(0);
	useEffect(() => () => { generationRef.current++; }, []);

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
		if (!toolsMenuOpen) return undefined;
		const onPointerDown = (event: MouseEvent) => {
			if (!toolsMenuRef.current?.contains(event.target as Node)) {
				setToolsMenuOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setToolsMenuOpen(false);
		};
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [toolsMenuOpen]);

	const conversationTurns = useMemo<ChatTurn[]>(() => {
		return messages
			.filter(m => m.role === 'user' || m.role === 'assistant')
			.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));
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

	// Joplin Cloud is remote but the user already consented via sync setup.
	const requiresDisclosure = props.providerType !== 'joplin-cloud';
	const showDisclosure = requiresDisclosure && !disclosureShown && messages.length === 0;

	const handleToggleTool = useCallback((id: string, enabled: boolean) => {
		setAgentToolEnabled(id, enabled);
	}, []);

	const handleSend = useCallback(async () => {
		const text = input.trim();
		if (!text || sending) return;
		if (!props.noteId) {
			appendMessage({ id: makeId(), role: 'error', text: _('Open a note to start chatting.') });
			return;
		}

		const startGeneration = generationRef.current;
		const noteIdAtStart = props.noteId;
		setSending(true);
		setStatusText(props.agentMode ? _('Agent thinking…') : '');
		setInput('');
		setToolsMenuOpen(false);

		// Captured so we can roll it back on failure — otherwise a retry would
		// send the prior user turn as history alongside the new prompt.
		const userTurnId = makeId();
		appendMessage({ id: userTurnId, role: 'user', text });

		let toolActivitySeen = false;

		try {
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
			}, conversationTurns, text, (event) => {
				if (generationRef.current !== startGeneration) return;
				setStatusText(event.summary);
				if (event.phase === 'end') {
					toolActivitySeen = true;
					appendMessage({
						id: makeId(),
						role: 'tool',
						text: event.summary,
						isWrite: event.isWrite,
						isError: event.isError,
					});
				}
			});

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

			appendMessage({
				id: makeId(),
				role: 'assistant',
				text: reply.reply || _('(no message)'),
				editsApplied,
				editsMissed,
			});
		} catch (error) {
			logger.warn('Chat failed:', error);
			if (generationRef.current !== startGeneration) return;
			// If tools already ran, keep the user turn so the transcript stays
			// coherent with tool rows that were already appended.
			if (!toolActivitySeen) {
				dispatch({ type: 'AI_CHAT_REMOVE', windowId, id: userTurnId });
				setInput(text);
			}
			appendMessage({ id: makeId(), role: 'error', text: formatChatError(error) });
		} finally {
			setSending(false);
			setStatusText('');
		}
	}, [input, sending, props.noteId, props.agentMode, conversationTurns, windowId, appendMessage, dispatch]);

	const handleAcknowledgeDisclosure = useCallback(() => {
		Setting.setValue(disclosureSetting, true);
		setDisclosureShown(true);
	}, []);

	const handleReset = useCallback(() => {
		generationRef.current++;
		setStatusText('');
		setToolsMenuOpen(false);
		dispatch({ type: 'AI_CHAT_RESET', windowId: windowId });
	}, [dispatch, windowId]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Don't send while an IME composition is in flight — Enter commits
		// the composition for CJK / accented input.
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			if (!sending) void handleSend();
		}
	}, [handleSend, sending]);

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
				{props.agentMode && (
					<div className='agent-toolbar' ref={toolsMenuRef}>
						<span className='agent-badge' title={_('Agent can search and edit notes')}>{_('Agent')}</span>
						<button
							type='button'
							className='tools-toggle'
							aria-expanded={toolsMenuOpen}
							aria-haspopup='true'
							onClick={() => setToolsMenuOpen(open => !open)}
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
			<div className='messages'>
				{messages.length === 0 && (
					<div className='empty'>
						{emptyHint(props.agentMode, props.includeRelatedNotes)}
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
						].filter(Boolean).join(' ');
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
						</div>
					);
				})}
				{statusText && (
					<div className='tool-activity -pending'>{statusText}</div>
				)}
				<div ref={messagesEndRef} />
			</div>
			<div className='composer'>
				{showDisclosure && (
					<div className='disclosure'>
						{_('Your note will be sent to the configured AI provider (%s).', props.providerType)}
						{' '}
						<a href='#' onClick={(e) => { e.preventDefault(); handleAcknowledgeDisclosure(); }}>{_('Don\'t show again')}</a>
					</div>
				)}
				<div className='input-wrapper'>
					<textarea
						className='input'
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholderHint(props.agentMode, props.includeRelatedNotes)}
						aria-label={_('Chat message')}
					/>
					<button
						type='button'
						className='send'
						onClick={() => { void handleSend(); }}
						disabled={sending || !input.trim()}
						aria-label={sending ? _('Sending') : _('Send')}
						title={sending ? _('Sending…') : _('Send')}
					>
						<i className={sending ? 'fas fa-spinner' : 'fas fa-paper-plane'} aria-hidden='true' />
					</button>
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
		noteId,
		noteTitle: note?.title || '',
		noteIsEncrypted: !!note?.encryption_applied,
		messages: windowState.aiChatMessages || [],
		agentMode: !!state.settings['ai.chat.agentMode'],
		includeRelatedNotes: !!state.settings['ai.chat.includeRelatedNotes'],
		enabledTools: (state.settings['ai.chat.enabledTools'] || {}) as Record<string, boolean>,
	};
};

export default connect(mapStateToProps)(ChatPanel);
