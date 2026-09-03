import shim from '../../shim';
import { basename, fileExtension } from '@joplin/utils/path';
import Logger from '@joplin/utils/Logger';

const logger = Logger.create('chatAttachments');

// Soft cap so a large PDF doesn't blow the chat context by itself.
const maxAttachmentChars = 40000;

export const supportedChatAttachmentExtensions = ['txt', 'md', 'markdown', 'csv', 'pdf'] as const;

export type SupportedChatAttachmentExtension = typeof supportedChatAttachmentExtensions[number];

export interface ChatAttachmentExtracted {
	fileName: string;
	text: string;
	truncated: boolean;
}

const isSupportedExtension = (ext: string): ext is SupportedChatAttachmentExtension => {
	return (supportedChatAttachmentExtensions as readonly string[]).includes(ext);
};

export const isSupportedChatAttachmentPath = (filePath: string) => {
	const ext = fileExtension(filePath).toLowerCase();
	return isSupportedExtension(ext);
};

const truncateText = (text: string) => {
	if (text.length <= maxAttachmentChars) return { text, truncated: false };
	return {
		text: `${text.slice(0, maxAttachmentChars)}\n\n[…truncated…]`,
		truncated: true,
	};
};

const readTextFile = async (filePath: string) => {
	return await shim.fsDriver().readFile(filePath, 'utf8');
};

const readPdfText = async (filePath: string) => {
	const pages = await shim.pdfExtractEmbeddedText(filePath);
	return pages.filter(Boolean).join('\n\n');
};

export const extractChatAttachment = async (filePath: string): Promise<ChatAttachmentExtracted> => {
	const fileName = basename(filePath);
	const ext = fileExtension(filePath).toLowerCase();

	if (!isSupportedExtension(ext)) {
		throw new Error(`Unsupported attachment type: .${ext || '(none)'}`);
	}

	let raw = '';
	if (ext === 'pdf') {
		raw = await readPdfText(filePath);
	} else {
		raw = await readTextFile(filePath);
	}

	const cleaned = (raw || '').split('\u0000').join('').trim();
	if (!cleaned) {
		logger.warn(`Attachment had no extractable text: ${fileName}`);
		return { fileName, text: '(No extractable text found in this file.)', truncated: false };
	}

	const { text, truncated } = truncateText(cleaned);
	return { fileName, text, truncated };
};

export const formatAttachmentsForPrompt = (attachments: ChatAttachmentExtracted[]) => {
	if (!attachments.length) return '';
	const blocks = attachments.map(a => {
		const note = a.truncated ? ' (truncated)' : '';
		return [
			`--- BEGIN ATTACHMENT: ${a.fileName}${note} ---`,
			a.text,
			`--- END ATTACHMENT: ${a.fileName} ---`,
		].join('\n');
	});
	return [
		'The user attached the following local document(s) for this message. Use their content when answering.',
		'',
		...blocks,
	].join('\n');
};

export const formatAttachmentDisplayLine = (fileNames: string[]) => {
	if (!fileNames.length) return '';
	return `📎 ${fileNames.join(', ')}`;
};

export const _internal = {
	maxAttachmentChars,
	truncateText,
};
