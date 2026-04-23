import http from "http";
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 8080;
const RELAY_TOKEN = process.env.RELAY_TOKEN || "abc123";

app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("healthy"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

      // STEP 1: Handle OcuClaw handshake
      if (data.type === "protocolHello") {
        const token = data.token;

        if (token !== RELAY_TOKEN) {
          console.log("UNAUTHORIZED");
          ws.close();
          return;
        }

        authorized = true;
        console.log("AUTHORIZED");

        // Respond to handshake (important!)
        ws.send(
          JSON.stringify({
            type: "protocolAck",
            version: "v2"
          })
        );

        return;
      }

      // STEP 2: Ignore anything before auth
      if (!authorized) {
        console.log("IGNORED (not authorized yet)");
        return;
      }

      // STEP 3: Handle real messages
      ws.send(
        JSON.stringify({
          type: "response",
          text: "Connected to AI relay"
        })
      );

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

// Keep alive
setInterval(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    if (res.ok) console.log("Self ping success");
  } catch {}
}, 30000);
