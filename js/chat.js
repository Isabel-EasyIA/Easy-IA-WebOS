// Easy IA WebOS - Chat Logic
// Heartbeat System Logic
let heartbeatInterval = null;

function startHeartbeatLoop() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (!systemConfig.loop || !systemConfig.loop.loop_active) return;

    const run = () => runHeartbeat(systemConfig.loop.loop_prompt);
    const minutes = systemConfig.loop.loop_minutes || 5;
    const ms = minutes * 60 * 1000;
    
    run(); // Ejecutar inmediatamente
    heartbeatInterval = setInterval(run, ms);
    console.log(`[System] Heartbeat iniciado: cada ${minutes} min.`);
}

// Configuración de Marked para respetar saltos de línea simples
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true
    });
}

async function runHeartbeat() {
    if (!systemConfig.loop || !systemConfig.loop.loop_active) return;
    if (!currentSessionId) return;

    console.log("[System] Ejecutando pulso de sistema (Heartbeat)...");
    
    let prompt = systemConfig.loop.loop_prompt;
    if (systemConfig.loop.loop_doc) {
        prompt += "\n\nCONTENIDO ADJUNTO DEL SISTEMA:\n" + systemConfig.loop.loop_doc;
    }

    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Feedback visual del pulso
    const msgId = 'hb-' + Date.now();
    const hbMsgEl = document.createElement('div');
    const aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg ai heartbeat-msg';
    aiMsgEl.id = msgId;
    aiMsgEl.style.borderLeft = '3px solid var(--accent-color)';
    // Indicador de carga más elegante para evitar el "cuadro negro"
    aiMsgEl.innerHTML = `
        <div class="chat-content" style="opacity: 0.6; display: flex; align-items: center; gap: 10px; font-size: 0.8rem;">
            <span class="reasoning-typing-dot"></span>
            <span>IA está procesando el pulso...</span>
        </div>
    `;
    messagesContainer.appendChild(aiMsgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
        const aiConfig = systemConfig.ai_model;
        
        // Preparar mensajes con rol de sistema para el Heartbeat
        const finalMessages = prepareMessagesForAI(chatHistory, prompt, 'system');
        
        const payload = {
            model: aiConfig.model,
            messages: finalMessages,
            stream: true,
            ...(aiConfig.advanced_params_enabled ? aiConfig.parameters : {})
        };
        console.groupCollapsed("🤖 [WebOS AI] Heartbeat (Pulso del Sistema)");
        console.log("URL:", aiConfig.url);
        
        const payloadObj = JSON.parse(JSON.stringify(payload));
        console.log("Payload:", payloadObj);
        
        console.log("%c📄 --- TEXTOS COMPLETOS ---", "color: #10b981; font-weight: bold;");
        payloadObj.messages.forEach((msg, idx) => {
            console.log(`%c[Mensaje ${idx} - ${msg.role.toUpperCase()}]`, "color: #3b82f6; font-weight: bold;");
            console.log(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2));
            console.log("---------------------------");
        });
        
        console.groupEnd();
        
        const response = await fetch(aiConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(aiConfig.key && aiConfig.key !== 'no-key' ? { 'Authorization': 'Bearer ' + aiConfig.key } : {})
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('API Error');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let rawContent = "";
        let currentReasoning = "";
        let currentMain = "";
        let isThinkingStream = false;
        let lastRenderTime = 0;
        
        aiMsgEl.innerHTML = `
            <div class="chat-content">
                <div class="reasoning-container" style="display:none;"></div>
                <div class="main-text-container"></div>
            </div>
        `;
        const rContainer = aiMsgEl.querySelector('.reasoning-container');
        const mContainer = aiMsgEl.querySelector('.main-text-container');

        let renderFrame;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                if (line.includes('[DONE]')) break;
                
                try {
                    const data = JSON.parse(line.substring(6));
                    const delta = data.choices?.[0]?.delta || {};
                    const content = delta.content || "";
                    const reasoning = delta.reasoning_content || "";
                    
                    if (reasoning || content) {
                        if (reasoning) {
                            if (!isThinkingStream) {
                                rawContent += "<think>\n";
                                isThinkingStream = true;
                            }
                            rawContent += reasoning;
                        }
                        if (content) {
                            if (isThinkingStream) {
                                rawContent += "\n</think>\n";
                                isThinkingStream = false;
                            }
                            rawContent += content;
                        }
                        
                        let tempContent = rawContent;
                        currentReasoning = "";
                        currentMain = "";
                        let isCurrentlyThinking = false;
                        
                        while (true) {
                            let startIdx = tempContent.indexOf("<think>");
                            if (startIdx === -1) startIdx = tempContent.indexOf("<THINK>");
                            
                            if (startIdx !== -1) {
                                currentMain += tempContent.substring(0, startIdx);
                                let endIdx = tempContent.indexOf("</think>", startIdx);
                                if (endIdx === -1) endIdx = tempContent.indexOf("</THINK>", startIdx);
                                
                                if (endIdx !== -1) {
                                    currentReasoning += tempContent.substring(startIdx + 7, endIdx).trim() + "\n\n";
                                    tempContent = tempContent.substring(endIdx + 8);
                                } else {
                                    currentReasoning += tempContent.substring(startIdx + 7).trim();
                                    isCurrentlyThinking = true;
                                    tempContent = "";
                                    break;
                                }
                            } else {
                                currentMain += tempContent;
                                break;
                            }
                        }
                        
                        const now = Date.now();
                        const throttleMs = Math.min(100, 15 + Math.floor(rawContent.length / 200) * 10);
                        
                        if (now - lastRenderTime > throttleMs) {
                            if (currentReasoning) {
                                rContainer.style.display = 'block';
                                rContainer.innerHTML = formatReasoningHtml(currentReasoning, !isCurrentlyThinking);
                            } else {
                                rContainer.style.display = 'none';
                            }
                            
                            if (currentMain.trim() || !isCurrentlyThinking) {
                                mContainer.innerHTML = marked.parse(currentMain.trim());
                            }
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            lastRenderTime = now;
                        }
                    }
                } catch (e) {}
            }
        }
        
        if (isThinkingStream) {
            rawContent += "\n</think>\n";
        }
        
        // Render final garantizado
        if (currentReasoning) {
            rContainer.style.display = 'block';
            rContainer.innerHTML = formatReasoningHtml(currentReasoning, true);
        }
        if (currentMain.trim()) {
            mContainer.innerHTML = marked.parse(currentMain.trim());
        }
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        chatHistory.push({ role: 'assistant', content: rawContent, iteration: chatHistory.length + 1 });
        await dbSet(`webos_chat_history_${currentSessionId}`, chatHistory);
        if (window.lucide) lucide.createIcons();

        // Procesar llamadas a herramientas si el modelo las generó durante el heartbeat
        if (rawContent.includes('<|tool_call')) {
            await processToolCalls(rawContent);
        }
    } catch (e) {
        console.error("Heartbeat fail:", e);
        aiMsgEl.querySelector('.chat-content').innerHTML = '<span style="color: #ff5f57; font-size: 0.8rem;">⚠️ El pulso de sistema falló.</span>';
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Función auxiliar para preparar los mensajes antes de enviarlos a la IA
window.prepareMessagesForAI = function(history, extraPrompt = null, extraRole = 'user') {
    const aiConfig = systemConfig.ai_model;
    let messages = [];

    let combinedSystemPrompt = "";

    // 1. Inyectar Prompt de Sistema Global si está activo
    if (systemConfig.system && systemConfig.system.system_active && systemConfig.system.system_prompt) {
        let content = systemConfig.system.system_prompt;
        if (systemConfig.system.system_doc) {
            content += "\n\n--- DOCUMENTO DE CONTEXTO DEL SISTEMA ---\n" + systemConfig.system.system_doc;
        }
        combinedSystemPrompt += content + "\n\n";
    }

    // 1.1. Inyectar Prompt de Permisos del Sistema (Delegado a permissions.js)
    if (window.getSystemPermissionsPrompt) {
        const permPrompt = window.getSystemPermissionsPrompt();
        if (permPrompt) {
            combinedSystemPrompt += permPrompt + "\n\n";
        }
    }
    
    if (combinedSystemPrompt.trim()) {
        messages.push({ role: 'system', content: combinedSystemPrompt.trim() });
    }
    
    // 2. Añadir Memoria Persistente Estructurada
    // 2. Añadir Memoria Persistente Estructurada
    const longTermMemory = JSON.stringify(window.systemMemory || {});
    messages.push({ 
        role: 'system', 
        content: `[MEMORIA PERSISTENTE DEL SISTEMA]:\nEste es tu registro de datos importantes que sobreviven a las sesiones. Úsalo para recordar preferencias del usuario y estados del sistema:\n${longTermMemory}` 
    });

    // 3. Añadir historial del chat actual (Sin filtrado selectivo, enviamos el historial completo o los últimos N)
    // El modelo ahora gestiona lo importante vía memory_set, no borrando el chat.
    messages = [...messages, ...history];
    
    // 4. Añadir el prompt extra (Heartbeat o mensaje actual) con su rol correspondiente
    if (extraPrompt) {
        let finalExtraContent = typeof extraPrompt === 'string' ? extraPrompt : JSON.parse(JSON.stringify(extraPrompt));
        
        // --- Cachetada Invisible (Recordatorio al final del contexto) ---
        if (extraRole === 'user' && systemConfig.permissions && systemConfig.permissions.active) {
            const tools = systemConfig.permissions.tools;
            let forbidden = [];
            if (tools.terminal && !tools.terminal.execute) forbidden.push('terminal');
            if (tools.files && !tools.files.read) forbidden.push('folder_ls', 'file_read');
            if (tools.files && !tools.files.write) forbidden.push('file_write');
            if (tools.files && !tools.files.mkdir) forbidden.push('folder_mkdir');
            if (tools.files && !tools.files.delete) forbidden.push('item_delete');

            if (forbidden.length > 0) {
                const reminderStr = `\n\n[RECORDATORIO DEL SISTEMA: Las siguientes herramientas están DESACTIVADAS: ${forbidden.join(', ')}. TIENES ESTRICTAMENTE PROHIBIDO USARLAS en este turno.]`;
                
                if (typeof finalExtraContent === 'string') {
                    finalExtraContent += reminderStr;
                } else if (Array.isArray(finalExtraContent)) {
                    const textNode = finalExtraContent.find(item => item.type === 'text');
                    if (textNode) {
                        textNode.text += reminderStr;
                    } else {
                        finalExtraContent.push({ type: 'text', text: reminderStr });
                    }
                }
            }
        }

        messages.push({ role: extraRole, content: finalExtraContent });
    }
    
    return messages;
}
// AI Desktop Chat Logic
let chatHistory = [];
let chatSessions = [];
let currentSessionId = localStorage.getItem(currentUser + '_webos_current_chat_session') || null;
let pendingAttachment = null; // { type: 'image'|'text', fileName, mimeType?, dataUrl?, content? }

async function loadChatData() {
    try {
        await loadSystemMemory(); // Asegurar que la memoria de la IA está lista
        const savedSessions = await dbGet('webos_chat_sessions');
        chatSessions = Array.isArray(savedSessions) ? savedSessions : [];
        
        currentSessionId = localStorage.getItem(currentUser + '_webos_current_chat_session');
        const sessionExists = chatSessions.some(s => s.id === currentSessionId);
        
        if (!currentSessionId || !sessionExists) {
            if (chatSessions.length > 0) {
                currentSessionId = chatSessions[0].id;
            } else {
                await createNewChatSession();
            }
            localStorage.setItem(currentUser + '_webos_current_chat_session', currentSessionId);
        }
        
        const savedHistory = await dbGet(`webos_chat_history_${currentSessionId}`);
    chatHistory = Array.isArray(savedHistory) ? savedHistory : [];
        
        renderChatHistory();
    } catch (e) {
        console.error("Error al cargar chats:", e);
    }
}

// Nueva función para renderizar el razonamiento interactivo respetando el estado global
function formatReasoningHtml(text, isComplete) {
    // Usar el estado global para decidir si empieza abierta o cerrada
    // Si el usuario la tiene cerrada globalmente, no la abrimos ni siquiera en streaming
    const shouldBeOpen = reasoningTabOpen ? 'open' : '';
    
    return `
        <details class="reasoning-tab" ${shouldBeOpen}>
            <summary class="reasoning-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i data-lucide="brain-circuit" style="width: 14px; height: 14px;"></i>
                    RAZONAMIENTO ${isComplete ? '' : '<span class="reasoning-typing-dot"></span>'}
                </div>
            </summary>
            <div class="reasoning-body">${marked.parse(text)}</div>
        </details>
    `;
}

// Función para formatear el mensaje completo (usada para el historial)
function formatAIMessage(content) {
    if (!content) return "";
    
    let processed = content;
    let reasoningBlocks = "";
    
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let match;
    
    while ((match = thinkRegex.exec(processed)) !== null) {
        reasoningBlocks += formatReasoningHtml(match[1].trim(), true);
    }
    
    processed = processed.replace(/<think>[\s\S]*?<\/think>/gi, "");
    
    const openThinkRegex = /<think>([\s\S]*)$/i;
    const openMatch = processed.match(openThinkRegex);
    if (openMatch) {
        reasoningBlocks += formatReasoningHtml(openMatch[1].trim(), false);
        processed = processed.replace(openThinkRegex, "");
    }

    return reasoningBlocks + marked.parse(processed.trim());
}

async function createNewChatSession(title = 'Nueva Sesión') {
    const id = 'session-' + Date.now();
    const newSession = { id, title, date: new Date().toISOString() };
    chatSessions.unshift(newSession);
    currentSessionId = id;
    chatHistory = [];
    
    localStorage.setItem(currentUser + '_webos_current_chat_session', id);
    await dbSet('webos_chat_sessions', chatSessions);
    await dbSet(`webos_chat_history_${id}`, chatHistory);
    
    renderChatHistory();
    renderSessionsList();
    
    // Si la ventana de ajustes está abierta, refrescarla
    const settingsWin = openApps.find(a => a.appId === 'settings');
    if (settingsWin) loadSettingsUsersList(settingsWin.id);
}

function appendMessage(role, content, save = true) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const displayRole = role === 'assistant' ? 'ai' : role;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${displayRole}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-content';

    // Manejar contenido array (mensajes multimodal: imagen + texto del historial)
    if (Array.isArray(content)) {
        const imagePart = content.find(c => c.type === 'image_url');
        const textPart  = content.find(c => c.type === 'text');
        let html = '';
        if (imagePart) {
            html += `<img src="${imagePart.image_url.url}" style="max-width:200px; max-height:150px; border-radius:8px; margin-bottom:8px; display:block; object-fit:cover;">`;
        }
        if (textPart && textPart.text) {
            html += marked.parse(textPart.text);
        }
        contentDiv.innerHTML = html;
    } else if (displayRole === 'system') {
        contentDiv.textContent = content || '';
    } else if (displayRole === 'ai') {
        contentDiv.innerHTML = formatAIMessage(content);
    } else {
        contentDiv.innerHTML = marked.parse(content || '');
    }
    
    msgDiv.appendChild(contentDiv);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    if (save) {
        const iterNum = chatHistory.length + 1;
        chatHistory.push({ role, content, iteration: iterNum });
        dbSet(`webos_chat_history_${currentSessionId}`, chatHistory);
    }
}

