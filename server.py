import http.server
import socketserver
import json
import os
import shutil
from urllib.parse import urlparse, parse_qs
import base64
import subprocess

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Carpeta raíz para los archivos de usuario
STORAGE_ROOT = os.path.join(BASE_DIR, "Easy IA WebOs")
SYSTEM_FOLDER = "System_EasyIA_WebOS"

# Asegurar que existe la carpeta raíz
if not os.path.exists(STORAGE_ROOT):
    os.makedirs(STORAGE_ROOT)
    print(f"[System] Creada carpeta raíz: {STORAGE_ROOT}")

class WebOSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == '/api/vfs/list':
            self.handle_vfs_list(parsed_url)
        elif parsed_url.path == '/api/vfs/read':
            self.handle_vfs_read(parsed_url)
        elif parsed_url.path == '/api/system/get':
            self.handle_system_get(parsed_url)
        elif parsed_url.path == '/api/system/users':
            self.handle_system_users(parsed_url)
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(post_data) if post_data else {}
        except:
            data = {}

        if parsed_url.path == '/api/vfs/write':
            self.handle_vfs_write(data)
        elif parsed_url.path == '/api/vfs/mkdir':
            self.handle_vfs_mkdir(data)
        elif parsed_url.path == '/api/vfs/delete':
            self.handle_vfs_delete(data)
        elif parsed_url.path == '/api/python/run':
            self.handle_python_run(data)
        elif parsed_url.path == '/api/vfs/init_user':
            self.handle_init_user(data)
        elif parsed_url.path == '/api/system/delete_user':
            self.handle_delete_user(data)
        elif parsed_url.path == '/api/system/factory_reset':
            self.handle_factory_reset(data)
        elif parsed_url.path == '/api/system/vfs_export':
            self.handle_vfs_export(data)
        elif parsed_url.path == '/api/system/vfs_import':
            self.handle_vfs_import(data)
        elif parsed_url.path == '/api/system/set':
            self.handle_system_set(data)
        else:
            self.send_error(404, "API Endpoint not found")

    def get_real_path(self, user, virtual_path):
        # Limpiar el path virtual de forma robusta e insensible a mayúsculas
        import re
        v_path = re.sub(r'^C:\\WebOS', '', virtual_path, flags=re.IGNORECASE)
        v_path = re.sub(r'^C:/WebOS', '', v_path, flags=re.IGNORECASE)
        v_path = v_path.strip('\\/')
        
        # Unir a la ruta real del almacenamiento
        return os.path.normpath(os.path.join(STORAGE_ROOT, user, v_path))

    def handle_vfs_list(self, parsed_url):
        params = parse_qs(parsed_url.query)
        user = params.get('user', ['Administrador'])[0]
        v_path = params.get('path', ['C:\\WebOS'])[0]
        
        real_path = self.get_real_path(user, v_path)
        
        if not os.path.exists(real_path):
            os.makedirs(real_path, exist_ok=True)

        try:
            items = os.listdir(real_path)
            # Clasificar en carpetas y archivos
            result = []
            for item in items:
                # Ocultar carpeta de sistema
                if item == SYSTEM_FOLDER: continue
                
                is_dir = os.path.isdir(os.path.join(real_path, item))
                result.append({"name": item, "type": "dir" if is_dir else "file"})
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_error(500, str(e))

    def handle_vfs_read(self, parsed_url):
        params = parse_qs(parsed_url.query)
        user = params.get('user', ['Administrador'])[0]
        v_path = params.get('path', [''])[0]
        real_path = self.get_real_path(user, v_path)

        if os.path.exists(real_path) and os.path.isfile(real_path):
            with open(real_path, 'r', encoding='utf-8') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(content.encode())
        else:
            self.send_error(404, "File not found")

    def handle_vfs_write(self, data):
        user = data.get('user', 'Administrador')
        v_path = data.get('path', '')
        content = data.get('content', '')
        real_path = self.get_real_path(user, v_path)

        os.makedirs(os.path.dirname(real_path), exist_ok=True)
        with open(real_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_vfs_mkdir(self, data):
        user = data.get('user', 'Administrador')
        v_path = data.get('path', '')
        real_path = self.get_real_path(user, v_path)

        os.makedirs(real_path, exist_ok=True)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_vfs_delete(self, data):
        user = data.get('user', 'Administrador')
        v_path = data.get('path', '')
        real_path = self.get_real_path(user, v_path)

        if os.path.exists(real_path):
            if os.path.isdir(real_path):
                shutil.rmtree(real_path)
            else:
                os.remove(real_path)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_python_run(self, data):
        user = data.get('user', 'Administrador')
        v_path = data.get('path', '')
        real_path = self.get_real_path(user, v_path)
        
        if (not os.path.exists(real_path)) or (not os.path.isfile(real_path)):
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_msg = f"Archivo no encontrado: {v_path}"
            self.wfile.write(json.dumps({"status": "error", "output": error_msg}).encode())
            return

        try:
            # Ejecutar el script y capturar salida. Timeout de 30s para seguridad.
            result = subprocess.run(['python', real_path], capture_output=True, text=True, timeout=30)
            output = result.stdout + result.stderr
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "output": output}).encode())
        except subprocess.TimeoutExpired:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "output": "ERROR: El script tardó demasiado en ejecutarse (Timeout 30s)."}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "output": str(e)}).encode())

    def handle_init_user(self, data):
        user = data.get('user', 'Administrador')
        user_path = os.path.join(STORAGE_ROOT, user)
        # Crear estructura base si no existe
        folders = ['Escritorio', 'Proyectos', 'Imagenes', 'Documentos', 'Musica', SYSTEM_FOLDER]
        for folder in folders:
            os.makedirs(os.path.join(user_path, folder), exist_ok=True)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_delete_user(self, data):
        user = data.get('user')
        if not user or user == 'Administrador':
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid user"}')
            return
        
        user_path = os.path.join(STORAGE_ROOT, user)
        if os.path.exists(user_path):
            shutil.rmtree(user_path)
            print(f"[System] Borrada carpeta de usuario: {user}")
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_factory_reset(self, data):
        if os.path.exists(STORAGE_ROOT):
            shutil.rmtree(STORAGE_ROOT)
            print(f"[System] Ejecutando Factory Reset. Borrando {STORAGE_ROOT}")
        os.makedirs(STORAGE_ROOT)
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_vfs_export(self, data):
        def get_dir_tree(path):
            tree = {}
            for item in os.listdir(path):
                f_path = os.path.join(path, item)
                if os.path.isdir(f_path):
                    tree[item] = {"type": "dir", "contents": get_dir_tree(f_path)}
                else:
                    try:
                        with open(f_path, 'rb') as f:
                            tree[item] = {"type": "file", "data": base64.b64encode(f.read()).decode('utf-8')}
                    except: continue
            return tree
        
        print("[System] Exportando VFS completo...")
        vfs_tree = get_dir_tree(STORAGE_ROOT)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(vfs_tree).encode())

    def handle_vfs_import(self, data):
        vfs_tree = data.get('vfs_tree', {})
        print("[System] Importando VFS completo...")
        
        def restore_tree(path, tree):
            os.makedirs(path, exist_ok=True)
            for item, info in tree.items():
                item_path = os.path.join(path, item)
                if info['type'] == 'dir':
                    restore_tree(item_path, info['contents'])
                else:
                    try:
                        with open(item_path, 'wb') as f:
                            f.write(base64.b64decode(info['data']))
                    except: continue

        if os.path.exists(STORAGE_ROOT):
            shutil.rmtree(STORAGE_ROOT)
        restore_tree(STORAGE_ROOT, vfs_tree)
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_system_get(self, parsed_url):
        params = parse_qs(parsed_url.query)
        user = params.get('user', ['Administrador'])[0]
        key = params.get('key', ['config'])[0]
        
        user_path = os.path.join(STORAGE_ROOT, user, SYSTEM_FOLDER)
        file_path = os.path.join(user_path, f"{key}.json")
        
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(content.encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')

    def handle_system_set(self, data):
        user = data.get('user', 'Administrador')
        key = data.get('key', 'config')
        value = data.get('value', {})
        
        user_path = os.path.join(STORAGE_ROOT, user, SYSTEM_FOLDER)
        os.makedirs(user_path, exist_ok=True)
        file_path = os.path.join(user_path, f"{key}.json")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(json.dumps(value, indent=2, ensure_ascii=False))
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def handle_system_users(self, parsed_url):
        # Listar carpetas en STORAGE_ROOT que no sean archivos y que tengan estructura de usuario
        users = []
        if os.path.exists(STORAGE_ROOT):
            for item in os.listdir(STORAGE_ROOT):
                if os.path.isdir(os.path.join(STORAGE_ROOT, item)):
                    users.append(item)
        
        if not users: users = ['Administrador']
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(users, ensure_ascii=False).encode())


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

print(f"Servidor WebOS activo en http://localhost:8000")
print(f"Archivos reales en: {STORAGE_ROOT}")
with ThreadingTCPServer(("", 8000), WebOSHandler) as httpd:
    httpd.serve_forever()
