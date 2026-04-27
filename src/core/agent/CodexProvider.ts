import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, AgentProvider, AgentQuery, CodexianSettings } from '../types';
import { buildProcessEnv, mergePath } from '../settings/env';
import { findCodexCli } from '../codex/CodexCliResolver';

export class CodexProvider implements AgentProvider {
  private settings: () => CodexianSettings;
  private currentProcess: ChildProcess | null = null;
  private sessionId: string | null = null;

  constructor(settings: () => CodexianSettings) {
    this.settings = settings;
  }

  async *query(input: AgentQuery): AsyncGenerator<AgentEvent> {
    const settings = this.settings();
    const env = buildProcessEnv(settings.environmentVariables);
    const codexPath = findCodexCli(settings.codexCliPath, env.PATH);

    if (!codexPath) {
      yield {
        type: 'error',
        content: 'Codex CLI not found. Install @openai/codex or set the Codex CLI path in settings.',
      };
      yield { type: 'done' };
      return;
    }
    env.PATH = mergePath(env.PATH, [path.dirname(codexPath)]);

    const prompt = this.buildPrompt(input);
    const outputPath = path.join(
      os.tmpdir(),
      `codexian-last-message-${Date.now()}-${Math.random().toString(36).slice(2)}.md`
    );
    const args = [
      'exec',
      '--color',
      'never',
      '--output-last-message',
      outputPath,
      '--skip-git-repo-check',
      '--cd',
      input.cwd,
      '--model',
      settings.codexModel,
      '--config',
      `model_reasoning_effort="${settings.reasoningEffort}"`,
      '-',
    ];

    if (settings.permissionMode === 'yolo') {
      args.splice(1, 0, '--dangerously-bypass-approvals-and-sandbox');
    } else if (settings.permissionMode === 'auto') {
      args.splice(1, 0, '--full-auto');
    } else {
      args.splice(1, 0, '--sandbox', 'workspace-write');
    }

    yield* this.runProcess(codexPath, args, env, prompt, outputPath);
    yield { type: 'done' };
  }

  cancel(): void {
    this.currentProcess?.kill();
    this.currentProcess = null;
  }

  resetSession(): void {
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(id: string | null): void {
    this.sessionId = id;
  }

  private buildPrompt(input: AgentQuery): string {
    const parts: string[] = [];
    parts.push(input.prompt);

    if (input.activeNotePath && input.activeNoteContent) {
      parts.push(`\n\nActive Obsidian note: ${input.activeNotePath}\n\n${input.activeNoteContent}`);
    }

    if (input.selectedText) {
      parts.push(`\n\nSelected text:\n${input.selectedText}`);
    }

    if (input.pinnedNotes && input.pinnedNotes.length > 0) {
      const pinned = input.pinnedNotes
        .map((note) => `Pinned Obsidian note: ${note.path}\n\n${note.content}`)
        .join('\n\n---\n\n');
      parts.push(`\n\nPinned context notes:\n${pinned}`);
    }

    parts.push('\n\nYou are running inside an Obsidian vault. Keep edits vault-scoped unless the user explicitly requests otherwise.');
    return parts.join('');
  }

  private async *runProcess(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdin: string,
    outputPath: string
  ): AsyncGenerator<AgentEvent> {
    const child = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    this.currentProcess = child;
    child.stdin?.end(stdin);

    const queue: AgentEvent[] = [];
    let stderrBuffer = '';
    let done = false;
    let exitCode: number | null = null;

    child.stdout.on('data', (chunk: Buffer) => {
      // Codex CLI stdout includes session headers, hook logs, token reports, and
      // sometimes the final answer. The UI reads only --output-last-message.
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });
    child.on('error', (error) => {
      queue.push({ type: 'error', content: error.message });
      done = true;
    });
    child.on('close', (code) => {
      exitCode = code;
      if (code && code !== 0) {
        const pathHint = code === 127
          ? `\n\nCommand-not-found hint: Obsidian may not have the same PATH as your terminal. Current PATH passed to Codexian:\n${env.PATH || '(empty)'}`
          : '';
        const details = stderrBuffer.trim() ? `\n\n${stderrBuffer.trim()}` : '';
        queue.push({ type: 'error', content: `Codex exited with code ${code}.${pathHint}${details}` });
      }
      done = true;
    });

    while (!done || queue.length > 0) {
      const event = queue.shift();
      if (event) {
        yield event;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }

    if (exitCode === 0) {
      const finalMessage = this.readLastMessage(outputPath);
      if (finalMessage) {
        yield { type: 'text', content: finalMessage };
      } else if (stderrBuffer.trim()) {
        yield { type: 'error', content: stderrBuffer.trim() };
      }
    }

    this.removeTempFile(outputPath);
    this.currentProcess = null;
  }

  private readLastMessage(outputPath: string): string {
    try {
      return fs.readFileSync(outputPath, 'utf8').trim();
    } catch {
      return '';
    }
  }

  private removeTempFile(outputPath: string): void {
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
