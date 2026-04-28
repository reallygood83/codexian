import { MarkdownView, Notice, Plugin, type TFile } from 'obsidian';

import { CodexProvider } from './core/agent/CodexProvider';
import { findCodexCli } from './core/codex/CodexCliResolver';
import { generateVisualAsset } from './core/images/VisualAssetService';
import { buildProcessEnv } from './core/settings/env';
import type { CodexianSettings } from './core/types';
import { DEFAULT_SETTINGS } from './core/types';
import { CodexianView, VIEW_TYPE_CODEXIAN } from './ui/CodexianView';
import { ImageGenerationModal } from './ui/modals/ImageGenerationModal';
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

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.autofillCodexCliPath();
    this.agent = new CodexProvider(() => this.settings);

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
    const file = markdownView?.file;
    if (!file && this.settings.pinnedNotePaths.length === 0) return null;

    const content = file && this.settings.autoIncludeActiveNote ? await this.app.vault.read(file) : '';
    const selection = markdownView?.editor?.getSelection()?.trim() || undefined;
    const pinnedNotes = await this.getPinnedNoteContents(file?.path);
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
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file || null;
  }

  isNotePinned(path: string): boolean {
    return this.settings.pinnedNotePaths.includes(path);
  }

  async pinNote(path: string): Promise<void> {
    if (!this.settings.pinnedNotePaths.includes(path)) {
      this.settings.pinnedNotePaths.push(path);
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

  refreshOpenViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CODEXIAN)) {
      const view = leaf.view;
      if (view instanceof CodexianView) {
        view.refreshContextChips();
      }
    }
  }

  async unpinNote(path: string): Promise<void> {
    const next = this.settings.pinnedNotePaths.filter((item) => item !== path);
    if (next.length !== this.settings.pinnedNotePaths.length) {
      this.settings.pinnedNotePaths = next;
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

    new Notice('Generating visual asset with Codex...');
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
      });

      new Notice(`Visual embedded: ${generated.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Visual generation failed: ${message}`);
    }
  }
}
