import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";
import fetch from "node-fetch";

// ===== ENV =====
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RELAY_TOKEN = process.env.RELAY_TOKEN || "default-token";

// ===== INIT =====
const app = express();

// IMPORTANT: bind to 0.0.0.0 (fixes container shutdown on some platforms)
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("OK");
});

// ===== WEBSOCKET SERVER =====
wss.on("connection", (ws) => {
  console.log("NEW CONNECTION");

  let authorized = false;

  // keep connection alive
  const keepAlive = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 25000);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("RAW MESSAGE:", data);

      // ===== AUTH =====
      if (!authorized) {
        if (data.token !== RELAY_TOKEN) {
          console.log("UNAUTHORIZED");
          ws.close();
          return;
        }

        authorized = true;
        console.log("AUTHORIZED");
      }

      // ===== HANDSHAKE =====
      if (data.type === "protocolHello") {
        console.log("Handshake received");

        ws.send(
          JSON.stringify({
            type: "protocolAck",
          })
        );
        return;
      }

      // ===== USER MESSAGE =====
      if (data.type === "userMessage") {
        const userText = data.text || "Hello";

        let aiReply = "AI unavailable";

        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "user", content: userText }
            ],
          });

          aiReply = response.choices[0].message.content;
        } catch (err) {
          console.log("AI ERROR:", err.message);
          aiReply = "Temporary AI error. Try again.";
        }

        ws.send(
          JSON.stringify({
            type: "assistantMessage",
            text: aiReply,
          })
        );
      }

    } catch (err) {
      console.log("MESSAGE ERROR:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("CONNECTION CLOSED");
    clearInterval(keepAlive);
  });

  ws.on("error", (err) => {
    console.log("WS ERROR:", err.message);
  });
});

// ===== START SERVER =====
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// ===== KEEP CONTAINER ALIVE =====
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}`);
    console.log("Self ping success");
  } catch {
    console.log("Self ping failed");
  }
}, 20000);
