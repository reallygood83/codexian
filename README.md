# Codexian

Run OpenAI Codex CLI inside Obsidian, with note context, visual generation, Memory Map search, and one-click setup helpers.

<p align="center">
  <a href="https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v">
    <img alt="YouTube: 배움의 달인" src="https://img.shields.io/badge/YouTube-%EB%B0%B0%EC%9B%80%EC%9D%98%20%EB%8B%AC%EC%9D%B8-FF0000?style=for-the-badge&logo=youtube&logoColor=white">
  </a>
  <a href="https://x.com/reallygood83">
    <img alt="X: @reallygood83" src="https://img.shields.io/badge/X-@reallygood83-000000?style=for-the-badge&logo=x&logoColor=white">
  </a>
</p>

Codexian is a desktop-only Obsidian plugin that wraps your authenticated Codex CLI session. It is built for users who want an ObsidianCode-like agent sidebar, but powered by Codex instead of Claude Code.

Core chat and visual generation are routed through Codex CLI. Codexian does **not** require an OpenAI API key for normal use.

## Current Release

Latest BRAT release: **0.2.18**

Install with:

```text
https://github.com/reallygood83/codexian
```

## What It Does

- **Codex sidebar in Obsidian**: Chat with Codex from a native sidebar using an ObsidianCode-style interface.
- **Automatic note context**: The active note, selected text, and pinned notes can be sent to Codex automatically.
- **Pinned and dismissible note chips**: Pin important notes with `+` or remove noisy notes with `x`.
- **Memory Map**: Build a local vault index, find related notes, and add them to context with clear hover reasons.
- **Visible Codex work timeline**: Codex CLI progress lines are shown as a step-by-step timeline while the final answer is being generated.
- **Slash command menu**: Type `/` to open a scrollable Codex-style command menu.
- **Model selector**: Includes `gpt-5.5`, `gpt-5.4`, and fallback Codex model options. Settings still allow manual model IDs.
- **Windows-aware Codex launch**: Avoids known `codex.cmd` spawn issues by running the Codex Node entrypoint directly when needed.
- **Permission modes**: Review, Auto, and Yolo map to Codex sandbox behavior.
- **Obsidian appearance-aware text**: Chat and composer text follow your Obsidian font, size, and line-height settings.

## Visual Generation

Codexian can generate and embed PNG or SVG visual assets from the current note.

Supported visual types:

- Infographic
- Poster
- Cartoon / storyboard
- Concept art
- Diagram illustration
- YouTube thumbnail
- Profile / avatar
- Product marketing
- E-commerce hero image
- UI / app mockup

Flow:

1. Open a note.
2. Click the image button in the Codexian sidebar.
3. Choose `PNG via Codex image generation` or `SVG via Codex code generation`.
4. Choose a visual format.
5. Codexian analyzes the note and drafts a production-ready image prompt.
6. Review or edit the prompt.
7. Codexian generates the asset and embeds it into the note.

Important details:

- PNG generation uses Codex CLI built-in `image_generation`.
- SVG generation uses Codex CLI to write a text-safe SVG file.
- Generated assets are saved to the configured media folder.
- Embeds are inserted below YAML frontmatter/properties so Obsidian properties stay valid.
- Korean text guidance is included to reduce garbled labels.
- Prompt drafting uses GPT Image 2-style recipes: `subject`, `composition`, `style`, `environment`, `lighting`, `typography`, `details`, and `aspect_ratio`.
- The progress modal shows Codex CLI steps while prompts and image files are being generated, copied, verified, and embedded.

## One-Click Setup Helpers

Open Obsidian Settings → Community plugins → Codexian.

Codexian settings include:

