import { ItemView, MarkdownRenderer, Notice, setIcon, type TFile, type WorkspaceLeaf } from 'obsidian';

import type CodexianPlugin from '../main';
import type { ConversationMessage, MemoryMapResult, PermissionMode, ReasoningEffort } from '../core/types';

export const VIEW_TYPE_CODEXIAN = 'codexian-view';

const CODEXIAN_LOGO = {
  viewBox: '0 0 24 24',
  path: 'M12 2.8a4.2 4.2 0 0 1 3.64 2.1 4.2 4.2 0 0 1 5.56 5.56A4.2 4.2 0 0 1 19.1 14.1a4.2 4.2 0 0 1-5.56 5.56A4.2 4.2 0 0 1 9.9 21.2a4.2 4.2 0 0 1-5.56-5.56A4.2 4.2 0 0 1 2.8 12a4.2 4.2 0 0 1 2.1-3.64A4.2 4.2 0 0 1 10.46 2.8 4.4 4.4 0 0 1 12 2.8Zm0 2.1a2.1 2.1 0 0 0-1.05.28L7.32 7.27a2.1 2.1 0 0 0-1.05 1.82v4.18a2.1 2.1 0 0 0 1.05 1.82l3.63 2.09a2.1 2.1 0 0 0 2.1 0l3.63-2.09a2.1 2.1 0 0 0 1.05-1.82V9.09a2.1 2.1 0 0 0-1.05-1.82l-3.63-2.09A2.1 2.1 0 0 0 12 4.9Zm0 3.1 3.46 2v4L12 16l-3.46-2v-4L12 8Z',
};

const CODEX_SLASH_COMMANDS = [
  { name: '/help', hint: 'Show Codex CLI help', description: 'Ask Codex CLI for available commands and usage.' },
  { name: '/init', hint: 'Create AGENTS.md', description: 'Initialize repository/vault instructions for Codex.' },
  { name: '/status', hint: 'Show session status', description: 'Ask Codex for current model, workdir, sandbox, and session state.' },
  { name: '/model', hint: 'Change model', description: 'Open or request Codex model selection if supported by the CLI surface.' },
  { name: '/approvals', hint: 'Approval mode', description: 'Open or request approval/sandbox mode selection if supported.' },
  { name: '/compact', hint: 'Compact context', description: 'Ask Codex to compact the current conversation context.' },
  { name: '/diff', hint: 'Review changes', description: 'Ask Codex to summarize current git/worktree changes.' },
  { name: '/clear', hint: 'Clear context', description: 'Ask Codex to clear or reset the active conversation context.' },
];

export class CodexianView extends ItemView {
  private plugin: CodexianPlugin;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private memoryMapEl: HTMLElement | null = null;
  private fileIndicatorEl: HTMLElement | null = null;
  private selectionIndicatorEl: HTMLElement | null = null;
  private slashDropdownEl: HTMLElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private messages: ConversationMessage[] = [];
  private relatedNotes: MemoryMapResult[] = [];
  private hiddenRelatedPaths = new Set<string>();
  private memoryMapRenderToken = 0;
  private isMemoryMapExpanded = true;
  private isRunning = false;
  private selectedSlashCommandIndex = 0;

  constructor(leaf: WorkspaceLeaf, plugin: CodexianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CODEXIAN;
  }

