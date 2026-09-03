import shim from '../../../shim';
import OpenAiCompatibleProvider from './OpenAiCompatible';

describe('OpenAiCompatibleProvider', () => {

	let originalFetch: typeof shim.fetch;

	beforeEach(() => {
		originalFetch = shim.fetch;
	});

	afterEach(() => {
		shim.fetch = originalFetch;
	});

	const provider = () => new OpenAiCompatibleProvider({
		baseUrl: 'http://127.0.0.1:1234/v1',
		apiKey: '',
		model: 'local-test-model',
		classification: 'local',
	});

	const jsonResponse = (status: number, body: unknown) => ({
		status,
		text: async () => JSON.stringify(body),
	});

	test('retries without tools when LM Studio returns a string prompt-template/channel error', async () => {
		const bodies: unknown[] = [];
		let calls = 0;
		shim.fetch = (async (_url: string, options: { body?: string }) => {
			calls++;
			bodies.push(JSON.parse(options.body || '{}'));
			if (calls === 1) {
				return jsonResponse(400, {
					error: 'Error rendering prompt with template: "Cannot call something that is not a function: got UndefinedValue".\n\nChannel Error',
				});
			}
			return jsonResponse(200, {
				choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			});
		}) as unknown as typeof shim.fetch;

		const result = await provider().chat(
			[{ role: 'user', content: 'Say hi' }],
			{ tools: [{ name: 'search_notes', description: 'Search', parameters: { type: 'object' } }] },
		);

		expect(calls).toBe(2);
		expect((bodies[0] as { tools?: unknown }).tools).toBeTruthy();
		expect((bodies[1] as { tools?: unknown }).tools).toBeUndefined();
		expect(result.text).toBe('Hi');
		expect(result.toolsDropped).toBe(true);
	});

	test('retries without tools on a bare Channel Error string', async () => {
		let calls = 0;
		shim.fetch = (async () => {
			calls++;
			if (calls === 1) {
				return jsonResponse(400, { error: 'Channel Error' });
			}
			return jsonResponse(200, {
				choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			});
		}) as unknown as typeof shim.fetch;

		const result = await provider().chat(
			[{ role: 'user', content: 'hi' }],
			{ tools: [{ name: 'search_notes', description: 'Search', parameters: { type: 'object' } }] },
		);
		expect(calls).toBe(2);
		expect(result.text).toBe('OK');
		expect(result.toolsDropped).toBe(true);
	});

	test('surfaces LM Studio string errors when retry is not applicable', async () => {
		shim.fetch = (async () => jsonResponse(400, {
			error: 'Context length exceeded',
		})) as unknown as typeof shim.fetch;

		await expect(provider().chat([{ role: 'user', content: 'x' }]))
			.rejects.toThrow(/Context length exceeded/);
	});

	test('passes an extended timeout and disables fetch retries for chat completions', async () => {
		let seen: { timeout?: number; maxRetry?: number } = {};
		shim.fetch = (async (_url: string, options: { timeout?: number; maxRetry?: number }) => {
			seen = options;
			return jsonResponse(200, {
				choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			});
		}) as unknown as typeof shim.fetch;

		await provider().chat([{ role: 'user', content: 'Say hi' }]);
		expect(seen.timeout).toBe(1000 * 60 * 10);
		expect(seen.maxRetry).toBe(0);
	});

});
