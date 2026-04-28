import type { App, TFile } from 'obsidian';

import type { MemoryMapEntry, MemoryMapIndex, MemoryMapResult } from '../types';

const INDEX_PATH = '.codexian/memory/index.json';
const STOP_WORDS = new Set([
  '그리고', '그러나', '이것', '저것', '하는', '있는', '없는', 'the', 'and', 'for', 'with', 'that', 'this',
  'from', 'into', 'about', 'note', 'notes', '정리', '내용', '문서', '관련',
]);

export class MemoryMapService {
  private app: App;
  private index: MemoryMapIndex | null = null;

  constructor(app: App) {
    this.app = app;
  }

  async build(): Promise<MemoryMapIndex> {
    const entries: MemoryMapEntry[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(this.toEntry(file, content));
    }

    this.index = { version: 1, builtAt: Date.now(), entries };
    await this.persist(this.index);
    return this.index;
  }

  async load(): Promise<MemoryMapIndex | null> {
    if (this.index) return this.index;
    const adapter = this.app.vault.adapter;
    try {
      if (!await adapter.exists(INDEX_PATH)) return null;
      const parsed = JSON.parse(await adapter.read(INDEX_PATH)) as MemoryMapIndex;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null;
      this.index = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<{ built: boolean; count: number; builtAt: number | null }> {
    const index = await this.load();
    return {
      built: Boolean(index),
      count: index?.entries.length || 0,
      builtAt: index?.builtAt || null,
    };
  }

  async findRelated(currentFile: TFile, limit = 8): Promise<MemoryMapResult[]> {
    const index = await this.load() || await this.build();
    const current = index.entries.find((entry) => entry.path === currentFile.path);
    if (!current) return [];

    return index.entries
      .filter((entry) => entry.path !== current.path)
      .map((entry) => this.score(current, entry))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async persist(index: MemoryMapIndex): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists('.codexian')) await adapter.mkdir('.codexian');
    if (!await adapter.exists('.codexian/memory')) await adapter.mkdir('.codexian/memory');
    await adapter.write(INDEX_PATH, JSON.stringify(index, null, 2));
  }

  private toEntry(file: TFile, content: string): MemoryMapEntry {
    const title = file.basename;
    const folder = file.parent?.path || '';
    const tags = this.extractTags(content);
    const links = [...content.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)]
      .map((match) => match[1].trim())
      .filter(Boolean);
    const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)]
      .map((match) => match[1].trim())
      .slice(0, 20);

    return {
      path: file.path,
      title,
      folder,
      tags,
      links,
      headings,
      keywords: this.extractKeywords(`${title}\n${headings.join('\n')}\n${content}`),
      mtime: file.stat.mtime,
    };
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>();
    for (const match of content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
      tags.add(match[1]);
    }

    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    const tagLine = frontmatter?.[1].match(/^tags:\s*(.+)$/m)?.[1];
    if (tagLine) {
      tagLine
        .replace(/[[\]]/g, '')
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean)
        .forEach((tag) => tags.add(tag));
    }

    return [...tags];
  }

  private extractKeywords(content: string): string[] {
    const counts = new Map<string, number>();
    const words = content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
      .split(/\s+/)
      .map((word) => word.trim().toLowerCase())
      .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));

    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);
  }

  private score(current: MemoryMapEntry, candidate: MemoryMapEntry): MemoryMapResult {
    let score = 0;
    const reasons: string[] = [];
    const candidateAliases = new Set([candidate.title, candidate.path, candidate.path.replace(/\.md$/i, '')]);
    const currentAliases = new Set([current.title, current.path, current.path.replace(/\.md$/i, '')]);

    if (current.links.some((link) => candidateAliases.has(link))) {
      score += 12;
      reasons.push('현재 노트에서 링크됨');
    }
    if (candidate.links.some((link) => currentAliases.has(link))) {
      score += 10;
      reasons.push('현재 노트를 백링크함');
    }

    const sharedTags = candidate.tags.filter((tag) => current.tags.includes(tag));
    if (sharedTags.length > 0) {
      score += sharedTags.length * 5;
      reasons.push(`같은 태그 ${sharedTags.slice(0, 3).map((tag) => `#${tag}`).join(', ')}`);
    }

    if (candidate.folder && candidate.folder === current.folder) {
      score += 3;
      reasons.push('같은 폴더');
    }

    const sharedHeadings = candidate.headings.filter((heading) => current.headings.includes(heading));
    if (sharedHeadings.length > 0) {
      score += Math.min(sharedHeadings.length * 2, 6);
      reasons.push('비슷한 소제목');
    }

    const sharedKeywords = candidate.keywords.filter((keyword) => current.keywords.includes(keyword));
    if (sharedKeywords.length > 0) {
      score += Math.min(sharedKeywords.length, 8);
      reasons.push(`키워드 ${sharedKeywords.slice(0, 4).join(', ')}`);
    }

    const ageDays = Math.max(0, (Date.now() - candidate.mtime) / 86_400_000);
    if (ageDays < 14) {
      score += 1;
      reasons.push('최근 수정됨');
    }

    return {
      path: candidate.path,
      title: candidate.title,
      score,
      reasons: reasons.slice(0, 4),
    };
  }
}
