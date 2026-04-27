import { spawn, type ChildProcess } from 'child_process';

import type { AgentEvent, AgentProvider, AgentQuery, CodexianSettings } from '../types';
import { buildProcessEnv } from '../settings/env';
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

    const prompt = this.buildPrompt(input);
    const args = [
      'exec',
      '--color',
      'never',
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

    yield* this.runProcess(codexPath, args, env, prompt);
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

    parts.push('\n\nYou are running inside an Obsidian vault. Keep edits vault-scoped unless the user explicitly requests otherwise.');
    return parts.join('');
  }

  private async *runProcess(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdin: string
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
    let done = false;

    child.stdout.on('data', (chunk: Buffer) => {
      queue.push({ type: 'text', content: chunk.toString() });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      queue.push({ type: 'text', content: chunk.toString() });
    });
    child.on('error', (error) => {
      queue.push({ type: 'error', content: error.message });
      done = true;
    });
    child.on('close', (code) => {
      if (code && code !== 0) {
        queue.push({ type: 'error', content: `Codex exited with code ${code}.` });
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

    this.currentProcess = null;
  }
}
