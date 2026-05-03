// Easy IA WebOS - Tools Execution Engine
// Centralizes all functions that the AI Model can call.
// Updated to use the real VFS Server API.

window.SystemTools = {
    // --- TERMINAL TOOLS ---
    
    /**
     * Executes a command in the virtual terminal
     */
    terminal_execute: async function(command) {
        if (!systemConfig.permissions.tools.terminal.execute) {
            return "ERROR: La Herramienta Terminal está Desactivada.";
        }

        console.log("[SystemTools] IA solicitando ejecución de comando:", command);
        
        // Buscamos una ventana de terminal abierta
        const termWin = openApps.find(a => a.appId === 'terminal');
        
        if (termWin && typeof window.executeCommand === 'function') {
            const windowId = termWin.id;
            const outputEl = document.getElementById(`term-output-${windowId}`);
            const state = window.terminalStates[windowId] || { path: 'C:\\WebOS' };
            
            // Ejecutar el comando y retornar su salida real
            const output = window.executeCommand(command, state, outputEl, windowId);
            return output || `ÉXITO: Comando '${command}' ejecutado.`;
        } else {
            // Si no hay terminal abierta, lo ejecutamos en "segundo plano"
            const state = { path: 'C:\\WebOS' }; // Estado temporal
            return window.executeCommand(command, state, null, null);
        }
    },
    
    memory_save: async function(key, value) {
        console.log("[SystemMemory] Actualizando clave:", key, " con valor:", value);
        let memory = await dbGet('webos_memory') || {};
        memory[key] = value;
        await dbSet('webos_memory', memory);
        return `Memoria actualizada en el servidor: La clave '${key}' ahora tiene el valor '${value}'.`;
    },

    memory_delete: async function(key) {
        console.log("[SystemMemory] Eliminando clave:", key);
        let memory = await dbGet('webos_memory') || {};
        if (memory[key]) {
            delete memory[key];
            await dbSet('webos_memory', memory);
            return `Memoria actualizada en el servidor: La clave '${key}' ha sido eliminada.`;
        }
        return `Error: La clave '${key}' no existe en la memoria del servidor.`;
    },

    // --- FILE SYSTEM TOOLS ---

    /**
     * Lists contents of a directory
     */
    folder_ls: async function(path) {
        if (!systemConfig.permissions.tools.files.read) return "ERROR: La Herramienta de Lectura de Archivos está Desactivada.";
        
        const normalizedPath = this._normalizePath(path);
        const contents = await apiVFS('list', 'GET', { user: currentUser, path: normalizedPath });
        
        if (!contents) return `ERROR: El directorio '${normalizedPath}' no existe o no se puede leer.`;
        
        const list = contents.map(item => `[${item.type === 'dir' ? 'DIR' : 'FILE'}] ${item.name}`).join('\n');
        return `Contenido de ${normalizedPath}:\n${list || '(Vacío)'}`;
    },

    /**
     * Reads a file content
     */
    file_read: async function(path) {
        if (!systemConfig.permissions.tools.files.read) return "ERROR: La Herramienta de Lectura de Archivos está Desactivada.";
        
        const normalizedPath = this._normalizePath(path);
        const fileName = normalizedPath.split('\\').pop();
        
        // Caso especial: herramientas.md o tools_doc.js (usar variable global para evitar CORS)
        if (fileName === 'tools_doc.js' || fileName === 'tools.md') {
            const text = window.TOOLS_DOC_CONTENT || "ERROR: El contenido de tools_doc.js no está disponible en la memoria del sistema.";
            return `[Contenido de tools_doc.js]:\n\n${text}`;
        }

        const content = await apiVFS('read', 'GET', { user: currentUser, path: normalizedPath });
        if (content !== null) {
            return `[Contenido de ${fileName}]:\n${content}`;
        }
        
        return `ERROR: El archivo '${normalizedPath}' no existe.`;
    },

    /**
     * Writes or creates a file
     */
    file_write: async function(path, content) {
        if (!systemConfig.permissions.tools.files.write) return "ERROR: La Herramienta de Escritura de Archivos está Desactivada.";
        
        const normalizedPath = this._normalizePath(path);
        const fileName = normalizedPath.split('\\').pop();

        const result = await apiVFS('write', 'POST', { user: currentUser, path: normalizedPath, content: content });

        if (result && result.status === 'ok') {
            this._refreshExplorers();
            return `ÉXITO: Archivo '${fileName}' guardado correctamente en '${normalizedPath}'.`;
        }

        return `ERROR: No se pudo escribir el archivo en '${normalizedPath}'. Verifica que la ruta es válida.`;
    },

    /**
     * Creates a directory
     */
    folder_mkdir: async function(path) {
        if (!systemConfig.permissions.tools.files.mkdir) return "ERROR: La Herramienta de Creación de Carpetas está Desactivada.";
        
        const normalizedPath = this._normalizePath(path);
        const dirName = normalizedPath.split('\\').pop();

        const result = await apiVFS('mkdir', 'POST', { user: currentUser, path: normalizedPath });
        
        if (result && result.status === 'ok') {
            this._refreshExplorers();
            return `ÉXITO: Directorio '${dirName}' creado correctamente.`;
        }

        return `ERROR: No se pudo crear el directorio en '${normalizedPath}'.`;
    },

    /**
     * Deletes an item
     */
    item_delete: async function(path) {
        if (!systemConfig.permissions.tools.files.delete) return "ERROR: La Herramienta de Eliminación de Archivos está Desactivada.";
        
        const normalizedPath = this._normalizePath(path);
        const itemName = normalizedPath.split('\\').pop();

        const result = await apiVFS('delete', 'POST', { user: currentUser, path: normalizedPath });

        if (result && result.status === 'ok') {
            this._refreshExplorers();
            return `ÉXITO: '${itemName}' eliminado.`;
        }

        return "ERROR: El elemento no existe o no se puede eliminar.";
    },

    /**
     * Revisa el estado actual de los permisos y herramientas disponibles.
     * Llama a getSystemPermissionsStatus (NO al prompt de sistema).
     */
    check_permissions: async function() {
        const sysPerm = systemConfig.permissions && systemConfig.permissions.tools && systemConfig.permissions.tools.system;
        if (sysPerm && sysPerm.check_permissions === false) {
            return "ERROR: La Herramienta check_permissions está Desactivada.";
        }
        
        // Sincronizar estado con la memoria persistente
        if (window.syncPermissionsToMemory) window.syncPermissionsToMemory();

        if (typeof window.getSystemPermissionsStatus === 'function') {
            return window.getSystemPermissionsStatus();
        }
        return "ERROR: No se pudo obtener el estado de los permisos del sistema.";
    },

    // --- PRIVATE HELPERS ---

    _normalizePath: function(path) {
        if (!path) return 'C:\\WebOS';
        
        // 1. Estandarizar todas las barras a backslashes
        let p = path.replace(/\//g, '\\').trim();
        
        // 2. Eliminar recursivamente prefijos redundantes (C:, \WebOS, WebOS)
        // Esto evita C:\WebOS\WebOS\..., \WebOS\..., etc.
        let changed = true;
        while (changed) {
            let oldP = p;
            p = p.replace(/^C:/i, '');
            p = p.replace(/^\\WebOS/i, '');
            p = p.replace(/^WebOS/i, '');
            p = p.trim().replace(/^\\+/, ''); // Quitar barras iniciales
            if (p === oldP) changed = false;
        }
        
        // 3. Quitar barra final si existe
        p = p.replace(/\\+$/, '');
        
        // 4. Retornar ruta completa estandarizada
        return p ? 'C:\\WebOS\\' + p : 'C:\\WebOS';
    },

    _refreshExplorers: function() {
        if (typeof navigateExplorer === 'function') {
            openApps.filter(a => a.appId === 'explorer').forEach(app => {
                const state = window.explorerStates[app.id] || { currentPath: 'C:\\WebOS' };
                navigateExplorer(app.id, state.currentPath);
            });
        }
    }
};
