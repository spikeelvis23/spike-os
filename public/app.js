// spike-os dashboard
// Each panel has its own render function. Data comes from the server's /api routes.
// Rule used everywhere: build elements with createElement + textContent (never put
// file data into innerHTML), so a weird note or Claude answer can't break the page.

const STATUSES = ['backlog', 'todo', 'doing', 'done'];

// ---------- helpers ----------

// Make an element with an optional class and text in one line.
const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
};

const getJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
};

const postJson = async (url, body) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${url} → ${res.status}`);
    return data;
};

// Data files are sometimes a plain list [...] and sometimes { key: [...] }.
// This returns the list either way, so a format change doesn't blank the page.
const asList = (data, key) => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[key])) return data[key];
    return [];
};

const showEmpty = (container, message) => {
    container.replaceChildren(el('p', 'empty', message));
};

// Wait until the user stops typing before running fn (saves server calls).
const debounce = (fn, ms = 200) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
};

// ---------- tabs ----------

const RENDERERS = {
    sprints: () => renderSprints(),
    projects: () => renderProjects(),
    docs: () => renderDocs(),
    agents: () => renderAgents(),
    links: () => renderLinks(),
    ideas: () => renderIdeas(),
    brain: () => {
        renderVault();
        startBrain();
    },
    chat: () => document.getElementById('chat-input').focus(),
};

const showTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach((section) => {
        section.classList.toggle('active', section.id === tabId);
    });
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // The 3D brain only animates while you're looking at it (saves battery).
    if (tabId !== 'brain') stopBrain();

    const render = RENDERERS[tabId];
    if (render) Promise.resolve(render()).catch((err) => console.error(err));
};

// ---------- sprints ----------

const renderSprints = async () => {
    const board = document.getElementById('sprint-board');
    const raw = await getJson('/api/data/sprints');

    // Always work with the full { sprint, tasks } object so saving never loses tasks.
    const data = Array.isArray(raw) ? { sprint: '', tasks: raw } : raw;
    if (!Array.isArray(data.tasks)) data.tasks = [];

    document.getElementById('sprint-name').textContent = data.sprint || '';
    board.replaceChildren();

    STATUSES.forEach((status) => {
        const tasks = data.tasks.filter((task) => task.status === status);

        const column = el('div', `sprint-column ${status}`);
        const head = el('h3');
        head.append(el('span', null, status), el('span', 'count', tasks.length));
        column.appendChild(head);

        tasks.forEach((task) => {
            const card = el('button', 'sprint-task');
            card.type = 'button';
            card.append(el('span', 'task-project', task.project || 'general'), el('span', 'task-title', task.title));

            card.addEventListener('click', async () => {
                const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];
                task.status = next;
                card.disabled = true;
                try {
                    // Send the WHOLE file back. The server replaces sprints.json with whatever we send.
                    await postJson('/api/data/sprints', data);
                } catch (err) {
                    console.error('Failed to update task:', err);
                }
                renderSprints();
            });

            column.appendChild(card);
        });

        if (tasks.length === 0) column.appendChild(el('p', 'column-empty', '—'));
        board.appendChild(column);
    });
};

// ---------- agents ----------

const renderAgents = async () => {
    const container = document.getElementById('agent-list');
    const agents = asList(await getJson('/api/data/agents'), 'agents');
    if (agents.length === 0) return showEmpty(container, 'No agents yet. Ask Claude to add one to data/agents.json.');

    container.replaceChildren();
    agents.forEach((agent) => {
        const card = el('article', 'card agent-card');
        card.append(
            el('div', 'agent-icon', agent.icon || '🤖'),
            el('h3', null, agent.name),
            el('p', 'muted', agent.role),
            el('span', `badge ${agent.status === 'active' ? 'active' : ''}`, agent.status || 'idle'),
        );
        container.appendChild(card);
    });
};

// ---------- links ----------

const renderLinks = async () => {
    const container = document.getElementById('links-list');
    const links = asList(await getJson('/api/data/links'), 'links');
    if (links.length === 0) return showEmpty(container, 'No links saved yet.');

    container.replaceChildren();
    links.forEach((link) => {
        const a = el('a', 'card link-card');
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.append(el('strong', null, link.title), el('span', 'muted mono', link.url));
        container.appendChild(a);
    });
};

// ---------- ideas ----------

const renderIdeas = async () => {
    const container = document.getElementById('ideas-list');
    const ideas = asList(await getJson('/api/data/ideas'), 'ideas');
    if (ideas.length === 0) return showEmpty(container, 'No ideas yet.');

    container.replaceChildren();
    ideas.forEach((idea) => {
        const card = el('article', 'card idea-card');
        card.append(el('span', 'chip', idea.category || 'Idea'), el('p', null, idea.idea));
        container.appendChild(card);
    });
};

// ---------- search (sidebar + Ctrl+K) ----------

// Builds one search result row. onPick runs when it's clicked.
const searchRow = (item, onPick) => {
    const row = el('button', 'search-item');
    row.type = 'button';
    const top = el('div', 'search-top');
    (item.tags || []).forEach((tag) => top.appendChild(el('span', 'tag', tag)));
    top.appendChild(el('b', null, item.name));
    row.append(top, el('div', 'search-snippet', item.snippet || ''));
    row.addEventListener('click', onPick);
    return row;
};

const runSearch = async (query) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
};

const openNoteFromSearch = (name) => {
    showTab('brain');
    loadNote(name);
};

const doSearch = async () => {
    const input = document.getElementById('global-search');
    const resultsDiv = document.getElementById('search-results');
    const query = input.value.trim();

    if (query.length < 2) {
        resultsDiv.hidden = true;
        return;
    }

    try {
        const results = await runSearch(query);
        resultsDiv.replaceChildren();
        results.forEach((item) => {
            resultsDiv.appendChild(searchRow(item, () => {
                resultsDiv.hidden = true;
                input.value = '';
                openNoteFromSearch(item.name);
            }));
        });
        if (results.length === 0) resultsDiv.appendChild(el('p', 'search-none', 'No matches'));
        resultsDiv.hidden = false;
    } catch (err) {
        console.error('Search error:', err);
    }
};

const searchByTag = (tag) => {
    document.getElementById('global-search').value = tag;
    doSearch();
};

// ---------- quick launch (Ctrl+K) ----------
// Type a command word first ("task", "idea", "go", "theme", "ask"), then the details.
// Anything else is treated as a search of your brain notes.

// Pulls a #tag out of text: "build logo #BSC" → { text: "build logo", tag: "BSC" }
const splitTag = (text) => {
    const match = text.match(/#(\w+)/);
    return {
        text: text.replace(/#\w+/, '').trim(),
        tag: match ? match[1] : null,
    };
};

const COMMANDS = [
    {
        word: 'task',
        help: 'task <title> #project — add to your sprint',
        run: async (rest) => {
            const { text, tag } = splitTag(rest);
            if (!text) return toast('Type a task title after "task"');
            const data = await getJson('/api/data/sprints');
            const sprint = Array.isArray(data) ? { sprint: '', tasks: data } : data;
            sprint.tasks = sprint.tasks || [];
            const nextId = Math.max(0, ...sprint.tasks.map((t) => Number(t.id) || 0)) + 1;
            sprint.tasks.push({ id: nextId, title: text, status: 'todo', project: tag || 'general' });
            await postJson('/api/data/sprints', sprint); // whole file, as always
            toast(`Task added to ${tag || 'general'}`);
            showTab('sprints');
        },
    },
    {
        word: 'idea',
        help: 'idea <text> #category — save an idea',
        run: async (rest) => {
            const { text, tag } = splitTag(rest);
            if (!text) return toast('Type your idea after "idea"');
            const data = await getJson('/api/data/ideas');
            const ideas = asList(data, 'ideas');
            const nextId = Math.max(0, ...ideas.map((i) => Number(i.id) || 0)) + 1;
            ideas.push({ id: nextId, idea: text, category: tag || 'Idea' });
            // Save it back in the same shape we got it (plain list, or { ideas: [...] })
            await postJson('/api/data/ideas', Array.isArray(data) ? ideas : { ...data, ideas });
            toast('Idea saved');
            showTab('ideas');
        },
    },
    {
        word: 'go',
        help: 'go <panel> — jump to a panel',
        run: (rest) => {
            const tabs = [...document.querySelectorAll('.nav-btn')].map((b) => b.dataset.tab);
            const tab = tabs.find((t) => t.startsWith(rest.toLowerCase()));
            if (tab) showTab(tab);
            else toast(`No panel called "${rest}"`);
        },
    },
    {
        word: 'theme',
        help: 'theme <name> — mission, linear, raycast, obsidian, home',
        run: (rest) => {
            const theme = THEMES.find((t) => t.id.startsWith(rest.toLowerCase()));
            if (theme) applyTheme(theme.id);
            else toast(`No theme called "${rest}"`);
        },
    },
    {
        word: 'ask',
        help: 'ask <question> — send to Claude',
        run: (rest) => {
            if (!rest) return toast('Type a question after "ask"');
            showTab('chat');
            document.getElementById('chat-input').value = rest;
            document.getElementById('chat-form').requestSubmit(); // same as pressing Send
        },
    },
];

// One row in the quick launch list.
const commandRow = (label, detail, onRun) => {
    const row = el('button', 'search-item command-row');
    row.type = 'button';
    const top = el('div', 'search-top');
    top.append(icon('bolt'), el('b', null, label));
    row.append(top, el('div', 'search-snippet', detail));
    row.addEventListener('click', async () => {
        toggleCommandBar(false);
        try {
            await onRun();
        } catch (err) {
            toast(`That didn't work: ${err.message}`);
        }
    });
    return row;
};

