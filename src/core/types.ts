export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type PermissionMode = 'review' | 'auto' | 'yolo';
export type ImageMode = 'infographic' | 'poster' | 'cartoon' | 'concept' | 'diagram';
export type VisualOutputType = 'png' | 'svg';

export interface MemoryMapEntry {
  path: string;
  title: string;
  folder: string;
  tags: string[];
  links: string[];
  headings: string[];
  keywords: string[];
  terms: Record<string, number>;
  length: number;
  mtime: number;
}

export interface MemoryMapIndex {
  version: 2;
  builtAt: number;
  entries: MemoryMapEntry[];
}

export interface MemoryMapResult {
  path: string;
  title: string;
  score: number;
  reasons: string[];
}

export interface CodexianSettings {
  codexCliPath: string;
  codexModel: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  autoIncludeActiveNote: boolean;
  pinnedNotePaths: string[];
  excludedNotePaths: string[];
  environmentVariables: string;
  mediaFolder: string;
  omx: {
    enabled: boolean;
    lastDoctorStatus: 'unknown' | 'pass' | 'warn' | 'fail';
    lastCheckedAt: number | null;
  };
  blockedCommands: {
    unix: string[];
    windows: string[];
  };
  allowedExportPaths: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: number;
}

export interface AgentQuery {
  prompt: string;
  cwd: string;
  activeNotePath?: string;
  activeNoteContent?: string;
  selectedText?: string;
  pinnedNotes?: Array<{ path: string; content: string }>;
}

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'progress'; content: string }
  | { type: 'error'; content: string }
  | { type: 'done' };

export interface AgentProvider {
  query(input: AgentQuery): AsyncGenerator<AgentEvent>;
  cancel(): void;
  resetSession(): void;
  getSessionId(): string | null;
  setSessionId(id: string | null): void;
}

export const DEFAULT_SETTINGS: CodexianSettings = {
  codexCliPath: '',
  codexModel: 'gpt-5.5',
  reasoningEffort: 'high',
  permissionMode: 'review',
  autoIncludeActiveNote: true,
  pinnedNotePaths: [],
  excludedNotePaths: [],
  environmentVariables: '',
  mediaFolder: 'attachments/codexian',
  omx: {
    enabled: false,
    lastDoctorStatus: 'unknown',
    lastCheckedAt: null,
  },
  blockedCommands: {
    unix: ['rm -rf', 'chmod 777', 'chmod -R 777'],
    windows: ['Remove-Item -Recurse -Force', 'rd /s /q', 'del /s /q', 'format', 'diskpart'],
  },
  allowedExportPaths: [],
};
