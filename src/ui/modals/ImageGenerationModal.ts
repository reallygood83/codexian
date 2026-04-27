import { Modal, Setting, type App } from 'obsidian';

import type { ImageMode } from '../../core/types';

export interface ImageGenerationInput {
  mode: ImageMode;
  prompt: string;
}

export class ImageGenerationModal extends Modal {
  private resolve: ((value: ImageGenerationInput | null) => void) | null = null;
  private mode: ImageMode = 'infographic';
  private prompt = '';

  constructor(app: App) {
    super(app);
  }

  openAndWait(): Promise<ImageGenerationInput | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Generate Codexian visual asset' });
    contentEl.createEl('p', {
      text: 'Codexian will ask Codex CLI to create an SVG from the current note and embed it. No API key is used.',
    });

    new Setting(contentEl)
      .setName('Format')
      .setDesc('Choose the visual output type.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('infographic', 'Infographic')
          .addOption('poster', 'Poster')
          .addOption('cartoon', 'Cartoon')
          .addOption('concept', 'Concept art')
          .addOption('diagram', 'Diagram illustration')
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value as ImageMode;
          });
      });

    new Setting(contentEl)
      .setName('Direction')
      .setDesc('Optional style, audience, layout, or content instructions.')
      .addTextArea((text) => {
        text
          .setPlaceholder('Make this suitable for a newsletter header, with concise Korean labels...')
          .onChange((value) => {
            this.prompt = value;
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = '100%';
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Generate SVG and embed')
          .setCta()
          .onClick(() => {
            this.resolve?.({ mode: this.mode, prompt: this.prompt });
            this.resolve = null;
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Cancel')
          .onClick(() => {
            this.resolve?.(null);
            this.resolve = null;
            this.close();
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
  }
}