const toggleCommandBar = (open) => {
    const overlay = document.getElementById('command-overlay');
    const input = document.getElementById('command-input');
    overlay.hidden = open === undefined ? !overlay.hidden : !open;
    if (!overlay.hidden) {
        input.value = '';
        doCommandSearch(); // shows the command list right away
        input.focus();
    }
};

const doCommandSearch = async () => {
    const query = document.getElementById('command-input').value.trim();
    const resultsDiv = document.getElementById('command-results');
    resultsDiv.replaceChildren();

    // Empty box → show every command as a cheat sheet.
    if (!query) {
        COMMANDS.forEach((cmd) => {
            resultsDiv.appendChild(commandRow(cmd.word, cmd.help, () => {
                toggleCommandBar(true);
                document.getElementById('command-input').value = `${cmd.word} `;
                doCommandSearch();
            }));
        });
        return;
    }

    // "task build logo #BSC" → word = "task", rest = "build logo #BSC"
    const [word, ...restWords] = query.split(' ');
    const rest = restWords.join(' ').trim();
    const matches = COMMANDS.filter((cmd) => cmd.word.startsWith(word.toLowerCase()));
    matches.forEach((cmd) => {
        resultsDiv.appendChild(commandRow(`${cmd.word} ${rest}`.trim(), cmd.help, () => cmd.run(rest)));
    });

    // Also search notes, so the bar still works as a search box.
    if (query.length >= 2) {
        try {
            const results = await runSearch(query);
            results.forEach((item) => {
                resultsDiv.appendChild(searchRow(item, () => {
                    toggleCommandBar(false);
                    openNoteFromSearch(item.name);
                }));
            });
        } catch (err) {
            console.error('Command search error:', err);
        }
    }
    if (!resultsDiv.children.length) resultsDiv.appendChild(el('p', 'search-none', 'No matches'));
};

