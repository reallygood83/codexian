import { execFile } from 'child_process';

import { getShellCommand } from '../codex/CodexCliResolver';
import { buildProcessEnv } from '../settings/env';

export type InstallLog = (line: string) => void;

function installCommand(): string {
  return 'npm install -g @openai/codex oh-my-codex';
}

export function getInstallPreview(): string {
  const lines = [
    installCommand(),
    'omx setup',
    'omx doctor',
  ];
  if (process.platform === 'win32') {
    lines.unshift('# PowerShell');
    lines.push('# Windows team runtime may require psmux; WSL remains an advanced fallback.');
  } else {
    lines.unshift('# macOS/Linux shell');
    lines.push('# tmux is recommended for durable OMX team workflows.');
  }
  return lines.join('\n');
}

async function run(commandText: string, envText: string, log: InstallLog): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const shell = getShellCommand(commandText);
    const child = execFile(shell.command, shell.args, {
      env: buildProcessEnv(envText),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
    });

    child.stdout?.on('data', (chunk) => log(chunk.toString()));
    child.stderr?.on('data', (chunk) => log(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${commandText} exited with code ${code}`));
    });
  });
}

export async function installOrUpdateOmx(envText: string, log: InstallLog): Promise<void> {
  log(`$ ${installCommand()}\n`);
  await run(installCommand(), envText, log);
  log('\n$ omx setup\n');
  await run('omx setup', envText, log);
  log('\n$ omx doctor\n');
  await run('omx doctor', envText, log);
}

