import { Modal, type App } from 'obsidian';

export type VisualProgressState = 'running' | 'success' | 'error';

export class VisualGenerationProgressModal extends Modal {
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('codexian-visual-progress-modal');
    contentEl.createEl('h2', { text: 'Generating Codexian visual asset' });
    this.statusEl = contentEl.createDiv({ cls: 'codexian-visual-progress-status', text: 'Starting...' });
    this.listEl = contentEl.createDiv({ cls: 'codexian-visual-progress-list' });
  }

  addStep(message: string): void {
    console.log(`[Codexian visual] ${message}`);
    this.statusEl?.setText(message);
    const item = this.listEl?.createDiv({ cls: 'codexian-visual-progress-item is-running' });
    item?.setText(message);
  }

  finish(message: string, state: VisualProgressState): void {
    const logger = state === 'error' ? console.error : console.log;
    logger(`[Codexian visual] ${message}`);
    this.statusEl?.setText(message);
    this.statusEl?.toggleClass('is-success', state === 'success');
    this.statusEl?.toggleClass('is-error', state === 'error');
    const item = this.listEl?.createDiv({ cls: `codexian-visual-progress-item is-${state}` });
    item?.setText(message);
  }

  onClose(): void {
    this.contentEl.empty();
    this.listEl = null;
    this.statusEl = null;
  }
}
