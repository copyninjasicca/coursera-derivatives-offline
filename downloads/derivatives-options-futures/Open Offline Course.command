#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
python3 - <<'PYTHON'
import http.server, functools, os, webbrowser
handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=os.getcwd())
try:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),handler)
except OSError:
    print('Port 8765 is occupied. If the course preview is already running, use its open tab. Otherwise stop that process and run this launcher again.')
else:
    webbrowser.open('http://127.0.0.1:8765/index.html')
    print('Offline course is running locally. Press Ctrl-C to stop.')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
PYTHON
