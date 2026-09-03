import Setting from '../../models/Setting';
import shim from '../../shim';
import { rtrimSlashes } from '@joplin/utils/path';
import Logger from '@joplin/utils/Logger';

const logger = Logger.create('listChatModels');

interface ModelsResponse {
	data?: { id?: string }[];
}

// Fetch model ids from an OpenAI-compatible GET /models endpoint (LM Studio,
// Ollama, etc.). Returns [] when the provider is not openai-compatible or the
// request fails — callers should fall back to the configured ai.chat.model.
export const listChatModels = async (): Promise<string[]> => {
	const providerType = Setting.value('ai.chat.providerType');
	if (providerType !== 'openai-compatible') return [];

	const baseUrl = rtrimSlashes(Setting.value('ai.chat.baseUrl') || '');
	if (!baseUrl) return [];

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const apiKey = Setting.value('ai.chat.apiKey') || '';
	if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

	try {
		const response = await shim.fetch(`${baseUrl}/models`, {
			method: 'GET',
			headers,
			timeout: 1000 * 8,
			maxRetry: 0,
		});
		const text = await response.text();
		if (response.status >= 400) {
			logger.warn(`GET /models returned ${response.status}: ${text.slice(0, 200)}`);
			return [];
		}
		let json: ModelsResponse;
		try {
			json = JSON.parse(text) as ModelsResponse;
		} catch {
			logger.warn('GET /models returned non-JSON');
			return [];
		}
		const ids = (json.data || [])
			.map(m => (typeof m.id === 'string' ? m.id.trim() : ''))
			.filter(Boolean);
		return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
	} catch (error) {
		logger.warn('Failed to list chat models:', error);
		return [];
	}
};

export default listChatModels;