// ---------- brain: vault + notes ----------

const renderVault = async () => {
    const list = document.getElementById('vault-list');
    const files = await getJson('/api/vault');
    if (files.length === 0) return showEmpty(list, 'No notes yet. Write one below.');

    list.replaceChildren();
    files.forEach((file) => {
        const item = el('button', 'vault-item', file.replace(/\.md$/, ''));
        item.type = 'button';
        item.addEventListener('click', () => loadNote(file));
        list.appendChild(item);
    });
};

// Turns note text into elements: [[Note Name]] becomes a link, #tag becomes a tag button.
const renderNoteText = (text) => {
    const body = el('div', 'md-body');
    text.split(/(\[\[.*?\]\]|#\w+)/g).forEach((part) => {
        if (!part) return;
        if (part.startsWith('[[') && part.endsWith(']]')) {
            const name = part.slice(2, -2);
            const link = el('button', 'note-link', name);
            link.type = 'button';
            link.addEventListener('click', () => loadNote(`${name}.md`));
            body.appendChild(link);
        } else if (/^#\w+$/.test(part)) {
            const tag = el('button', 'tag-button', part);
            tag.type = 'button';
            tag.addEventListener('click', () => searchByTag(part));
            body.appendChild(tag);
        } else {
            body.appendChild(document.createTextNode(part));
        }
    });
    return body;
};

