# 🖥️ Easy IA WebOS 🇪🇸

> [!WARNING]
> **Estado del Proyecto: En Desarrollo (Work in Progress)**. Este sistema se encuentra en fase activa de desarrollo y mejora continua.

**Easy IA WebOS** es un entorno de escritorio basado en web diseñado para integrar la potencia de la Inteligencia Artificial con la gestión real de archivos locales. A diferencia de otras interfaces, este sistema opera bajo una arquitectura **Local-First**, donde el control de los datos, la configuración y la memoria reside exclusivamente en tu propio disco duro.

---

##   Características Principales

### 📁 Gestión de Archivos Real (VFS)
*   **Acceso Directo al Disco**: El Explorador de Archivos interactúa con carpetas reales en tu ordenador.
*   **Unidad C: Integrada**: Navegación nativa por la raíz del espacio de trabajo.
*   **Ejecución de Scripts**: Terminal integrada capaz de ejecutar scripts de Python directamente en tu entorno local.

### 🧠 Inteligencia Artificial Avanzada
*   **Memoria Persistente**: La IA recuerda tus preferencias, datos y estados a través de sesiones y dispositivos.
*   **Sistema de Herramientas (Tools)**: La IA puede leer, escribir, crear carpetas y ejecutar comandos en el sistema.
*   **Heartbeat System**: Pulso de sistema configurable para que la IA realice tareas o análisis en segundo plano.

### 👥 Perfiles y Portabilidad
*   **Multi-usuario**: Soporte para múltiples perfiles con configuraciones y archivos aislados.
*   **Arquitectura Local-First**: Todos los datos (chats, ajustes, memoria) se guardan en una carpeta de sistema oculta (`System_EasyIA_WebOS`) dentro de cada usuario.
*   **Cero Dependencia del Navegador**: Tus datos no se pierden al limpiar la caché; el servidor es el único guardián de la verdad.

---

## 🏗️ 🇪🇸 Arquitectura Técnica

El sistema utiliza un modelo híbrido para maximizar la velocidad y la compatibilidad:

*   **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism UI) y JavaScript (ES6+). Sin frameworks pesados para garantizar la máxima velocidad.
*   **Backend**: Servidor Python de alta eficiencia que gestiona las operaciones de entrada/salida (I/O) y la ejecución de herramientas.
*   **Almacenamiento**: Persistencia mediante archivos JSON estructurados en el servidor, eliminando la dependencia de bases de datos externas.

---

## 📂 Estructura de Datos (Privacidad)

Tus datos se organizan de la siguiente manera dentro de la carpeta del proyecto:

```text
Easy IA WebOs/
├── Easy IA WebOs/          <-- Directorio de Almacenamiento Real
│   ├── [Usuario]/          <-- Tu espacio personal
│   │   ├── Documentos/
│   │   ├── Escritorio/
│   │   └── System_EasyIA_WebOS/  <-- 🔒 Carpeta Oculta (Cerebro del SO)
│   │       ├── config.json       <-- Tus ajustes y API Keys
│   │       ├── memory.json       <-- Memoria persistente de la IA
│   │       └── chat_sessions.json <-- Historial de conversaciones
```

---

## 🛠️ Instalación y Uso

1.  **Requisitos**: Tener instalado Python 3.x.
2.  **Iniciar el Sistema**: Ejecuta el archivo `Iniciar_WebOS.bat`. Esto abrirá automáticamente el servidor backend y cargará la interfaz en tu navegador.
3.  **Método Manual**: 
    *   Inicia el servidor ejecutando `python server.py`.
    *   Abre `index.html` en cualquier navegador moderno.
4.  **Configuración**: Dirígete a **Ajustes** para introducir tu API Key y seleccionar tu modelo de IA favorito (Local via Ollama/LM Studio o Cloud).

---

## 🔮  Futuro del Proyecto

*   **Integración MCP (Model Context Protocol)**: Próxima implementación de funciones y servidores MCP para expandir las capacidades de la IA.
*   **Nuevas Aplicaciones**: Expansión del ecosistema con editores de código, visualizadores de medios y herramientas de diagnóstico.
*   **Automatización**: Flujos de trabajo automáticos gestionados por el Heartbeat de la IA.

---

## 📸  Galería del Sistema



| ![Escritorio](./imagenes/Captura%20de%20pantalla%202026-05-04%20005026.png) | ![Explorador](./imagenes/Captura%20de%20pantalla%202026-05-04%20005113.png) |



| ![Configuración](./imagenes/Captura%20de%20pantalla%202026-05-04%20005128.png) | ![Ajustes](./imagenes/Captura%20de%20pantalla%202026-05-04%20005143.png) |



| ![Terminal](./imagenes/Captura%20de%20pantalla%202026-05-04%20005154.png) | ![Usuarios](./imagenes/Captura%20de%20pantalla%202026-05-04%20005221.png) |



| ![Almacenamiento](./imagenes/Captura%20de%20pantalla%202026-05-04%20005300.png) | ![Panoramic](./imagenes/Captura%20de%20pantalla%202026-05-04%20005607.png) |

---

> **Nota**: Este proyecto está diseñado para usuarios que buscan privacidad absoluta y un control total sobre cómo la Inteligencia Artificial interactúa con sus archivos personales.

