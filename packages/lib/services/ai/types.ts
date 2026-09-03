export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallRequest {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	// Original JSON string from the provider — kept so we can round-trip
	// tool_calls back in follow-up messages without re-serialising.
	rawArguments?: string;
}

export interface ChatMessage {
	role: ChatRole;
	content: string;
	toolCalls?: ToolCallRequest[];
	toolCallId?: string;
}

export interface ResponseFormat {
	type: 'json_schema';
	json_schema: {
		name: string;
		strict: boolean;
		schema: unknown;
	};
}

// OpenAI-compatible function-tool shape. MCP tools map onto this via
// name/description/parameters ← id/description/inputSchema.
export interface ChatToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface ChatOptions {
	temperature?: number;
	responseFormat?: ResponseFormat;
	maxTokens?: number;
	tools?: ChatToolDefinition[];
}

export interface ChatUsage {
	inputTokens: number;
	outputTokens: number;
}

export type ChatStopReason = 'stop' | 'tool_use' | 'length';

export interface ChatResult {
	text: string;
	usage: ChatUsage;
	stopReason?: ChatStopReason;
	toolCalls?: ToolCallRequest[];
	// Set when the provider had to strip `tools` and retry (e.g. LM Studio
	// Channel Error / broken prompt template for function calling).
	toolsDropped?: boolean;
}

export type ProviderClassification = 'local' | 'remote';

export type ProviderType = 'joplin-cloud' | 'openai-compatible' | 'anthropic';

export interface ChatProvider {
	id: string;
	classification: ProviderClassification;
	chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}

// Produces embedding vectors for text.
// - modelId is stored per chunk; a change triggers a full re-index.
// - dimension is fixed at first vec-table creation.
export type ProviderModelDownloadStatus = 'not-started' | 'downloading' | 'downloaded';

export type ModelDownloadStatus = ProviderModelDownloadStatus | 'unavailable';
export type IndexerState = 'idle' | 'running' | 'ai-disabled' | 'index-disabled' | 'vector-search-unavailable';
export interface IndexStatus {
	modelDownloadStatus: ModelDownloadStatus;
	indexerState: IndexerState;
	notesIndexed: number;
	totalNotes: number;
}

export interface EmbeddingProvider {
	id: string;
	modelId: string;
	dimension: number;
	classification: ProviderClassification;
	embed(texts: string[]): Promise<number[][]>;
	// Asymmetric providers (e5) get better retrieval with a query-side
	// encoding. Symmetric providers omit it and callers fall back to embed().
	embedQuery?(texts: string[]): Promise<number[][]>;
	// Providers without a downloadable artefact omit this; the reporter
	// treats them as always-ready.
	modelDownloadStatus?(): Promise<ProviderModelDownloadStatus>;
}
