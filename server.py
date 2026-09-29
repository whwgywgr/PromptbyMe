# Local dev server for PromptbyMe with no-cache headers,
# so edits to the app files show up immediately on refresh.
# Run:  python server.py   (defaults to port 8931)
import http.server
import socketserver

PORT = 8931


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True

with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
    print(f"Serving PromptbyMe at http://localhost:{PORT}  (Ctrl+C to stop)")
    httpd.serve_forever()
