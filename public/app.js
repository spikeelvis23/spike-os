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

const toggleCommandBar = (open) => {
    const overlay = document.getElementById('command-overlay');
    const input = document.getElementById('command-input');
    overlay.hidden = open === undefined ? !overlay.hidden : !open;
    if (!overlay.hidden) {
        input.value = '';
        document.getElementById('command-results').replaceChildren();
        input.focus();
    }
};

const doCommandSearch = async () => {
    const query = document.getElementById('command-input').value.trim();
    const resultsDiv = document.getElementById('command-results');
    if (query.length < 2) {
        resultsDiv.replaceChildren();
        return;
    }
    try {
        const results = await runSearch(query);
        resultsDiv.replaceChildren();
        results.forEach((item) => {
            resultsDiv.appendChild(searchRow(item, () => {
                toggleCommandBar(false);
                openNoteFromSearch(item.name);
            }));
        });
        if (results.length === 0) resultsDiv.appendChild(el('p', 'search-none', 'No matches'));
    } catch (err) {
        console.error('Command search error:', err);
    }
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

// ---------- start ----------

const initOS = () => {
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
        }
    });

    window.addEventListener('resize', resizeBrain);

    showTab('sprints');
};

initOS();