function renderChatHistory() {
    applyChatStyles(); // Asegurar estilos antes de renderizar
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    chatHistory.forEach(msg => {
        if (msg.role !== 'system') {
            appendMessage(msg.role, msg.content, false); // false = don't scroll yet
        }
    });
    container.scrollTop = container.scrollHeight;
}

window.handleChatInput = function(e) {
    const input = e.target;
    
    // Auto-ajustar altura según el contenido
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';

    // Enter para enviar, Shift+Enter o Ctrl+Enter para salto de línea
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        sendChatMessage();
        // Restablecer altura tras enviar
        input.style.height = 'auto';
    }
}

window.sendChatMessage = async function(overrideMsg = null, role = 'user', skipAI = false) {
    const inputEl = document.getElementById('ai-chat-input');
    const typedMsg = (overrideMsg !== null) ? null : inputEl.value.trim();

    // Necesitamos texto escrito, un adjunto pendiente, o un override programático
    if (overrideMsg === null && !typedMsg && !pendingAttachment) return;

    if (overrideMsg === null) {
        inputEl.value = '';
        inputEl.style.height = 'auto'; // Resetear altura
    }

    // ── Construir mensaje visual y mensaje para la API por separado ──
    let displayMsg;       // Lo que ve el usuario en la burbuja
    let apiUserContent;   // Lo que va a la API (string o array multimodal)

    const attachment = pendingAttachment;
    clearAttachment(); // Limpiar preview antes de enviar

    if (overrideMsg !== null) {
        // Llamada programática (heartbeat u otro módulo)
        // Si es del sistema, mostramos el contenido tal cual o con un prefijo informativo
        displayMsg     = (role === 'system') ? overrideMsg : '📎 Archivo procesado correctamente.';
        apiUserContent = overrideMsg;
    } else if (attachment) {
        if (attachment.type === 'image') {
            // Imagen → formato vision API (array)
            displayMsg = `📸 **${attachment.fileName}**${typedMsg ? '\n\n' + typedMsg : ''}`;
            apiUserContent = [
                { type: 'image_url', image_url: { url: attachment.dataUrl } },
                { type: 'text', text: typedMsg || `Analiza esta imagen: "${attachment.fileName}"` }
            ];
        } else {
            // Archivo de texto/código/doc → embeber contenido en el prompt
            displayMsg = `📎 **${attachment.fileName}**${typedMsg ? '\n\n' + typedMsg : ''}`;
            apiUserContent = `${typedMsg ? typedMsg + '\n\n' : ''}[Archivo adjunto: "${attachment.fileName}"]\n\n${attachment.content}`;
        }
    } else {
        displayMsg     = typedMsg;
        apiUserContent = typedMsg;
    }

    // Mostrar burbuja visual (sin guardar en historial todavía)
    appendMessage(role, displayMsg, false);
    // Guardar en historial con el contenido real que entiende la API
    const iterNum = chatHistory.length + 1;
    chatHistory.push({ role: role, content: apiUserContent, iteration: iterNum });
    dbSet(`webos_chat_history_${currentSessionId}`, chatHistory);

    // NUEVO: Permitir que el usuario también ejecute herramientas para pruebas
    if (role === 'user' && typeof apiUserContent === 'string' && apiUserContent.includes('<|tool_call')) {
        await processToolCalls(apiUserContent);
        return; // processToolCalls ya se encargará de disparar la IA si es necesario
    }

    if (skipAI) return;

    const aiConfig = systemConfig.ai_model;
    const finalMessages = prepareMessagesForAI(chatHistory);
    
    const messagesContainer = document.getElementById('chat-messages');
    const msgId = 'msg-' + Date.now();
    const aiMsgEl = document.createElement('div');
    aiMsgEl.className = 'chat-msg ai';
    aiMsgEl.id = msgId;
    aiMsgEl.innerHTML = `
        <div class="chat-content">
            <div class="reasoning-container" style="display:none;"></div>
            <div class="main-text-container">
                <span style="opacity: 0.5;">Pensando...</span>
            </div>
        </div>
    `;
    messagesContainer.appendChild(aiMsgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    const startTime = Date.now();
    let tokensCount = 0;
    const telemetryEl = document.getElementById('chat-telemetry');
    const speedEl = document.getElementById('telemetry-speed');
    const contextEl = document.getElementById('telemetry-context');
    
    telemetryEl.style.display = 'flex';
    
    // Referencias a los contenedores (fuera del loop para acceso en retries)
    const rContainer = aiMsgEl.querySelector('.reasoning-container');
    const mContainer = aiMsgEl.querySelector('.main-text-container');

    const headers = { 'Content-Type': 'application/json' };
    if (aiConfig.key && aiConfig.key !== 'no-key') {
        headers['Authorization'] = 'Bearer ' + aiConfig.key;
    }
    const requestBody = JSON.stringify({
        model: aiConfig.model,
        messages: finalMessages,
        stream: true,
        ...(aiConfig.advanced_params_enabled ? aiConfig.parameters : {})
    });

    console.groupCollapsed("🤖 [WebOS AI] Petición de Chat a la IA");
    console.log("URL:", aiConfig.url);
    
    const parsedPayload = JSON.parse(requestBody);
    console.log("Payload:", parsedPayload);
    
    console.log("%c📄 --- TEXTOS COMPLETOS ---", "color: #10b981; font-weight: bold;");
    parsedPayload.messages.forEach((msg, idx) => {
        console.log(`%c[Mensaje ${idx} - ${msg.role.toUpperCase()}]`, "color: #3b82f6; font-weight: bold;");
        console.log(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2));
        console.log("---------------------------");
    });

    console.groupEnd();

    const MAX_RETRIES = 2;
    let attempt = 0;
    let success = false;

    while (attempt <= MAX_RETRIES && !success) {
        // Reiniciar estado del streaming en cada intento
        let rawContent = "";
        let currentReasoning = "";
        let currentMain = "";
        let isThinkingStream = false;
        let lastRenderTime = 0;

        if (attempt > 0) {
            rContainer.style.display = 'none';
            mContainer.innerHTML = `<span style="opacity:0.5">⟳ Reintentando (${attempt}/${MAX_RETRIES})...</span>`;
            await new Promise(r => setTimeout(r, 1200 * attempt));
        }

        try {
            const response = await fetch(aiConfig.url, {
                method: 'POST',
                headers: headers,
                body: requestBody
            });

            if (!response.ok) throw new Error('API Error: ' + response.statusText);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;
                    if (line.includes('[DONE]')) break;

                    try {
                        const data = JSON.parse(line.substring(6));
                        const delta = data.choices?.[0]?.delta || {};
                        const content = delta.content || "";
                        const reasoning = delta.reasoning_content || "";

                        if (reasoning || content) {
                            tokensCount++;
                            const elapsed = (Date.now() - startTime) / 1000;
                            if (elapsed > 0) {
                                speedEl.innerText = `Tokens/s: ${(tokensCount / elapsed).toFixed(1)}`;
                            }

                            if (reasoning) {
                                if (!isThinkingStream) {
                                    rawContent += "<think>\n";
                                    isThinkingStream = true;
                                }
                                rawContent += reasoning;
                            }
                            if (content) {
                                if (isThinkingStream) {
                                    rawContent += "\n</think>\n";
                                    isThinkingStream = false;
                                }
                                rawContent += content;
                            }

                            let tempContent = rawContent;
                            currentReasoning = "";
                            currentMain = "";
                            let isCurrentlyThinking = false;

                            while (true) {
                                let startIdx = tempContent.indexOf("<think>");
                                if (startIdx === -1) startIdx = tempContent.indexOf("<THINK>");

                                if (startIdx !== -1) {
                                    currentMain += tempContent.substring(0, startIdx);
                                    let endIdx = tempContent.indexOf("</think>", startIdx);
                                    if (endIdx === -1) endIdx = tempContent.indexOf("</THINK>", startIdx);

                                    if (endIdx !== -1) {
                                        currentReasoning += tempContent.substring(startIdx + 7, endIdx).trim() + "\n\n";
                                        tempContent = tempContent.substring(endIdx + 8);
                                    } else {
                                        currentReasoning += tempContent.substring(startIdx + 7).trim();
                                        isCurrentlyThinking = true;
                                        tempContent = "";
                                        break;
                                    }
                                } else {
                                    currentMain += tempContent;
                                    break;
                                }
                            }

                            const now = Date.now();
                            const throttleMs = Math.min(100, 15 + Math.floor(rawContent.length / 200) * 10);

                            if (now - lastRenderTime > throttleMs) {
                                if (currentReasoning) {
                                    rContainer.style.display = 'block';
                                    rContainer.innerHTML = formatReasoningHtml(currentReasoning, !isCurrentlyThinking);
                                } else {
                                    rContainer.style.display = 'none';
                                }

                                if (mContainer.innerHTML.includes('Pensando...') && !isCurrentlyThinking) {
                                    mContainer.innerHTML = "";
                                }

                                mContainer.innerHTML = marked.parse(currentMain.trim() || (isCurrentlyThinking ? "" : ""));
                                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                lastRenderTime = now;
                            }
                        }
                    } catch (e) {}
                }
            }

            if (isThinkingStream) rawContent += "\n</think>\n";

            // Render final garantizado
            if (currentReasoning) rContainer.innerHTML = formatReasoningHtml(currentReasoning, true);
            mContainer.innerHTML = marked.parse(currentMain.trim());
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            const iterNum = chatHistory.length + 1;
            chatHistory.push({ role: 'assistant', content: rawContent, iteration: iterNum });
            await dbSet(`webos_chat_history_${currentSessionId}`, chatHistory);

            // NUEVO: Procesar llamadas a herramientas si existen
            if (rawContent.includes('<|tool_call')) {
                await processToolCalls(rawContent);
            }

            // Telemetría final
            contextEl.innerText = `Contexto: ~${Math.round(rawContent.length / 4)}`;

            // Auto-título de sesión (primera respuesta)
            if (chatHistory.filter(m => m.role === 'user').length === 1) {
                const session = chatSessions.find(s => s.id === currentSessionId);
                if (session && session.title === 'Bienvenido a Easy IA WebOs') {
                    const raw = typeof displayMsg === 'string' ? displayMsg : (typedMsg || 'Chat');
                    const titleText = raw.replace(/\*\*/g, '').trim();
                    session.title = titleText.substring(0, 30) + (titleText.length > 30 ? '...' : '');
                    await dbSet('webos_chat_sessions', chatSessions);
                }
            }

            if (window.lucide) lucide.createIcons();
            success = true;

        } catch (e) {
            console.warn(`[Chat] Fallo intento ${attempt + 1}/${MAX_RETRIES + 1}:`, e.message || e);
            attempt++;
        }
    }

    if (!success) {
        const retryBtn = `<button onclick="sendChatMessage()" style="margin-top:8px;background:var(--accent-color);color:white;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:inherit;">↩ Reintentar</button>`;
        aiMsgEl.querySelector('.chat-content').innerHTML = `
            <span style="color:#ff5f57;font-size:0.85rem;">⚠️ Sin respuesta tras ${MAX_RETRIES + 1} intentos. Comprueba que el modelo está activo.</span>
            ${retryBtn}
        `;
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Función para aplicar estilos globales desde config.js
window.applyGlobalChatStyles = function() {
    if (!systemConfig || !systemConfig.chat_style) return;
    const style = systemConfig.chat_style;
    const root = document.documentElement;
    root.style.setProperty('--text-primary', style.text_color || '#ececec');
    root.style.setProperty('--bold-color', style.bold_color || '#e67e22');
    root.style.setProperty('--chat-font-size', (style.font_size || 0.8) + 'rem');
}

async function init() {
    await loadConfig();
    applyGlobalChatStyles();
    await loadChatData();
    updateClock();
    setInterval(updateClock, 1000);
    renderSessionsList();
    startHeartbeatLoop();
    if (window.lucide) lucide.createIcons();

    // Recordar la preferencia del usuario sobre el panel de razonamiento
    // El evento 'toggle' no burbujea, se captura en fase de captura (true)
    document.addEventListener('toggle', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('reasoning-tab')) {
            reasoningTabOpen = e.target.open;
        }
    }, true);
}

