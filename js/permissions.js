// Easy IA WebOS - Permissions Management Logic

window.getPermissionsTabContent = function (windowId) {
    const perm = systemConfig.permissions || window.SYSTEM_CONFIG.permissions;

    return `
        <div id="tab-permissions-${windowId}" style="display:none; flex-direction: column; gap: 20px;">
            <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 5px;">Permisos Sistema</h2>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 10px;">Gestiona los permisos de las funciones del modelo y herramientas del sistema.</p>

            <!-- Prompt de Permisos -->
            <div class="settings-section" style="margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin: 0;">Prompt de Permisos Sistema</h3>
                        <label class="switch">
                            <input type="checkbox" id="perm-prompt-toggle-${windowId}" ${perm.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <textarea id="perm-prompt-val-${windowId}" class="settings-input" style="height: 100px; resize: none; margin-bottom: 10px;" placeholder="Escribe aquí el prompt de permisos...">${perm.prompt || ''}</textarea>
                    
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label class="secondary-btn" style="padding: 5px 10px; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-secondary);">
                            <i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Adjuntar Doc
                            <input type="file" onchange="handlePermissionsDocUpload(event, '${windowId}')" style="display:none;">
                        </label>
                        <span id="perm-doc-name-${windowId}" style="font-size: 0.7rem; color: var(--accent-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">
                            ${perm.docName ? '✓ ' + perm.docName : 'Sin documento'}
                        </span>
                        ${perm.docName === 'tools_doc.js' ? `<i data-lucide="refresh-cw" onclick="syncPermissionsDoc('${windowId}')" title="Sincronizar con disco" style="width: 12px; cursor: pointer; color: var(--text-secondary); margin-left: 5px;"></i>` : ''}
                        ${perm.doc ? `<i data-lucide="eye" onclick="showDocumentationPreview()" title="Ver vista previa" style="width: 12px; cursor: pointer; color: #3b82f6; margin-left: 5px;"></i>` : ''}
                        ${perm.docName ? `<i data-lucide="trash-2" onclick="clearPermissionsDoc('${windowId}')" title="Eliminar documento" style="width: 12px; cursor: pointer; color: #ff5f57; margin-left: 5px;"></i>` : ''}
                    </div>
                </div>
            </div>

            <!-- Grupos de Permisos -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                
                <!-- Grupo: Terminal -->
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                        <i data-lucide="terminal" style="width: 18px; color: #10b981;"></i>
                        <h3 style="font-size: 0.95rem; color: white; margin: 0;">Herramientas de Terminal</h3>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Ejecución de Comandos (terminal)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-term-execute-${windowId}" ${perm.tools.terminal.execute ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--accent-color); opacity: 0.8;">Comandos: cd, ls, dir, mkdir, clear, echo, help</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Acceso a Historial (history)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-term-history-${windowId}" ${perm.tools.terminal.history ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Permite ver la lista de comandos ejecutados anteriormente.</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Limpieza de Buffer (clear)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-term-clear-${windowId}" ${perm.tools.terminal.clear ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Permite borrar el texto visible de la terminal.</span>
                        </div>
                    </div>
                </div>

                <!-- Grupo: Archivos y Carpetas -->
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                        <i data-lucide="folder" style="width: 18px; color: #3b82f6;"></i>
                        <h3 style="font-size: 0.95rem; color: white; margin: 0;">Archivos y Carpetas</h3>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Lectura y Listado (file_read / folder_ls)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-file-read-${windowId}" ${perm.tools.files.read ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Ver contenido de archivos y listar carpetas.</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Escritura / Modificación (file_write)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-file-write-${windowId}" ${perm.tools.files.write ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Crear o editar el contenido de los archivos.</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Creación de Carpetas (folder_mkdir)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-file-mkdir-${windowId}" ${perm.tools.files.mkdir ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Crear nuevos directorios en el sistema.</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: #ff5f57;">Eliminación de Archivos y Carpetas (item_delete)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-file-delete-${windowId}" ${perm.tools.files.delete ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: #ff5f57; opacity: 0.6;">Borrar elementos de forma permanente.</span>
                        </div>
                    </div>
                </div>

                <!-- Grupo: Funciones del Sistema -->
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                        <i data-lucide="cpu" style="width: 18px; color: #a855f7;"></i>
                        <h3 style="font-size: 0.95rem; color: white; margin: 0;">Funciones del Sistema</h3>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Comprobar Permisos (check_permissions)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-sys-check-${windowId}" ${perm.tools.system && perm.tools.system.check_permissions ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--text-secondary); opacity: 0.6;">Permite saber qué herramientas tiene activadas.</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.85rem; color: var(--text-secondary);">Gestión de Memoria Dinamica (memory_save/delete)</span>
                                <label class="switch">
                                    <input type="checkbox" id="perm-sys-memory-${windowId}" ${perm.tools.system && perm.tools.system.memory_sesion ? 'checked' : ''}>
                                    <span class="slider round"></span>
                                </label>
                            </div>
                            <span style="font-size: 0.7rem; color: var(--accent-color); opacity: 0.8;">Permite al modelo guardar y modificar los datos en su base de memoria.</span>
                        </div>
                    </div>
                </div>

            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 10px; margin-bottom: 20px;">
                <button class="primary-btn" onclick="savePermissions('${windowId}')" style="background: var(--accent-color); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-family: inherit; font-weight: 500; font-size: 0.85rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center;">
                    <i data-lucide="shield-check" style="width: 14px; height: 14px; margin-right: 8px;"></i> <span class="btn-text">Guardar Cambios</span>
                </button>
            </div>
        </div>
    `;
};