const loadNote = async (fileName) => {
    const contentDiv = document.getElementById('overlay-body');
    let data;
    try {
        data = await getJson(`/api/vault/${encodeURIComponent(fileName)}`);
    } catch {
        contentDiv.replaceChildren(el('p', 'empty', `Couldn't open ${fileName}.`));
        document.getElementById('note-overlay').hidden = false;
        return;
    }

    const title = el('h2', null, (data.name || fileName).replace(/\.md$/, ''));

    const backlinks = el('div', 'backlinks');
    backlinks.appendChild(el('h3', null, 'Backlinks'));
    const links = data.backlinks || [];
    if (links.length === 0) backlinks.appendChild(el('p', 'muted', 'No backlinks found.'));
    links.forEach((name) => {
        const chip = el('button', 'backlink-item', name.replace(/\.md$/, ''));
        chip.type = 'button';
        chip.addEventListener('click', () => loadNote(name));
        backlinks.appendChild(chip);
    });

    contentDiv.replaceChildren(title, renderNoteText(data.text || ''), backlinks);
    document.getElementById('note-overlay').hidden = false;
};

const closeNoteOverlay = () => {
    document.getElementById('note-overlay').hidden = true;
};

const saveCurrentNote = async (event) => {
    event.preventDefault();
    const titleInput = document.getElementById('note-title');
    const textInput = document.getElementById('note-text');
    const status = document.getElementById('note-status');
    const title = titleInput.value.trim();
    const text = textInput.value.trim();

    if (!title || !text) {
        status.textContent = 'Add a title and some text first.';
        return;
    }

    try {
        const data = await postJson('/api/save-note', { title, text });
        if (data.ok) {
            status.textContent = `Saved “${title}”.`;
            titleInput.value = '';
            textInput.value = '';
            renderVault();
        }
    } catch (err) {
        status.textContent = `Couldn't save: ${err.message}`;
    }
};

// ---------- chat ----------

const addChatMessage = (who, text) => {
    const chatWindow = document.getElementById('chat-window');
    const msg = el('div', `msg ${who}`, text);
    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return msg;
};

const sendChat = async (event) => {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const button = document.querySelector('#chat-form button');
    const prompt = input.value.trim();
    if (!prompt) return;

    addChatMessage('user', prompt);
    input.value = '';
    button.disabled = true;
    const reply = addChatMessage('os', 'Thinking…');

    try {
        const { answer } = await postJson('/api/ask', { prompt });
        reply.textContent = answer;
    } catch (err) {
        reply.textContent = err.message || 'Error connecting to Claude';
        reply.classList.add('error');
    } finally {
        button.disabled = false;
        input.focus();
    }
};

// ---------- brain: 3D map ----------

const brain = {
    ready: false,
    running: false,
    frameId: null,
    scene: null,
    camera: null,
    renderer: null,
    group: null,
    raycaster: null,
    mouse: null,           // position inside the canvas, from -1 to 1
    pointer: { x: 0, y: 0 }, // position on the page, for the tooltip
    nodes: [],
    hovered: null,
};

