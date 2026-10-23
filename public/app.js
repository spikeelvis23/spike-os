async function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');

    if (tabId === 'sprints') renderSprints();
    if (tabId === 'agents') renderAgents();
    if (tabId === 'links') renderLinks();
    if (tabId === 'ideas') renderIdeas();
    if (tabId === 'brain') {
        renderVault();
        initBrain3D();
    }
}

async function doSearch() {
    const query = document.getElementById('global-search').value;
    const resultsDiv = document.getElementById('search-results');

    if (query.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();

        resultsDiv.innerHTML = '';
        if (results.length > 0) {
            resultsDiv.style.display = 'block';
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                const tagsHtml = item.tags.map(t => `<span class="tag">${t}</span>`).join('');
                div.innerHTML = `${tagsHtml} <b>${item.name}</b><div style="font-size: 0.8rem; opacity: 0.7">${item.snippet}</div>`;
                div.onclick = () => {
                    showTab('brain');
                    loadNote(item.name);
                    resultsDiv.style.display = 'none';
                    document.getElementById('global-search').value = '';
                };
                resultsDiv.appendChild(div);
            });
        } else {
            resultsDiv.style.display = 'none';
        }
    } catch (err) {
        console.error('Search error:', err);
    }
}

async function renderSprints() {
    const res = await fetch('/api/data/sprints');
    const data = await res.json();
    const container = document.getElementById('sprint-list');
    container.innerHTML = '';
    data.forEach(task => {
        const div = document.createElement('div');
        div.className = 'card';
        div.textContent = `[${task.status}] ${task.title} (${task.project})`;
        container.appendChild(div);
    });
}

async function renderAgents() {
    const res = await fetch('/api/data/agents');
    const data = await res.json();
    const container = document.getElementById('agent-list');
    container.innerHTML = '';
    data.forEach(agent => {
        const div = document.createElement('div');
        div.className = 'card';
        div.textContent = `${agent.icon} ${agent.name} - ${agent.role}`;
        container.appendChild(div);
    });
}

async function renderLinks() {
    const res = await fetch('/api/data/links');
    const data = await res.json();
    const container = document.getElementById('links-list');
    container.innerHTML = '';
    data.forEach(link => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<a href="${link.url}" target="_blank" style="color: var(--accent)">${link.title}</a>`;
        container.appendChild(div);
    });
}

async function renderIdeas() {
    const res = await fetch('/api/data/ideas');
    const data = await res.json();
    const container = document.getElementById('ideas-list');
    container.innerHTML = '';
    data.forEach(idea => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<strong>${idea.category}</strong>: ${idea.idea}`;
        container.appendChild(div);
    });
}

async function renderVault() {
    const res = await fetch('/api/vault');
    const files = await res.json();
    const list = document.getElementById('vault-list');
    list.innerHTML = '';
    files.forEach(file => {
        const div = document.createElement('div');
        div.className = 'vault-item';
        div.textContent = file;
        div.onclick = () => loadNote(file);
        list.appendChild(div);
    });
}

async function loadNote(fileName) {
    const res = await fetch(`/api/vault/${encodeURIComponent(fileName)}`);
    const data = await res.json();

    const contentDiv = document.getElementById('overlay-body');
    if (!contentDiv) return;

    let html = data.text
        .replace(/\[\[(.*?)\]\]/g, (match, p1) => {
            return `<span class="link-tag" onclick="loadNote('${p1}.md')" style="color: var(--accent); cursor: pointer; text-decoration: underline;">${p1}</span>`;
        })
        .replace(/#(\w+)/g, (match, p1) => {
            return `<span class="tag-button" onclick="searchByTag('${match}')" style="background: var(--border); color: var(--accent); padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">${match}</span>`;
        });

    contentDiv.innerHTML = `<h2 style="margin-top:0">${data.name}</h2><div class="md-body">${html}</div>`;
    document.getElementById('note-overlay').style.display = 'flex';

    const backlinkDiv = document.createElement('div');
    backlinkDiv.className = 'backlinks';
    backlinkDiv.innerHTML = '<h3 style="font-size: 1rem; color: var(--accent)">Backlinks</h3>';
    if (data.backlinks.length === 0) {
        backlinkDiv.innerHTML += '<p style="font-size: 0.8rem; opacity: 0.6">No backlinks found.</p>';
    } else {
        data.backlinks.forEach(bl => {
            const span = document.createElement('span');
            span.className = 'backlink-item';
            span.textContent = bl;
            span.onclick = () => loadNote(bl);
            backlinkDiv.appendChild(span);
        });
    }
    contentDiv.appendChild(backlinkDiv);
}

function closeNoteOverlay() {
    document.getElementById('note-overlay').style.display = 'none';
}

function searchByTag(tag) {
    document.getElementById('global-search').value = tag;
    doSearch();
    showTab('brain');
}

async function saveCurrentNote() {
    const title = document.getElementById('note-title').value;
    const text = document.getElementById('note-text').value;
    if (!title || !text) return alert('Please provide both a title and content');

    try {
        const res = await fetch('/api/save-note', {
            method: 'POST',
            body: JSON.stringify({ title, text })
        });
        const data = await res.json();
        if (data.ok) {
            alert('Note saved successfully!');
            renderVault();
        }
    } catch (err) {
        console.error('Save error:', err);
    }
}

