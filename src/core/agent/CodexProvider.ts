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
    const rawPrompt = input.prompt.trim();
    if (rawPrompt.startsWith('/')) {
      return rawPrompt;
    }

    const parts: string[] = [];
    parts.push('You are running inside an Obsidian vault. Keep edits vault-scoped unless the user explicitly requests otherwise.');
    parts.push('\n\nUse the provided Obsidian note context whenever the user refers to "this note", "current note", "이 노트", "현재 노트", or asks to summarize/analyze the note.');

    if (input.activeNotePath && input.activeNoteContent) {
      parts.push(`\n\n<active_obsidian_note path="${input.activeNotePath}">\n${input.activeNoteContent}\n</active_obsidian_note>`);
    }

    if (input.selectedText) {
      parts.push(`\n\n<selected_text>\n${input.selectedText}\n</selected_text>`);
    }

    if (input.pinnedNotes && input.pinnedNotes.length > 0) {
      const pinned = input.pinnedNotes
        .map((note) => `<pinned_obsidian_note path="${note.path}">\n${note.content}\n</pinned_obsidian_note>`)
        .join('\n\n---\n\n');
      parts.push(`\n\n<pinned_context_notes>\n${pinned}\n</pinned_context_notes>`);
    }

    parts.push(`\n\n<user_request>\n${input.prompt}\n</user_request>`);
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
    let stdoutBuffer = '';
    let lastProgress = '';
    let stderrBuffer = '';
    let done = false;
    let exitCode: number | null = null;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const progress = this.formatProgressLine(line);
        if (progress && progress !== lastProgress) {
          lastProgress = progress;
          queue.push({ type: 'progress', content: progress });
        }
      }
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

  private formatProgressLine(line: string): string {
    const cleaned = line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').trim();
    if (!cleaned) return '';
    if (/^user$/i.test(cleaned) || /^codex$/i.test(cleaned)) return '';
    if (/^[┌└├│─╭╰]/.test(cleaned)) return '';
    if (/^(•|-) /i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^tokens used\b/i.test(cleaned)) return cleaned;
    if (/^OpenAI Codex\b/i.test(cleaned)) return cleaned;
    if (/^workdir:/i.test(cleaned)) return cleaned;
    if (/^model:/i.test(cleaned)) return cleaned;
    if (/^approval:/i.test(cleaned)) return cleaned;
    if (/^sandbox:/i.test(cleaned)) return cleaned;
    if (/^session id:/i.test(cleaned)) return cleaned;
    if (/^hook:/i.test(cleaned)) return cleaned;
    if (/\bERROR\b/.test(cleaned)) return cleaned;
    if (/^(read|write|edit|apply|patch|search|run|exec|open|thinking|reasoning|update|create|delete|move|list|find|scan|inspect|build|test|verify|commit|tag|push|install|copy|generate|embed)\b/i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^(reading|writing|editing|applying|searching|running|executing|opening|creating|deleting|moving|listing|finding|scanning|inspecting|building|testing|verifying|committing|tagging|pushing|installing|copying|generating|embedding)\b/i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^(rg|sed|cat|ls|git|npm|node|tsc|mkdir|cp|mv|python|python3|gh|codex)\b/i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^[A-Za-z0-9_./~-]+\.(ts|tsx|js|jsx|css|json|md|svg|png|yml|yaml):?\d*/.test(cleaned)) return cleaned.slice(0, 240);
    return '';
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