const initBrain3D = async () => {
    const container = document.getElementById('brain-3d-container');
    if (typeof THREE === 'undefined') {
        container.replaceChildren(el('p', 'empty brain-offline', '3D map needs an internet connection to load three.js.'));
        return false;
    }

    brain.scene = new THREE.Scene();
    brain.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    brain.camera.position.z = 15;
    brain.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    brain.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    brain.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(brain.renderer.domElement);

    brain.raycaster = new THREE.Raycaster();
    brain.mouse = new THREE.Vector2(-10, -10); // start off-screen so nothing is "hovered" yet

    brain.scene.add(new THREE.AmbientLight(0x404040, 2));
    const pointLight = new THREE.PointLight(0x38bdf8, 10, 100);
    pointLight.position.set(10, 10, 10);
    brain.scene.add(pointLight);

    // Flatten the folder tree into a list, remembering each item's parent.
    const tree = await getJson('/api/file-tree');
    const flatFiles = [];
    const traverse = (node, depth = 0, parentId = null) => {
        const id = flatFiles.length;
        flatFiles.push({ ...node, id, depth, parentId });
        (node.children || []).forEach((child) => traverse(child, depth + 1, id));
    };
    traverse(tree);

    brain.group = new THREE.Group();
    const folderGeo = new THREE.SphereGeometry(0.4, 16, 16); // shared shapes = faster
    const fileGeo = new THREE.SphereGeometry(0.2, 16, 16);

    flatFiles.forEach((file, i) => {
        const isFolder = file.type === 'folder';
        const glow = isFolder ? 0x0e4a66 : 0x2a3446; // a little self-light so nodes aren't too dark
        const material = new THREE.MeshPhongMaterial({
            color: isFolder ? 0x38bdf8 : 0x94a3b8,
            emissive: glow,
            shininess: 100,
        });
        const sphere = new THREE.Mesh(isFolder ? folderGeo : fileGeo, material);
        const angle = (i / flatFiles.length) * Math.PI * 2;
        const radius = 5 + file.depth * 2;
        sphere.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 4, Math.sin(angle) * radius);
        sphere.userData = { name: file.name, path: file.path, type: file.type, glow };
        brain.group.add(sphere);
        brain.nodes.push(sphere);
    });

    // Lines from each file to its parent folder. Added to the group so they rotate together.
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.2 });
    flatFiles.forEach((file, i) => {
        if (file.parentId === null) return;
        const points = [brain.nodes[file.parentId].position, brain.nodes[i].position];
        brain.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    });

    brain.scene.add(brain.group);

    container.addEventListener('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        brain.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        brain.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        brain.pointer = { x: event.clientX, y: event.clientY };
    });

    container.addEventListener('mouseleave', () => {
        brain.mouse.set(-10, -10);
    });

    container.addEventListener('click', (event) => {
        if (!brain.hovered) return;
        event.stopPropagation(); // don't let the page-wide click close the menu we're opening
        showQuickActions(brain.hovered, event.clientX, event.clientY);
    });

    brain.ready = true;
    return true;
};

