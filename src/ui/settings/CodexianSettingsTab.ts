import { Notice, PluginSettingTab, Setting } from 'obsidian';

import type CodexianPlugin from '../../main';
import type { PermissionMode, ReasoningEffort } from '../../core/types';
import { findCodexCli } from '../../core/codex/CodexCliResolver';
import { buildProcessEnv } from '../../core/settings/env';
import {
  enableCodexImageGeneration,
  getCodexUpdatePreview,
  getInstallPreview,
  getObsidianSkillsPreview,
  installOrUpdateObsidianSkills,
  installOrUpdateOmx,
  updateCodexCli,
} from '../../core/installer/OmxInstaller';
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
    const detectedCodex = findCodexCli('', buildProcessEnv(this.plugin.settings.environmentVariables).PATH);
    statusCard.createEl('p', {
      cls: 'codexian-settings-hint',
      text: detectedCodex ? `Detected Codex CLI: ${detectedCodex}` : 'Codex CLI was not auto-detected yet.',
    });

    new Setting(statusCard)
      .setName('Codex CLI path')
      .setDesc('Leave empty for auto-detection, or click “Use detected” to lock the detected path.')
      .addText((text) => text
        .setPlaceholder(process.platform === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\codex.cmd' : '/opt/homebrew/bin/codex')
        .setValue(this.plugin.settings.codexCliPath)
        .onChange(async (value) => {
          this.plugin.settings.codexCliPath = value.trim();
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText('Use detected')
        .setDisabled(!detectedCodex)
        .onClick(async () => {
          if (!detectedCodex) return;
          this.plugin.settings.codexCliPath = detectedCodex;
          await this.plugin.saveSettings();
          this.display();
        }));

    new Setting(statusCard)
      .setName('Model')
      .addText((text) => text
        .setValue(this.plugin.settings.codexModel)
        .onChange(async (value) => {
          this.plugin.settings.codexModel = value.trim() || 'gpt-5.5';
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

    new Setting(statusCard)
      .setName('Auto-include active note')
      .setDesc('Automatically attach the currently open markdown note to every Codex prompt.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoIncludeActiveNote)
        .onChange(async (value) => {
          this.plugin.settings.autoIncludeActiveNote = value;
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
      text: 'Codexian uses Codex CLI to create PNG or SVG visuals from notes. PNG generation requires a recent Codex CLI with image_generation enabled. No API key is required.',
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

    const codexUpdateCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    codexUpdateCard.createEl('h3', { text: 'Codex CLI update' });
    codexUpdateCard.createEl('p', {
      text: 'Update Codex CLI and enable the built-in image_generation feature used for PNG visual assets.',
    });
    codexUpdateCard.createEl('pre', { cls: 'codexian-status-line', text: getCodexUpdatePreview() });

    new Setting(codexUpdateCard)
      .addButton((button) => button
        .setButtonText('Update Codex CLI')
        .setCta()
        .onClick(() => void this.updateCodexCli()))
      .addButton((button) => button
        .setButtonText('Enable image generation')
        .onClick(() => void this.enableImageGeneration()));

    const skillsCard = containerEl.createDiv({ cls: 'codexian-settings-card' });
    skillsCard.createEl('h3', { text: 'Obsidian Skills' });
    skillsCard.createEl('p', {
      text: 'Install or update kepano/obsidian-skills for Codex CLI. These skills teach Codex Obsidian Markdown, Bases, Canvas, and CLI workflows.',
    });
    skillsCard.createEl('pre', { cls: 'codexian-status-line', text: getObsidianSkillsPreview() });

    new Setting(skillsCard)
      .addButton((button) => button
        .setButtonText('Install / update Obsidian Skills')
        .setCta()
        .onClick(() => void this.installObsidianSkills()));
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

  private async updateCodexCli(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Updating Codex CLI...\n');
    try {
      await updateCodexCli(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Codex CLI update completed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\nFAILED: ${message}`);
      new Notice(`Codex CLI update failed: ${message}`);
    }
  }

  private async enableImageGeneration(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Enabling Codex image_generation...\n');
    try {
      await enableCodexImageGeneration(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Codex image_generation enabled.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\nFAILED: ${message}`);
      new Notice(`Codex image_generation setup failed: ${message}`);
    }
  }

  private async installObsidianSkills(): Promise<void> {
    if (!this.diagnosticsEl) return;
    this.diagnosticsEl.setText('Installing Obsidian Skills...\n');
    try {
      await installOrUpdateObsidianSkills(this.plugin.settings.environmentVariables, (line) => {
        this.diagnosticsEl?.appendText(line);
      });
      new Notice('Obsidian Skills installed. Restart Codexian sessions to load them.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.diagnosticsEl.appendText(`\nFAILED: ${message}`);
      new Notice(`Obsidian Skills setup failed: ${message}`);
    }
  }
}
