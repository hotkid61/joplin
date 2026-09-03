import Setting from '../../models/Setting';
import { McpTool } from './types';

import searchNotes from './tools/searchNotes';
import semanticSearchNotes from './tools/semanticSearchNotes';
import readNote from './tools/readNote';
import listNotebooks from './tools/listNotebooks';
import listNotes from './tools/listNotes';
import listTags from './tools/listTags';
import createNote from './tools/createNote';
import updateNote from './tools/updateNote';
import deleteNote from './tools/deleteNote';
import manageTags from './tools/manageTags';
import createNotebook from './tools/createNotebook';
import openNote from './tools/openNote';
import getActiveNote from './tools/getActiveNote';
import getVaultStats from './tools/getVaultStats';
import getOrCreateDailyNote from './tools/getOrCreateDailyNote';

// Every tool registered here gets an `mcp.tool.<id>.enabled` setting (see
// builtInMetadata.ts). Adding a tool to this list without also adding the
// setting means it will be reported as enabled by default — keep them in sync.
const allMcpTools: McpTool[] = [
	searchNotes,
	semanticSearchNotes,
	readNote,
	listNotebooks,
	listNotes,
	listTags,
	createNote,
	updateNote,
	deleteNote,
	manageTags,
	createNotebook,
	openNote,
	getActiveNote,
	getVaultStats,
	getOrCreateDailyNote,
];

export const allTools = () => allMcpTools;

export const enabledTools = () => {
	return allMcpTools.filter(t => Setting.value(`mcp.tool.${t.id}.enabled`) as boolean);
};

export const findTool = (id: string) => {
	const t = allMcpTools.find(t => t.id === id);
	if (!t) return null;
	if (!(Setting.value(`mcp.tool.${t.id}.enabled`) as boolean)) return null;
	return t;
};

// In-app AI Chat agent allowlist. Same handlers as MCP, but independent of
// `mcp.enabled` / per-tool MCP toggles — agent mode has its own setting.
// delete_note is intentionally excluded.
export const agentWorkspaceToolIds = [
	'search_notes',
	'semantic_search_notes',
	'read_note',
	'list_notebooks',
	'list_notes',
	'list_tags',
	'create_note',
	'update_note',
	'manage_tags',
	'create_notebook',
	'open_note',
	'get_active_note',
	'get_vault_stats',
	'get_or_create_daily_note',
] as const;

export const agentWriteToolIds = new Set([
	'create_note',
	'update_note',
	'manage_tags',
	'create_notebook',
	'get_or_create_daily_note',
]);

// Per-tool on/off for in-app agent mode (`ai.chat.enabledTools`). Missing keys
// default to enabled so existing installs keep all agent tools after upgrade.
export const isAgentToolEnabled = (id: string) => {
	const map = Setting.value('ai.chat.enabledTools') as Record<string, boolean> | null;
	if (!map || typeof map !== 'object') return true;
	if (!(id in map)) return true;
	return !!map[id];
};

export const setAgentToolEnabled = (id: string, enabled: boolean) => {
	if (!(agentWorkspaceToolIds as readonly string[]).includes(id)) return;
	Setting.setObjectValue('ai.chat.enabledTools', id, enabled);
};

export const agentWorkspaceTools = () => {
	const allowed = new Set<string>(agentWorkspaceToolIds);
	return allMcpTools.filter(t => allowed.has(t.id) && isAgentToolEnabled(t.id));
};

export const findAgentTool = (id: string) => {
	return agentWorkspaceTools().find(t => t.id === id) ?? null;
};