const animateBrain = () => {
    if (!brain.running) return;
    brain.frameId = requestAnimationFrame(animateBrain);
    brain.group.rotation.y += 0.002;

    brain.raycaster.setFromCamera(brain.mouse, brain.camera);
    const hit = brain.raycaster.intersectObjects(brain.nodes)[0]?.object || null;

    if (hit !== brain.hovered) {
        if (brain.hovered) {
            brain.hovered.material.emissive.setHex(brain.hovered.userData.glow);
            brain.hovered.scale.set(1, 1, 1);
        }
        if (hit) {
            hit.material.emissive.setHex(0x38bdf8);
            hit.scale.set(1.5, 1.5, 1.5);
        }
        brain.hovered = hit;
    }

    const tooltip = document.getElementById('brain-tooltip');
    if (hit) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${brain.pointer.x + 12}px`;
        tooltip.style.top = `${brain.pointer.y + 12}px`;
        tooltip.textContent = hit.userData.name;
    } else {
        tooltip.style.display = 'none';
    }

    brain.renderer.render(brain.scene, brain.camera);
};

const startBrain = async () => {
    if (!brain.ready) {
        brain.ready = 'loading';
        const ok = await initBrain3D().catch((err) => {
            console.error('Brain map failed:', err);
            return false;
        });
        if (!ok) return;
    }
    if (brain.ready !== true || brain.running) return;
    if (!document.getElementById('brain').classList.contains('active')) return;
    resizeBrain();
    brain.running = true;
    animateBrain();
};

const stopBrain = () => {
    brain.running = false;
    cancelAnimationFrame(brain.frameId);
    document.getElementById('brain-tooltip').style.display = 'none';
};

const resizeBrain = () => {
    if (brain.ready !== true) return;
    const container = document.getElementById('brain-3d-container');
    if (!container.clientWidth || !container.clientHeight) return;
    brain.camera.aspect = container.clientWidth / container.clientHeight;
    brain.camera.updateProjectionMatrix();
    brain.renderer.setSize(container.clientWidth, container.clientHeight);
};

const closeQuickActions = () => {
    document.querySelector('.quick-action-menu')?.remove();
};

const showQuickActions = (node, x, y) => {
    closeQuickActions();
    const menu = el('div', 'quick-action-menu');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.appendChild(el('div', 'quick-action-title', node.userData.name));

    const { name, type } = node.userData;
    const askClaude = {
        label: 'Ask Claude about this',
        run: () => {
            showTab('chat');
            document.getElementById('chat-input').value = `Explain what the ${type} "${name}" in spike-os does.`;
        },
    };
    // Only .md files are vault notes. Everything else gets handed to Claude.
    const actions = type !== 'folder' && name.endsWith('.md')
        ? [{ label: 'Open note', run: () => loadNote(name) }, askClaude]
        : [askClaude];

    actions.forEach(({ label, run }) => {
        const btn = el('button', 'quick-action-btn', label);
        btn.type = 'button';
        btn.addEventListener('click', () => {
            closeQuickActions();
            run();
        });
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
};

// ---------- icons ----------
// Line icons drawn with SVG. They use stroke="currentColor", so they take the
// text color of whatever they sit in — that's why they change with the theme.
// (These shapes are fixed strings we wrote, never user data, so innerHTML is safe here.)

const ICONS = {
    sprints: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    agents: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
    ideas: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
    docs: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    links: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    brain: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5l-5.5 5.5M12 12l5.5 5.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    theme: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21a2.5 2.5 0 0 1 0-5h2a3 3 0 0 0 3-3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
};

const SVG_NS = 'http://www.w3.org/2000/svg'; // SVG elements need this "namespace" to draw

const icon = (name) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || ICONS.note;
    return svg;
};

// Finds every <span data-icon="x"> in the HTML and puts the matching icon in it.
const mountIcons = () => {
    document.querySelectorAll('[data-icon]').forEach((spot) => {
        spot.replaceChildren(icon(spot.dataset.icon));
    });
};

// ---------- toast (small pop-up message) ----------

const toast = (message) => {
    const box = document.getElementById('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toast.timer); // functions are objects, so we can hang a timer on one
    toast.timer = setTimeout(() => (box.hidden = true), 2500);
};

// ---------- projects (folders built from your data) ----------
// No folders are stored anywhere. Every time this panel opens, it groups tasks
// by their "project" name, so a new project appears as soon as a task uses it.

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

const renderProjects = async () => {
    const view = document.getElementById('projects-view');
    document.getElementById('projects-title').textContent = 'Projects';
    document.getElementById('projects-back').hidden = true;
    document.getElementById('projects-hint').hidden = false;

    const data = await getJson('/api/data/sprints');
    const tasks = asList(data, 'tasks');

    // Group tasks into { "DirectPlate": [task, task], "spike-os": [task] }
    const groups = {};
    tasks.forEach((task) => {
        const name = task.project || 'general';
        if (!groups[name]) groups[name] = [];
        groups[name].push(task);
    });

    const names = Object.keys(groups).sort();
    if (names.length === 0) return showEmpty(view, 'No projects yet. Add a task with a #project.');

    const grid = el('div', 'grid');
    names.forEach((name) => {
        const list = groups[name];
        const done = list.filter((t) => t.status === 'done').length;
        const percent = Math.round((done / list.length) * 100);

        const card = el('button', 'card folder-card');
        card.type = 'button';
        const head = el('div', 'folder-head');
        head.append(icon('folder'), el('h3', null, name));

        const bar = el('div', 'progress');
        const fill = el('div', 'progress-fill');
        fill.style.width = `${percent}%`;
        bar.appendChild(fill);

        card.append(head, el('p', 'muted', `${list.length} tasks · ${done} done · ${percent}%`), bar);
        card.addEventListener('click', () => openProject(name, list));
        grid.appendChild(card);
    });
    view.replaceChildren(grid);
};

const openProject = async (name, tasks) => {
    const view = document.getElementById('projects-view');
    document.getElementById('projects-title').textContent = name;
    document.getElementById('projects-back').hidden = false;
    document.getElementById('projects-hint').hidden = true;

    const columns = el('div', 'project-columns');

    // Left: this project's tasks, grouped by status
    const taskBox = el('div', 'card');
    taskBox.appendChild(el('h3', null, 'Tasks'));
    STATUSES.forEach((status) => {
        const inStatus = tasks.filter((t) => t.status === status);
        if (inStatus.length === 0) return;
        taskBox.appendChild(el('p', 'status-label', status));
        inStatus.forEach((t) => taskBox.appendChild(el('div', 'project-task', t.title)));
    });

    // Right: notes in the vault tagged with this project, e.g. #directplate
    const noteBox = el('div', 'card');
    noteBox.appendChild(el('h3', null, `Notes tagged #${slug(name)}`));
    const notes = await runSearch(`#${slug(name)}`).catch(() => []);
    if (notes.length === 0) noteBox.appendChild(el('p', 'muted', `No notes yet. Add #${slug(name)} to a note in Brain.`));
    notes.forEach((note) => {
        const row = el('button', 'vault-item');
        row.type = 'button';
        row.append(icon('note'), document.createTextNode(` ${note.name.replace(/\.md$/, '')}`));
        row.addEventListener('click', () => openNoteFromSearch(note.name));
        noteBox.appendChild(row);
    });

    columns.append(taskBox, noteBox);
    view.replaceChildren(columns);
};

