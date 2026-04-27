export function parseEnvironmentVariables(input: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

export function buildProcessEnv(input: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...parseEnvironmentVariables(input),
  };
}
