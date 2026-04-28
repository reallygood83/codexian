import * as path from 'path';
import type { App, TFile } from 'obsidian';

import type { CodexProvider } from '../agent/CodexProvider';
import type { ImageMode, VisualOutputType } from '../types';
import { buildImagePrompt, buildPromptDraftRequest } from './ImagePromptBuilder';

function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'codexian-visual';
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = folder.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
  }
}

export interface GenerateVisualAssetRequest {
  app: App;
  agent: CodexProvider;
  vaultPath: string;
  file: TFile;
  mediaFolder: string;
  mode: ImageMode;
  outputType: VisualOutputType;
  userPrompt: string;
  generatedPrompt?: string;
  noteContent: string;
  selection?: string;
  onProgress?: (message: string) => void;
}

export interface GeneratedVisualAsset {
  path: string;
  transcript: string;
}

export async function generateVisualAsset(request: GenerateVisualAssetRequest): Promise<GeneratedVisualAsset> {
  request.onProgress?.('Preparing attachment folder...');
  const folder = request.mediaFolder.trim() || 'attachments/codexian';
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  await ensureFolder(request.app, normalizedFolder);

  const extension = request.outputType === 'png' ? 'png' : 'svg';
  const filename = `${sanitizeName(`${request.file.basename}-${request.mode}`)}-${Date.now()}.${extension}`;
  const vaultRelativePath = path.posix.join(normalizedFolder, filename);

  const fallbackPrompt = buildImagePrompt({
    mode: request.mode,
    outputType: request.outputType,
    userPrompt: request.userPrompt,
    noteTitle: request.file.basename,
    noteContent: request.noteContent,
    selection: request.selection,
  });
  const visualPrompt = request.generatedPrompt?.trim() || fallbackPrompt;

  const prompt = request.outputType === 'png'
    ? buildPngGenerationPrompt(vaultRelativePath, visualPrompt)
    : buildSvgGenerationPrompt(vaultRelativePath, visualPrompt);

  let transcript = '';
  request.onProgress?.(`Asking Codex CLI to create the ${extension.toUpperCase()}...`);
  for await (const event of request.agent.query({
    prompt,
    cwd: request.vaultPath,
    activeNotePath: request.file.path,
    activeNoteContent: request.noteContent,
    selectedText: request.selection,
  })) {
    if (event.type === 'text') transcript += event.content;
    if (event.type === 'error') transcript += `\nERROR: ${event.content}`;
  }

  if (!(await request.app.vault.adapter.exists(vaultRelativePath))) {
    request.onProgress?.(`${extension.toUpperCase()} file was not created at the expected path.`);
    throw new Error(`Codex did not create the expected ${extension.toUpperCase()} file: ${vaultRelativePath}\n\n${transcript.trim()}`);
  }

  request.onProgress?.(`Embedding generated ${extension.toUpperCase()} at the top of the note...`);
  await request.app.vault.process(request.file, (content) => embedAtTop(content, vaultRelativePath));
  request.onProgress?.(`Visual embedded: ${vaultRelativePath}`);
  return { path: vaultRelativePath, transcript: `Generated prompt:\n${visualPrompt}\n\n${transcript}` };
}

function buildSvgGenerationPrompt(vaultRelativePath: string, visualPrompt: string): string {
  return [
    'Create a single SVG visual asset from the generated image prompt below.',
    '',
    `Target file path, relative to the vault root: ${vaultRelativePath}`,
    '',
    'Hard requirements:',
    '- Use Codex CLI only. Do not call API keys or image APIs.',
    '- Write exactly one valid standalone SVG file to the target path.',
    '- The SVG must be viewBox-based, self-contained, and safe for Obsidian embedding.',
    '- Include <style> text rules with font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif.',
    '- Use real UTF-8 Korean text directly in <text> elements when Korean labels are needed.',
    '- Keep Korean labels short and large enough to read. Do not create mojibake, random glyphs, or placeholder Latin text.',
    '- Prefer visual hierarchy, shapes, layout, and concise labels over long paragraphs.',
    '- Do not modify the source note. Codexian will embed the SVG at the top after the file exists.',
    '',
    'Generated image prompt to apply:',
    '',
    visualPrompt,
  ].join('\n');
}

function buildPngGenerationPrompt(vaultRelativePath: string, visualPrompt: string): string {
  return [
    'Create a single PNG image from the generated image prompt below.',
    '',
    `Final target file path, relative to the vault root: ${vaultRelativePath}`,
    '',
    'Hard requirements:',
    '- Use Codex CLI built-in image generation tool only.',
    '- Do not use Python, Pillow, SVG, HTML, canvas, diagrams-as-code, or any code-drawn substitute.',
    '- Generate the image with the built-in image generation capability, then copy or move the resulting PNG from ~/.codex/generated_images/... to the final target file path.',
    '- The final file must be a real PNG image at the target path.',
    '- After saving, verify the file exists and is a PNG.',
    '- If exact size control is unavailable, prefer a square high-resolution image and do not fake dimensions with code.',
    '- For Korean text, keep labels very short, large, and high contrast. Avoid long paragraphs and tiny text.',
    '- Do not modify the source note. Codexian will embed the PNG at the top after the file exists.',
    '',
    'Generated image prompt to apply:',
    '',
    visualPrompt,
  ].join('\n');
}

export async function draftVisualPrompt(request: GenerateVisualAssetRequest): Promise<string> {
  const prompt = buildPromptDraftRequest({
    mode: request.mode,
    outputType: request.outputType,
    userPrompt: request.userPrompt,
    noteTitle: request.file.basename,
    noteContent: request.noteContent,
    selection: request.selection,
  });

  let drafted = '';
  for await (const event of request.agent.query({
    prompt,
    cwd: request.vaultPath,
    activeNotePath: request.file.path,
    activeNoteContent: request.noteContent,
    selectedText: request.selection,
  })) {
    if (event.type === 'text') drafted += event.content;
    if (event.type === 'error') {
      request.onProgress?.(`Prompt draft warning: ${event.content}`);
      console.warn('[Codexian visual] Prompt draft warning:', event.content);
    }
  }

  return drafted.trim();
}

function embedAtTop(content: string, vaultRelativePath: string): string {
  const embed = `![[${vaultRelativePath}]]`;
  if (content.includes(embed)) return content;
  if (content.startsWith('---\n')) {
    const frontmatterEnd = content.indexOf('\n---', 4);
    if (frontmatterEnd !== -1) {
      const closingEnd = frontmatterEnd + '\n---'.length;
      const hasTrailingNewline = content.slice(closingEnd).startsWith('\n');
      const before = content.slice(0, closingEnd);
      const after = content.slice(closingEnd + (hasTrailingNewline ? 1 : 0));
      return `${before}\n\n${embed}\n\n${after}`;
    }
  }
  return `${embed}\n\n${content}`;
}