// ---------- docs (markdown files in /docs) ----------

// Small markdown renderer: # headings, - lists, ``` code blocks, `code`, **bold**.
// It builds real elements instead of HTML strings, so nothing in a doc can break the page.
const addInline = (parent, line) => {
    line.split(/(`[^`]+`|\*\*[^*]+\*\*)/).forEach((part) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
            parent.appendChild(el('code', null, part.slice(1, -1)));
        } else if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
            parent.appendChild(el('strong', null, part.slice(2, -2)));
        } else if (part) {
            parent.appendChild(document.createTextNode(part));
        }
    });
};

const renderMarkdown = (text, container) => {
    container.replaceChildren();
    let list = null;
    let codeBlock = null;

    text.split('\n').forEach((line) => {
        if (line.startsWith('```')) {
            if (codeBlock) {
                codeBlock = null; // closing fence
            } else {
                const pre = el('pre');
                codeBlock = el('code');
                pre.appendChild(codeBlock);
                container.appendChild(pre);
            }
            list = null;
            return;
        }
        if (codeBlock) {
            codeBlock.textContent += `${line}\n`;
            return;
        }

        const heading = line.match(/^(#{1,3})\s+(.*)/);
        const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);

        if (heading) {
            list = null;
            const h = el(`h${heading[1].length}`);
            addInline(h, heading[2]);
            container.appendChild(h);
        } else if (bullet) {
            if (!list) {
                list = el(/^\s*\d+\./.test(line) ? 'ol' : 'ul');
                container.appendChild(list);
            }
            const li = el('li');
            addInline(li, bullet[1]);
            list.appendChild(li);
        } else if (line.trim()) {
            list = null;
            const p = el('p');
            addInline(p, line);
            container.appendChild(p);
        } else {
            list = null;
        }
    });
};

const openDoc = async (name, button) => {
    const { text } = await getJson(`/api/docs/${encodeURIComponent(name)}`);
    document.querySelectorAll('.doc-item').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    renderMarkdown(text, document.getElementById('doc-view'));
};

const renderDocs = async () => {
    const list = document.getElementById('doc-list');
    const view = document.getElementById('doc-view');
    let files;
    try {
        files = await getJson('/api/docs');
    } catch {
        // The server doesn't have the docs route yet.
        list.replaceChildren();
        view.replaceChildren(
            el('h2', null, 'Docs needs one server route'),
            el('p', null, 'server.js has no /api/docs route yet. Ask Claude Code: "add GET /api/docs (list .md files in docs/) and GET /api/docs/<name> (return { name, text }) to server.js, then restart."'),
        );
        return;
    }

    if (files.length === 0) {
        list.replaceChildren();
        return showEmpty(view, 'No docs yet. Put .md files in the docs/ folder.');
    }

    list.replaceChildren();
    files.forEach((name, index) => {
        const button = el('button', 'doc-item');
        button.type = 'button';
        button.append(icon('note'), document.createTextNode(` ${name.replace(/\.md$/, '')}`));
        button.addEventListener('click', () => openDoc(name, button));
        list.appendChild(button);
        if (index === 0) openDoc(name, button); // open the first doc automatically
    });
};

// ---------- themes ----------