window.toggleChatSidebar = function() {
    const sidebar = document.getElementById('chat-sidebar');
    const isVisible = sidebar.style.display === 'flex';
    sidebar.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) renderSessionsList();
}

function renderSessionsList() {
    const container = document.getElementById('chat-sessions-list');
    if (!container) return;
    container.innerHTML = chatSessions.map(session => `
        <div onclick="switchChatSession('${session.id}')" style="padding: 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; background: ${session.id === currentSessionId ? 'rgba(234, 127, 5, 0.15)' : 'transparent'}; color: ${session.id === currentSessionId ? 'white' : 'var(--text-secondary)'}; border: 1px solid ${session.id === currentSessionId ? 'var(--accent-color)' : 'transparent'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${session.title}
        </div>
    `).join('');
}

window.switchChatSession = async function(id) {
    if (id === currentSessionId) return;
    currentSessionId = id;
    localStorage.setItem(currentUser + '_webos_current_chat_session', id);
    const savedHistory = await dbGet(`webos_chat_history_${id}`);
    chatHistory = Array.isArray(savedHistory) ? savedHistory : [];
    applyChatStyles();
    renderChatHistory();
    renderSessionsList();
}

let recognition = null;
window.toggleVoiceInput = function() {
    const btn = document.getElementById('voice-btn');
    const input = document.getElementById('ai-chat-input');
    
    if (!recognition) {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            showModal('Error', 'Tu navegador no soporta reconocimiento de voz.');
            return;
        }
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        
        recognition.onstart = () => {
            btn.style.color = 'var(--accent-color)';
            btn.querySelector('i').setAttribute('data-lucide', 'mic-off');
            lucide.createIcons();
        };
        
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            input.value = text;
            // Short delay to let the user see the text before sending
            setTimeout(sendChatMessage, 500);
        };
        
        recognition.onend = () => {
            btn.style.color = 'var(--text-secondary)';
            btn.querySelector('i').setAttribute('data-lucide', 'mic');
            lucide.createIcons();
            recognition = null;
        };
        
        recognition.start();
    } else {
        recognition.stop();
    }
}

