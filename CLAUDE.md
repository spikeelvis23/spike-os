# spike-os — instructions for Claude

This folder is Spike's personal agent platform ("agentic OS"). Spike is learning to code, so explain what you change in plain language as you go.

## Structure
- `server.js` — zero-dependency Node server. Serves `public/` and a small API. Bound to localhost only.
- `public/` — the dashboard: `index.html`, `style.css`, `app.js`. Each panel is a function in `app.js`.
- `data/sprints.json` — tasks. Each task: `{ id, title, status, project }`. Status is one of `backlog`, `todo`, `doing`, `done`.
- `data/agents.json` — the agent "team". Each agent: `{ id, name, icon, role, status }`. Status is `active` or `idle`.
- `data/links.json` — saved links: `{ title, url }`.
- `docs/` — markdown knowledge base. Read relevant docs before answering questions about Spike's projects.
- `.claude/skills/` — reusable skills.

## Rules
- Keep the project dependency-free (no npm packages) unless Spike asks.
- Use modern JavaScript: `const`/`let`, arrow functions, `fetch`, `forEach`/`map`, `createElement`/`appendChild`. No `innerHTML` with data (use `textContent`).
- When adding a task, use the next unused `id` number.
- Keep JSON files valid and formatted with 2-space indentation.
- To add a new panel: add a tab button in `index.html`, a `<section>` with a matching id, and a render function in `app.js`.
