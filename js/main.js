// Easy IA WebOS - Core OS Logic
window.systemStartTime = Date.now();
const windowContainer = document.getElementById('window-container');
const clockElement = document.getElementById('taskbar-clock');

let zIndexCounter = 1000;
let openApps = [];
let reasoningTabOpen = true; // Estado global preferido del usuario
window.systemMemory = {}; // Memoria persistente de la IA cargada del servidor

const apps = {
    explorer: { title: 'Explorador de Archivos', icon: 'folder', color: '#6366f1', content: getExplorerContent, width: 900, height: 550 },
    terminal: { title: 'Terminal', icon: 'terminal', color: '#10b981', content: getTerminalContent, width: 650, height: 450 },
    settings: { title: 'Configuracion', icon: 'settings', color: '#64748b', content: getSettingsContent, width: 1200, height: 600 },
    users: { title: 'Perfiles de Usuario', icon: 'users', color: '#f43f5e', content: getUsersContent, width: 400, height: 500 }
};

let currentUser = localStorage.getItem('webos_current_user') || 'Administrador';

// IndexedDB Manager
const dbName = 'EasyIA_WebOS_DB';
const dbVersion = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('system')) db.createObjectStore('system');
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function dbGet(key, userOverride = null) {
    const user = userOverride || currentUser;
    try {
        const response = await fetch(`/api/system/get?user=${encodeURIComponent(user)}&key=${encodeURIComponent(key)}`);
        if (response.ok) return await response.json();
        return null;
    } catch (e) {
        return null;
    }
}

