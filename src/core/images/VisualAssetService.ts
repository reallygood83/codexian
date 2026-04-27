import * as path from 'path';
import type { App, TFile } from 'obsidian';

import type { CodexProvider } from '../agent/CodexProvider';
import type { ImageMode } from '../types';
import { buildImagePrompt } from './ImagePromptBuilder';

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
  userPrompt: string;
  noteContent: string;
  selection?: string;
}

export interface GeneratedVisualAsset {
  path: string;
  transcript: string;
}

export async function generateVisualAsset(request: GenerateVisualAssetRequest): Promise<GeneratedVisualAsset> {
  const folder = request.mediaFolder.trim() || 'attachments/codexian';
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  await ensureFolder(request.app, normalizedFolder);

  const filename = `${sanitizeName(`${request.file.basename}-${request.mode}`)}-${Date.now()}.svg`;
  const vaultRelativePath = path.posix.join(normalizedFolder, filename);

  const visualPrompt = buildImagePrompt({
    mode: request.mode,
    userPrompt: request.userPrompt,
    noteTitle: request.file.basename,
    noteContent: request.noteContent,
    selection: request.selection,
  });

  const prompt = [
    'Create a single SVG visual asset for the active Obsidian note.',
    '',
    `Target file path, relative to the vault root: ${vaultRelativePath}`,
    '',
    'Hard requirements:',
    '- Use Codex CLI only. Do not call API keys or image APIs.',
    '- Write exactly one valid standalone SVG file to the target path.',
    '- The SVG must be viewBox-based, self-contained, and safe for Obsidian embedding.',
    '- Prefer visual hierarchy, shapes, layout, and concise labels over long paragraphs.',
    '- Do not modify the source note. Codexian will append the embed after the file exists.',
    '',
    visualPrompt,
  ].join('\n');

  let transcript = '';
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
    throw new Error(`Codex did not create the expected SVG file: ${vaultRelativePath}\n\n${transcript.trim()}`);
  }

  await request.app.vault.process(request.file, (content) => `${content}\n\n![[${vaultRelativePath}]]\n`);
  return { path: vaultRelativePath, transcript };
}