window.handlePermissionsDocUpload = function (event, windowId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        if (!systemConfig.permissions) systemConfig.permissions = { ...window.SYSTEM_CONFIG.permissions };
        systemConfig.permissions.doc = content;
        systemConfig.permissions.docName = file.name;

        const label = document.getElementById(`perm-doc-name-${windowId}`);
        if (label) label.innerText = '✓ ' + file.name;

        showModal('Documento de Permisos', `Se ha cargado "${file.name}" como referencia de seguridad.`, null, 'shield');
    };
    reader.readAsText(file);
};

window.clearPermissionsDoc = function (windowId) {
    if (systemConfig.permissions) {
        systemConfig.permissions.doc = null;
        systemConfig.permissions.docName = null;
    }
    const label = document.getElementById(`perm-doc-name-${windowId}`);
    if (label) label.innerText = 'Sin documento';
};

window.syncPermissionsDoc = async function (windowId) {
    const perm = systemConfig.permissions;
    if (!perm || perm.docName !== 'tools_doc.js') return;

    const icon = document.querySelector(`#tab-permissions-${windowId} [onclick*="syncPermissionsDoc"]`);
    if (icon) icon.classList.add('spin-animation');

    const text = window.TOOLS_DOC_CONTENT;
    if (text) {
        systemConfig.permissions.doc = text;
        await dbSet('webos_config', systemConfig);
        showModal('Sincronización', 'El documento tools_doc.js se ha sincronizado desde la memoria del sistema.', null, 'refresh-cw');
    }

    if (icon) icon.classList.remove('spin-animation');
};