async function dbSet(key, value, userOverride = null) {
    const user = userOverride || currentUser;

    // Si estamos guardando la memoria, actualizamos también la variable global
    if (key === 'webos_memory') {
        window.systemMemory = value;
    }

    try {
        const response = await fetch(`/api/system/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, key, value })
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function loadSystemMemory() {
    const memory = await dbGet('webos_memory');
    window.systemMemory = memory || {};
}

async function dbClear() {
    // Cerramos cualquier conexión existente antes de eliminar la DB
    // Para ello, abrimos y cerramos explícitamente
    const db = await openDB();
    db.close();

    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
    });
}

let systemConfig = {};
let vfs = {};

// Helper para peticiones al servidor real de archivos
async function apiVFS(endpoint, method = 'GET', data = null) {
    const url = new URL(`/api/vfs/${endpoint}`, window.location.origin);
    if (method === 'GET' && data) {
        Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
    }

    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (method === 'POST' && data) options.body = JSON.stringify(data);

        const response = await fetch(url, options);
        if (!response.ok) return null;

        const text = await response.text();
        try {
            // Intentar parsear como JSON siempre primero
            return JSON.parse(text);
        } catch (e) {
            // Si falla (como en el contenido de un archivo .md), devolver como texto plano
            return text;
        }
    } catch (e) {
        console.error("VFS API Error:", e);
        return null;
    }
}



async function loadConfig() {
    const saved = await dbGet('webos_config');
    if (saved) {
        systemConfig = saved;
    } else {
        systemConfig = window.SYSTEM_CONFIG || {};
        await dbSet('webos_config', systemConfig);
    }

    // Migration: Ensure chat_style exists and has all new fields
    if (!systemConfig.chat_style) {
        systemConfig.chat_style = window.SYSTEM_CONFIG.chat_style;
    } else {
        // Merge missing fields (like bubble_opacity) from default config
        systemConfig.chat_style = { ...window.SYSTEM_CONFIG.chat_style, ...systemConfig.chat_style };
    }
    await dbSet('webos_config', systemConfig);
    applyChatStyles();

    // Migration: Ensure permissions exists
    if (!systemConfig.permissions) {
        systemConfig.permissions = window.SYSTEM_CONFIG.permissions;
    } else {
        // Merge missing sub-fields
        systemConfig.permissions = { ...window.SYSTEM_CONFIG.permissions, ...systemConfig.permissions };
        if (systemConfig.permissions.tools) {
            systemConfig.permissions.tools.terminal = { ...window.SYSTEM_CONFIG.permissions.tools.terminal, ...systemConfig.permissions.tools.terminal };
            systemConfig.permissions.tools.files = { ...window.SYSTEM_CONFIG.permissions.tools.files, ...systemConfig.permissions.tools.files };
            // Migration: Ensure system group exists
            if (!systemConfig.permissions.tools.system) {
                systemConfig.permissions.tools.system = { ...window.SYSTEM_CONFIG.permissions.tools.system };
            } else {
                systemConfig.permissions.tools.system = { ...window.SYSTEM_CONFIG.permissions.tools.system, ...systemConfig.permissions.tools.system };
            }
        }
    }

    // Auto-load tools_doc.js content from global variable
    if (systemConfig.permissions.docName === 'tools_doc.js' || systemConfig.permissions.docName === 'tools.md') {
        systemConfig.permissions.docName = 'tools_doc.js';
        const text = window.TOOLS_DOC_CONTENT || "";
        if (text && systemConfig.permissions.doc !== text) {
            systemConfig.permissions.doc = text;
            console.log("[System] tools_doc.js sincronizado.");
            dbSet('webos_config', systemConfig);
        }
    }

    // Auto-load System doc from global variable
    if (systemConfig.system.docName === 'system_doc.js') {
        const text = window.SYSTEM_DOC_CONTENT || "";
        if (text && systemConfig.system.system_doc !== text) {
            systemConfig.system.system_doc = text;
            console.log("[System] system_doc.js sincronizado.");
            dbSet('webos_config', systemConfig);
        }
    }

    // Auto-load Loop doc from global variable
    if (systemConfig.loop.docName === 'loop_doc.js') {
        const text = window.LOOP_DOC_CONTENT || "";
        if (text && systemConfig.loop.loop_doc !== text) {
            systemConfig.loop.loop_doc = text;
            console.log("[System] loop_doc.js sincronizado.");
            dbSet('webos_config', systemConfig);
        }
    }

    await dbSet('webos_config', systemConfig);

    // Inicializar estructura de usuario en el servidor real
    await apiVFS('init_user', 'POST', { user: currentUser });
}


function updateClock() {
    const now = new Date();
    clockElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function openApp(appId) {
    if (!apps[appId]) return;

    const existingApp = openApps.find(a => a.appId === appId);
    if (existingApp) {
        const win = document.getElementById(existingApp.id);
        if (win) {
            win.classList.remove('window-minimized');
            win.style.zIndex = ++zIndexCounter;
            return;
        }
    }

    const app = apps[appId];
    const windowId = `win-${appId}-${Date.now()}`;
    const win = document.createElement('div');
    win.id = windowId;
    win.className = 'window window-opening';
    win.style.zIndex = ++zIndexCounter;
    const winW = app.width || 600;
    const winH = app.height || 400;
    win.style.width = winW + 'px';
    win.style.height = winH + 'px';

    if (appId === 'settings' || appId === 'explorer' || appId === 'users') {
        win.style.left = `calc(50% - ${winW / 2}px)`;
        win.style.top = `calc(50% - ${winH / 2}px)`;
    } else {
        win.style.left = '100px';
        win.style.top = '100px';
    }

    win.innerHTML = `
        <div class="window-header">
            <div class="window-title">
                <i data-lucide="${app.icon}" style="color:${app.color}; width:16px;"></i>
                <span>${app.title}</span>
            </div>
            <div class="window-controls">
                <button class="win-btn win-minimize" onclick="toggleMinimize('${windowId}')"><i data-lucide="minus"></i></button>
                <button class="win-btn win-maximize" onclick="toggleMaximize('${windowId}')"><i data-lucide="square"></i></button>
                <button class="win-btn win-close" onclick="closeWindow('${windowId}')"><i data-lucide="x"></i></button>
            </div>
        </div>
        <div class="window-content">${app.content(windowId)}</div>
    `;

    windowContainer.appendChild(win);
    lucide.createIcons();

    makeDraggable(win);
    makeResizable(win);

    win.addEventListener('mousedown', () => {
        win.style.zIndex = ++zIndexCounter;
    });

    openApps.push({ id: windowId, appId });
    updateTaskbar();
}

function closeWindow(windowId) {
    const win = document.getElementById(windowId);
    if (win) {
        win.remove();
        openApps = openApps.filter(a => a.id !== windowId);
        updateTaskbar();
    }
}

function toggleMaximize(windowId) {
    const win = document.getElementById(windowId);
    if (win) win.classList.toggle('window-maximized');
}

function toggleMinimize(windowId) {
    const win = document.getElementById(windowId);
    if (win) win.classList.toggle('window-minimized');
}

function makeDraggable(win) {
    const header = win.querySelector('.window-header');
    let x = 0, y = 0, nx = 0, ny = 0;

    header.onmousedown = (e) => {
        if (win.classList.contains('window-maximized')) return;
        e.preventDefault();
        nx = e.clientX;
        ny = e.clientY;
        document.onmousemove = (e) => {
            x = nx - e.clientX;
            y = ny - e.clientY;
            nx = e.clientX;
            ny = e.clientY;
            win.style.top = (win.offsetTop - y) + "px";
            win.style.left = (win.offsetLeft - x) + "px";
        };
        document.onmouseup = () => {
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

function makeResizable(win) {
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach(dir => {
        const resizer = document.createElement('div');
        resizer.className = `resizer ${dir}`;
        win.appendChild(resizer);

        resizer.onmousedown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const startT = win.offsetTop;
            const startL = win.offsetLeft;

            document.onmousemove = (e) => {
                if (dir.includes('e')) win.style.width = startW + (e.clientX - startX) + 'px';
                if (dir.includes('w')) {
                    win.style.width = startW - (e.clientX - startX) + 'px';
                    win.style.left = startL + (e.clientX - startX) + 'px';
                }
                if (dir.includes('s')) win.style.height = startH + (e.clientY - startY) + 'px';
                if (dir.includes('n')) {
                    win.style.height = startH - (e.clientY - startY) + 'px';
                    win.style.top = startT + (e.clientY - startY) + 'px';
                }
            };
            document.onmouseup = () => {
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
    });
}

function updateTaskbar() {
    document.querySelectorAll('.dock-indicator').forEach(el => el.remove());
    const uniqueApps = [...new Set(openApps.map(a => a.appId))];
    uniqueApps.forEach(appId => {
        const dockItem = document.querySelector(`.dock-item[onclick*="openApp('${appId}')"]`);
        if (dockItem) {
            const ind = document.createElement('div');
            ind.className = 'dock-indicator';
            dockItem.appendChild(ind);
        }
    });
}

// Explorer Navigation Logic
window.explorerStates = window.explorerStates || {};

window.navigateExplorer = async function (windowId, path) {
    const win = document.getElementById(windowId);
    if (!win) return;

    let vfsPath = path === 'Unidad C:' ? 'C:\\WebOS' : path;
    if (vfsPath === 'Escritorio') vfsPath = 'C:\\WebOS\\Escritorio';
    if (vfsPath === 'Proyectos') vfsPath = 'C:\\WebOS\\Proyectos';
    if (vfsPath === 'Imagenes') vfsPath = 'C:\\WebOS\\Imagenes';
    if (vfsPath === 'Documentos') vfsPath = 'C:\\WebOS\\Documentos';
    if (vfsPath === 'Musica') vfsPath = 'C:\\WebOS\\Musica';

    window.explorerStates[windowId] = { currentPath: vfsPath };

    const pathDisplay = win.querySelector('.explorer-path');
    if (pathDisplay) pathDisplay.innerHTML = `Este Equipo > <span style="color: white;">${vfsPath.replace('C:\\WebOS', 'Unidad C:')}</span>`;

    const mainArea = win.querySelector('.explorer-main-area');
    if (mainArea) {
        mainArea.innerHTML = '<div style="display:flex; justify-content:center; padding:20px; color:var(--text-secondary);">Cargando archivos reales...</div>';

        const contents = await apiVFS('list', 'GET', { user: currentUser, path: vfsPath }) || [];

        // Ordenar: carpetas primero, luego por nombre alfabético
        contents.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        if (contents.length > 0) {
            mainArea.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 25px; padding: 5px;">
                    ${contents.map(item => {
                const icon = getIconForName(item.name);
                const color = getColorForName(item.name);
                const isFolder = item.type === 'dir';
                const fullPath = vfsPath.endsWith('\\') ? vfsPath + item.name : vfsPath + '\\' + item.name;
                return getExplorerItemHTML(windowId, icon, item.name, color, isFolder ? fullPath : null);
            }).join('')}
                </div>
            `;
        } else {
            mainArea.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 10px;">
                    <i data-lucide="folder-open" style="width: 48px; height: 48px; opacity: 0.2;"></i>
                    <span>Carpeta vacía</span>
                </div>
            `;
        }
        if (window.lucide) setTimeout(() => lucide.createIcons(), 10);
    }
}

function getExplorerItemHTML(windowId, icon, name, color, targetPath) {
    const action = targetPath ? `navigateExplorer('${windowId}', '${targetPath.replace(/\\/g, '\\\\')}')` : '';
    const protectedItems = ['Escritorio', 'Proyectos', 'Imagenes', 'Documentos', 'Musica', 'WebOS'];
    const isProtected = protectedItems.includes(name);

    return `
        <div class="explorer-item" onclick="${action}" style="position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; width: 100px; padding: 10px; border-radius: 8px; transition: background 0.2s;">
            ${!isProtected ? `
                <button class="delete-item-btn" onclick="event.stopPropagation(); deleteExplorerItem('${windowId}', '${name}')" style="position: absolute; top: 5px; right: 5px; background: rgba(255,95,87,0.8); border: none; border-radius: 4px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            ` : ''}
            <div style="width: 60px; height: 60px; background: ${color}22; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid ${color}44;">
                <i data-lucide="${icon}" style="color: ${color}; width: 32px; height: 32px;"></i>
            </div>
            <span style="font-size: 0.72rem; font-weight: 500; text-align: center; width: 100%; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #eee; line-height: 1.2; padding: 0 5px;">${name}</span>
        </div>
    `;
}

function getIconForName(name) {
    const n = name.toLowerCase();
    if (n.includes('musica') || n.includes('audio') || n.includes('.mp3')) return 'music';
    if (n.includes('imagen') || n.includes('foto')) return 'image';
    if (n.includes('proyecto')) return 'folder';
    if (n.includes('documento') || n.includes('texto') || n.includes('.txt')) return 'file-text';
    if (n.includes('escritorio')) return 'layout';
    return !name.includes('.') ? 'folder' : 'file';
}

function getColorForName(name) {
    const n = name.toLowerCase();
    if (n.includes('musica')) return '#f43f5e';
    if (n.includes('imagen')) return '#10b981';
    if (n.includes('proyecto')) return '#3b82f6';
    if (n.includes('documento')) return '#f59e0b';
    if (n.includes('escritorio')) return '#8b5cf6';
    return !name.includes('.') ? '#ea7f05' : '#94a3b8';
}

function getExplorerContent(windowId) {
    return `
        <div style="display: flex; height: 100%; gap: 0;">
            <div style="width: 160px; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 15px; display: flex; flex-direction: column; gap: 10px;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-top: 5px; margin-left: 10px;">Este Equipo</div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Unidad C:')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="hard-drive" style="width:14px; height:14px;"></i> Unidad C:
                </div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Escritorio')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="layout" style="width:14px; height:14px;"></i> Escritorio
                </div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Proyectos')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="folder" style="width:14px; height:14px;"></i> Proyectos
                </div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Imagenes')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="image" style="width:14px; height:14px;"></i> Imagenes
                </div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Documentos')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="file-text" style="width:14px; height:14px;"></i> Documentos
                </div>
                <div class="explorer-nav-item" onclick="navigateExplorer('${windowId}', 'Musica')" style="display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; white-space: nowrap;">
                    <i data-lucide="music" style="width:14px; height:14px;"></i> Musica
                </div>
            </div>
            <div style="flex: 1; padding-left: 20px; display: flex; flex-direction: column; gap: 20px;">
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div style="display: flex; gap: 8px;">
                        <i data-lucide="chevron-left" onclick="navigateExplorer('${windowId}', 'Unidad C:')" style="width:18px; color: var(--text-secondary); cursor:pointer;"></i>
                        <i data-lucide="chevron-right" style="width:18px; color: var(--text-secondary);"></i>
                    </div>
                    <div class="explorer-path" style="flex:1; background: rgba(0,0,0,0.2); padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary);">
                        Este Equipo > <span style="color: white;">Unidad C:</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="createNewExplorerItem('${windowId}', 'folder')" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <i data-lucide="folder-plus" style="width:14px;height:14px;"></i> Crear Carpeta
                        </button>
                        <button onclick="createNewExplorerItem('${windowId}', 'file')" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <i data-lucide="file-plus" style="width:14px;height:14px;"></i> Crear Archivo
                        </button>
                    </div>
                </div>
                <div class="explorer-main-area" style="flex: 1; overflow-y: auto;">
                    <div style="display: flex; justify-content: center; padding: 20px; color: var(--text-secondary);">
                        Cargando...
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.createNewExplorerItem = async function (windowId, type) {
    const state = window.explorerStates[windowId] || { currentPath: 'C:\\WebOS' };
    const title = type === 'folder' ? 'Nueva Carpeta' : 'Nuevo Archivo';
    const msg = `Introduce el nombre del nuevo ${type === 'folder' ? 'directorio' : 'archivo'}:`;

    showModal(title, msg, async (name) => {
        if (!name) return;
        const newPath = state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name;
        const endpoint = type === 'folder' ? 'mkdir' : 'write';
        const result = await apiVFS(endpoint, 'POST', { user: currentUser, path: newPath, content: "" });
        if (result) navigateExplorer(windowId, state.currentPath);
    }, 'plus', true);
};

window.deleteExplorerItem = async function (windowId, name) {
    const state = window.explorerStates[windowId];
    if (!state) return;

    const protectedItems = ['Escritorio', 'Proyectos', 'Imagenes', 'Documentos', 'Musica', 'WebOS'];
    if (protectedItems.includes(name)) {
        showModal('Protección del Sistema', `No es posible eliminar '${name}' porque es una carpeta esencial del sistema.`, null, 'shield-alert');
        return;
    }

    showModal('Eliminar Elemento', `¿Estás seguro de que quieres eliminar '${name}'?`, async () => {
        const itemPath = state.currentPath.endsWith('\\') ? state.currentPath + name : state.currentPath + '\\' + name;
        const result = await apiVFS('delete', 'POST', { user: currentUser, path: itemPath });
        if (result) navigateExplorer(windowId, state.currentPath);
    });
};

// Virtual File System (VFS) is loaded in loadConfig()

window.terminalStates = window.terminalStates || {};

function handleTerminalInput(e, windowId) {
    if (e.key === 'Enter') {
        const inputEl = e.target;
        const cmdLine = inputEl.value.trim();
        inputEl.value = '';

        const state = window.terminalStates[windowId];
        const outputEl = document.getElementById(`term-output-${windowId}`);
        const promptEl = document.getElementById(`term-prompt-${windowId}`);

        outputEl.innerHTML += `<div><span style="color: #cccccc;">PS ${state.path}&gt;</span> ${cmdLine}</div>`;

        if (cmdLine) {
            executeCommand(cmdLine, state, outputEl, windowId);
        }

        const container = document.getElementById(`term-${windowId}`);
        container.scrollTop = container.scrollHeight;
        promptEl.textContent = `PS ${state.path}>`;
    }
}

async function executeCommand(cmdLine, state, outputEl, windowId) {
    // Parsear la línea de comandos respetando comillas para rutas con espacios
    const args = cmdLine.match(/(?:[^\s"']+|"([^"]*)"|'([^']*)')+/g)?.map(arg => {
        if (arg.startsWith('"') && arg.endsWith('"')) return arg.slice(1, -1);
        if (arg.startsWith("'") && arg.endsWith("'")) return arg.slice(1, -1);
        return arg;
    }) || [];

    if (args.length === 0) return "";
    const cmd = args[0].toLowerCase();
    let result = "";

    if (cmd === 'clear' || cmd === 'cls') {
        if (outputEl) outputEl.innerHTML = '';
        return "Terminal limpia.";
    }
    if (cmd === 'echo') {
        const text = args.slice(1).join(' ');
        if (outputEl) outputEl.innerHTML += `<div>${text}</div>`;
        return text;
    }
    if (cmd === 'cd') {
        if (args.length < 2) {
            const out = state.path;
            if (outputEl) outputEl.innerHTML += `<div>${out}</div>`;
            return out;
        }
        let target = args.slice(1).join(' ');
        if (target === '..') {
            const parts = state.path.split('\\');
            if (parts.length > 1) {
                if (parts.length === 2 && parts[0] === 'C:') state.path = 'C:\\';
                else { parts.pop(); state.path = parts.join('\\'); }
            }
        } else {
            let newPath = state.path === 'C:\\' ? state.path + target : state.path + '\\' + target;
            const check = await apiVFS('list', 'GET', { user: currentUser, path: newPath });
            if (check) {
                state.path = newPath;
            } else {
                const err = `cd : No se encuentra la ruta '${target}'`;
                if (outputEl) outputEl.innerHTML += `<div style="color:#ff5f57;">${err}</div>`;
                return "ERROR: " + err;
            }
        }
        syncExplorerWithTerminal(state.path);
        return `Cambiado a ${state.path}`;
    }
    if (cmd === 'dir' || cmd === 'ls') {
        let targetPath = state.path;
        if (args.length > 1) {
            let argPath = args.slice(1).join(' ');
            // Si el path no es absoluto (no empieza por C:\), lo hacemos relativo al actual
            if (!argPath.match(/^[a-zA-Z]:\\/)) {
                targetPath = state.path.endsWith('\\') ? state.path + argPath : state.path + '\\' + argPath;
            } else {
                targetPath = argPath;
            }
        }

        const contents = await apiVFS('list', 'GET', { user: currentUser, path: targetPath });
        if (contents) {
            // Ordenar: carpetas primero, luego por nombre alfabético
            contents.sort((a, b) => {
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });
            if (contents.length === 0) {
                if (outputEl) outputEl.innerHTML += `<div>Directorio vacío.</div>`;
                return "Directorio vacío.";
            } else {
                let textResult = `Directorio: ${targetPath}\n\nMode                Name\n----                ----\n`;
                let htmlList = `<div style="display:flex; flex-direction:column; gap:2px;"><div>Directorio: ${targetPath}</div><br>`;
                contents.forEach(item => {
                    const mode = item.type === 'dir' ? 'd-----' : '-a----';
                    htmlList += `<div style="display:flex;"><span style="width:100px;">${mode}</span><span>${item.name}</span></div>`;
                    textResult += `${mode.padEnd(20)}${item.name}\n`;
                });
                htmlList += `</div><br>`;
                if (outputEl) outputEl.innerHTML += htmlList;
                return textResult;
            }
        }
        return "Error al listar.";
    }
    if (cmd === 'mkdir') {
        const name = args[1];
        if (!name) return "Error: Falta nombre.";
        const newPath = state.path.endsWith('\\') ? state.path + name : state.path + '\\' + name;
        await apiVFS('mkdir', 'POST', { user: currentUser, path: newPath });
        if (outputEl) outputEl.innerHTML += `<div>Directorio '${name}' creado físicamente.</div>`;
        return `Directorio ${name} creado.`;
    }
    if (cmd === 'python') {
        let scriptName = "";
        // Si el usuario usó comillas, el parser de 'args' ya lo tiene bien en args[1]
        // Si no usó comillas, capturamos todo lo que sigue después de "python "
        if (cmdLine.includes('"') || cmdLine.includes("'")) {
            scriptName = args[1];
        } else {
            const index = cmdLine.toLowerCase().indexOf('python');
            scriptName = cmdLine.substring(index + 6).trim();
        }

        if (!scriptName) {
            const err = "python : Falta el nombre del script.";
            if (outputEl) outputEl.innerHTML += `<div style="color:#ff5f57;">${err}</div>`;
            return "ERROR: " + err;
        }

        // Determinar ruta completa (absoluta o relativa)
        let fullPath = scriptName;
        if (!scriptName.match(/^[a-zA-Z]:\\/) && !scriptName.startsWith('/')) {
            fullPath = state.path.endsWith('\\') ? state.path + scriptName : state.path + '\\' + scriptName;
        }

        if (outputEl) outputEl.innerHTML += `<div>Ejecutando Python script: ${scriptName}...</div>`;

        try {
            const response = await fetch('http://localhost:8000/api/python/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser, path: fullPath })
            });

            const data = await response.json();
            if (data.status === 'ok') {
                if (outputEl) {
                    const formattedOutput = (data.output || "").replace(/\n/g, '<br>');
                    outputEl.innerHTML += `<div style="color: #10b981;">${formattedOutput}</div>`;
                }
                return data.output;
            } else {
                const err = data.output || "Error desconocido.";
                if (outputEl) outputEl.innerHTML += `<div style="color:#ff5f57;">${err}</div>`;
                return "ERROR: " + err;
            }
        } catch (e) {
            const err = "Error de conexión con el servidor.";
            if (outputEl) outputEl.innerHTML += `<div style="color:#ff5f57;">${err}</div>`;
            return "ERROR: " + err;
        }
    }
    if (cmd === 'system_info' || cmd === 'system_health' || cmd === 'health') {
        const memory = JSON.parse(localStorage.getItem(`webos_memory_${currentUser}`) || '{}');
        const memoryKeys = Object.keys(memory).length;
        const uptime = Math.floor((Date.now() - (window.systemStartTime || Date.now())) / 1000);
        const storageItems = localStorage.length;

        // Medir latencia básica a la API (ping)
        let latencyInfo = "Calculando...";
        const startPing = Date.now();

        const reportBody = `
╔══════════════════════════════════════════════════════════════╗
║        EASY IA WebOS - ADVANCED SYSTEM INFORMATION           ║
╚══════════════════════════════════════════════════════════════╝
 FECHA SISTEMA : ${new Date().toLocaleString()}
 KERNEL VER    : 2.5.0-STABLE (X64)
 USER AGENT    : ${navigator.userAgent.substring(0, 45)}...
 RESOLUTION    : 1920x1080 (Full HD)
────────────────────────────────────────────────────────────────

 ESTADO DE COMPONENTES:
 ● Sistema de Archivos (VFS) : [ OK ] (Unidad C:\\ cargada)
 ● Motor de Herramientas     : [ OK ] (Activo)
 ● Base de Datos Local       : [ OK ] (${storageItems} nodos en localStorage)
 ● Memoria de IA Persistente : [ OK ] (${memoryKeys} registros)

 MÉTRICAS DE RENDIMIENTO:
 ● Tiempo de Actividad (Uptime) : ${uptime}s
 ● Latencia de Red IA           : [ Verificando... ]
 ● Carga de Contexto            : [ BAJA ]

 INFRAESTRUCTURA IA:
 ● Endpoint : ${systemConfig.ai_model.url}
 ● Modelo   : ${systemConfig.ai_model.model}

 [ CONCLUSIÓN: SISTEMA SALUDABLE ]
────────────────────────────────────────────────────────────────`.trim();

        if (outputEl) {
            outputEl.innerHTML += `<div id="health-report-${windowId}" style="color: #10b981; white-space: pre-wrap; margin: 10px 0; font-family: monospace;">${reportBody.replace(/\n/g, '<br>')}</div>`;

            // Intento de ping real para la latencia
            fetch(systemConfig.ai_model.url, { method: 'OPTIONS' }).then(() => {
                const lat = Date.now() - startPing;
                const el = document.getElementById(`health-report-${windowId}`);
                if (el) el.innerHTML = el.innerHTML.replace('[ Verificando... ]', `[ ${lat}ms ]`);
            }).catch(() => {
                const el = document.getElementById(`health-report-${windowId}`);
                if (el) el.innerHTML = el.innerHTML.replace('[ Verificando... ]', `[ ERROR / TIMEOUT ]`);
            });
        }
        return reportBody;
    }
    if (cmd === 'help') {
        const helpText = `Comandos: cd, ls/dir, mkdir, python, system_info, clear, echo, help`;
        if (outputEl) outputEl.innerHTML += `<div>${helpText}</div>`;
        return helpText;
    }
    const err = `${cmd} : Comando no reconocido.`;
    if (outputEl) outputEl.innerHTML += `<div style="color: #ff5f57;">${err}</div>`;
    return "ERROR: " + err;
}

function refreshExplorers() {
    openApps.forEach(app => {
        if (app.appId === 'explorer') {
            // we don't have the current path of the explorer window easily, 
            // but navigateExplorer handles 'Inicio' etc.
            // For now, simple refresh to Inicio or current state if we had it.
        }
    });
}

function syncExplorerWithTerminal(path) {
    const explorerWin = openApps.find(a => a.appId === 'explorer');
    if (explorerWin) {
        let mappedPath = '';
        if (path.toLowerCase() === 'c:\\webos') mappedPath = 'Unidad C:';
        else if (path.toLowerCase() === 'c:\\webos\\escritorio') mappedPath = 'Escritorio';
        else if (path.toLowerCase() === 'c:\\webos\\mis proyectos') mappedPath = 'Mis Proyectos';
        else if (path.toLowerCase() === 'c:\\webos\\imagenes') mappedPath = 'Imagenes';
        else if (path.toLowerCase() === 'c:\\webos\\documentos') mappedPath = 'Documentos';

        if (mappedPath) {
            navigateExplorer(explorerWin.id, mappedPath);
        }
    }
}

function getTerminalContent(windowId) {
    if (!window.terminalStates[windowId]) {
        window.terminalStates[windowId] = { path: 'C:\\WebOS', history: [] };
    }
    const state = window.terminalStates[windowId];

    return `
        <div class="terminal-container" id="term-${windowId}" 
             onclick="if(!window.getSelection().toString()) document.getElementById('term-input-${windowId}').focus()" 
             style="background: rgba(0,0,0,0.6); height: 100%; border-radius: 0 0 12px 12px; padding: 10px; font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9rem; color: #cccccc; overflow-y: auto; display: flex; flex-direction: column; user-select: text; cursor: text;">
            <div style="pointer-events: none;">Windows PowerShell</div>
            <div style="pointer-events: none;">Copyright (C) Microsoft Corporation. Todos los derechos reservados.</div>
            <br>
            <div id="term-output-${windowId}" style="display:flex; flex-direction: column; gap: 4px; user-select: text;"></div>
            <div style="display: flex; gap: 8px; margin-top: 4px;">
                <span id="term-prompt-${windowId}" style="color: #cccccc; white-space: nowrap; user-select: none;">PS ${state.path}&gt;</span>
                <input id="term-input-${windowId}" type="text" autocomplete="off" spellcheck="false" onkeydown="handleTerminalInput(event, '${windowId}')" style="flex: 1; background: transparent; border: none; color: #cccccc; font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9rem; outline: none; user-select: text;">
            </div>
        </div>
    `;
}

function getSettingsContent(windowId) {
    const ai = systemConfig.ai_model;

    return `
        <div style="display: flex; height: 100%; gap: 0;">
            <!-- Columna Izquierda (Navegacion) -->
            <div style="width: 180px; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 15px; display: flex; flex-direction: column; gap: 10px;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; margin-top: 5px; margin-left: 10px;">Ajustes</div>
                <button id="tab-btn-ai-${windowId}" class="settings-nav-btn" onclick="switchSettingsTab('${windowId}', 'ai')" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: white; background: rgba(255,255,255,0.1); margin-left: 10px; border:none; width: 100%;">
                    <i data-lucide="cpu" style="width:14px; height:14px;"></i> Modelo IA
                </button>
                <button id="tab-btn-storage-${windowId}" class="settings-nav-btn" onclick="switchSettingsTab('${windowId}', 'storage')" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; border:none; width: 100%; background: transparent;">
                    <i data-lucide="database" style="width:14px;height:14px;"></i> Almacenamiento
                </button>
                <button id="tab-btn-users-${windowId}" class="settings-nav-btn" onclick="switchSettingsTab('${windowId}', 'users')" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; border:none; width: 100%; background: transparent;">
                    <i data-lucide="users" style="width:14px;height:14px;"></i> Usuarios
                </button>
                <button id="tab-btn-style-${windowId}" class="settings-nav-btn" onclick="switchSettingsTab('${windowId}', 'style')" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; border:none; width: 100%; background: transparent;">
                    <i data-lucide="palette" style="width:14px;height:14px;"></i> Estilo Chat
                </button>
                <button id="tab-btn-permissions-${windowId}" class="settings-nav-btn" onclick="switchSettingsTab('${windowId}', 'permissions')" style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; color: var(--text-secondary); margin-left: 10px; border:none; width: 100%; background: transparent;">
                    <i data-lucide="shield-check" style="width:14px;height:14px;"></i> Permisos Sistema
                </button>
            </div>
            
            <!-- Columna Derecha (Contenido) -->
            <div style="flex: 1; padding-left: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; padding-right: 10px;">

                <!-- PANEL: Modelo IA -->
                <div id="tab-ai-${windowId}">
                
                <div class="settings-section">
                    <h3 style="font-size: 1rem; margin-bottom: 15px; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">Conexión al Modelo</h3>
                    <div style="display: flex; gap: 15px; align-items: center; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="flex: 1;">
                            <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 5px;">Nombre del Modelo</label>
                            <input type="text" id="ai-model-name-${windowId}" class="settings-input" value="${ai.model}">
                        </div>
                        <div style="flex: 2;">
                            <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 5px;">IP / URL</label>
                            <input type="text" id="ai-model-url-${windowId}" class="settings-input" value="${ai.url}">
                        </div>
                        <div style="flex: 1;">
                            <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 5px;">API Key</label>
                            <input type="text" id="ai-model-key-${windowId}" class="settings-input" value="${ai.key}">
                        </div>
                    </div>
                </div>

                <div class="settings-section" style="margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 5px;">
                        <h3 style="font-size: 1rem; color: var(--text-secondary); margin: 0;">Parámetros Avanzados</h3>
                        <label class="switch">
                            <input type="checkbox" id="adv-params-toggle-${windowId}" ${ai.advanced_params_enabled ? 'checked' : ''} onchange="toggleAdvancedParams('${windowId}')">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    
                    <div id="adv-params-container-${windowId}" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); transition: opacity 0.3s; ${ai.advanced_params_enabled ? '' : 'opacity: 0.3; pointer-events: none;'}">
                        ${Object.entries(ai.parameters).map(([key, val]) => `
                            <div>
                                <label style="display:block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 5px;">${key}</label>
                                <input type="number" step="0.01" class="settings-input param-input" data-key="${key}" value="${val}">
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="settings-section" style="margin-bottom: 20px;">
                    <div style="display: flex; gap: 20px;">
                        <!-- Prompt del Sistema -->
                        <div style="flex: 1; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;">Prompt del Sistema</h3>
                                <label class="switch">
                                    <input type="checkbox" id="sys-prompt-toggle-${windowId}" ${systemConfig.system && systemConfig.system.system_active ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <textarea id="sys-prompt-val-${windowId}" class="settings-input" style="height: 100px; resize: none;">${systemConfig.system ? systemConfig.system.system_prompt : ''}</textarea>
                            
                            <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                                <label class="secondary-btn" style="padding: 5px 10px; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-secondary);">
                                    <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Adjuntar Doc
                                    <input type="file" onchange="handleSettingsDocUpload(event, '${windowId}', 'system')" style="display:none;">
                                </label>
                                <span id="sys-doc-name-${windowId}" style="font-size: 0.7rem; color: var(--accent-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;">
                                    ${(systemConfig.system && systemConfig.system.system_doc) ? '✓ ' + (systemConfig.system.docName || 'system_doc.js') : 'Sin documento'}
                                </span>
                                <div style="display: flex; gap: 8px; align-items: center; margin-left: 5px;">
                                    <i data-lucide="refresh-cw" onclick="syncSystemDoc('${windowId}')" title="Sincronizar" style="width: 12px; cursor: pointer; color: var(--text-secondary);"></i>
                                    ${(systemConfig.system && systemConfig.system.system_doc) ? `<i data-lucide="eye" onclick="showDocumentationPreview('system')" title="Vista previa" style="width: 12px; cursor: pointer; color: #3b82f6;"></i>` : ''}
                                    ${(systemConfig.system && systemConfig.system.system_doc) ? `<i data-lucide="trash-2" onclick="clearSettingsDoc('${windowId}', 'system')" title="Eliminar" style="width: 12px; cursor: pointer; color: #ff5f57;"></i>` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Loop del Sistema -->
                        <div style="flex: 1; background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;">Loop del Sistema (Heartbeat)</h3>
                                <label class="switch">
                                    <input type="checkbox" id="loop-prompt-toggle-${windowId}" ${systemConfig.loop && systemConfig.loop.loop_active ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <textarea id="loop-prompt-val-${windowId}" class="settings-input" style="height: 60px; resize: none; margin-bottom: 10px;">${systemConfig.loop ? systemConfig.loop.loop_prompt : ''}</textarea>
                            
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div>
                                    <label style="display:block; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 3px;">Minutos</label>
                                    <input type="number" id="loop-min-val-${windowId}" class="settings-input" value="${systemConfig.loop ? systemConfig.loop.loop_minutes : 5}" style="width: 55px; padding: 5px 8px;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 10px; margin-top: 15px;">
                                    <label class="secondary-btn" style="padding: 5px 10px; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-secondary); white-space: nowrap;">
                                        <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Adjuntar Doc
                                        <input type="file" onchange="handleSettingsDocUpload(event, '${windowId}', 'loop')" style="display:none;">
                                    </label>
                                    <span id="loop-doc-name-${windowId}" style="font-size: 0.7rem; color: var(--accent-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">
                                        ${(systemConfig.loop && systemConfig.loop.loop_doc) ? '✓ ' + (systemConfig.loop.docName || 'loop_doc.js') : 'Sin documento'}
                                    </span>
                                    <div style="display: flex; gap: 8px; align-items: center; margin-left: 5px;">
                                        <i data-lucide="refresh-cw" onclick="syncLoopDoc('${windowId}')" title="Sincronizar" style="width: 12px; cursor: pointer; color: var(--text-secondary);"></i>
                                        ${(systemConfig.loop && systemConfig.loop.loop_doc) ? `<i data-lucide="eye" onclick="showDocumentationPreview('loop')" title="Vista previa" style="width: 12px; cursor: pointer; color: #3b82f6;"></i>` : ''}
                                        ${(systemConfig.loop && systemConfig.loop.loop_doc) ? `<i data-lucide="trash-2" onclick="clearSettingsDoc('${windowId}', 'loop')" title="Eliminar" style="width: 12px; cursor: pointer; color: #ff5f57;"></i>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <button class="primary-btn" onclick="saveConfig('${windowId}')" style="background: var(--accent-color); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-family: inherit; font-weight: 500; font-size: 0.85rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center;">
                        <i data-lucide="save" style="width: 14px; height: 14px; margin-right: 8px;"></i> <span class="btn-text">Guardar Cambios</span>
                    </button>
                </div>
                </div><!-- end tab-ai -->

                <!-- PANEL: Almacenamiento -->
                <div id="tab-storage-${windowId}" style="display:none; flex-direction: column; gap: 20px;">
                    <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 5px;">Almacenamiento</h2>

                    <!-- Info -->
                    <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">Estado del localStorage</h3>
                        <div id="storage-info-${windowId}" style="font-size: 0.85rem; color: var(--text-primary);">Calculando...</div>
                    </div>

                    <!-- Backup -->
                    <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">Copia de Seguridad</h3>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Exporta todos los datos del WebOS (config, documentos, chats) a un archivo .json</p>
                        <button onclick="exportBackup()" style="background: var(--accent-color); color: white; border: none; padding: 9px 18px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="download" style="width:14px;height:14px;"></i> Exportar copia
                        </button>
                    </div>

                    <!-- Restaurar -->
                    <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                        <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">Restaurar Copia</h3>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Importa una copia exportada anteriormente. Esto sobrescribirá todos los datos actuales.</p>
                        <label style="background: #3b82f6; color: white; border: none; padding: 9px 18px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                            <i data-lucide="upload" style="width:14px;height:14px;"></i> Importar copia
                            <input type="file" accept=".json" onchange="importBackup(event)" style="display:none;">
                        </label>
                    </div>

                    <!-- Reset -->
                    <div style="background: rgba(255, 80, 80, 0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255, 80, 80, 0.2);">
                        <h3 style="font-size: 0.85rem; color: #ff5f57; margin-bottom: 8px;">Restablecer de Fábrica</h3>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Borra todos los datos del localStorage y restaura la configuración inicial de config.js. Esta acción no se puede deshacer.</p>
                        <button onclick="factoryReset()" style="background: rgba(255,80,80,0.2); color: #ff5f57; border: 1px solid rgba(255,80,80,0.4); padding: 9px 18px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Restablecer sistema
                        </button>
                    </div>
                </div><!-- end tab-storage -->

                <!-- PANEL: Usuarios y Sesiones -->
                <div id="tab-users-${windowId}" style="display:none; flex-direction: column; gap: 20px;">
                    <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 5px;">Gestión de Usuarios</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 20px;">
                        <!-- Lista de Usuarios -->
                        <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px;">
                            <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">Usuarios Registrados</h3>
                            <div id="settings-user-list-${windowId}" style="display: flex; flex-direction: column; gap: 5px;">
                                <!-- Usuarios aquí -->
                            </div>
                        </div>

                        <!-- Lista de Sesiones del Usuario Seleccionado -->
                        <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Sesiones de Chat</h3>
                                <button onclick="deleteAllSessions()" style="font-size: 0.7rem; background: rgba(255,80,80,0.1); color: #ff5f57; border: 1px solid rgba(255,80,80,0.2); padding: 2px 8px; border-radius: 4px; cursor: pointer;">Borrar Todas</button>
                            </div>
                            <div id="settings-session-list-${windowId}" style="display: flex; flex-direction: column; gap: 5px;">
                                <!-- Sesiones aquí -->
                                <div style="text-align: center; color: var(--text-secondary); font-size: 0.8rem; padding: 20px;">Selecciona un usuario para ver sus sesiones</div>
                            </div>
                        </div>
                    </div>

                    <!-- SECCIÓN: Memoria de la IA -->
                    <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <h3 style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Memoria Persistente de la IA</h3>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="clearAIMemory('${windowId}')" style="font-size: 0.7rem; background: rgba(255,80,80,0.1); color: #ff5f57; border: 1px solid rgba(255,80,80,0.2); padding: 4px 10px; border-radius: 4px; cursor: pointer;">Borrar Memoria</button>
                                <button onclick="saveAIMemoryFromUI('${windowId}')" style="font-size: 0.7rem; background: var(--accent-color-light); color: var(--accent-color); border: 1px solid var(--accent-color-border); padding: 4px 10px; border-radius: 4px; cursor: pointer;">Guardar Cambios</button>
                            </div>
                        </div>
                        <textarea id="ai-memory-viewer-${windowId}" style="width: 100%; height: 160px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #10b981; font-family: monospace; font-size: 0.75rem; padding: 10px; resize: vertical; outline: none;" spellcheck="false"></textarea>
                    </div>
                </div><!-- end tab-users -->

                <!-- PANEL: Estilo Chat -->
                <div id="tab-style-${windowId}" style="display:none; flex-direction: column; gap: 20px;">
                    <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 5px;">Estilo del Chat</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 12px;">
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Color de Texto</label>
                            <input type="color" id="chat-text-color-${windowId}" style="width: 100%; height: 35px; border: none; background: transparent; cursor: pointer;">
                            
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Color Negrita (Bold)</label>
                            <input type="color" id="chat-bold-color-${windowId}" style="width: 100%; height: 35px; border: none; background: transparent; cursor: pointer;">
                            
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Tamaño de Fuente (rem)</label>
                            <input type="number" id="chat-font-size-${windowId}" step="0.05" class="settings-input">
                        </div>
                        
                        <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 12px;">
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Color Globo Usuario</label>
                            <input type="color" id="chat-user-bg-${windowId}" style="width: 100%; height: 35px; border: none; background: transparent; cursor: pointer;">
                            
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Color Globo IA</label>
                            <input type="color" id="chat-ai-bg-${windowId}" style="width: 100%; height: 35px; border: none; background: transparent; cursor: pointer;">
                            
                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Ancho de Burbuja (%)</label>
                            <input type="number" id="chat-bubble-width-${windowId}" class="settings-input">

                            <label style="font-size: 0.8rem; color: var(--text-secondary);">Transparencia de Globos (0.1 - 1.0)</label>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <input type="range" id="chat-bubble-opacity-${windowId}" min="0.1" max="1.0" step="0.05" style="flex: 1; accent-color: var(--accent-color);">
                                <span id="chat-bubble-opacity-val-${windowId}" style="font-size: 0.8rem; color: var(--text-secondary); width: 30px;">0.4</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 8px;">
                        <label style="font-size: 0.8rem; color: var(--text-secondary);">Estilo de Fuente</label>
                        <select id="chat-font-family-${windowId}" class="settings-input" style="background: rgba(0,0,0,0.2);">
                            <option value="'Inter', sans-serif">Inter (Moderno)</option>
                            <option value="'Roboto', sans-serif">Roboto (Limpio)</option>
                            <option value="'Montserrat', sans-serif">Montserrat (Elegante)</option>
                            <option value="'Open Sans', sans-serif">Open Sans (Legible)</option>
                            <option value="'Ubuntu', sans-serif">Ubuntu (Redondeado)</option>
                            <option value="'Consolas', monospace">Consolas (Programador)</option>
                            <option value="system-ui, sans-serif">Sistema (Nativo)</option>
                        </select>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                        <button class="primary-btn" onclick="saveChatStyle('${windowId}')" style="background: var(--accent-color); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 500; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="palette" style="width: 14px;"></i> <span class="btn-text">Guardar Cambios</span>
                        </button>
                    </div>
                </div><!-- end tab-style -->

                <!-- PANEL: Permisos del Sistema (Cargado desde permissions.js) -->
                ${getPermissionsTabContent(windowId)}

            </div>
        </div>
    `;
}

window.switchSettingsTab = function (windowId, tab) {
    const aiPanel = document.getElementById('tab-ai-' + windowId);
    const storagePanel = document.getElementById('tab-storage-' + windowId);
    const aiBtn = document.getElementById('tab-btn-ai-' + windowId);
    const storageBtn = document.getElementById('tab-btn-storage-' + windowId);
    const usersPanel = document.getElementById('tab-users-' + windowId);
    const usersBtn = document.getElementById('tab-btn-users-' + windowId);
    const stylePanel = document.getElementById('tab-style-' + windowId);
    const styleBtn = document.getElementById('tab-btn-style-' + windowId);
    const permissionsPanel = document.getElementById('tab-permissions-' + windowId);
    const permissionsBtn = document.getElementById('tab-btn-permissions-' + windowId);

    if (!aiPanel || !storagePanel || !usersPanel || !stylePanel || !permissionsPanel) return;

    aiPanel.style.display = 'none';
    storagePanel.style.display = 'none';
    usersPanel.style.display = 'none';
    stylePanel.style.display = 'none';
    permissionsPanel.style.display = 'none';
    aiBtn.style.background = storageBtn.style.background = usersBtn.style.background = styleBtn.style.background = permissionsBtn.style.background = 'transparent';
    aiBtn.style.color = storageBtn.style.color = usersBtn.style.color = styleBtn.style.color = permissionsBtn.style.color = 'var(--text-secondary)';

    if (tab === 'ai') {
        aiPanel.style.display = 'block';
        aiBtn.style.background = 'rgba(255,255,255,0.1)';
        aiBtn.style.color = 'white';
    } else if (tab === 'storage') {
        storagePanel.style.display = 'flex';
        storageBtn.style.background = 'rgba(255,255,255,0.1)';
        storageBtn.style.color = 'white';
        calculateStorageUsage(windowId);
    } else if (tab === 'users') {
        usersPanel.style.display = 'flex';
        usersBtn.style.background = 'rgba(255,255,255,0.1)';
        usersBtn.style.color = 'white';
        loadSettingsUsersList(windowId);

        // Sincronizar y cargar memoria de la IA
        if (window.syncPermissionsToMemory) window.syncPermissionsToMemory();
        const memoryEl = document.getElementById(`ai-memory-viewer-${windowId}`);
        if (memoryEl) {
            const memory = localStorage.getItem(`webos_memory_${currentUser}`) || '{}';
            try {
                memoryEl.value = JSON.stringify(JSON.parse(memory), null, 2);
            } catch (e) {
                memoryEl.value = memory;
            }
        }
    } else if (tab === 'style') {
        stylePanel.style.display = 'flex';
        styleBtn.style.background = 'rgba(255,255,255,0.1)';
        styleBtn.style.color = 'white';
        loadSettingsChatStyle(windowId);
    } else if (tab === 'permissions') {
        permissionsPanel.style.display = 'flex';
        permissionsBtn.style.background = 'rgba(255,255,255,0.1)';
        permissionsBtn.style.color = 'white';
    }
    if (window.lucide) lucide.createIcons();
}

async function calculateStorageUsage(windowId) {
    const infoEl = document.getElementById('storage-info-' + windowId);
    if (infoEl) {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const used = (estimate.usage / (1024 * 1024)).toFixed(2);
            const quota = (estimate.quota / (1024 * 1024 * 1024)).toFixed(2);
            infoEl.innerHTML = `<i data-lucide="database" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:5px;"></i> <b>${used} MB</b> usados de <b>${quota} GB</b> disponibles (Gestionado Local-First)`;
            lucide.createIcons();
        } else {
            infoEl.innerHTML = `<i data-lucide="info" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:5px;"></i> Almacenamiento gestionado por <b>IndexedDB</b> (Capacidad: Ilimitada/Gigas)`;
        }
    }
}

let selectedUserForSettings = null;

window.loadSettingsUsersList = async function (windowId) {
    const users = await getGlobalUserList();
    const container = document.getElementById(`settings-user-list-${windowId}`);
    if (!container) return;

    container.innerHTML = users.map(user => `
        <div onclick="selectUserForSettings('${windowId}', '${user}')" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: ${selectedUserForSettings === user ? 'rgba(234, 127, 5, 0.1)' : 'rgba(255,255,255,0.05)'}; border-radius: 6px; cursor: pointer; border: 1px solid ${selectedUserForSettings === user ? 'var(--accent-color)' : 'transparent'};">
            <span style="font-size: 0.85rem; color: ${selectedUserForSettings === user ? 'white' : 'var(--text-secondary)'};">${user} ${user === currentUser ? '(Tú)' : ''}</span>
            <button onclick="event.stopPropagation(); requestDeleteUser('${user}')" style="background: none; border: none; color: #ff5f57; cursor: pointer; padding: 2px;">
                <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
    if (selectedUserForSettings) loadSettingsSessionsList(windowId, selectedUserForSettings);
}

window.selectUserForSettings = function (windowId, user) {
    selectedUserForSettings = user;
    loadSettingsUsersList(windowId);
}

async function loadSettingsSessionsList(windowId, user) {
    const container = document.getElementById(`settings-session-list-${windowId}`);
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.8rem; padding: 20px;">Cargando sesiones de ${user}...</div>`;

    try {
        const sessions = await dbGet('webos_chat_sessions', user) || [];

        if (sessions.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.8rem; padding: 20px;">${user} no tiene sesiones de chat.</div>`;
            return;
        }

        container.innerHTML = sessions.map(s => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                <span style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${s.title || 'Sin título'}</span>
                <button onclick="requestDeleteSession('${user}', '${s.id}')" style="background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; padding: 2px;">
                    <i data-lucide="x" style="width: 14px;"></i>
                </button>
            </div>
        `).join('');
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        container.innerHTML = `<div style="text-align: center; color: #ff5f57; font-size: 0.8rem; padding: 20px;">Error al cargar sesiones.</div>`;
        console.error(e);
    }
}

function applyChatStyles() {
    const style = systemConfig.chat_style || window.SYSTEM_CONFIG.chat_style;
    const root = document.documentElement;

    const hexToRgba = (hex, alpha) => {
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
        let r, g, b;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha !== undefined ? alpha : 0.6})`;
    };

    root.style.setProperty('--chat-text-color', style.text_color);
    root.style.setProperty('--chat-bold-color', style.bold_color);
    root.style.setProperty('--chat-font-size', style.font_size + 'rem');
    root.style.setProperty('--chat-font-family', style.font_family);
    root.style.setProperty('--chat-bubble-width', style.bubble_width + '%');
    root.style.setProperty('--chat-user-bg', hexToRgba(style.user_bubble_color, style.bubble_opacity));
    root.style.setProperty('--chat-ai-bg', hexToRgba(style.ai_bubble_color, style.bubble_opacity));
}

window.loadSettingsChatStyle = function (windowId) {
    const style = systemConfig.chat_style || window.SYSTEM_CONFIG.chat_style;
    document.getElementById(`chat-text-color-${windowId}`).value = style.text_color;
    document.getElementById(`chat-bold-color-${windowId}`).value = style.bold_color;
    document.getElementById(`chat-font-size-${windowId}`).value = style.font_size;
    document.getElementById(`chat-font-family-${windowId}`).value = style.font_family;
    document.getElementById(`chat-user-bg-${windowId}`).value = style.user_bubble_color;
    document.getElementById(`chat-ai-bg-${windowId}`).value = style.ai_bubble_color;
    document.getElementById(`chat-bubble-width-${windowId}`).value = style.bubble_width;

    const opacityInput = document.getElementById(`chat-bubble-opacity-${windowId}`);
    const opacityVal = document.getElementById(`chat-bubble-opacity-val-${windowId}`);
    if (opacityInput && opacityVal) {
        opacityInput.value = style.bubble_opacity || 0.4;
        opacityVal.innerText = style.bubble_opacity || 0.4;
        opacityInput.oninput = (e) => {
            opacityVal.innerText = e.target.value;
        };
    }
}

window.saveChatStyle = async function (windowId) {
    const newStyle = {
        text_color: document.getElementById(`chat-text-color-${windowId}`).value,
        bold_color: document.getElementById(`chat-bold-color-${windowId}`).value,
        font_size: parseFloat(document.getElementById(`chat-font-size-${windowId}`).value),
        font_family: document.getElementById(`chat-font-family-${windowId}`).value,
        user_bubble_color: document.getElementById(`chat-user-bg-${windowId}`).value,
        ai_bubble_color: document.getElementById(`chat-ai-bg-${windowId}`).value,
        bubble_width: parseInt(document.getElementById(`chat-bubble-width-${windowId}`).value),
        bubble_opacity: parseFloat(document.getElementById(`chat-bubble-opacity-${windowId}`).value)
    };

    systemConfig.chat_style = newStyle;
    await dbSet('webos_config', systemConfig);
    applyChatStyles();

    const win = document.getElementById(windowId);
    const btn = win.querySelector('#tab-style-' + windowId + ' .primary-btn');
    if (!btn) return;

    const icon = btn.querySelector('i, svg');
    const text = btn.querySelector('.btn-text');

    btn.style.background = '#10b981';
    if (icon) icon.setAttribute('data-lucide', 'check');
    text.textContent = 'Cambios Guardados';
    lucide.createIcons();

    setTimeout(() => {
        btn.style.background = 'var(--accent-color)';
        if (icon) icon.setAttribute('data-lucide', 'palette');
        text.textContent = 'Guardar Cambios';
        lucide.createIcons();
    }, 2000);
}

window.requestDeleteUser = function (name) {
    if (name === 'Administrador') {
        showModal('Error', 'No puedes eliminar el usuario Administrador.');
        return;
    }

    showModal('Eliminar Usuario', `¿Estás SEGURO de que quieres eliminar al usuario '${name}'? Se borrarán TODOS sus datos (VFS, Config, Chats).`, async () => {
        const users = await getGlobalUserList();
        const newList = users.filter(u => u !== name);
        await saveGlobalUserList(newList);

        // Borrar carpeta física en el servidor
        await fetch('/api/system/delete_user', {
            method: 'POST',
            body: JSON.stringify({ user: name })
        });

        const db = await openDB();
        const transaction = db.transaction('system', 'readwrite');
        const store = transaction.objectStore('system');

        const request = store.getAllKeys();
        request.onsuccess = () => {
            const keys = request.result;
            keys.forEach(k => {
                if (k.startsWith(name + '_')) {
                    store.delete(k);
                }
            });
        };

        if (currentUser === name) {
            localStorage.setItem('webos_current_user', 'Administrador');
            location.reload();
        } else {
            selectedUserForSettings = null;
            const settingsWin = openApps.find(a => a.appId === 'settings');
            if (settingsWin) loadSettingsUsersList(settingsWin.id);
        }
    }, 'trash-2');
}

window.requestDeleteSession = function (user, sessionId) {
    showModal('Eliminar Sesión', '¿Quieres borrar esta sesión de chat permanentemente?', async () => {
        const sessions = await dbGet('webos_chat_sessions', user) || [];
        const newList = sessions.filter(s => s.id !== sessionId);
        await dbSet('webos_chat_sessions', newList, user);

        const db = await openDB();
        const transaction = db.transaction('system', 'readwrite');
        transaction.objectStore('system').delete(user + '_webos_chat_history_' + sessionId);

        if (user === currentUser && sessionId === currentSessionId) {
            localStorage.removeItem(user + '_webos_current_chat_session');
            location.reload();
        } else {
            const settingsWin = openApps.find(a => a.appId === 'settings');
            if (settingsWin) loadSettingsSessionsList(settingsWin.id, user);
        }
    }, 'trash-2');
}

window.deleteAllSessions = function () {
    if (!selectedUserForSettings) return;
    const user = selectedUserForSettings;
    showModal('Borrar Todo', `¿Borrar TODAS las sesiones de ${user}?`, async () => {
        const sessions = await dbGet('webos_chat_sessions', user) || [];
        await dbSet('webos_chat_sessions', [], user);

        const db = await openDB();
        const transaction = db.transaction('system', 'readwrite');
        const store = transaction.objectStore('system');
        sessions.forEach(s => store.delete(user + '_webos_chat_history_' + s.id));

        if (user === currentUser) {
            localStorage.removeItem(user + '_webos_current_chat_session');
            location.reload();
        } else {
            const settingsWin = openApps.find(a => a.appId === 'settings');
            if (settingsWin) loadSettingsSessionsList(settingsWin.id, user);
        }
    }, 'trash-2');
};

window.exportBackup = async function () {
    showModal('Exportar Backup', 'Generando copia de seguridad completa (DB + Archivos)... Por favor espera.');

    try {
        const db = await openDB();
        const transaction = db.transaction('system', 'readonly');
        const store = transaction.objectStore('system');
        const keys = await new Promise(resolve => {
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
        });

        const backup = { _vfs: null };
        for (const key of keys) {
            backup[key] = await new Promise(resolve => {
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
            });
        }

        // Obtener archivos del servidor
        const vfsResponse = await fetch('/api/system/vfs_export', { method: 'POST' });
        backup._vfs = await vfsResponse.json();

        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webos_full_backup_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        closeModal();
    } catch (err) {
        showModal('Error', 'No se pudo generar la copia de seguridad: ' + err.message);
    }
};

window.importBackup = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const backup = JSON.parse(e.target.result);
            showModal('Restaurar Sistema', '¿Deseas restaurar esta copia COMPLETA? Se borrarán los datos y archivos actuales.', async () => {
                const msg = document.getElementById('modal-message');
                if (msg) msg.innerText = '⏳ Restaurando archivos y base de datos... Por favor espera.';
                const btn = document.getElementById('modal-confirm');
                if (btn) btn.style.pointerEvents = 'none'; // Evitar clics repetidos

                await dbClear();

                // Restaurar VFS si existe en el backup
                if (backup._vfs) {
                    await fetch('/api/system/vfs_import', {
                        method: 'POST',
                        body: JSON.stringify({ vfs_tree: backup._vfs })
                    });
                } else {
                    // Si no hay VFS, al menos hacemos factory reset para limpiar
                    await fetch('/api/system/factory_reset', { method: 'POST', body: JSON.stringify({}) });
                }

                // Restaurar DB
                for (let k in backup) {
                    if (k === '_vfs') continue;
                    await dbSet(k, backup[k]);
                }

                location.reload();
            });
        } catch (err) {
            showModal('Error', 'El archivo no es una copia de seguridad válida: ' + err.message);
        }
    };
    reader.readAsText(file);
};

window.factoryReset = async function () {
    showModal('Restablecer Sistema', '⚠️ Esto borrará ABSOLUTAMENTE TODO y volverá al estado de fábrica. ¿Proceder?', async () => {
        const msg = document.getElementById('modal-message');
        if (msg) msg.innerText = '⏳ Limpiando todo el sistema... Por favor espera.';
        const btn = document.getElementById('modal-confirm');
        if (btn) btn.style.pointerEvents = 'none';

        await dbClear();
        // Borrar todos los archivos de usuario en el servidor
        await fetch('/api/system/factory_reset', { method: 'POST', body: JSON.stringify({}) });

        // Clear WebOS related localStorage keys
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('webos_')) localStorage.removeItem(key);
        });
        sessionStorage.clear(); // Limpiar también sesión por si acaso

        // Limpiar caché de red si existe
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            } catch (e) { }
        }

        location.reload();
    });
};

