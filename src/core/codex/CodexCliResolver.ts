import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function isFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function pathEntries(pathValue?: string): string[] {
  return (pathValue || process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith(`~${path.sep}`)) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function findCodexCli(customPath?: string, pathValue?: string): string | null {
  const custom = (customPath || '').trim();
  if (custom && isFile(expandHome(custom))) return expandHome(custom);

  const names = process.platform === 'win32'
    ? ['codex.exe', 'codex.cmd', 'codex.ps1', 'codex']
    : ['codex'];

  for (const entry of pathEntries(pathValue)) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (isFile(candidate)) return candidate;
    }
  }

  const home = os.homedir();
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm', 'codex.cmd'),
        path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm', 'codex.exe'),
      ]
    : [
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
        path.join(home, '.npm-global', 'bin', 'codex'),
      ];

  return candidates.find(isFile) || null;
}

export function getShellCommand(command: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] };
  }
  return { command: '/bin/zsh', args: ['-lc', command] };
}

