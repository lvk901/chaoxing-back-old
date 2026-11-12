#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键安装 chaoxing-back-old 油猴脚本（跨平台，零依赖）。

原理：临时起一个本地静态服务，再用系统默认浏览器打开 .user.js 地址。
Tampermonkey / Violentmonkey 会接管这个请求并弹出安装页，点「安装」即可。

用法:
    python3 install.py                # 起服务并打开默认浏览器
    python3 install.py --port 8900    # 指定端口
    python3 install.py --no-browser   # 只起服务，自己手动打开打印出的地址
    python3 install.py --wait 120     # 服务保持时长（秒）
"""
import argparse
import http.server
import pathlib
import socketserver
import sys
import threading
import time
import webbrowser

HERE = pathlib.Path(__file__).resolve().parent
SCRIPT = "chaoxing-back-old.user.js"

# Windows 控制台默认 GBK，避免特殊符号导致 UnicodeEncodeError
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def make_server(preferred, handler):
    """先用指定端口，被占用则回退到系统分配的空闲端口。"""
    for port in (preferred, 0):
        try:
            return socketserver.TCPServer(("127.0.0.1", port), handler)
        except OSError:
            continue
    raise SystemExit("找不到可用端口")


def make_handler(directory):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(directory), **kw)

        def log_message(self, fmt, *args):
            sys.stderr.write("  [http] " + (fmt % args) + "\n")

    return Handler


def main():
    ap = argparse.ArgumentParser(description="安装 chaoxing-back-old 油猴脚本")
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--wait", type=int, default=90, help="服务保持秒数，默认 90")
    ap.add_argument("--no-browser", action="store_true", help="只起服务，不自动打开浏览器")
    args = ap.parse_args()

    target = HERE / SCRIPT
    if not target.exists():
        raise SystemExit(f"找不到 {SCRIPT}，请在仓库根目录运行本脚本")

    port = args.port
    httpd = make_server(port, make_handler(HERE))
    port = httpd.server_address[1]
    url = f"http://127.0.0.1:{port}/{SCRIPT}"

    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    print("chaoxing-back-old 安装器")
    print(f"  脚本: {target}")
    print(f"  地址: {url}")
    print()

    if not args.no_browser:
        ok = webbrowser.open(url)
        if not ok:
            print("  [!] 自动打开浏览器失败，请手动访问上面的地址")
    else:
        print("  请手动在浏览器里打开上面的地址")

    print()
    print("浏览器里若弹出 Tampermonkey 安装页，点「安装」即可。")
    print(f"完成后本服务会自动关闭（Ctrl+C 可提前结束）。剩余 {args.wait}s")

    try:
        for i in range(args.wait, 0, -1):
            time.sleep(1)
            if i % 30 == 0:
                print(f"  ... 剩余 {i}s")
    except KeyboardInterrupt:
        print("\n  已中断")
    finally:
        httpd.shutdown()
        httpd.server_close()
        print("  [ok] 临时服务已关闭")


if __name__ == "__main__":
    main()
