import shim from '../../../shim';
import JoplinError from '../../../JoplinError';
import Logger from '@joplin/utils/Logger';
import { rtrimSlashes } from '@joplin/utils/path';
import { ChatMessage, ChatOptions, ChatResult, ChatStopReason, ProviderClassification, ToolCallRequest } from '../types';
import ChatProviderBase from './ChatProviderBase';

const logger = Logger.create('OpenAiCompatibleProvider');

interface OpenAiUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
}

interface OpenAiToolCall {
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
}

interface OpenAiChoice {
	message?: {
		content?: string | null;
		tool_calls?: OpenAiToolCall[];
	};
	finish_reason?: string;
}

interface OpenAiResponse {
	choices?: OpenAiChoice[];
	usage?: OpenAiUsage;
	error?: { message?: string };
}

interface Options {
	baseUrl: string;
	apiKey: string;
	model: string;
	classification: ProviderClassification;
}

const parseToolArguments = (raw: string | undefined): { args: Record<string, unknown>; rawArguments: string } => {
	const rawArguments = raw ?? '{}';
	try {
		const parsed = JSON.parse(rawArguments);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return { args: parsed as Record<string, unknown>, rawArguments };
		}
	} catch {
		// Models occasionally emit non-JSON; surface empty args and keep the raw string.
	}
	return { args: {}, rawArguments };
};

const toOpenAiMessages = (messages: ChatMessage[]) => {
	return messages.map(m => {
		if (m.role === 'tool') {
			return {
				role: 'tool',
				tool_call_id: m.toolCallId,
				content: m.content,
			};
		}
		if (m.role === 'assistant' && m.toolCalls?.length) {
			return {
				role: 'assistant',
				content: m.content || null,
				tool_calls: m.toolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: {
						name: tc.name,
						arguments: tc.rawArguments ?? JSON.stringify(tc.arguments ?? {}),
					},
				})),
			};
		}
		return { role: m.role, content: m.content };
	});
};

const parseToolCalls = (raw: OpenAiToolCall[] | undefined): ToolCallRequest[] => {
	if (!raw?.length) return [];
	const out: ToolCallRequest[] = [];
	for (let i = 0; i < raw.length; i++) {
		const item = raw[i];
		const name = item.function?.name;
		if (!name) continue;
		const { args, rawArguments } = parseToolArguments(item.function?.arguments);
		out.push({
			id: item.id || `call_${i}`,
			name,
			arguments: args,
			rawArguments,
		});
	}
	return out;
};

const stopReasonFromFinish = (finishReason: string | undefined, hasToolCalls: boolean): ChatStopReason => {
	if (hasToolCalls || finishReason === 'tool_calls' || finishReason === 'tool_use') return 'tool_use';
	if (finishReason === 'length') return 'length';
	return 'stop';
};

export default class OpenAiCompatibleProvider extends ChatProviderBase {

	public id = 'openai-compatible';
	public classification: ProviderClassification;
	private baseUrl_: string;
	private apiKey_: string;
	private model_: string;

	public constructor(options: Options) {
		super();
		this.baseUrl_ = rtrimSlashes(options.baseUrl);
		this.apiKey_ = options.apiKey;
		this.model_ = options.model;
		this.classification = options.classification;
	}

	protected async doChat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
		if (!this.baseUrl_) throw new JoplinError('OpenAI-compatible provider has no base URL configured', 'aiProviderNotConfigured');
		if (!this.model_) throw new JoplinError('OpenAI-compatible provider has no model configured', 'aiProviderNotConfigured');

		const body: Record<string, unknown> = {
			model: this.model_,
			messages: toOpenAiMessages(messages),
			stream: false,
		};
		if (options?.temperature !== undefined) body.temperature = options.temperature;
		if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
		if (options?.responseFormat !== undefined) body.response_format = options.responseFormat;
		if (options?.tools?.length) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			}));
		}

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.apiKey_) headers['Authorization'] = `Bearer ${this.apiKey_}`;

		const doFetch = async () => {
			const response = await shim.fetch(`${this.baseUrl_}/chat/completions`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});
			const text = await response.text();
			let json: OpenAiResponse;
			try {
				json = JSON.parse(text) as OpenAiResponse;
			} catch {
				throw new JoplinError(`AI provider returned non-JSON response: ${text.slice(0, 200)}`, response.status);
			}
			return { response, json };
		};

		let { response, json } = await doFetch();

		// Newer OpenAI models (o1/o3/gpt-5/...) reject `max_tokens` and require
		// `max_completion_tokens`. Older models and many OpenAI-compatible
		// servers only know `max_tokens`. Retry once with the new name when the
		// server tells us so.
		const errorMessage = () => json?.error?.message ?? '';
		if (response.status === 400 && 'max_tokens' in body && /max_completion_tokens/i.test(errorMessage())) {
			body.max_completion_tokens = body.max_tokens;
			delete body.max_tokens;
			({ response, json } = await doFetch());
		}

		// Older OpenAI models might reject `response_format` json_schema (see https://stackoverflow.com/q/79039544).
		// For compatibility, retry without response_format on failure:
		if (response.status === 400 && 'response_format' in body && /json_schema|response_format/i.test(errorMessage())) {
			logger.warn(`Model ${this.model_} rejected response_format; retrying without structured output schema.`);
			delete body.response_format;
			({ response, json } = await doFetch());
		}

		// Some local models reject tools entirely — fall back to a tools-free
		// call so agent mode degrades to plain chat rather than hard-failing.
		if (response.status === 400 && 'tools' in body && /tool|function.?call/i.test(errorMessage())) {
			logger.warn(`Model ${this.model_} rejected tools; retrying without tool calling.`);
			delete body.tools;
			({ response, json } = await doFetch());
		}

		if (response.status >= 400) {
			const detail = json?.error?.message ? `: ${json.error.message}` : '';
			throw new JoplinError(`AI provider returned ${response.status}${detail}`, response.status);
		}

		// A 2xx response with no `choices` array usually means the endpoint URL
		// is wrong (e.g. user forgot the `/v1` suffix on a local server) — many
		// such servers reply 200 with an empty body rather than 404. Surface
		// this rather than returning an empty string the caller can't diagnose.
		if (!Array.isArray(json.choices)) {
			throw new JoplinError(
				`AI provider returned an unexpected response shape. The base URL is likely wrong — for OpenAI, Ollama, and LM Studio the URL must end with "/v1" (got ${this.baseUrl_}).`,
				'aiProviderBadResponse',
			);
		}

		const choice = json.choices[0];
		const message = choice?.message;
		const content = message?.content ?? '';
		const toolCalls = parseToolCalls(message?.tool_calls);
		// Some "OpenAI-compatible" providers (notably older Ollama versions)
		// omit `usage` entirely. Default to zeros rather than throw.
		const inputTokens = json.usage?.prompt_tokens ?? 0;
		const outputTokens = json.usage?.completion_tokens ?? 0;

		return {
			text: typeof content === 'string' ? content : '',
			usage: { inputTokens, outputTokens },
			stopReason: stopReasonFromFinish(choice?.finish_reason, toolCalls.length > 0),
			toolCalls: toolCalls.length ? toolCalls : undefined,
		};
	}
}
