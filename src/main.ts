import { MarkdownView, Notice, Plugin, type TFile } from 'obsidian';

import { CodexProvider } from './core/agent/CodexProvider';
import { generateVisualAsset } from './core/images/VisualAssetService';
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
}

export default class CodexianPlugin extends Plugin {
  settings: CodexianSettings;
  agent: CodexProvider;

  async onload(): Promise<void> {
    await this.loadSettings();
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
    if (!file) return null;

    const content = await this.app.vault.read(file);
    const selection = markdownView.editor?.getSelection()?.trim() || undefined;
    return {
      file,
      path: file.path,
      content,
      selection,
    };
  }

  async generateImageFromActiveNote(): Promise<void> {
    const context = await this.getActiveNoteContext();
    if (!context) {
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
        file: context.file,
        mediaFolder: this.settings.mediaFolder,
        mode: input.mode,
        userPrompt: input.prompt,
        noteContent: context.content,
        selection: context.selection,
      });

      new Notice(`Visual embedded: ${generated.path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Visual generation failed: ${message}`);
    }
  }
}
