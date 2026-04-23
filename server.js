import http from "http";
import express from "express";
import { WebSocketServer } from "ws";

const app = express();

// Railway port
const PORT = process.env.PORT || 8080;

// Your relay token (must match app)
const RELAY_TOKEN = process.env.RELAY_TOKEN || "abc123";

// Basic route (for browser test)
app.get("/", (req, res) => {
  res.send("OK");
});

// Health check (prevents sleep)
app.get("/health", (req, res) => {
  res.status(200).send("healthy");
});

const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (token !== RELAY_TOKEN) {
      console.log("UNAUTHORIZED");
      ws.close();
      return;
    }

    console.log("AUTHORIZED");

    // Handle messages from OcuClaw
    ws.on("message", (message) => {
      try {
        const text = message.toString();
        console.log("RAW MESSAGE:", text);

        // Echo response (placeholder for AI)
        ws.send(
          JSON.stringify({
            type: "response",
            text: "Connected successfully"
          })
        );

      } catch (err) {
        console.error("MESSAGE ERROR:", err);
      }
    });

    ws.on("close", () => {
      console.log("CONNECTION CLOSED");
    });

  } catch (err) {
    console.error("CONNECTION ERROR:", err);
    ws.close();
  }
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// Keep-alive ping (prevents Railway shutdown)
setInterval(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    if (res.ok) {
      console.log("Self ping success");
    }
  } catch (err) {
    console.error("Self ping failed");
  }
}, 30000);