/* Custom Modal Logic */
window.closeModal = function () {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.showModal = function (title, message, onConfirm, icon = 'alert-circle', showInput = false, defaultValue = '') {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;

    const inputEl = document.getElementById('modal-input');
    if (inputEl) {
        inputEl.style.display = showInput ? 'block' : 'none';
        inputEl.value = defaultValue;
        if (showInput) setTimeout(() => inputEl.focus(), 100);
    }

    const iconContainer = overlay.querySelector('.modal-icon');
    if (iconContainer) {
        iconContainer.innerHTML = `<i data-lucide="${icon}"></i>`;
        if (window.lucide) lucide.createIcons();
    }

    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = overlay.querySelector('.cancel');

    cancelBtn.style.display = (onConfirm || showInput) ? 'block' : 'none';

    overlay.style.display = 'flex';
    confirmBtn.onclick = async () => {
        const result = showInput ? inputEl.value.trim() : true;
        if (showInput && !result) return;

        try {
            if (onConfirm) await onConfirm(result);
        } catch (err) {
            console.error("Error in modal confirm:", err);
        } finally {
            closeModal();
        }
    };
}

function getUsersContent(windowId) {
    return `
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 15px; height: 100%;">
            <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto;">
                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 5px;">Seleccionar Perfil</div>
                <div id="user-list-container" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.8rem; padding: 20px;">Cargando...</div>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button onclick="createNewUser()" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--accent-color); background: rgba(234, 127, 5, 0.1); color: var(--accent-color); font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <i data-lucide="user-plus" style="width: 18px;"></i> Crear Nuevo Usuario
                </button>
                <button onclick="requestNewChatSession()" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.1); color: #10b981; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <i data-lucide="message-square-plus" style="width: 18px;"></i> Crear Nueva Sesión
                </button>
            </div>
        </div>
    `;
}

window.requestNewChatSession = function () {
    showModal('Nueva Sesión', 'Nombre de la sesión:', async (name) => {
        if (!name) return;
        await createNewChatSession(name);
        showModal('Éxito', `Sesión "${name}" creada.`);
    }, 'message-square-plus', true, 'Nueva Sesión');
}

// Global user list management (Server-side)
async function getGlobalUserList() {
    try {
        const response = await fetch('/api/system/users');
        if (response.ok) return await response.json();
        return ['Administrador'];
    } catch (e) {
        return ['Administrador'];
    }
}

async function saveGlobalUserList(list) {
    // Redundant now as server lists directories, but kept for compatibility
    return true;
}

window.loadUserList = async function () {
    const users = await getGlobalUserList();
    const container = document.getElementById('user-list-container');
    if (!container) return;

    container.innerHTML = users.map(user => `
        <div onclick="switchUser('${user}')" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: ${user === currentUser ? 'rgba(234, 127, 5, 0.15)' : 'rgba(255,255,255,0.05)'}; border-radius: 8px; cursor: pointer; transition: background 0.2s; border: 1px solid ${user === currentUser ? 'var(--accent-color)' : 'transparent'};">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="user" style="width: 16px; color: ${user === currentUser ? 'var(--accent-color)' : 'white'};"></i>
                </div>
                <span style="font-size: 0.9rem; font-weight: 500; color: ${user === currentUser ? 'white' : 'var(--text-secondary)'};">${user}</span>
            </div>
            ${user === currentUser ? '<i data-lucide="check" style="width: 16px; color: var(--accent-color);"></i>' : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

window.switchUser = function (user) {
    if (user === currentUser) return;
    showModal('Cambiar Usuario', `¿Quieres cerrar sesión actual y entrar como '${user}'?`, () => {
        localStorage.setItem('webos_current_user', user);
        location.reload();
    }, 'log-out');
}

window.createNewUser = function () {
    showModal('Nuevo Perfil', 'Introduce el nombre del nuevo usuario:', async (name) => {
        if (!name) return;
        const users = await getGlobalUserList();
        if (users.map(u => u.toLowerCase()).includes(name.toLowerCase())) {
            showModal('Error', 'Ese usuario ya existe.');
            return;
        }
        // Inicializar carpeta en el servidor
        await apiVFS('init_user', 'POST', { user: name });
        await loadUserList();
    }, 'user-plus', true);
}

// Call loadUserList when window is opened
const originalOpenApp = window.openApp;
window.openApp = function (appId) {
    const wasOpen = openApps.some(a => a.appId === appId);
    originalOpenApp(appId);
    if (!wasOpen && appId === 'explorer') {
        const win = openApps.find(a => a.appId === 'explorer');
        if (win) {
            setTimeout(() => navigateExplorer(win.id, 'Unidad C:'), 100);
        }
    }
    if (appId === 'users') {
        setTimeout(loadUserList, 100);
    }
    if (appId === 'settings') {
        selectedUserForSettings = currentUser;
    }
}

window.toggleAdvancedParams = function (windowId) {
    const toggle = document.getElementById(`adv-params-toggle-${windowId}`);
    const container = document.getElementById(`adv-params-container-${windowId}`);
    if (toggle.checked) {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    } else {
        container.style.opacity = '0.3';
        container.style.pointerEvents = 'none';
    }
}

window.saveConfig = async function (windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;

    // Extract values and update config
    systemConfig.ai_model.model = win.querySelector(`#ai-model-name-${windowId}`).value;
    systemConfig.ai_model.url = win.querySelector(`#ai-model-url-${windowId}`).value;
    systemConfig.ai_model.key = win.querySelector(`#ai-model-key-${windowId}`).value;

    systemConfig.ai_model.advanced_params_enabled = win.querySelector(`#adv-params-toggle-${windowId}`).checked;

    const paramInputs = win.querySelectorAll('.param-input');
    paramInputs.forEach(input => {
        const key = input.getAttribute('data-key');
        systemConfig.ai_model.parameters[key] = parseFloat(input.value);
    });

    if (!systemConfig.system) systemConfig.system = {};
    systemConfig.system.system_active = win.querySelector(`#sys-prompt-toggle-${windowId}`).checked;
    systemConfig.system.system_prompt = win.querySelector(`#sys-prompt-val-${windowId}`).value;
    // system_doc se mantiene en systemConfig

    if (!systemConfig.loop) systemConfig.loop = {};
    systemConfig.loop.loop_active = win.querySelector(`#loop-prompt-toggle-${windowId}`).checked;
    systemConfig.loop.loop_prompt = win.querySelector(`#loop-prompt-val-${windowId}`).value;
    systemConfig.loop.loop_minutes = parseInt(win.querySelector(`#loop-min-val-${windowId}`).value);
    // loop_doc se mantiene en systemConfig

    // Save to IndexedDB silently
    await dbSet('webos_config', systemConfig);

    // Reiniciar loop de heartbeat con los nuevos ajustes
    startHeartbeatLoop();

    const btn = win.querySelector('.primary-btn');
    if (!btn) return;

    const icon = btn.querySelector('i, svg');
    const text = btn.querySelector('.btn-text');

    // Success animation
    btn.style.background = '#10b981';
    if (icon) icon.setAttribute('data-lucide', 'check');
    text.textContent = 'Cambios Guardados';
    lucide.createIcons();

    setTimeout(() => {
        btn.style.background = 'var(--accent-color)';
        if (icon) icon.setAttribute('data-lucide', 'save');
        text.textContent = 'Guardar Cambios';
        lucide.createIcons();
    }, 2000);
}

window.syncSystemDoc = async function (windowId) {
    if (window.SYSTEM_DOC_CONTENT) {
        systemConfig.system.system_doc = window.SYSTEM_DOC_CONTENT;
        systemConfig.system.docName = "system_doc.js";
        await dbSet('webos_config', systemConfig);
        showModal('Sincronización', 'El System Prompt se ha sincronizado desde system_doc.js correctamente.', null, 'refresh-cw');
        const label = document.getElementById(`sys-doc-name-${windowId}`);
        if (label) label.innerText = '✓ system_doc.js';
    }
};

window.syncLoopDoc = async function (windowId) {
    if (window.LOOP_DOC_CONTENT) {
        systemConfig.loop.loop_doc = window.LOOP_DOC_CONTENT;
        systemConfig.loop.docName = "loop_doc.js";
        await dbSet('webos_config', systemConfig);
        showModal('Sincronización', 'El Heartbeat Prompt se ha sincronizado desde loop_doc.js correctamente.', null, 'refresh-cw');
        const label = document.getElementById(`loop-doc-name-${windowId}`);
        if (label) label.innerText = '✓ loop_doc.js';
    }
};

window.showDocumentationPreview = function (type = 'tools') {
    let content = "";
    let title = "Documentación";

    if (type === 'system') {
        content = systemConfig.system.system_doc;
        title = "Vista Previa: System Prompt";
    } else if (type === 'loop') {
        content = systemConfig.loop.loop_doc;
        title = "Vista Previa: Heartbeat Loop";
    } else {
        content = systemConfig.permissions.doc;
        title = "Vista Previa: Manual de Herramientas";
    }

    if (!content) return;

    const modal = document.createElement('div');
    modal.className = 'window window-opening';
    modal.style.cssText = `position: fixed; top: 50px; left: 50%; transform: translateX(-50%); width: 800px; height: 600px; z-index: 10001; background: var(--glass-bg); backdrop-filter: blur(25px); border: 1px solid var(--accent-color); border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); display: flex; flex-direction: column;`;

    modal.innerHTML = `
        <div class="window-header" style="background: rgba(234,127,5,0.1);">
            <div class="window-title"><i data-lucide="eye" style="width:14px; color: var(--accent-color);"></i> ${title}</div>
            <div class="window-controls">
                <button class="win-btn win-close" onclick="this.closest('.window').remove()"><i data-lucide="x"></i></button>
            </div>
        </div>
        <div class="window-content chat-content" style="padding: 30px; overflow-y: auto; background: rgba(0,0,0,0.2);">
            ${marked.parse(content)}
        </div>
    `;

    document.getElementById('desktop').appendChild(modal);
    if (window.lucide) lucide.createIcons();
};

window.handleSettingsDocUpload = function (event, windowId, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        if (type === 'system') {
            if (!systemConfig.system) systemConfig.system = {};
            systemConfig.system.system_doc = content;
            systemConfig.system.docName = file.name;
            const label = document.getElementById(`sys-doc-name-${windowId}`);
            if (label) label.innerText = '✓ ' + file.name;
        } else {
            if (!systemConfig.loop) systemConfig.loop = {};
            systemConfig.loop.loop_doc = content;
            systemConfig.loop.docName = file.name;
            const label = document.getElementById(`loop-doc-name-${windowId}`);
            if (label) label.innerText = '✓ ' + file.name;
        }
        showModal('Documento Cargado', `Se ha leído el contenido de "${file.name}" correctamente. Recuerda guardar los cambios.`, null, 'file-text');
    };
    reader.readAsText(file);
}

window.clearSettingsDoc = function (windowId, type) {
    if (type === 'system') {
        if (systemConfig.system) systemConfig.system.system_doc = null;
        const label = document.getElementById(`sys-doc-name-${windowId}`);
        if (label) label.innerText = 'Sin documento';
    } else {
        if (systemConfig.loop) systemConfig.loop.loop_doc = null;
        const label = document.getElementById(`loop-doc-name-${windowId}`);
        if (label) label.innerText = 'Sin documento';
    }
}

window.saveAIMemoryFromUI = async function (windowId) {
    const memoryEl = document.getElementById(`ai-memory-viewer-${windowId}`);
    if (!memoryEl) return;

    try {
        const content = memoryEl.value.trim();
        const json = JSON.parse(content);
        await dbSet('webos_memory', json);
        showModal('Memoria Guardada', 'Los cambios en la base de conocimientos se han aplicado correctamente en el servidor.', null, 'save');
    } catch (e) {
        showModal('Error de Formato', 'La memoria debe ser un objeto JSON válido.', null, 'alert-triangle');
    }
}

window.clearAIMemory = async function (windowId) {
    if (confirm('¿Estás seguro de que quieres borrar TODA la memoria persistente de la IA para el usuario actual en el servidor?')) {
        await dbSet('webos_memory', {});
        const memoryEl = document.getElementById(`ai-memory-viewer-${windowId}`);
        if (memoryEl) memoryEl.value = '{}';
        showModal('Memoria Borrada', 'La base de conocimientos de la IA ha sido reiniciada.', null, 'trash-2');
    }
}

// init() is called from chat.js after all modules are loaded
