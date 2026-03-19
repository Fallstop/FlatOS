// Custom server wrapper that combines Next.js + WebSocket print server on a single port.
// In production, start.sh runs this instead of server.js directly.

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const port = parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Track connected printer clients
const printerClients = new Set();

await app.prepare();

const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);

    // Handle print server HTTP routes
    if (parsedUrl.pathname === "/print/status" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ clients: printerClients.size }));
        return;
    }

    if (parsedUrl.pathname === "/print/send" && req.method === "POST") {
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
            try {
                const { text } = JSON.parse(body);
                if (!text) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing 'text' field" }));
                    return;
                }

                let sent = 0;
                for (const client of printerClients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(text);
                        sent++;
                    }
                }

                console.log(`[print-server] Broadcast to ${sent}/${printerClients.size} clients (${text.length} chars)`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, sent, total: printerClients.size }));
            } catch {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON body" }));
            }
        });
        return;
    }

    // Everything else goes to Next.js
    handle(req, res, parsedUrl);
});

// WebSocket server on /print/ws path
const wss = new WebSocketServer({ server, path: "/print/ws" });

wss.on("connection", (ws, req) => {
    const addr = req.socket.remoteAddress;
    printerClients.add(ws);
    console.log(`[print-server] Printer connected from ${addr} (${printerClients.size} total)`);

    ws.on("close", () => {
        printerClients.delete(ws);
        console.log(`[print-server] Printer disconnected (${printerClients.size} remaining)`);
    });

    ws.on("error", (err) => {
        console.error(`[print-server] Client error:`, err.message);
        printerClients.delete(ws);
    });
});

server.listen(port, hostname, () => {
    console.log(`[server] Ready on http://${hostname}:${port} (Next.js + Print WebSocket)`);
});
