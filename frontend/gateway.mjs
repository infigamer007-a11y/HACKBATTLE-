import http from "node:http";
import net from "node:net";

const BACKEND_PORT = 8000;
const NEXT_PORT = 3001;
const GATEWAY_PORT = 3000;

const server = http.createServer((req, res) => {
  const isBackend =
    req.url.startsWith("/api/") ||
    req.url === "/health" ||
    req.url.startsWith("/health");
  const targetPort = isBackend ? BACKEND_PORT : NEXT_PORT;

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
        "x-forwarded-host": req.headers.host || "",
        "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
        "x-forwarded-for": req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    console.error(`[gateway] Proxy error for ${req.url} -> port ${targetPort}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Gateway Bad Target", message: err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.on("upgrade", (req, clientSocket, head) => {
  const isBackend = req.url.startsWith("/ws/") || req.url.startsWith("/ws");
  const targetPort = isBackend ? BACKEND_PORT : NEXT_PORT;

  const targetSocket = net.connect(targetPort, "127.0.0.1", () => {
    let rawReq = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i];
      const val = req.rawHeaders[i + 1];
      if (key.toLowerCase() === "host") {
        rawReq += `Host: 127.0.0.1:${targetPort}\r\n`;
      } else {
        rawReq += `${key}: ${val}\r\n`;
      }
    }
    rawReq += "\r\n";
    targetSocket.write(rawReq);
    if (head && head.length > 0) {
      targetSocket.write(head);
    }
    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
  });

  targetSocket.on("error", (err) => {
    console.error("[gateway ws] Target socket error:", err.message);
    clientSocket.destroy();
  });

  clientSocket.on("error", (err) => {
    console.error("[gateway ws] Client socket error:", err.message);
    targetSocket.destroy();
  });
});

server.listen(GATEWAY_PORT, "0.0.0.0", () => {
  console.log(`[gateway] Unified Gateway running on http://0.0.0.0:${GATEWAY_PORT}`);
  console.log(`[gateway] -> /api/* & /health routed to 127.0.0.1:${BACKEND_PORT}`);
  console.log(`[gateway] -> /ws/* upgraded to 127.0.0.1:${BACKEND_PORT}`);
  console.log(`[gateway] -> All other routes to Next.js on 127.0.0.1:${NEXT_PORT}`);
});
