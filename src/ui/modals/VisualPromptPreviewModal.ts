import { Modal, Setting, type App } from 'obsidian';

export class VisualPromptPreviewModal extends Modal {
  private resolve: ((value: string | null) => void) | null = null;
  private prompt: string;

  constructor(app: App, prompt: string) {
    super(app);
    this.prompt = prompt;
  }

  openAndWait(): Promise<string | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Review generated image prompt' });
    contentEl.createEl('p', {
      text: 'Codexian drafted this prompt from the current note. Edit it if needed, then generate the SVG.',
    });

    new Setting(contentEl)
      .setName('Generated prompt')
      .setDesc('This structured prompt will be applied to the SVG generation step.')
      .addTextArea((text) => {
        text
          .setValue(this.prompt)
          .onChange((value) => {
            this.prompt = value;
          });
        text.inputEl.rows = 14;
        text.inputEl.style.width = '100%';
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Generate SVG with this prompt')
          .setCta()
          .onClick(() => {
            this.resolve?.(this.prompt.trim());
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