  getDisplayText(): string {
    return 'Codexian';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('oc-container');

    const header = container.createDiv({ cls: 'oc-header' });
    this.buildHeader(header);

    this.messagesEl = container.createDiv({ cls: 'oc-messages' });
    this.welcomeEl = this.messagesEl.createDiv({ cls: 'oc-welcome' });
    this.renderWelcome();

    const inputContainerEl = container.createDiv({ cls: 'oc-input-container' });
    this.buildInputArea(inputContainerEl);

    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.renderFileChips()));
    this.registerEvent(this.app.workspace.on('file-open', () => {
      this.relatedNotes = [];
      this.hiddenRelatedPaths.clear();
      this.renderMemoryMapPanel();
      this.renderFileChips();
    }));
    void this.renderMemoryMapPanel();
    this.renderFileChips();
  }

  async onClose(): Promise<void> {
    this.plugin.agent.cancel();
  }

  refreshContextChips(): void {
    void this.renderMemoryMapPanel();
    this.renderFileChips();
  }

  private buildHeader(header: HTMLElement): void {
    const titleContainer = header.createDiv({ cls: 'oc-title' });
    const logoEl = titleContainer.createSpan({ cls: 'oc-logo' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', CODEXIAN_LOGO.viewBox);
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CODEXIAN_LOGO.path);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    logoEl.appendChild(svg);
    titleContainer.createEl('h4', { text: 'Codexian' });

    const headerActions = header.createDiv({ cls: 'oc-header-actions' });

    const visualBtn = headerActions.createDiv({ cls: 'oc-header-btn' });
    setIcon(visualBtn, 'image');
    visualBtn.setAttribute('aria-label', 'Generate visual from note');
    visualBtn.addEventListener('click', () => void this.plugin.generateImageFromActiveNote());

    const newBtn = headerActions.createDiv({ cls: 'oc-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', () => this.createNewConversation());
  }

  private buildInputArea(inputContainerEl: HTMLElement): void {
    const inputWrapper = inputContainerEl.createDiv({ cls: 'oc-input-wrapper' });

    this.selectionIndicatorEl = inputWrapper.createDiv({ cls: 'oc-selection-indicator' });
    this.selectionIndicatorEl.style.display = 'none';

    this.memoryMapEl = inputWrapper.createDiv({ cls: 'oc-memory-map-panel' });

    this.fileIndicatorEl = inputWrapper.createDiv({ cls: 'oc-file-indicator' });

    this.inputEl = inputWrapper.createEl('textarea', {
      cls: 'oc-input',
      attr: {
        placeholder: 'How can I help you today?',
        rows: '3',
      },
    });
    this.inputEl.addEventListener('keydown', (event) => {
      if (this.handleSlashKeydown(event)) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.submit();
      }
    });
    this.inputEl.addEventListener('input', () => {
      this.autoResizeInput();
      this.renderSlashCommands();
    });
    this.inputEl.addEventListener('blur', () => {
      window.setTimeout(() => this.hideSlashCommands(), 120);
    });

    this.slashDropdownEl = inputWrapper.createDiv({ cls: 'oc-slash-dropdown' });

    const toolbar = inputWrapper.createDiv({ cls: 'oc-input-toolbar' });
    this.buildModelSelector(toolbar);
    this.buildThinkingSelector(toolbar);
    this.buildPermissionToggle(toolbar);

    const sendBtn = toolbar.createDiv({ cls: 'oc-header-btn oc-send-btn', attr: { 'aria-label': 'Send message' } });
    setIcon(sendBtn, 'send');
    sendBtn.addEventListener('click', () => void this.submit());
  }

  private buildModelSelector(parent: HTMLElement): void {
    const selector = parent.createDiv({ cls: 'oc-model-selector' });
    const button = selector.createDiv({ cls: 'oc-model-btn' });
    button.createSpan({ cls: 'oc-model-label', text: this.plugin.settings.codexModel });

    const dropdown = selector.createDiv({ cls: 'oc-model-dropdown' });
    const models = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'];
    for (const model of models) {
      const option = dropdown.createDiv({ cls: 'oc-model-option' });
      if (model === this.plugin.settings.codexModel) option.addClass('selected');
      option.createSpan({ text: model });
      option.addEventListener('click', async () => {
        this.plugin.settings.codexModel = model;
        await this.plugin.saveSettings();
        this.reopen();
      });
    }
  }

  private buildThinkingSelector(parent: HTMLElement): void {
    const selector = parent.createDiv({ cls: 'oc-thinking-selector' });
    selector.createSpan({ cls: 'oc-thinking-label-text', text: 'Thinking:' });
    const gears = selector.createDiv({ cls: 'oc-thinking-gears' });
    gears.createDiv({ cls: 'oc-thinking-current', text: this.plugin.settings.reasoningEffort });
    const options = gears.createDiv({ cls: 'oc-thinking-options' });
    const efforts: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
    for (const effort of efforts) {
      const option = options.createDiv({ cls: 'oc-thinking-gear', text: effort });
      if (effort === this.plugin.settings.reasoningEffort) option.addClass('selected');
      option.addEventListener('click', async () => {
        this.plugin.settings.reasoningEffort = effort;
        await this.plugin.saveSettings();
        this.reopen();
      });
    }
  }

  private buildPermissionToggle(parent: HTMLElement): void {
    const toggle = parent.createDiv({ cls: 'oc-permission-toggle' });
    const label = toggle.createSpan({ cls: 'oc-permission-label' });
    const switchEl = toggle.createDiv({ cls: 'oc-toggle-switch' });
    this.updatePermissionToggle(label, switchEl);
    toggle.addEventListener('click', async () => {
      this.plugin.settings.permissionMode = this.nextPermissionMode(this.plugin.settings.permissionMode);
      await this.plugin.saveSettings();
      this.updatePermissionToggle(label, switchEl);
    });
  }

  private updatePermissionToggle(label: HTMLElement, switchEl: HTMLElement): void {
    const mode = this.plugin.settings.permissionMode;
    switchEl.toggleClass('active', mode === 'auto' || mode === 'yolo');
    label.setText(mode === 'review' ? 'Safe' : mode === 'auto' ? 'AUTO' : 'Yolo');
  }

  private nextPermissionMode(mode: PermissionMode): PermissionMode {
    if (mode === 'review') return 'auto';
    if (mode === 'auto') return 'yolo';
    return 'review';
  }

  private renderWelcome(): void {
    if (!this.welcomeEl) return;
    this.welcomeEl.empty();
    this.welcomeEl.createDiv({ cls: 'oc-welcome-greeting', text: 'How can I help you today?' });
  }

  private async renderMemoryMapPanel(): Promise<void> {
    if (!this.memoryMapEl) return;
    const renderToken = ++this.memoryMapRenderToken;

    const status = await this.plugin.getMemoryMapStatus();
    if (renderToken !== this.memoryMapRenderToken || !this.memoryMapEl) return;

    this.memoryMapEl.empty();
    this.memoryMapEl.toggleClass('is-collapsed', !this.isMemoryMapExpanded);
    const header = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-header' });
    const title = header.createDiv({ cls: 'oc-memory-map-title' });
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', String(this.isMemoryMapExpanded));
    title.addEventListener('click', async () => {
      this.isMemoryMapExpanded = !this.isMemoryMapExpanded;
      await this.renderMemoryMapPanel();
    });
    setIcon(title.createSpan({ cls: 'oc-memory-map-toggle' }), this.isMemoryMapExpanded ? 'chevron-down' : 'chevron-right');
    setIcon(title.createSpan({ cls: 'oc-memory-map-icon' }), 'network');
    title.createSpan({ text: status.built ? `Memory Map · ${status.count} notes` : 'Memory Map not built' });

    const actions = header.createDiv({ cls: 'oc-memory-map-actions' });
    if (this.relatedNotes.length > 0) {
      const clearBtn = actions.createEl('button', { cls: 'oc-memory-map-btn', text: 'Clear' });
      clearBtn.addEventListener('click', async () => {
        this.relatedNotes = [];
        this.hiddenRelatedPaths.clear();
        await this.renderMemoryMapPanel();
      });
    }

    const buildBtn = actions.createEl('button', { cls: 'oc-memory-map-btn', text: status.built ? 'Rebuild' : 'Build Memory Map' });
    buildBtn.addEventListener('click', async () => {
      buildBtn.setText('Building...');
      await this.plugin.buildMemoryMap();
      await this.renderMemoryMapPanel();
    });

    const findBtn = actions.createEl('button', { cls: 'oc-memory-map-btn oc-memory-map-primary', text: 'Find Context' });
    findBtn.disabled = !Boolean(this.plugin.getActiveMarkdownFile());
    findBtn.addEventListener('click', async () => {
      findBtn.setText('Finding...');
      this.relatedNotes = await this.plugin.findRelatedNotes();
      this.hiddenRelatedPaths.clear();
      this.isMemoryMapExpanded = true;
      await this.renderMemoryMapPanel();
    });

    if (!this.isMemoryMapExpanded) return;

    const visibleResults = this.relatedNotes.filter((result) => !this.hiddenRelatedPaths.has(result.path));
    if (visibleResults.length === 0) {
      const hint = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-hint' });
      hint.setText(status.built ? 'Click Find Context to recommend related notes.' : 'Build once, then find related notes from this vault.');
      return;
    }

    const list = this.memoryMapEl.createDiv({ cls: 'oc-memory-map-results' });
    for (const result of visibleResults) {
      this.createRelatedNoteChip(list, result);
    }
  }

  private createRelatedNoteChip(parent: HTMLElement, result: MemoryMapResult): void {
    const chip = parent.createDiv({ cls: 'oc-memory-chip' });
    chip.addEventListener('click', () => void this.openNote(result.path));

    const name = chip.createSpan({ cls: 'oc-memory-chip-name', text: result.title });
    name.setAttribute('title', result.path);
    chip.createSpan({ cls: 'oc-memory-chip-reason', text: result.reasons[0] || `score ${result.score}` });

    const tooltip = chip.createDiv({ cls: 'oc-memory-chip-tooltip' });
    tooltip.createDiv({ cls: 'oc-memory-tooltip-title', text: result.title });
    tooltip.createDiv({ cls: 'oc-memory-tooltip-path', text: result.path });
    const reasons = tooltip.createDiv({ cls: 'oc-memory-tooltip-reasons' });
    if (result.reasons.length > 0) {
      for (const reason of result.reasons) {
        reasons.createDiv({ cls: 'oc-memory-tooltip-reason', text: reason });
      }
    } else {
      reasons.createDiv({ cls: 'oc-memory-tooltip-reason', text: '규칙 기반 점수로 추천됨' });
    }
    tooltip.createDiv({ cls: 'oc-memory-tooltip-score', text: `Relevance score ${result.score}` });

    const add = chip.createSpan({ cls: 'oc-memory-chip-action' });
    setIcon(add, 'plus');
    add.setAttribute('aria-label', 'Add note to Codexian context');
    add.setAttribute('title', 'Add to context');
    add.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.pinNote(result.path);
      this.renderFileChips();
      new Notice(`Added context: ${result.title}`);
    });

    const hide = chip.createSpan({ cls: 'oc-memory-chip-action' });
    setIcon(hide, 'x');
    hide.setAttribute('aria-label', 'Hide recommendation');
    hide.setAttribute('title', 'Hide this recommendation');
    hide.addEventListener('click', async (event) => {
      event.stopPropagation();
      this.hiddenRelatedPaths.add(result.path);
      await this.renderMemoryMapPanel();
    });
  }

  private renderFileChips(): void {
    if (!this.fileIndicatorEl) return;
    this.fileIndicatorEl.empty();

    const activeFile = this.plugin.getActiveMarkdownFile();
    if (activeFile && !this.plugin.isNoteExcluded(activeFile.path)) {
      this.createFileChip(activeFile.path, {
        current: this.plugin.settings.autoIncludeActiveNote,
        pinned: this.plugin.isNotePinned(activeFile.path),
      });
    }

    for (const pinnedPath of this.plugin.settings.pinnedNotePaths) {
      if (pinnedPath === activeFile?.path) continue;
      if (this.plugin.isNoteExcluded(pinnedPath)) continue;
      this.createFileChip(pinnedPath, { pinned: true });
    }

    const hasChips = this.fileIndicatorEl.children.length > 0;
    this.fileIndicatorEl.style.display = hasChips ? 'flex' : 'none';
  }

  private createFileChip(filePath: string, options: { current?: boolean; pinned?: boolean }): void {
    if (!this.fileIndicatorEl) return;
    const chip = this.fileIndicatorEl.createDiv({ cls: 'oc-file-chip' });
    if (options.pinned) {
      chip.addClass('oc-file-chip-pinned');
    } else if (options.current) {
      chip.addClass('oc-file-chip-current');
    } else {
      chip.addClass('oc-file-chip-attached');
    }

    const icon = chip.createSpan({ cls: 'oc-file-chip-icon' });
    setIcon(icon, 'file-text');
    const normalizedPath = filePath.replace(/\\/g, '/');
    const filename = normalizedPath.split('/').pop() || filePath;
    const name = chip.createSpan({ cls: 'oc-file-chip-name', text: filename });
    name.setAttribute('title', options.current ? `Current: ${filePath}` : filePath);

    const pin = chip.createSpan({ cls: 'oc-file-chip-pin' });
    setIcon(pin, options.pinned ? 'pin-off' : 'pin');
    pin.setAttribute('aria-label', options.pinned ? 'Unpin note' : 'Pin note');
    pin.setAttribute('title', options.pinned ? 'Pinned - click to unpin' : 'Click to pin this note');
    pin.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (this.plugin.isNotePinned(filePath)) await this.plugin.unpinNote(filePath);
      else await this.plugin.pinNote(filePath);
      this.renderFileChips();
    });

    const remove = chip.createSpan({ cls: 'oc-file-chip-remove' });
    setIcon(remove, 'x');
    remove.setAttribute('aria-label', 'Remove note from Codexian context');
    remove.setAttribute('title', 'Remove this note from the chat context');
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.plugin.excludeNote(filePath);
      this.renderFileChips();
    });

    chip.addEventListener('click', () => void this.openNote(filePath));
  }

  private async openNote(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !('extension' in file)) return;
    await this.app.workspace.getLeaf(false).openFile(file as TFile);
  }

  private createNewConversation(): void {
    this.plugin.agent.cancel();
    this.plugin.agent.resetSession();
    this.messages = [];
    this.messagesEl?.empty();
    this.welcomeEl = this.messagesEl?.createDiv({ cls: 'oc-welcome' }) || null;
    this.renderWelcome();
  }

  private reopen(): void {
    const leaf = this.leaf;
    void leaf.setViewState({ type: VIEW_TYPE_CODEXIAN, active: true });
  }

  private autoResizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = 'auto';
    this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 200)}px`;
  }

  private handleSlashKeydown(event: KeyboardEvent): boolean {
    if (!this.slashDropdownEl?.hasClass('visible')) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedSlashCommandIndex = Math.min(this.selectedSlashCommandIndex + 1, this.getFilteredSlashCommands().length - 1);
      this.renderSlashCommands();
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSlashCommandIndex = Math.max(this.selectedSlashCommandIndex - 1, 0);
      this.renderSlashCommands();
      return true;
    }

    if (event.key === 'Tab' || event.key === 'Enter') {
      const command = this.getFilteredSlashCommands()[this.selectedSlashCommandIndex];
      if (command) {
        event.preventDefault();
        this.insertSlashCommand(command.name);
        return true;
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideSlashCommands();
      return true;
    }

    return false;
  }

  private getSlashQuery(): string | null {
    if (!this.inputEl) return null;
    const value = this.inputEl.value;
    const cursor = this.inputEl.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    if (!beforeCursor.startsWith('/')) return null;
    if (beforeCursor.includes('\n')) return null;
    if (beforeCursor.includes(' ')) return null;
    return beforeCursor.toLowerCase();
  }

  private getFilteredSlashCommands(): typeof CODEX_SLASH_COMMANDS {
    const query = this.getSlashQuery();
    if (query === null) return [];
    return CODEX_SLASH_COMMANDS.filter((command) => command.name.startsWith(query));
  }

  private renderSlashCommands(): void {
    if (!this.slashDropdownEl) return;
    const commands = this.getFilteredSlashCommands();
    this.slashDropdownEl.empty();

    if (commands.length === 0) {
      this.hideSlashCommands();
      return;
    }

    this.selectedSlashCommandIndex = Math.min(this.selectedSlashCommandIndex, commands.length - 1);
    this.slashDropdownEl.addClass('visible');

    for (const [index, command] of commands.entries()) {
      const item = this.slashDropdownEl.createDiv({ cls: 'oc-slash-item' });
      if (index === this.selectedSlashCommandIndex) item.addClass('selected');
      item.createSpan({ cls: 'oc-slash-name', text: command.name });
      item.createSpan({ cls: 'oc-slash-hint', text: command.hint });
      item.createDiv({ cls: 'oc-slash-desc', text: command.description });
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.insertSlashCommand(command.name);
      });
    }
  }

  private insertSlashCommand(command: string): void {
    if (!this.inputEl) return;
    this.inputEl.value = `${command} `;
    this.inputEl.focus();
    this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    this.autoResizeInput();
    this.hideSlashCommands();
  }

  private hideSlashCommands(): void {
    this.slashDropdownEl?.removeClass('visible');
    this.selectedSlashCommandIndex = 0;
  }

  private async submit(): Promise<void> {
    if (!this.inputEl || this.isRunning) return;
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;

    this.inputEl.value = '';
    this.autoResizeInput();
    this.isRunning = true;
    this.appendMessage({ role: 'user', content: prompt, timestamp: Date.now() });

    try {
      const context = await this.plugin.getActiveNoteContext();
      let assistantBuffer = '';
      const assistantEl = this.createMessageEl('assistant');
      const progressEl = assistantEl.createDiv({ cls: 'oc-thinking' });
      progressEl.createSpan({ text: 'Codex is working' });
      const progressHintEl = progressEl.createSpan({ text: ' · starting...', cls: 'oc-thinking-hint' });
      const contentEl = assistantEl.createDiv({ cls: 'oc-message-content' });

      for await (const event of this.plugin.agent.query({
        prompt,
        cwd: this.plugin.getVaultPath(),
        activeNotePath: context?.path,
        activeNoteContent: context?.content,
        selectedText: context?.selection,
        pinnedNotes: context?.pinnedNotes,
      })) {
        if (event.type === 'text') {
          assistantBuffer += event.content;
          progressEl.remove();
          await this.renderMarkdown(assistantBuffer, contentEl);
        } else if (event.type === 'progress') {
          progressHintEl.setText(` · ${event.content}`);
        } else if (event.type === 'error') {
          progressEl.remove();
          this.appendMessage({ role: 'error', content: event.content, timestamp: Date.now() });
        }
      }

      progressEl.remove();

      if (assistantBuffer.trim()) {
        this.messages.push({ role: 'assistant', content: assistantBuffer, timestamp: Date.now() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      this.appendMessage({ role: 'error', content: message, timestamp: Date.now() });
    } finally {
      this.isRunning = false;
    }
  }

  private appendMessage(message: ConversationMessage): void {
    this.messages.push(message);
    const el = this.createMessageEl(message.role);
    const content = el.createDiv({ cls: 'oc-message-content' });
    if (message.role === 'assistant') {
      void this.renderMarkdown(message.content, content);
    } else {
      content.setText(message.content);
    }
  }

  private createMessageEl(role: ConversationMessage['role']): HTMLElement {
    if (this.welcomeEl) {
      this.welcomeEl.remove();
      this.welcomeEl = null;
    }
    const className = role === 'user'
      ? 'oc-message oc-message-user'
      : role === 'error'
        ? 'oc-message oc-message-assistant oc-message-error'
        : 'oc-message oc-message-assistant';
    const el = this.messagesEl!.createDiv({ cls: className });
    this.messagesEl!.scrollTop = this.messagesEl!.scrollHeight;
    return el;
  }

  private async renderMarkdown(markdown: string, el: HTMLElement): Promise<void> {
    el.empty();
    await MarkdownRenderer.renderMarkdown(markdown, el, '', this);
    if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
