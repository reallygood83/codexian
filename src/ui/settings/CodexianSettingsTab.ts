import { Notice, PluginSettingTab, Setting } from 'obsidian';

import type CodexianPlugin from '../../main';
import type { PermissionMode, ReasoningEffort } from '../../core/types';
import { getInstallPreview, installOrUpdateOmx } from '../../core/installer/OmxInstaller';
import { probeEnvironment } from '../../core/installer/EnvironmentProbe';

export class CodexianSettingsTab extends PluginSettingTab {
  plugin: CodexianPlugin;
  private diagnosticsEl: HTMLElement | null = null;

  constructor(plugin: CodexianPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Codexian' });

    const statusCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    statusCard.createEl('h3', { text: 'Codex setup' });
    statusCard.createEl('p', {
      text: 'Configure Codex CLI, model, reasoning, and the environment Obsidian will use.',
    });

    new Setting(statusCard)
      .setName('Codex CLI path')
      .setDesc('Leave empty for auto-detection from PATH.')
      .addText((text) => text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\codex.cmd' : '/opt/homebrew/bin/codex')
        .setValue(this.plugin.settings.codexCliPath)
        .onChange(async (value) => {
          this.plugin.settings.codexCliPath = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('Model')
      .addText((text) => text
        .setValue(this.plugin.settings.codexModel)
        .onChange(async (value) => {
          this.plugin.settings.codexModel = value.trim() || 'gpt-5.4';
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('Reasoning')
      .addDropdown((dropdown) => dropdown
        .addOption('low', 'Low')
        .addOption('medium', 'Medium')
        .addOption('high', 'High')
        .addOption('xhigh', 'Extra high')
        .setValue(this.plugin.settings.reasoningEffort)
        .onChange(async (value) => {
          this.plugin.settings.reasoningEffort = value as ReasoningEffort;
          await this.plugin.saveSettings();
        }));

    new Setting(statusCard)
      .setName('Permission mode')
      .setDesc('Review uses workspace sandboxing. Auto maps to Codex full-auto. Yolo bypasses approvals and sandboxing.')
      .addDropdown((dropdown) => dropdown
        .addOption('review', 'Review')
        .addOption('auto', 'Auto')
        .addOption('yolo', 'Yolo')
        .setValue(this.plugin.settings.permissionMode)
        .onChange(async (value) => {
          this.plugin.settings.permissionMode = value as PermissionMode;
          await this.plugin.saveSettings();
        }));

    const envCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    envCard.createEl('h3', { text: 'Environment' });
    new Setting(envCard)
      .setName('Environment variables')
      .setDesc('One KEY=VALUE per line. Use this mainly to expose PATH so Obsidian can find codex, npm, and omx.')
      .addTextArea((text) => {
        text
          .setPlaceholder('PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange(async (value) => {
            this.plugin.settings.environmentVariables = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.style.width = '100%';
      });

    const imageCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    imageCard.createEl('h3', { text: 'Visual assets' });
    imageCard.createEl('p', {
      text: 'Codexian uses Codex CLI to create SVG visuals from notes. No API key is required.',
    });
    new Setting(imageCard)
      .setName('Media folder')
      .addText((text) => text
        .setValue(this.plugin.settings.mediaFolder)
        .onChange(async (value) => {
          this.plugin.settings.mediaFolder = value.trim() || 'attachments/codexian';
          await this.plugin.saveSettings();
        }));

    const omxCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    omxCard.createEl('h3', { text: 'oh-my-codex' });
    omxCard.createEl('p', { text: 'Install or update Codex CLI and OMX. Review the command preview before running.' });
    omxCard.createEl('pre', { cls: 'codexian-status-line', text: getInstallPreview() });

    new Setting(omxCard)
      .addButton((button) => button
        .setButtonText('Run diagnostics')
        .onClick(() => void this.runDiagnostics()))
      .addButton((button) => button
        .setButtonText('Install / update Codex + OMX')
        .setCta()
        .onClick(() => void this.installOmx()));

    this.diagnosticsEl = omxCard.createDiv({ cls: 'codexian-status-line' });
    this.diagnosticsEl.setText('Diagnostics not run yet.');
  }

  private async runDiagnostics(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Running diagnostics...');
    const results = await probeEnvironment(this.plugin.settings.environmentVariables);
    this.diagnosticsEl.setText(results
      .map((result) => `${result.ok ? 'PASS' : 'WARN'} ${result.label}\n${result.detail}`)
      .join('\n\n'));
  }

  private async installOmx(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Installing...\n');
    try {
      await installOrUpdateOmx(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      this.plugin.settings.omx.enabled = true;
      this.plugin.settings.omx.lastDoctorStatus = 'pass';
      this.plugin.settings.omx.lastCheckedAt = Date.now();
      await this.plugin.saveSettings();
      new Notice('Codex + OMX setup completed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\nFAILED: ${message}`);
      new Notice(`Codexian setup failed: ${message}`);
    }
  }
}
