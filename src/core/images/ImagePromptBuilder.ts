import type { ImageMode } from '../types';

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
  return parts.join('\n\n');
}