// ── Previsualización de adjunto ──
function showAttachmentPreview() {
    clearAttachmentPreview();
    if (!pendingAttachment) return;

    const previewEl = document.createElement('div');
    previewEl.id = 'attachment-preview';
    previewEl.style.cssText = [
        'position:absolute',
        'bottom:82px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(15,23,42,0.92)',
        'backdrop-filter:blur(12px)',
        'border:1px solid rgba(234,127,5,0.45)',
        'border-radius:10px',
        'padding:7px 14px',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'font-size:0.75rem',
        'color:var(--accent-color)',
        'z-index:1002',
        'max-width:400px',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
        'white-space:nowrap'
    ].join(';');

    const isImage = pendingAttachment.type === 'image';
    const thumb   = isImage
        ? `<img src="${pendingAttachment.dataUrl}" style="width:26px;height:26px;object-fit:cover;border-radius:5px;flex-shrink:0;">`
        : `<i data-lucide="file-text" style="width:15px;height:15px;flex-shrink:0;"></i>`;

    previewEl.innerHTML = `
        ${thumb}
        <span style="overflow:hidden;text-overflow:ellipsis;max-width:230px;font-weight:500;">${pendingAttachment.fileName}</span>
        <span style="font-size:0.65rem;color:var(--text-secondary);flex-shrink:0;">${isImage ? 'imagen' : 'doc'}</span>
        <button onclick="clearAttachment()" title="Quitar adjunto"
            style="background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;padding:0;margin-left:4px;display:flex;align-items:center;">
            <i data-lucide="x" style="width:13px;height:13px;"></i>
        </button>
    `;

    document.getElementById('desktop').appendChild(previewEl);
    if (window.lucide) lucide.createIcons();
    // Enfocar el input para que el usuario pueda escribir su mensaje
    setTimeout(() => document.getElementById('ai-chat-input').focus(), 50);
}

