import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";
import express from "express"; //

const app = express();
const PORT = process.env.PORT || 8080;
const RELAY_TOKEN = process.env.RELAY_TOKEN || "abc123";

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("healthy"));

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws"
});

wss.on("connection", (ws) => {
  console.log("NEW CONNECTION");

  let authorized = false;

  ws.on("message", (message) => {
    try {
      const text = message.toString();
      console.log("RAW MESSAGE:", text);

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }

      if (data.type === "protocolHello") {
        const token = data.token;

        if (token !== RELAY_TOKEN) {
          console.log("UNAUTHORIZED");
          ws.close();
          return;
        }

        authorized = true;
        console.log("AUTHORIZED");

        ws.send(JSON.stringify({
          type: "protocolAck",
          version: "v2"
        }));

        return;
      }

      if (!authorized) return;

      ws.send(JSON.stringify({
        type: "response",
        text: "Connected to AI relay"
      }));

    } catch (err) {
      console.error("ERROR:", err);
    }
  });

  ws.on("close", () => {
    console.log("CONNECTION CLOSED");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// keep alive
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/health`);
    console.log("Self ping success");
  } catch {}
}, 30000);