- **Run diagnostics**: Check whether Obsidian can find `codex`, `npm`, `node`, `git`, and `omx`.
- **Install / update Codex + OMX**: Installs `@openai/codex` and `oh-my-codex`, then runs `omx setup` and `omx doctor`.
- **Update Codex CLI**: Runs `npm install -g @openai/codex@latest`.
- **Enable image generation**: Runs `codex features enable image_generation`.
- **Install / update Obsidian Skills**: Installs [`kepano/obsidian-skills`](https://github.com/kepano/obsidian-skills) into `~/.codex/skills`.

`obsidian-skills` is not an Obsidian community plugin. It is an Agent Skills repository that teaches Codex CLI about Obsidian Markdown, Bases, JSON Canvas, Obsidian CLI workflows, and Defuddle web extraction.

## Requirements

- Obsidian desktop.
- Node.js 20+.
- Git, for one-click Obsidian Skills installation.
- OpenAI Codex CLI installed and authenticated.
- A recent Codex CLI with `image_generation` enabled for PNG visual generation.
- Optional: oh-my-codex for advanced OMX workflows.

Recommended CLI setup:

```bash
npm install -g @openai/codex oh-my-codex
codex login
codex features enable image_generation
omx setup
omx doctor
```

Platform notes:

- **macOS**: Codexian auto-detects Homebrew, npm, and NVM Codex paths such as `/opt/homebrew/bin/codex`.
- **Windows**: Codexian auto-detects npm paths such as `%APPDATA%\npm\codex.cmd`. When this `.cmd` wrapper causes Node spawn issues, Codexian runs the underlying `@openai/codex/bin/codex.js` entrypoint through `node`.
- **Windows PowerShell**: Recommended for manual setup commands.
- **Windows WSL**: Still a practical fallback for advanced OMX/team workflows if native Windows terminal tooling is unstable.

## Installing With BRAT

Codexian supports BRAT installation from GitHub releases.

1. Install **Obsidian42 - BRAT** from Obsidian Community Plugins.
2. Open BRAT settings.
3. Click **Add Beta Plugin**.
4. Paste this repository URL:

```text
https://github.com/reallygood83/codexian
```

5. Enable **Codexian** in Obsidian Community Plugins.

Each release includes the files BRAT needs:

- `main.js`
- `manifest.json`
- `styles.css`

If BRAT does not update immediately, use BRAT's plugin update command or restart Obsidian.

## Note Context Workflow

Codexian is designed to make Obsidian notes feel native inside Codex CLI:

- Open a note and Codexian detects it automatically.
- Use the pin icon to keep a note attached while switching files.
- Use `x` to exclude a note when you want a note-independent conversation.
- Run `Codexian: Attach current note to chat` from Obsidian commands or bind it to a hotkey.
- Ask Codex normally; Codexian sends the selected note context through Codex CLI.

## Memory Map

Memory Map is a local, API-free way to find relevant notes in your vault.

User flow:

1. Click **Build Memory Map** once to index the vault locally.
2. Open any note.
3. Click **Find Context**.
4. Codexian recommends related notes with clear reasons.
5. Add useful notes to Codexian context with `+`.

Memory Map uses note titles, tags, links, backlinks, headings, keywords, folders, modified times, URL-noise filtering, and BM25-style term scoring.

Memory Map data is saved locally in the vault:

```text
.codexian/memory/index.json
```

Available commands:

- `Codexian: Build Memory Map`
- `Codexian: Find related notes for current note`

## Configuration

Open Obsidian Settings → Community plugins → Codexian.

- Set `Codex CLI path` only if auto-detection fails.
- Add `PATH` under environment variables only if Obsidian cannot find `codex`, `npm`, `git`, or `omx`.
- On Windows, `Codex CLI path` may point to `codex.cmd`; Codexian will internally prefer the matching `codex.js` entrypoint when available.
- On macOS/Linux, Codexian keeps the normal executable path and does not use the Windows `.cmd` workaround.
- Choose your Codex model and reasoning effort.
- Use `Review` permission mode until you trust the current vault workflow.
- Configure the media folder for generated visual assets.

## Development

```bash
npm install
npm run build
```

Manual install for local development:

```text
<vault>/.obsidian/plugins/codexian/
  main.js
  manifest.json
  styles.css
```

Then enable **Codexian** in Obsidian settings.

## Release Workflow

This repository includes a GitHub Actions workflow that builds and uploads BRAT assets when a tag matching the manifest version is pushed.

Example:

```bash
git tag 0.2.15
git push origin 0.2.15
```

## Security Notes

- Review mode is the safest default.
- Auto mode maps to Codex full-auto behavior.
- Yolo mode maps to Codex's dangerous bypass mode and should only be used in trusted, backed-up vaults.
- One-click installers show command previews and log setup output.
- Visual generation edits the current note only after the asset file exists.

## Project Status

Codexian is in active MVP development. Current focus areas:

- Better Codex CLI parity with interactive slash commands.
- More robust visual generation workflows.
- Optional embedding-based Memory Map ranking.
- Deeper tool-call rendering and diff previews.
- Long-term conversation persistence.

## Credits

Created by [배움의 달인](https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v) / [@reallygood83](https://x.com/reallygood83).
