import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";

// ===== ENV =====
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RELAY_TOKEN = process.env.RELAY_TOKEN || "default-token";

// ===== INIT =====
const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// ===== HEALTH CHECK (REQUIRED FOR DEPLOY) =====
app.get("/", (req, res) => {
  res.send("OK");
});

// ===== WEBSOCKET (OCUCLAW RELAY) =====
wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let authorized = false;

  // ===== KEEP ALIVE (prevents container shutdown) =====
  const keepAlive = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 25000);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("RAW MESSAGE:", data);

      // ===== AUTH STEP =====
      if (!authorized) {
        if (data.token !== RELAY_TOKEN) {
          console.log("UNAUTHORIZED");
          ws.close();
          return;
        }

        authorized = true;
        console.log("AUTHORIZED");
      }

      // ===== HANDLE HANDSHAKE =====
      if (data.type === "protocolHello") {
        console.log("Handshake received");

        ws.send(
          JSON.stringify({
            type: "protocolAck",
          })
        );

        return;
      }

      // ===== HANDLE USER MESSAGE =====
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

          // fallback so connection doesn't close
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