// Each id matches a [data-theme="..."] block in style.css.
// bg + accent are only used to draw the little color preview in the menu.
const THEMES = [
    { id: 'mission', label: 'Mission', note: 'Navy + sky blue', bg: '#0b1120', accent: '#38bdf8' },
    { id: 'linear', label: 'Linear', note: 'Black + indigo', bg: '#08090a', accent: '#5e6ad2' },
    { id: 'raycast', label: 'Raycast', note: 'Charcoal + coral', bg: '#161616', accent: '#ff6363' },
    { id: 'obsidian', label: 'Obsidian', note: 'Graphite + purple', bg: '#1e1e1e', accent: '#a882ff' },
    { id: 'home', label: 'Home', note: 'Light + blue', bg: '#f2f4f7', accent: '#0398d6' },
    { id: 'bsc', label: 'BSC', note: 'Bland Sheep Crew clay', bg: '#e6dfd2', accent: '#b4462f' },
];
const THEME_KEY = 'spike-os-theme';

const applyTheme = (id) => {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    document.documentElement.dataset.theme = theme.id; // sets <html data-theme="linear">
    document.getElementById('theme-label').textContent = `Theme: ${theme.label}`;
    try {
        localStorage.setItem(THEME_KEY, theme.id); // remember it for next time
    } catch {
        // storage can be blocked (private window) — the theme still works, it just won't be remembered
    }
};

// Builds the menu: one row per theme with a color preview. Clicking a row applies it instantly.
const renderThemeMenu = () => {
    const menu = document.getElementById('theme-menu');
    const currentId = document.documentElement.dataset.theme;
    menu.replaceChildren();

    THEMES.forEach((theme) => {
        const option = el('button', `theme-option ${theme.id === currentId ? 'active' : ''}`);
        option.type = 'button';

        const swatch = el('span', 'theme-swatch');
        swatch.style.background = theme.bg;
        swatch.appendChild(el('span', 'theme-swatch-dot'));
        swatch.lastChild.style.background = theme.accent;

        const text = el('span', 'theme-text');
        text.append(el('strong', null, theme.label), el('span', 'muted', theme.note));

        option.append(swatch, text);
        if (theme.id === currentId) option.appendChild(el('span', 'theme-check', '✓'));

        option.addEventListener('click', () => {
            applyTheme(theme.id);
            closeThemeMenu();
        });
        menu.appendChild(option);
    });
};

const closeThemeMenu = () => {
    document.getElementById('theme-menu').hidden = true;
};

const toggleThemeMenu = () => {
    const menu = document.getElementById('theme-menu');
    if (menu.hidden) renderThemeMenu();
    menu.hidden = !menu.hidden;
};

const loadSavedTheme = () => {
    let saved = null;
    try {
        saved = localStorage.getItem(THEME_KEY);
    } catch {
        // ignore — fall back to the default theme
    }
    applyTheme(saved);
};

// ---------- start ----------

const initOS = () => {
    mountIcons();

    // Enter in the quick launch box runs the top result.
    document.getElementById('command-input').addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        await doCommandSearch(); // make sure the list matches what's typed right now
        document.querySelector('#command-results button')?.click();
    });

    document.getElementById('projects-back').addEventListener('click', renderProjects);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });

    document.getElementById('global-search').addEventListener('input', debounce(doSearch));
    document.getElementById('command-input').addEventListener('input', debounce(doCommandSearch));
    document.getElementById('note-form').addEventListener('submit', saveCurrentNote);
    document.getElementById('chat-form').addEventListener('submit', sendChat);
    document.getElementById('close-note').addEventListener('click', closeNoteOverlay);

    // Click on the dark area around the command bar closes it.
    document.getElementById('command-overlay').addEventListener('click', (event) => {
        if (event.target.id === 'command-overlay') toggleCommandBar(false);
    });

    // Any click elsewhere closes the brain menu and the sidebar search results.
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.quick-action-menu')) closeQuickActions();
        if (!event.target.closest('.search-container')) document.getElementById('search-results').hidden = true;
        if (!event.target.closest('.theme-picker')) closeThemeMenu();
    });

    window.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            toggleCommandBar();
        }
        if (event.key === 'Escape') {
            toggleCommandBar(false);
            closeNoteOverlay();
            closeQuickActions();
            closeThemeMenu();
        }
    });

    window.addEventListener('resize', resizeBrain);

    document.getElementById('theme-btn').addEventListener('click', toggleThemeMenu);
    loadSavedTheme();

    showTab('sprints');
};

initOS();
