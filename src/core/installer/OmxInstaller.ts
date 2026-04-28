import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getShellCommand } from '../codex/CodexCliResolver';
import { buildProcessEnv } from '../settings/env';

export type InstallLog = (line: string) => void;

function installCommand(): string {
  return 'npm install -g @openai/codex oh-my-codex';
}

function codexUpdateCommand(): string {
  return 'npm install -g @openai/codex@latest';
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

export function getCodexUpdatePreview(): string {
  return [
    codexUpdateCommand(),
    'codex --version',
    'codex features enable image_generation',
    'codex features list',
  ].join('\n');
}

export function getObsidianSkillsPreview(): string {
  return [
    'git clone --depth 1 https://github.com/kepano/obsidian-skills.git',
    `copy skills/* -> ${path.join(os.homedir(), '.codex', 'skills')}`,
    'restart Codex/Codexian sessions to load the new skills',
  ].join('\n');
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

async function runExecutable(command: string, args: string[], envText: string, log: InstallLog): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(command, args, {
      env: buildProcessEnv(envText),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (chunk) => log(chunk.toString()));
    child.stderr?.on('data', (chunk) => log(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
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

export async function updateCodexCli(envText: string, log: InstallLog): Promise<void> {
  log(`$ ${codexUpdateCommand()}\n`);
  await run(codexUpdateCommand(), envText, log);
  log('\n$ codex --version\n');
  await run('codex --version', envText, log);
}

export async function enableCodexImageGeneration(envText: string, log: InstallLog): Promise<void> {
  log('$ codex features enable image_generation\n');
  await run('codex features enable image_generation', envText, log);
  log('\n$ codex features list\n');
  await run('codex features list', envText, log);
}

export async function installOrUpdateObsidianSkills(envText: string, log: InstallLog): Promise<void> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codexian-obsidian-skills-'));
  const repoDir = path.join(tempRoot, 'obsidian-skills');
  const sourceSkillsDir = path.join(repoDir, 'skills');
  const targetSkillsDir = path.join(os.homedir(), '.codex', 'skills');

  try {
    log('$ git clone --depth 1 https://github.com/kepano/obsidian-skills.git\n');
    await runExecutable('git', ['clone', '--depth', '1', 'https://github.com/kepano/obsidian-skills.git', repoDir], envText, log);

    if (!fs.existsSync(sourceSkillsDir)) {
      throw new Error(`obsidian-skills repository did not contain a skills directory: ${sourceSkillsDir}`);
    }

    fs.mkdirSync(targetSkillsDir, { recursive: true });
    const entries = fs.readdirSync(sourceSkillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const entry of entries) {
      const source = path.join(sourceSkillsDir, entry.name);
      const target = path.join(targetSkillsDir, entry.name);
      log(`\nCopying ${entry.name} -> ${target}\n`);
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true, force: true });
    }

    log(`\nInstalled ${entries.length} Obsidian skills into ${targetSkillsDir}\n`);
    log('Restart active Codex/Codexian sessions so the new skills are discovered.\n');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