window.savePermissions = async function (windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;

    if (!systemConfig.permissions) {
        systemConfig.permissions = JSON.parse(JSON.stringify(window.SYSTEM_CONFIG.permissions));
    }

    const perm = systemConfig.permissions;

    perm.active = win.querySelector(`#perm-prompt-toggle-${windowId}`).checked;
    perm.prompt = win.querySelector(`#perm-prompt-val-${windowId}`).value;

    // Terminal
    perm.tools.terminal.execute = win.querySelector(`#perm-term-execute-${windowId}`).checked;
    perm.tools.terminal.history = win.querySelector(`#perm-term-history-${windowId}`).checked;
    perm.tools.terminal.clear = win.querySelector(`#perm-term-clear-${windowId}`).checked;

    // Files
    perm.tools.files.read = win.querySelector(`#perm-file-read-${windowId}`).checked;
    perm.tools.files.write = win.querySelector(`#perm-file-write-${windowId}`).checked;
    perm.tools.files.mkdir = win.querySelector(`#perm-file-mkdir-${windowId}`).checked;
    perm.tools.files.delete = win.querySelector(`#perm-file-delete-${windowId}`).checked;

    // System Functions
    if (!perm.tools.system) perm.tools.system = {};
    perm.tools.system.check_permissions = win.querySelector(`#perm-sys-check-${windowId}`).checked;
    perm.tools.system.memory_sesion = win.querySelector(`#perm-sys-memory-${windowId}`).checked;

    await dbSet('webos_config', systemConfig);

    const btn = win.querySelector('#tab-permissions-' + windowId + ' .primary-btn');
    if (btn) {
        const icon = btn.querySelector('i, svg');
        const text = btn.querySelector('.btn-text');

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

    // ── Notificar al modelo: llamada aislada sin historial ──
    setTimeout(() => sendPermissionsAlertToModel(), 300);

    // Sincronizar con la memoria persistente
    syncPermissionsToMemory(perm);
};

window.syncPermissionsToMemory = function (perm) {
    if (!perm) return;
    const summary = {
        terminal: perm.tools.terminal.execute ? "ON" : "OFF",
        file_read: perm.tools.files.read ? "ON" : "OFF",
        file_write: perm.tools.files.write ? "ON" : "OFF",
        file_delete: perm.tools.files.delete ? "ON" : "OFF",
        file_mkdir: perm.tools.files.mkdir ? "ON" : "OFF",
        memory: (perm.tools.system && perm.tools.system.memory_sesion) ? "ON" : "OFF"
    };
    let memory = JSON.parse(localStorage.getItem('webos_long_term_memory') || '{}');
    memory['permisos_sistema'] = JSON.stringify(summary);
    localStorage.setItem('webos_long_term_memory', JSON.stringify(memory));
};

/**
 * Returns only the user's custom prompt and attached document.
 * This is injected into EVERY request as the system message.
 */
window.getSystemPermissionsPrompt = function () {
    const perm = systemConfig.permissions;
    if (!perm || !perm.active) return null;

    let content = "";

    if (perm.prompt) {
        content += "--- INSTRUCCIONES ADICIONALES ---\n" + perm.prompt;
    }

    if (perm.doc) {
        content += (content ? "\n\n" : "") + "--- MANUAL DE USO DE HERRAMIENTAS ---\n" + perm.doc;
    }

    return content.trim() || null;
};

/**
 * Returns the live status of all tools/permissions.
 * Called ONLY by the check_permissions tool — NOT injected automatically.
 */
window.getSystemPermissionsStatus = function () {
    const perm = systemConfig.permissions;
    if (!perm) return "ERROR: No hay configuración de permisos disponible.";

    const tools = perm.tools;

    let content = "ESTADO ACTUAL DE (HERRAMIENTAS):\n";

    content += `\n- Terminal (terminal): ${tools.terminal.execute ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Lectura de Archivos (file_read): ${tools.files.read ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Listar Directorios (folder_ls): ${tools.files.read ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Escritura/Modificación (file_write): ${tools.files.write ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Creación de Carpetas (folder_mkdir): ${tools.files.mkdir ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Eliminación Total (item_delete): ${tools.files.delete ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Gestión de Memoria Dinamica (memory_save/delete): ${(tools.system && tools.system.memory_sesion) ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;
    content += `\n- Consultar Permisos (check_permissions): ${(tools.system && tools.system.check_permissions) ? '🟢 [ACTIVADA]' : '🔴 [DESACTIVADA]'}`;

    content += "\n\n⚠️ NOTA: Si necesitas una herramienta desactivada, informa al usuario de que un administrador debe activarla desde Configuración del Sistema en Easy IA WebOS.";

    return content;
};

/**
 * Sincroniza el estado actual de los permisos con la memoria persistente de la IA.
 * Esto asegura que la IA tenga un registro "oficial" de sus capacidades en su memoria.
 */
window.syncPermissionsToMemory = function () {
    if (typeof currentUser === 'undefined') return;

    try {
        const memoryKey = `webos_memory_${currentUser}`;
        let memory = JSON.parse(localStorage.getItem(memoryKey) || '{}');

        const tools = systemConfig.permissions.tools;
        const status = {
            terminal: tools.terminal.execute ? "activa" : "desactivada",
            file_read: tools.files.read ? "activa" : "desactivada",
            file_write: tools.files.write ? "activa" : "desactivada",
            folder_ls: tools.files.read ? "activa" : "desactivada",
            folder_mkdir: tools.files.mkdir ? "activa" : "desactivada",
            item_delete: tools.files.delete ? "activa" : "desactivada",
            memory_manage: (tools.system && tools.system.memory_sesion) ? "activa" : "desactivada",
            check_permissions: (tools.system && tools.system.check_permissions) ? "activa" : "desactivada",
            last_sync: new Date().toLocaleString()
        };

        memory.permisos_sistema = status;
        localStorage.setItem(memoryKey, JSON.stringify(memory));
        console.log(`[Permissions] Memoria de ${currentUser} sincronizada con permisos actuales.`);

        // Si hay un visor de memoria abierto en ajustes, actualizarlo
        const memoryEl = document.querySelector('[id^="ai-memory-viewer-"]');
        if (memoryEl) {
            memoryEl.value = JSON.stringify(memory, null, 2);
        }
    } catch (e) {
        console.error("Error sincronizando permisos a memoria:", e);
    }
};

/**
 * Envía una notificación de cambio de permisos al modelo de forma AISLADA.
 * La llamada a la API incluye ÚNICAMENTE este mensaje de sistema —
 * sin historial de chat, sin prompt global, sin nada más.
 * El resultado de check_permissions se ejecuta en cliente antes de enviar.
 */
window.sendPermissionsAlertToModel = async function () {
    const aiConfig = systemConfig && systemConfig.ai_model;
    if (!aiConfig || !aiConfig.url) return;

    // 1. Ejecutar check_permissions en cliente para obtener el estado actualizado
    let permStatus = '';
    if (typeof window.getSystemPermissionsStatus === 'function') {
        permStatus = window.getSystemPermissionsStatus();
    }

    // 2. Construir el mensaje único de sistema
    const notifyContent =
        `Atención: [El Sistema le Informa]\n` +
        `Se han realizado cambios en los Permisos del Sistema.\n\n` +
        `[RESULTADO DE check_permissions]:\n${permStatus}`;

    // 3. Array de mensajes COMPLETAMENTE AISLADO — solo este aviso
    const messages = [
        { role: 'system', content: notifyContent }
    ];

    // 4. Indicador visual en el chat
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const alertEl = document.createElement('div');
    alertEl.className = 'chat-msg ai';
    alertEl.style.cssText = 'border-left: 3px solid #f59e0b;';
    alertEl.innerHTML = `
        <div class="chat-content" style="opacity:0.65; display:flex; align-items:center; gap:10px; font-size:0.8rem;">
            <span class="reasoning-typing-dot"></span>
            <span>⚙️ Sistema actualizando permisos...</span>
        </div>
    `;
    messagesContainer.appendChild(alertEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    console.groupCollapsed('%c🔐 [PermissionsAlert] Notificación aislada al modelo', 'color:#f59e0b; font-weight:bold;');
    console.log('Mensajes enviados:', messages);
    console.groupEnd();

    try {
        const response = await fetch(aiConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(aiConfig.key && aiConfig.key !== 'no-key'
                    ? { 'Authorization': 'Bearer ' + aiConfig.key }
                    : {})
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: messages,
                stream: true,
                ...(aiConfig.advanced_params_enabled ? aiConfig.parameters : {})
            })
        });

        if (!response.ok) throw new Error('API Error: ' + response.statusText);

        // 5. Preparar contenedor de streaming
        alertEl.innerHTML = `
            <div class="chat-content">
                <div class="main-text-container"></div>
            </div>
        `;
        const mContainer = alertEl.querySelector('.main-text-container');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let rawContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                if (line.includes('[DONE]')) break;
                try {
                    const data = JSON.parse(line.substring(6));
                    const content = data.choices?.[0]?.delta?.content || '';
                    if (content) {
                        rawContent += content;
                        mContainer.innerHTML = marked.parse(rawContent.trim());
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                } catch (e) { }
            }
        }

        // 6. Render final
        if (rawContent.trim()) {
            mContainer.innerHTML = marked.parse(rawContent.trim());
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (window.lucide) lucide.createIcons();

    } catch (e) {
        console.error('[PermissionsAlert] Error:', e);
        alertEl.innerHTML = `
            <div class="chat-content" style="font-size:0.8rem; color:#ff5f57;">
                ⚠️ No se pudo notificar al modelo del cambio de permisos.
            </div>
        `;
    }
};