function clearAttachmentPreview() {
    const el = document.getElementById('attachment-preview');
    if (el) el.remove();
}

window.clearAttachment = function() {
    pendingAttachment = null;
    clearAttachmentPreview();
    const fi = document.getElementById('chat-file-input');
    if (fi) fi.value = '';
};

// ── Manejador de carga de archivo ──
window.handleChatFileUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // Limpiar input para poder seleccionar el mismo archivo otra vez

    const isImage = file.type.startsWith('image/');
    const reader  = new FileReader();

    if (isImage) {
        reader.onload = function(e) {
            pendingAttachment = {
                type: 'image',
                fileName: file.name,
                mimeType: file.type,
                dataUrl: e.target.result   // base64 data URL para la API vision
            };
            showAttachmentPreview();
        };
        reader.readAsDataURL(file);
    } else {
        reader.onload = function(e) {
            pendingAttachment = {
                type: 'text',
                fileName: file.name,
                content: e.target.result
            };
            showAttachmentPreview();
        };
        reader.readAsText(file);
    }
}

// ── Motor de Intercepción de Herramientas ──
async function processToolCalls(text) {
    console.log("[ChatEngine] Escaneando texto en busca de herramientas...");
    
    const OPEN_TAG  = '<|tool_call|>';
    const CLOSE_TAG = '<|tool_call|>';
    const toolCalls = [];
    let startIdx = 0;

    // 1. Extraer todas las llamadas a herramientas del texto
    while (true) {
        const openIdx = text.indexOf(OPEN_TAG, startIdx);
        if (openIdx === -1) break;

        const afterOpen = openIdx + OPEN_TAG.length;
        const closeIdx  = text.indexOf(CLOSE_TAG, afterOpen);
        if (closeIdx === -1) break;

        const inner = text.substring(afterOpen, closeIdx).trim();
        const callMatch = inner.match(/^call:(\w+)\{([\s\S]*)\}$/);
        
        if (callMatch) {
            toolCalls.push({ 
                name: callMatch[1].trim(), 
                args: callMatch[2].trim() 
            });
        }
        startIdx = closeIdx + CLOSE_TAG.length;
    }
    if (toolCalls.length === 0) return;

    // 2. Validar Protocolo de Memoria Obligatorio (Solo si se usan herramientas)
    const memoryCalls = toolCalls.filter(c => c.name.toLowerCase().includes('memory'));
    const otherCalls = toolCalls.filter(c => !c.name.toLowerCase().includes('memory'));
    const isMemoryAllowed = systemConfig.permissions && systemConfig.permissions.tools && 
                           systemConfig.permissions.tools.system && systemConfig.permissions.tools.system.memory_sesion;

    if (isMemoryAllowed) {
        // Solo exigimos memoria si NO se están llamando a otras herramientas (es decir, es la respuesta final con herramientas)
        if (otherCalls.length === 0) {
            if (memoryCalls.length === 0) {
                console.warn("[ChatEngine] Protocolo incumplido: Falta memory_sesion en respuesta final de herramientas.");
                setTimeout(async () => {
                    await sendChatMessage("[SISTEMA]: Error de Protocolo. No has seleccionado las iteraciones a recordar para finalizar tu turno. Por favor, usa la herramienta memory_sesion.", "system");
                }, 500);
                return;
            }
            if (memoryCalls.length > 1) {
                console.warn("[ChatEngine] Protocolo incumplido: Múltiples memory_sesion en respuesta final.");
                setTimeout(async () => {
                    await sendChatMessage("[SISTEMA]: Error de Protocolo. Has enviado múltiples llamadas a memory_sesion. Por favor, envía UN SOLO comando con la lista consolidada.", "system");
                }, 500);
                return;
            }
        } else {
            // Si hay otras herramientas, permitimos que NO haya memoria aún, 
            // pero si decide poner memoria, solo permitimos UNA.
            if (memoryCalls.length > 1) {
                console.warn("[ChatEngine] Protocolo incumplido: Múltiples memory_sesion con otras herramientas.");
                setTimeout(async () => {
                    await sendChatMessage("[SISTEMA]: Error de Protocolo. No puedes enviar múltiples llamadas a memory_sesion.", "system");
                }, 500);
                return;
            }
        }
    }

    // 3. Ejecutar las herramientas en lote
    let resultsCollected = [];
    for (const call of toolCalls) {
        let funcName = call.name;
        const argsRaw = call.args;

        console.log(`%c[BATCH TOOL] ${funcName}(${argsRaw})`, 'color: #ea7f05; font-weight: bold;');

        // Mapeo y Normalización
        const lowerName = funcName.toLowerCase();
        if (lowerName === 'terminal') funcName = 'terminal_execute';
        if (lowerName.includes('read')   || lowerName.includes('lectura'))   funcName = 'file_read';
        if (lowerName.includes('write')  || lowerName.includes('escritura')) funcName = 'file_write';
        if (lowerName.includes('delete') || lowerName.includes('eliminar'))  funcName = 'item_delete';
        if (lowerName.includes('mkdir')) funcName = 'folder_mkdir';
        if (lowerName.includes('ls') || lowerName.includes('list')) {
            if (!lowerName.includes('terminal')) funcName = 'folder_ls';
        }
        if (lowerName.includes('memory')) funcName = 'memory_save';

        // Ejecutar (sin disparar la IA individualmente)
        const result = await executeTool(funcName, argsRaw, true);
        if (funcName !== 'memory_sesion') {
            resultsCollected.push(result);
        }
    }

    // 4. Si hubo herramientas de ejecución (no solo memoria), pedir a la IA que continúe
    if (resultsCollected.length > 0) {
        console.log("[ChatEngine] Lote finalizado. Solicitando continuación a la IA...");
        // Disparar la IA con el último resultado o una señal de lote completado si se prefiere
        // Pero sendChatMessage ya añadió los resultados al historial.
        // Solo necesitamos llamar a la lógica de la IA una vez.
        const lastResult = resultsCollected[resultsCollected.length - 1];
        
        // Lanzamos una petición "vacía" o de continuación (el historial ya tiene los resultados)
        const aiConfig = systemConfig.ai_model;
        const finalMessages = prepareMessagesForAI(chatHistory);
        // Usamos una función interna o llamamos a sendChatMessage con un flag especial
        // Para este sistema, simplemente llamar a sendChatMessage con un mensaje invisible de sistema funciona
        await sendChatMessage("[SISTEMA]: Lote de herramientas procesado. Continúa.", "system");
    }
}

