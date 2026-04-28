import type { ImageMode, VisualOutputType } from '../types';

const MODE_DIRECTIVES: Record<ImageMode, string> = {
  infographic: 'Create a clean editorial infographic with strong hierarchy, compact labels, and visually distinct sections.',
  poster: 'Create a striking poster with a central visual metaphor, high contrast, and concise title typography.',
  cartoon: 'Create a polished cartoon/comic-style image with expressive characters or symbolic scenes.',
  concept: 'Create concept art with cinematic composition, atmosphere, and clear subject focus.',
  diagram: 'Create a diagram-like illustration that explains relationships visually without looking like a generic flowchart.',
};

export function buildImagePrompt(options: {
  mode: ImageMode;
  userPrompt: string;
  noteTitle?: string;
  noteContent?: string;
  selection?: string;
}): string {
  const source = options.selection || options.noteContent || '';
  const parts = [
    MODE_DIRECTIVES[options.mode],
    'Use the provided Obsidian note context as source material. Preserve meaning, but do not cram all text into the image.',
  ];

  if (options.noteTitle) {
    parts.push(`Note title: ${options.noteTitle}`);
  }

  if (source.trim()) {
    parts.push(`Source context:\n${source.slice(0, 6000)}`);
  }

  if (options.userPrompt.trim()) {
    parts.push(`User direction:\n${options.userPrompt.trim()}`);
  }

  parts.push('Avoid tiny unreadable text. Prefer visual synthesis, clear composition, and a premium OpenAI-adjacent monochrome/green design language when appropriate.');
  parts.push('For Korean text, use concise Korean labels and specify font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif. Do not convert Korean text into broken outlines or garbled Latin placeholders.');
  return parts.join('\n\n');
}

export function buildPromptDraftRequest(options: {
  mode: ImageMode;
  outputType: VisualOutputType;
  userPrompt: string;
  noteTitle?: string;
  noteContent?: string;
  selection?: string;
}): string {
  const source = options.selection || options.noteContent || '';
  const outputDescription = options.outputType === 'png'
    ? 'a high-quality PNG image using Codex built-in image generation'
    : 'one text-safe SVG visual asset';
  return [
    `Analyze the provided Obsidian note and write a production-ready prompt for generating ${outputDescription}.`,
    '',
    'Output only the final image-generation prompt. Do not include commentary, markdown fences, or alternatives.',
    '',
    'The prompt must include:',
    `- Visual format: ${options.mode}`,
    '- The core message extracted from the note',
    '- Recommended composition/layout',
    '- 3 to 7 concise Korean labels if labels are useful',
    '- Clear instruction to preserve Korean text legibility',
    options.outputType === 'svg'
      ? '- SVG-safe typography using Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
      : '- Keep any Korean text short, large, high contrast, and easy to verify',
    '- Avoidance of tiny text, clutter, and garbled Korean',
    '',
    options.noteTitle ? `Note title: ${options.noteTitle}` : '',
    source.trim() ? `Source note:\n${source.slice(0, 7000)}` : '',
    options.userPrompt.trim() ? `User direction:\n${options.userPrompt.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}
