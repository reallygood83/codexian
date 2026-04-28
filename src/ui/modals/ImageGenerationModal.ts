import { Modal, Setting, type App } from 'obsidian';

import type { ImageMode, VisualOutputType } from '../../core/types';

export interface ImageGenerationInput {
  mode: ImageMode;
  outputType: VisualOutputType;
  prompt: string;
}

export class ImageGenerationModal extends Modal {
  private resolve: ((value: ImageGenerationInput | null) => void) | null = null;
  private mode: ImageMode = 'infographic';
  private outputType: VisualOutputType = 'png';
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
      text: 'Codexian will analyze the current note, draft an image prompt, generate a visual with Codex CLI, and embed it at the top. No API key is used.',
    });

    new Setting(contentEl)
      .setName('Output')
      .setDesc('Choose Codex built-in PNG generation or text-safe SVG generation.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('png', 'PNG via Codex image generation')
          .addOption('svg', 'SVG via Codex code generation')
          .setValue(this.outputType)
          .onChange((value) => {
            this.outputType = value as VisualOutputType;
          });
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
          .setButtonText('Analyze note, generate, and embed')
          .setCta()
          .onClick(() => {
            this.resolve?.({ mode: this.mode, outputType: this.outputType, prompt: this.prompt });
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
