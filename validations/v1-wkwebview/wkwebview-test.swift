// wkwebview-test.swift
//
// Minimal command-line WKWebView host that loads an MJPEG stream page and
// reports the rendered FPS — same engine Tauri 2.x uses on macOS.
//
// Compile:
//   swiftc -O wkwebview-test.swift -o wkwebview-test
// Run:
//   ./wkwebview-test http://127.0.0.1:8765/ 16

import Cocoa
import WebKit

final class Runner: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let webView: WKWebView
    let url: URL
    let duration: TimeInterval
    var startTime: Date?

    init(url: URL, duration: TimeInterval) {
        self.url = url
        self.duration = duration

        let cfg = WKWebViewConfiguration()
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false
        if #available(macOS 11.0, *) {
            cfg.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        // The WKWebView must have a window backing for full rendering perf.
        let frame = NSRect(x: 0, y: 0, width: 900, height: 1000)
        self.webView = WKWebView(frame: frame, configuration: cfg)
        super.init()

        cfg.userContentController.add(self, name: "v1result")

        let window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false)
        window.title = "V1 — WKWebView FPS Test"
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        webView.navigationDelegate = self
        webView.load(URLRequest(url: url))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        FileHandle.standardError.write("[v1] page loaded, waiting \(duration)s for measurement\n".data(using: .utf8)!)
        startTime = Date()

        // Install a small bridge: when the JS test completes it will post a message.
        let injectJS = """
        const orig = window.console.log;
        window.console.log = function(...args){
            try {
                const s = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                if (s.startsWith('V1_RESULT')) {
                    window.webkit.messageHandlers.v1result.postMessage(s);
                }
            } catch(e){}
            return orig.apply(this, args);
        };
        """
        webView.evaluateJavaScript(injectJS, completionHandler: nil)
    }

    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "v1result" {
            let body = "\(message.body)"
            FileHandle.standardOutput.write("\(body)\n".data(using: .utf8)!)
            FileHandle.standardError.write("[v1] received result, exiting\n".data(using: .utf8)!)
            exit(0)
        }
    }
}

// Timeout safety
DispatchQueue.global().async {
    Thread.sleep(forTimeInterval: 30)
    FileHandle.standardError.write("[v1] timeout 30s, forcing exit\n".data(using: .utf8)!)
    exit(2)
}

let args = CommandLine.arguments
guard args.count >= 2, let url = URL(string: args[1]) else {
    print("Usage: wkwebview-test <url> [duration]")
    exit(1)
}
let duration = args.count >= 3 ? TimeInterval(args[2]) ?? 16.0 : 16.0

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let runner = Runner(url: url, duration: duration)
_ = runner  // keep alive
app.run()
