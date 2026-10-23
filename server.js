// spike-os server — zero npm dependencies, just Node's built-in modules.
// Start it with:  node server.js   then open http://localhost:3000

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3000;
const HOST = '127.0.0.1'; // localhost only — nobody else on your wifi can reach it
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DOCS_DIR = path.join(ROOT, 'docs');

// Only these data files can be read/written through the API (safety whitelist).
const DATA_FILES = ['sprints', 'agents', 'links'];

// false = the chat box can read files and answer questions, but Claude must ask
// before editing. Set to true to let the chat box edit files in this folder.
const ALLOW_EDITS = false;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---------- helpers ----------

const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(data));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

// Runs `claude -p "<prompt>"` inside this folder and returns what it prints.
const askClaude = (prompt) =>
  new Promise((resolve, reject) => {
    const args = ['-p', prompt];
    if (ALLOW_EDITS) args.push('--permission-mode', 'acceptEdits');

    // spawn with an args array (no shell) so the prompt can't run extra commands
    const child = spawn('claude', args, { cwd: ROOT });
    let output = '';
    let errors = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude took longer than 5 minutes — stopped.'));
    }, 5 * 60 * 1000);

    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (errors += chunk));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not start claude: ${err.message}. Is Claude Code installed and on your PATH?`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(errors.trim() || `claude exited with code ${code}`));
    });
  });

// ---------- API routes ----------

const handleApi = async (req, res, url) => {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'data', 'sprints']

  // GET /api/data/sprints  |  POST /api/data/sprints (saves the whole file)
  if (parts[1] === 'data' && DATA_FILES.includes(parts[2])) {
    const filePath = path.join(DATA_DIR, `${parts[2]}.json`);

    if (req.method === 'GET') {
      const text = await fs.readFile(filePath, 'utf8');
      return sendJson(res, 200, JSON.parse(text));
    }
    if (req.method === 'POST') {
      const data = JSON.parse(await readBody(req));
      await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
      return sendJson(res, 200, { ok: true });
    }
  }

  // GET /api/docs  → list of markdown files
  if (parts[1] === 'docs' && !parts[2] && req.method === 'GET') {
    const files = await fs.readdir(DOCS_DIR);
    return sendJson(res, 200, files.filter((name) => name.endsWith('.md')));
  }

  // GET /api/docs/welcome.md  → that file's text
  if (parts[1] === 'docs' && parts[2] && req.method === 'GET') {
    const name = path.basename(decodeURIComponent(parts[2])); // basename blocks ../ tricks
    if (!name.endsWith('.md')) return sendJson(res, 400, { error: 'Only .md files' });
    const text = await fs.readFile(path.join(DOCS_DIR, name), 'utf8');
    return sendJson(res, 200, { name, text });
  }

  // POST /api/ask  { prompt: "..." }  → Claude's answer
  if (parts[1] === 'ask' && req.method === 'POST') {
    const { prompt } = JSON.parse(await readBody(req));
    if (!prompt || !prompt.trim()) return sendJson(res, 400, { error: 'Empty prompt' });
    const answer = await askClaude(prompt);
    return sendJson(res, 200, { answer });
  }

  return sendJson(res, 404, { error: 'Unknown API route' });
};

// ---------- static files (the dashboard itself) ----------

const handleStatic = async (res, url) => {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));

  // Never serve anything outside the public folder
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const file = await fs.readFile(filePath);
    const type = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
};

// ---------- start ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(res, url);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`spike-os running → http://localhost:${PORT}`);
});