async function executeTool(funcName, argsRaw, skipAI = false) {
    console.log(`[ChatEngine] Ejecutando: ${funcName}(${argsRaw})`);
    
    const args = parseToolArgs(argsRaw);
    let finalResult = "";
    
    if (window.SystemTools && typeof window.SystemTools[funcName] === 'function') {
        try {
            appendToolLog(funcName, argsRaw);
            const result = await window.SystemTools[funcName](...args);
            finalResult = result;
            if (funcName !== 'memory_sesion') {
                await sendChatMessage(`[RESULTADO DE ${funcName}]:\n\n${result}`, 'system', skipAI);
            }
        } catch (err) {
            finalResult = `Error: ${err.message}`;
            await sendChatMessage(`[ERROR EN ${funcName}]: ${err.message}`, 'system', skipAI);
        }
    } else {
        finalResult = `Error: La herramienta '${funcName}' no existe.`;
        await sendChatMessage(`[ERROR]: La herramienta '${funcName}' no existe.`, 'system', skipAI);
    }
    return finalResult;
}

function parseToolArgs(argsRaw) {
    if (!argsRaw || !argsRaw.trim()) return [];
    
    const args = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";
    let escaped = false;
    
    for (let i = 0; i < argsRaw.length; i++) {
        const char = argsRaw[i];
        
        if (inQuotes) {
            if (escaped) {
                // Manejo de escapes: si no es reconocido, mantenemos la barra (importante para rutas Windows)
                if (char === 'n') current += '\n';
                else if (char === 'r') current += '\r';
                else if (char === '\\') current += '\\';
                else if (char === '"') current += '"';
                else if (char === "'") current += "'";
                else {
                    // CASO ESPECIAL RUTAS WINDOWS: 
                    // Si encontramos \t (como en \tests), \u, etc. que no son escapes de texto comunes,
                    // mantenemos la barra literal + el caracter para no romper rutas.
                    current += '\\' + char;
                }
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === quoteChar) {
                inQuotes = false;
                args.push(current);
                current = "";
            } else {
                current += char;
            }
        } else {
            if (char === '"' || char === "'") {
                inQuotes = true;
                quoteChar = char;
                current = ""; 
            } else if (char === ',') {
                if (current.trim()) {
                    args.push(current.trim());
                    current = "";
                }
            } else {
                // No estamos en comillas, acumulamos si no es espacio en blanco inicial
                if (current.length > 0 || char.trim() !== "") {
                    current += char;
                }
            }
        }
    }
    
    if (current.trim() && !inQuotes) {
        args.push(current.trim());
    }
    
    return args;
}

function appendToolLog(func, args) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const logDiv = document.createElement('div');
    logDiv.style.cssText = "font-size: 0.7rem; color: var(--accent-color); opacity: 0.8; margin: 8px 0; padding: 5px 10px; background: rgba(234,127,5,0.05); border-left: 2px solid var(--accent-color); font-family: monospace;";
    logDiv.innerHTML = `<i data-lucide="wrench" style="width:10px; height:10px; margin-right:5px;"></i> Ejecutando: ${func}(${args})`;
    container.appendChild(logDiv);
    container.scrollTop = container.scrollHeight;
    if (window.lucide) lucide.createIcons();
}

// Arrancar el sistema cuando todo está cargado
init();
