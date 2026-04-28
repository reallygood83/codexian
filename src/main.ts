import { MarkdownView, Notice, Plugin, type TFile } from 'obsidian';

import { CodexProvider } from './core/agent/CodexProvider';
import { findCodexCli } from './core/codex/CodexCliResolver';
import { generateVisualAsset } from './core/images/VisualAssetService';
import { MemoryMapService } from './core/memory/MemoryMapService';
import { buildProcessEnv } from './core/settings/env';
import type { CodexianSettings, MemoryMapResult } from './core/types';
import { DEFAULT_SETTINGS } from './core/types';
import { CodexianView, VIEW_TYPE_CODEXIAN } from './ui/CodexianView';
import { ImageGenerationModal } from './ui/modals/ImageGenerationModal';
import { VisualGenerationProgressModal } from './ui/modals/VisualGenerationProgressModal';
import { CodexianSettingsTab } from './ui/settings/CodexianSettingsTab';

interface ActiveNoteContext {
  file: TFile;
  path: string;
  content: string;
  selection?: string;
  pinnedNotes: Array<{ path: string; content: string }>;
}

export default class CodexianPlugin extends Plugin {
  settings: CodexianSettings;
  agent: CodexProvider;
  memoryMap: MemoryMapService;
  private lastActiveMarkdownFile: TFile | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.autofillCodexCliPath();
    this.agent = new CodexProvider(() => this.settings);
    this.memoryMap = new MemoryMapService(this.app);

    this.registerView(VIEW_TYPE_CODEXIAN, (leaf) => new CodexianView(leaf, this));

