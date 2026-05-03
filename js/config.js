window.SYSTEM_CONFIG = {
  "ai_model": {
    "url": "http://192.168.18.3:8080/v1/chat/completions",
    "key": "no-key",
    "model": "Gemma-4-E4B",
    "advanced_params_enabled": false,
    "parameters": {
      "temperature": 0.7,
      "top_p": 0.9,
      "min_p": 0.05,
      "repeat_penalty": 1.1,
      "repeat_last_n": 64,
      "frequency_penalty": 0,
      "presence_penalty": 0,
      "mirostat": 0,
      "seed": -1,
      "tfs_z": 1,
      "typical_p": 1
    }
  },
  "system": {
    "system_prompt": "",
    "system_active": false,
    "system_doc": null,
    "docName": "system_doc.js"
  },
  "loop": {
    "loop_prompt": "",
    "loop_active": false,
    "loop_minutes": 5,
    "loop_doc": null,
    "docName": "loop_doc.js"
  },
  "chat_style": {
    "text_color": "#ececec",
    "bold_color": "#e67e22",
    "font_size": 0.80,
    "font_family": "'Inter', sans-serif",
    "bubble_width": 100,
    "bubble_opacity": 0.4,
    "user_bubble_color": "#000000ff",
    "ai_bubble_color": "#000000ff"
  },
  "permissions": {
    "prompt": "",
    "active": true,
    "doc": null,
    "docName": "tools_doc.js",
    "tools": {
      "terminal": {
        "execute": false,
        "history": false,
        "clear": false
      },
      "files": {
        "read": false,
        "write": false,
        "delete": false,
        "mkdir": false,
        "touch": false
      },
      "system": {
        "check_permissions": true,
        "memory_sesion": true
      }
    }
  }
};
