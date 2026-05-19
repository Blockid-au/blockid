#!/usr/bin/env python3
"""
Minimal file upload server for upload.blockid.au
Files are stored in the same directory as this script.
"""

import os
import html
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime

UPLOAD_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_SIZE = 50 * 1024 * 1024  # 50 MB

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BlockID Upload</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; min-height: 100vh; }
  .container { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
  .sub { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
  .upload-box { background: white; border: 2px dashed #d1d5db; border-radius: 1rem; padding: 2.5rem; text-align: center; margin-bottom: 2rem; transition: all 0.2s; }
  .upload-box:hover, .upload-box.drag { border-color: #3b82f6; background: #eff6ff; }
  .upload-box input[type=file] { display: none; }
  .upload-box label { cursor: pointer; display: inline-block; background: #2563eb; color: white; padding: 0.625rem 1.5rem; border-radius: 0.625rem; font-weight: 600; font-size: 0.875rem; transition: background 0.2s; }
  .upload-box label:hover { background: #1d4ed8; }
  .upload-box p { margin-top: 0.75rem; color: #9ca3af; font-size: 0.8rem; }
  .files { background: white; border: 1px solid #e5e7eb; border-radius: 1rem; overflow: hidden; }
  .files-header { padding: 1rem 1.25rem; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 0.875rem; color: #374151; }
  .file-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; border-bottom: 1px solid #f3f4f6; font-size: 0.875rem; }
  .file-row:last-child { border-bottom: none; }
  .file-row:hover { background: #f9fafb; }
  .file-name { flex: 1; min-width: 0; }
  .file-name a { color: #2563eb; text-decoration: none; word-break: break-all; }
  .file-name a:hover { text-decoration: underline; }
  .file-size { color: #9ca3af; font-size: 0.75rem; white-space: nowrap; }
  .file-date { color: #9ca3af; font-size: 0.75rem; white-space: nowrap; }
  .file-copy { background: #f3f4f6; border: none; padding: 0.25rem 0.625rem; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer; color: #374151; }
  .file-copy:hover { background: #e5e7eb; }
  .empty { padding: 2rem; text-align: center; color: #9ca3af; }
  .msg { padding: 1rem; border-radius: 0.625rem; margin-bottom: 1rem; font-size: 0.875rem; }
  .msg.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .msg.err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .url-box { background: #f3f4f6; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.8rem; word-break: break-all; margin-top: 0.5rem; }
</style>
</head>
<body>
<div class="container">
  <h1>BlockID Upload</h1>
  <p class="sub">upload.blockid.au &mdash; drag &amp; drop or click to upload</p>
  {message}
  <form method="POST" enctype="multipart/form-data" id="upload-form">
    <div class="upload-box" id="drop-zone">
      <input type="file" name="file" id="file-input" multiple>
      <label for="file-input">Choose files</label>
      <p>or drag &amp; drop here &mdash; max 50 MB per file</p>
    </div>
  </form>
  <div class="files">
    <div class="files-header">Uploaded files ({count})</div>
    {file_list}
  </div>
</div>
<script>
const dz = document.getElementById('drop-zone');
const fi = document.getElementById('file-input');
const form = document.getElementById('upload-form');
['dragenter','dragover'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('drag'); }));
['dragleave','drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', ev => { fi.files = ev.dataTransfer.files; form.submit(); });
fi.addEventListener('change', () => { if (fi.files.length) form.submit(); });
function copyUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy URL', 1500);
  });
}
</script>
</body>
</html>"""


def human_size(n):
    for u in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.1f} {u}" if u != "B" else f"{n} {u}"
        n /= 1024
    return f"{n:.1f} TB"


class UploadHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=UPLOAD_DIR, **kwargs)

    def do_GET(self):
        # Serve files directly if path points to a file
        path = urllib.parse.unquote(self.path.lstrip("/"))
        if path and path != "server.py" and os.path.isfile(os.path.join(UPLOAD_DIR, path)):
            return super().do_GET()
        # Otherwise show the upload page
        self._serve_page()

    def do_POST(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._serve_page(err="Invalid request")
            return

        boundary = content_type.split("boundary=")[1].encode()
        content_length = int(self.headers.get("Content-Length", 0))

        if content_length > MAX_SIZE * 2:
            self._serve_page(err="File too large")
            return

        body = self.rfile.read(content_length)
        parts = body.split(b"--" + boundary)
        saved = []

        for part in parts:
            if b'filename="' not in part:
                continue
            header, _, data = part.partition(b"\r\n\r\n")
            fname_start = header.index(b'filename="') + 10
            fname_end = header.index(b'"', fname_start)
            filename = header[fname_start:fname_end].decode("utf-8", errors="replace")
            if not filename:
                continue
            # Strip path, sanitize
            filename = os.path.basename(filename)
            filename = filename.replace(" ", "-")
            # Remove trailing boundary
            if data.endswith(b"\r\n"):
                data = data[:-2]

            filepath = os.path.join(UPLOAD_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(data)
            saved.append(filename)

        if saved:
            urls = [f"https://upload.blockid.au/{f}" for f in saved]
            msg = f"Uploaded: {', '.join(saved)}"
            self._serve_page(ok=msg, urls=urls)
        else:
            self._serve_page(err="No file received")

    def _serve_page(self, ok=None, err=None, urls=None):
        message = ""
        if ok:
            url_html = ""
            if urls:
                url_html = "".join(f'<div class="url-box">{html.escape(u)}</div>' for u in urls)
            message = f'<div class="msg ok">{html.escape(ok)}{url_html}</div>'
        elif err:
            message = f'<div class="msg err">{html.escape(err)}</div>'

        # List files
        files = []
        for f in os.listdir(UPLOAD_DIR):
            if f == "server.py" or f.startswith("."):
                continue
            fp = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(fp):
                stat = os.stat(fp)
                files.append((f, stat.st_size, stat.st_mtime))
        files.sort(key=lambda x: x[2], reverse=True)

        if files:
            rows = []
            for fname, size, mtime in files:
                dt = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
                url = f"https://upload.blockid.au/{urllib.parse.quote(fname)}"
                rows.append(
                    f'<div class="file-row">'
                    f'<div class="file-name"><a href="/{html.escape(fname)}" target="_blank">{html.escape(fname)}</a></div>'
                    f'<div class="file-size">{human_size(size)}</div>'
                    f'<div class="file-date">{dt}</div>'
                    f'<button class="file-copy" onclick="copyUrl(\'{html.escape(url)}\')">Copy URL</button>'
                    f'</div>'
                )
            file_list = "".join(rows)
        else:
            file_list = '<div class="empty">No files yet</div>'

        page = (HTML_TEMPLATE
            .replace("{message}", message)
            .replace("{count}", str(len(files)))
            .replace("{file_list}", file_list)
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(page.encode())))
        self.end_headers()
        self.wfile.write(page.encode())

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4010))
    server = HTTPServer(("127.0.0.1", port), UploadHandler)
    print(f"Upload server on http://127.0.0.1:{port}")
    server.serve_forever()
