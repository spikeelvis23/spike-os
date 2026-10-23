# spike-os

My personal agent platform: a local dashboard on top of Claude Code.

## Start it
1. Install Node.js (v18 or newer) if you don't have it: https://nodejs.org
2. In a terminal: `cd spike-os` then `node server.js`
3. Open http://localhost:3000

## Use it with Claude Code
Open a second terminal tab, `cd spike-os`, and run `claude`. Claude reads `CLAUDE.md` and knows how the folder works. Try:
- "add a task to my sprint: build the menu page for DirectPlate"
- "add a new agent called Hype for Bland Sheep Crew social posts"
- "add a new panel called Ideas that reads from data/ideas.json"

Refresh the dashboard to see the change.

## Chat tab
The Chat tab runs `claude -p` on your laptop. By default it can read but not edit. To let it edit files, set `ALLOW_EDITS = true` in `server.js` and restart.
