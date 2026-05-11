#!/usr/bin/env python3
"""
Minimal MJPEG HTTP server. Reads frames.bin (length-prefixed JPEGs from sim-capture)
and serves multipart/x-mixed-replace stream at configurable FPS.
Usage: python3 mjpeg_server.py [--fps 60] [--port 8765]
"""
import http.server
import socketserver
import struct
import threading
import time
import argparse
import os

FRAMES_PATH = os.path.join(os.path.dirname(__file__), 'frames.bin')

def load_frames():
    frames = []
    with open(FRAMES_PATH, 'rb') as f:
        data = f.read()
    pos = 0
    while pos < len(data) - 4:
        length = struct.unpack('>I', data[pos:pos+4])[0]
        pos += 4
        if pos + length > len(data):
            break
        frames.append(data[pos:pos+length])
        pos += length
    return frames

FRAMES = load_frames()
TARGET_FPS = 60

class MJPEGHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass  # quiet

    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            with open(os.path.join(os.path.dirname(__file__), 'index.html'), 'rb') as f:
                self.wfile.write(f.read())
            return
        if self.path == '/stream.mjpg':
            self.send_response(200)
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Connection', 'close')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
            self.end_headers()
            interval = 1.0 / TARGET_FPS
            i = 0
            try:
                while True:
                    frame = FRAMES[i % len(FRAMES)]
                    self.wfile.write(b'--FRAME\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n')
                    self.wfile.write(f'Content-Length: {len(frame)}\r\n\r\n'.encode())
                    self.wfile.write(frame)
                    self.wfile.write(b'\r\n')
                    self.wfile.flush()
                    i += 1
                    time.sleep(interval)
            except (BrokenPipeError, ConnectionResetError):
                return

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--fps', type=int, default=60)
    args = p.parse_args()
    TARGET_FPS = args.fps
    print(f'Loaded {len(FRAMES)} frames, serving at http://127.0.0.1:{args.port}/ @ {args.fps}fps')
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', args.port), MJPEGHandler) as srv:
        srv.serve_forever()