    this.addRibbonIcon('sparkles', 'Open Codexian', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-codexian',
      name: 'Open Codexian',
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: 'generate-visual-from-note',
      name: 'Generate visual asset from active note',
      callback: () => void this.generateImageFromActiveNote(),
    });

    this.addCommand({
      id: 'attach-current-note',
      name: 'Attach current note to chat',
      checkCallback: (checking: boolean) => {
        const activeFile = this.getActiveMarkdownFile();
        if (!activeFile) return false;
        if (checking) return true;

        void this.attachCurrentNoteToChat();
        return true;
      },
    });

    this.addCommand({
      id: 'build-memory-map',
      name: 'Build Memory Map',
      callback: () => void this.buildMemoryMap(),
    });

    this.addCommand({
      id: 'find-related-notes',
      name: 'Find related notes for current note',
      checkCallback: (checking: boolean) => {
        const activeFile = this.getActiveMarkdownFile();
        if (!activeFile) return false;
        if (checking) return true;

        void this.findRelatedNotes();
        return true;
      },
    });

    this.addSettingTab(new CodexianSettingsTab(this));
  }

  onunload(): void {
    this.agent?.cancel();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CODEXIAN);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      pinnedNotePaths: Array.isArray(data?.pinnedNotePaths) ? data.pinnedNotePaths : DEFAULT_SETTINGS.pinnedNotePaths,
      excludedNotePaths: Array.isArray(data?.excludedNotePaths) ? data.excludedNotePaths : DEFAULT_SETTINGS.excludedNotePaths,
      omx: {
        ...DEFAULT_SETTINGS.omx,
        ...data?.omx,
      },
      blockedCommands: {
        ...DEFAULT_SETTINGS.blockedCommands,
        ...data?.blockedCommands,
      },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async autofillCodexCliPath(): Promise<void> {
    if (this.settings.codexCliPath.trim()) return;
    const detected = findCodexCli('', buildProcessEnv(this.settings.environmentVariables).PATH);
    if (!detected) return;
    this.settings.codexCliPath = detected;
    await this.saveSettings();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (!rightLeaf) return;
      leaf = rightLeaf;
      await leaf.setViewState({ type: VIEW_TYPE_CODEXIAN, active: true });
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath || '/';
  }

  async getActiveNoteContext(): Promise<ActiveNoteContext | null> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = this.getActiveMarkdownFile();
    const includeActiveFile = Boolean(
      file
      && this.settings.autoIncludeActiveNote
      && !this.isNoteExcluded(file.path),
    );
    const pinnedNotes = await this.getPinnedNoteContents(file?.path);
    if (!file && pinnedNotes.length === 0) return null;

    const content = file && includeActiveFile ? await this.app.vault.read(file) : '';
    const selection = includeActiveFile && markdownView?.file?.path === file?.path
      ? markdownView?.editor?.getSelection()?.trim() || undefined
      : undefined;
    return {
      file: file!,
      path: file?.path || '',
      content,
      selection,
      pinnedNotes,
    };
  }

  async getPinnedNoteContents(excludePath?: string): Promise<Array<{ path: string; content: string }>> {
    const notes: Array<{ path: string; content: string }> = [];
    for (const notePath of this.settings.pinnedNotePaths) {
      if (notePath === excludePath) continue;
      if (this.isNoteExcluded(notePath)) continue;
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (!file || !('extension' in file)) continue;
      try {
        notes.push({ path: notePath, content: await this.app.vault.read(file as TFile) });
      } catch {
        // Ignore stale pinned files; the UI still exposes the stored path.
      }
    }
    return notes;
  }

  getActiveMarkdownFile(): TFile | null {
    const markdownViewFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
    const activeFile = this.app.workspace.getActiveFile();
    const file = markdownViewFile || activeFile || this.lastActiveMarkdownFile;

    if (file && file.extension === 'md') {
      this.lastActiveMarkdownFile = file;
      return file;
    }

    return this.lastActiveMarkdownFile;
  }

  isNotePinned(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.settings.pinnedNotePaths.includes(normalizedPath);
  }

  isNoteExcluded(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.settings.excludedNotePaths.includes(normalizedPath);
  }

  async pinNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    await this.includeNote(normalizedPath);
    if (!this.settings.pinnedNotePaths.includes(normalizedPath)) {
      this.settings.pinnedNotePaths.push(normalizedPath);
      await this.saveSettings();
    }
  }

  async attachCurrentNoteToChat(): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice('Open a markdown note before attaching it.');
      return;
    }

    await this.pinNote(activeFile.path.replace(/\\/g, '/'));
    await this.activateView();
    this.refreshOpenViews();
    new Notice(`Attached: ${activeFile.name}`);
  }

  async buildMemoryMap(): Promise<void> {
    new Notice('Building Codexian Memory Map...');
    try {
      const index = await this.memoryMap.build();
      this.refreshOpenViews();
      new Notice(`Memory Map ready: ${index.entries.length} notes indexed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Memory Map failed: ${message}`);
    }
  }

  async getMemoryMapStatus(): Promise<{ built: boolean; count: number; builtAt: number | null }> {
    return this.memoryMap.getStatus();
  }

  async findRelatedNotes(limit = 8): Promise<MemoryMapResult[]> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice('Open a markdown note before finding related notes.');
      return [];
    }

    try {
      const results = await this.memoryMap.findRelated(activeFile, limit);
      this.refreshOpenViews();
      if (results.length === 0) new Notice('No related notes found.');
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Find Context failed: ${message}`);
      return [];
    }
  }

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)) {
      const view = leaf.view;
      if (view instanceof CodexianView) {
        view.refreshContextChips();
      }
    }
  }

  async unpinNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    const next = this.settings.pinnedNotePaths.filter((item) => item !== normalizedPath);
    if (next.length !== this.settings.pinnedNotePaths.length) {
      this.settings.pinnedNotePaths = next;
      await this.saveSettings();
    }
  }

  async excludeNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    this.settings.pinnedNotePaths = this.settings.pinnedNotePaths.filter((item) => item !== normalizedPath);
    if (!this.settings.excludedNotePaths.includes(normalizedPath)) {
      this.settings.excludedNotePaths.push(normalizedPath);
    }
    await this.saveSettings();
  }

  async includeNote(path: string): Promise<void> {
    const normalizedPath = path.replace(/\\/g, '/');
    const next = this.settings.excludedNotePaths.filter((item) => item !== normalizedPath);
    if (next.length !== this.settings.excludedNotePaths.length) {
      this.settings.excludedNotePaths = next;
      await this.saveSettings();
    }
  }

  async generateImageFromActiveNote(): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    const context = await this.getActiveNoteContext();
    if (!context || !activeFile) {
      new Notice('Open a markdown note before generating an image.');
      return;
    }

    const input = await new ImageGenerationModal(this.app).openAndWait();
    if (!input) return;

    const progressModal = new VisualGenerationProgressModal(this.app);
    progressModal.open();
    progressModal.addStep(`Source note: ${activeFile.path}`);
    progressModal.addStep(`Visual format: ${input.mode}`);

    try {
      const generated = await generateVisualAsset({
        app: this.app,
        agent: this.agent,
        vaultPath: this.getVaultPath(),
        file: activeFile,
        mediaFolder: this.settings.mediaFolder,
        mode: input.mode,
        userPrompt: input.prompt,
        noteContent: context.content || await this.app.vault.read(activeFile),
        selection: context.selection,
        onProgress: (message) => progressModal.addStep(message),
      });

      progressModal.finish(`Done. Embedded ${generated.path}`, 'success');
      new Notice(`Visual embedded: ${generated.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progressModal.finish(`Error: ${message}`, 'error');
      console.error('[Codexian visual] Visual generation failed:', error);
      new Notice(`Visual generation failed: ${message}`);
    }
  }
}
