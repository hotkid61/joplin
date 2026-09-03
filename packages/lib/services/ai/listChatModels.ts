import Setting from '../../models/Setting';
import shim from '../../shim';
import { rtrimSlashes } from '@joplin/utils/path';
import Logger from '@joplin/utils/Logger';

const logger = Logger.create('listChatModels');

interface ModelsResponse {
	data?: { id?: string }[];
}

export interface ListChatModelsResult {
	models: string[];
	error?: string;
}

// Keep short — model listing must never sit behind a hung chat completion.
const modelsTimeoutMs = 1000 * 5;

// OpenAI-compatible servers expect …/v1/models. Users sometimes save the host
// without the /v1 suffix; chat then fails later, so normalize here too.
const openaiCompatibleBaseUrl = (raw: string) => {
	let baseUrl = rtrimSlashes(raw || '');
	if (!baseUrl) return '';
	if (!/\/v\d+$/i.test(baseUrl)) baseUrl = `${baseUrl}/v1`;
	return baseUrl;
};

// Fetch model ids from an OpenAI-compatible GET /models endpoint (LM Studio,
// Ollama, etc.). Uses an independent HTTP connection + short timeout so it
// never queues behind an in-flight agent/chat completion (shared maxSockets:1).
export const listChatModels = async (signal?: AbortSignal): Promise<ListChatModelsResult> => {
	const providerType = Setting.value('ai.chat.providerType');
	if (providerType !== 'openai-compatible') {
		return { models: [], error: 'Model listing is only available for OpenAI-compatible providers.' };
	}

	const baseUrl = openaiCompatibleBaseUrl(Setting.value('ai.chat.baseUrl') || '');
	if (!baseUrl) {
		return { models: [], error: 'No base URL configured. Set it in Settings → AI, or enter a model id below.' };
	}

	if (signal?.aborted) {
		return { models: [], error: 'Model listing was cancelled.' };
	}

	const headers: Record<string, string> = { Accept: 'application/json' };
	const apiKey = Setting.value('ai.chat.apiKey') || '';
	if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

	const url = `${baseUrl}/models`;
	// Own controller so chat Stop/AbortController never leaves this pending.
	const localController = new AbortController();
	const onParentAbort = () => localController.abort();
	signal?.addEventListener('abort', onParentAbort);
	const timer = setTimeout(() => localController.abort(), modelsTimeoutMs);

	try {
		const response = await shim.fetch(url, {
			method: 'GET',
			headers,
			timeout: modelsTimeoutMs,
			maxRetry: 0,
			independentConnection: true,
			signal: localController.signal,
		});
		const text = await response.text();
		if (response.status >= 400) {
			const message = `GET /models returned ${response.status}: ${text.slice(0, 200)}`;
			logger.warn(message);
			return { models: [], error: message };
		}
		let json: ModelsResponse;
		try {
			json = JSON.parse(text) as ModelsResponse;
		} catch {
			logger.warn('GET /models returned non-JSON');
			return { models: [], error: 'The models endpoint returned a non-JSON response.' };
		}
		const ids = (json.data || [])
			.map(m => (typeof m.id === 'string' ? m.id.trim() : ''))
			.filter(Boolean);
		const models = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
		if (!models.length) {
			return { models: [], error: 'No models were returned by the endpoint.' };
		}
		return { models };
	} catch (error) {
		if (localController.signal.aborted) {
			const message = signal?.aborted
				? 'Model listing was cancelled.'
				: `GET /models timed out after ${modelsTimeoutMs}ms`;
			logger.warn(message);
			return { models: [], error: message };
		}
		const message = error instanceof Error ? error.message : String(error);
		logger.warn('Failed to list chat models:', error);
		return { models: [], error: message || 'Failed to list models.' };
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onParentAbort);
	}
};

export default listChatModels;
