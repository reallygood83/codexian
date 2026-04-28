# Codexian

OpenAI Codex and oh-my-codex setup inside Obsidian, with no API key required for core use.

<p align="center">
  <a href="https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v">
    <img alt="YouTube: 배움의 달인" src="https://img.shields.io/badge/YouTube-%EB%B0%B0%EC%9B%80%EC%9D%98%20%EB%8B%AC%EC%9D%B8-FF0000?style=for-the-badge&logo=youtube&logoColor=white">
  </a>
  <a href="https://x.com/reallygood83">
    <img alt="X: @reallygood83" src="https://img.shields.io/badge/X-@reallygood83-000000?style=for-the-badge&logo=x&logoColor=white">
  </a>
</p>

Codexian is a desktop-only Obsidian plugin that brings OpenAI Codex into your vault as a sidebar agent. It is designed for note-aware coding, writing, refactoring, local automation, and visual SVG asset generation from your Obsidian notes.

## Features

- **Codex sidebar**: Ask Codex to work with your vault from an Obsidian-native chat panel.
- **Current-note context**: Active note content and selected text are automatically attached to prompts.
- **Pinned note context**: Pin important notes so they stay attached even when you switch files.
- **Attach current note command**: Use Obsidian's hotkey settings to bind `Codexian: Attach current note to chat`.
- **Fast composer UX**: Press Enter to send, or Shift+Enter for a new line.
- **ObsidianCode legacy UI**: The chat shell, message bubbles, input box, toolbar, note chips, and stylesheet are carried from ObsidianCode's `.oc-*` legacy.
- **Clean Codex replies**: Codexian reads Codex's final response from `--output-last-message` so session headers, hooks, and token logs stay out of the chat.
- **Vault working directory**: Codex runs with the vault as its working root.
- **Permission modes**: Review, Auto, and Yolo modes map to Codex sandbox behavior.
- **No API key for core use**: Codexian uses your authenticated Codex CLI session, like ObsidianCode uses Claude Code CLI.
- **Codex visual assets**: Generate SVG infographics, posters, cartoons, concept-art boards, or diagram-like illustrations from note context.
- **Automatic visual embedding**: Generated SVG files are saved into the configured attachment folder and embedded with `![[...]]`.
- **oh-my-codex setup**: Settings include diagnostics and an install/update flow for Codex CLI plus OMX.
- **macOS and Windows aware**: CLI detection, diagnostics, and command previews adapt by platform.

## Why Codexian?

Obsidian is where many people keep their project notes, research, drafts, and plans. Codexian makes that vault directly actionable: Codex can read the note you are working on, reason over it, and help transform it into code, structured writing, or generated visual assets.

The plugin also gives power users a path into [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex), while keeping basic Codex usage independent from OMX.

## Requirements

- Obsidian desktop.
- Node.js 20+.
- OpenAI Codex CLI installed and authenticated.
- Optional: oh-my-codex for OMX workflows.

Recommended CLI setup:

```bash
npm install -g @openai/codex oh-my-codex
codex login
omx setup
omx doctor
```

On Windows, use PowerShell. If advanced OMX team runtime features are unstable natively, WSL remains a practical fallback.

## Installation For Development

```bash
npm install
npm run build
```

Copy these files into your vault:

```text
<vault>/.obsidian/plugins/codexian/
  main.js
  manifest.json
  styles.css
```

Then enable **Codexian** in Obsidian settings.

## Installing With BRAT

Codexian is intended to support BRAT installation from GitHub releases.

1. Install **Obsidian42 - BRAT** from Obsidian Community Plugins.
2. Open BRAT settings.
3. Click **Add Beta Plugin**.
4. Paste the Codexian GitHub repository URL:

```text
https://github.com/reallygood83/codexian
```

5. Enable **Codexian** in Obsidian Community Plugins.

For BRAT to work, each GitHub release must include these assets:

- `main.js`
- `manifest.json`
- `styles.css`

This repository includes a release workflow that builds and uploads those assets when a tag matching the manifest version is pushed, for example:

```bash
git tag 0.1.0
git push origin 0.1.0
```

## Configuration

Open Obsidian Settings → Community plugins → Codexian.

- Set `Codex CLI path` only if auto-detection fails.
- Codexian auto-detects common macOS, Windows, Homebrew, npm, and NVM Codex paths and can store the detected path for you.
- Add `PATH` under environment variables only if Obsidian cannot find `codex`, `npm`, or `omx`.
- Choose your Codex model and reasoning effort.
- Run diagnostics before using the one-click OMX installer.
- Keep `Review` permission mode until you trust the current vault workflow.

## Visual Generation

Use the command **Generate visual asset from active note** or the sidebar button.

Codexian can generate:

- Infographics
- Posters
- Cartoons
- Concept art
- Diagram-like illustrations

The generated SVG is created by Codex CLI, saved to the configured media folder, and appended to the active note as an Obsidian embed.

This is intentionally not an OpenAI Images API integration. Codexian is designed to work from your Codex CLI subscription/login without requiring separate API billing.

## Security Notes

- Review mode is the safest default.
- Yolo mode maps to Codex's dangerous bypass mode and should only be used in trusted, backed-up vaults.
- The OMX installer shows command previews and logs setup output.

## Project Status

This project is in early MVP development. The current implementation prioritizes a working Obsidian plugin foundation:

- Codex CLI execution is implemented behind a provider boundary.
- Codex-powered SVG visual asset generation is implemented without API keys.
- OMX diagnostics and install/update UI are implemented.
- Deeper tool-call rendering, diff previews, and long-term conversation persistence are planned.

## Credits

Created by [배움의 달인](https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v) / [@reallygood83](https://x.com/reallygood83).