async function saveArtifact(name, content, type = 'html') {
    const res = await fetch('/api/save-artifact', {
        method: 'POST',
        body: JSON.stringify({ name, content, type })
    });
    return await res.json();
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const window = document.getElementById('chat-window');
    const prompt = input.value;
    if (!prompt) return;

    window.innerHTML += `<div style="margin-bottom: 1rem"><b style="color: var(--accent)">You:</b> ${prompt}</div>`;
    input.value = '';

    try {
        const res = await fetch('/api/ask', {
            method: 'POST',
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        window.innerHTML += `<div style="margin-bottom: 1rem"><b style="color: var(--text)">OS:</b> ${data.answer}</div>`;
    } catch (err) {
        window.innerHTML += `<div style="color: #ef4444">Error connecting to Claude</div>`;
    }
    window.scrollTop = window.scrollHeight;
}

// ---------- 3D BRAIN MAP LOGIC ----------

let brainScene, brainCamera, brainRenderer, brainNodes = [];
let brainRaycaster = new THREE.Raycaster();
let brainMouse = new THREE.Vector2();

async function initBrain3D() {
    const container = document.getElementById('brain-3d-container');
    if (!container) return;
    if (brainScene) return;

    brainScene = new THREE.Scene();
    brainCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    brainRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    brainRenderer.setSize(container.clientWidth, container.clientHeight);
    brainRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(brainRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    brainScene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x38bdf8, 10, 100);
    pointLight.position.set(10, 10, 10);
    brainScene.add(pointLight);

    const res = await fetch('/api/file-tree');
    const tree = await res.json();

    const flatFiles = [];
    const traverse = (node, depth = 0, parentId = null) => {
        const id = flatFiles.length;
        flatFiles.push({ ...node, id, depth, parentId });
        if (node.children) {
            node.children.forEach(child => traverse(child, depth + 1, id));
        }
    };
    traverse(tree);

    const group = new THREE.Group();
    const nodesMap = [];

    flatFiles.forEach((file, i) => {
        const isFolder = file.type === 'folder';
        const geometry = new THREE.SphereGeometry(isFolder ? 0.4 : 0.2, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: isFolder ? 0x38bdf8 : 0x94a3b8,
            emissive: isFolder ? 0x1e293b : 0x000000,
            shininess: 100
        });
        const sphere = new THREE.Mesh(geometry, material);

        const angle = (i / flatFiles.length) * Math.PI * 2;
        const radius = 5 + (file.depth * 2);
        sphere.position.set(
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 4,
            Math.sin(angle) * radius
        );

        sphere.userData = { name: file.name, path: file.path, type: file.type };
        group.add(sphere);
        brainNodes.push(sphere);
        nodesMap.push(sphere);
    });

    // Neural connections
    flatFiles.forEach((file, i) => {
        if (file.parentId !== null) {
            const start = nodesMap[file.parentId].position;
            const end = nodesMap[i].position;
            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            const material = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.2 });
            const line = new THREE.Line(geometry, material);
            brainScene.add(line);
        }
    });

    brainScene.add(group);
    brainCamera.position.z = 15;

    const tooltip = document.getElementById('brain-tooltip');

    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        brainMouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        brainMouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    });

    container.addEventListener('click', () => {
        brainRaycaster.setFromCamera(brainMouse, brainCamera);
        const intersects = brainRaycaster.intersectObjects(brainNodes);
        if (intersects.length > 0) {
            const node = intersects[0].object;
            showQuickActions(node, event.clientX, event.clientY);
        }
    });

    function animate() {
        requestAnimationFrame(animate);
        group.rotation.y += 0.002;

        brainRaycaster.setFromCamera(brainMouse, brainCamera);
        const intersects = brainRaycaster.intersectObjects(brainNodes);

        brainNodes.forEach(node => {
            node.material.emissive.setHex(0x000000);
            node.scale.set(1, 1, 1);
        });

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            hit.material.emissive.setHex(0x38bdf8);
            hit.scale.set(1.5, 1.5, 1.5);

            tooltip.style.display = 'block';
            tooltip.style.left = (event.clientX + 10) + 'px';
            tooltip.style.top = (event.clientY + 10) + 'px';
            tooltip.textContent = hit.userData.name;
        } else {
            tooltip.style.display = 'none';
        }

        brainRenderer.render(brainScene, brainCamera);
    }
    animate();
}

function showQuickActions(node, x, y) {
    const existing = document.querySelector('.quick-action-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'quick-action-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const actions = node.userData.type === 'folder'
        ? [{label: 'Explore', action: () => console.log('Exploring ' + node.userData.name)}]
        : [{label: 'Edit', action: () => loadNote(node.userData.name)}];

    actions.forEach(act => {
        const btn = document.createElement('button');
        btn.className = 'quick-action-btn';
        btn.textContent = act.label;
        btn.onclick = act.action;
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    window.onclick = () => menu.remove();
}

function initOS() {
    showTab('sprints');

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const overlay = document.getElementById('command-overlay');
            const input = document.getElementById('command-input');
            overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
            if (overlay.style.display === 'flex') input.focus();
        }
    });

    document.getElementById('command-input').addEventListener('input', async (e) => {
        const query = e.target.value;
        const resultsDiv = document.getElementById('command-results');

        if (query.length < 2) {
            resultsDiv.innerHTML = '';
            return;
        }

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await res.json();

            resultsDiv.innerHTML = '';
            results.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<b>${item.name}</b> <div style="font-size:0.8rem; opacity:0.7">${item.snippet}</div>`;
                div.onclick = () => {
                    showTab('brain');
                    loadNote(item.name);
                    document.getElementById('command-overlay').style.display = 'none';
                    document.getElementById('command-input').value = '';
                };
                resultsDiv.appendChild(div);
            });
        } catch (err) {
            console.error('Command search error:', err);
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('command-overlay').style.display = 'none';
        }
    });
}
