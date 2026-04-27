import { execFile } from 'child_process';
import { promisify } from 'util';

import { getShellCommand } from '../codex/CodexCliResolver';
import { buildProcessEnv } from '../settings/env';

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  label: string;
  ok: boolean;
  detail: string;
}

async function run(commandText: string, envText: string): Promise<{ ok: boolean; output: string }> {
  const shell = getShellCommand(commandText);
  try {
    const { stdout, stderr } = await execFileAsync(shell.command, shell.args, {
      env: buildProcessEnv(envText),
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, output: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`.trim() };
  }
}

export async function probeEnvironment(envText: string): Promise<ProbeResult[]> {
  const checks: Array<[string, string]> = [
    ['Node.js', 'node --version'],
    ['npm', 'npm --version'],
    ['Codex CLI', 'codex --version'],
    ['Codex auth', 'codex login status'],
    ['oh-my-codex', 'omx --version'],
    ['OMX doctor', 'omx doctor'],
  ];

  const results: ProbeResult[] = [];
  for (const [label, command] of checks) {
    const result = await run(command, envText);
    results.push({
      label,
      ok: result.ok,
      detail: result.output || (result.ok ? 'OK' : 'No output'),
    });
  }
  return results;
}

