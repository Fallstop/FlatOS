// Production server wrapper.
// Intercepts the HTTP server that Next.js standalone server.js creates,
// injects print server routes and WebSocket support on the same port.

import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// Track connected printer clients
const printerClients = new Set();

// Monkey-patch http.createServer to wrap the Next.js request handler
const originalCreateServer = http.createServer;
http.createServer = function (nextHandler) {
    const wrappedHandler = (req, res) => {
        // Handle print server HTTP routes before Next.js
        if (req.url === "/print/status" && req.method === "GET") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ clients: printerClients.size }));
            return;
        }

        if (req.url === "/print/send" && req.method === "POST") {
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
        nextHandler(req, res);
    };

    // Create the real server with our wrapped handler
    const server = originalCreateServer.call(this, wrappedHandler);

    // Restore original createServer (only need to patch once)
    http.createServer = originalCreateServer;

    // Attach WebSocket server
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

    console.log("[print-server] WebSocket attached to Next.js server at /print/ws");

    return server;
};

// Now load the standalone server.js — it will call http.createServer() which we've patched
await import("../server.js");
