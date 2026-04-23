import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

// Environment variables
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RELAY_TOKEN = process.env.RELAY_TOKEN;

// OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Health check (Railway needs this)
app.get("/", (req, res) => {
  res.send("OK");
});

// WebSocket connection (OcuClaw)
wss.on("connection", (ws, req) => {
  console.log("🔌 Client connected");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("📩 Incoming:", data);

      // Ignore protocol hello (OcuClaw handshake)
      if (data.type === "protocolHello") {
        console.log("🤝 Handshake received");
        return;
      }

      // Optional token check
      if (RELAY_TOKEN && data.token !== RELAY_TOKEN) {
        ws.send(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      const userText = data.text || "Hello";

      let replyText = "";

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful AI assistant for smart glasses." },
            { role: "user", content: userText },
          ],
        });

        replyText = completion.choices[0].message.content;

      } catch (err) {
        console.error("❌ OpenAI Error:", err.message);

        // Handle quota / rate limit nicely
        if (err.status === 429) {
          replyText = "⚠️ AI is temporarily busy or quota exceeded. Try again shortly.";
        } else if (err.status === 401) {
          replyText = "⚠️ API key issue. Check your OpenAI key.";
        } else {
          replyText = "⚠️ AI error occurred.";
        }
      }

      ws.send(
        JSON.stringify({
          type: "response",
          text: replyText,
        })
      );

    } catch (err) {
      console.error("❌ Message Error:", err);

      ws.send(
        JSON.stringify({
          error: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Keep Railway alive (prevents shutdown)
setInterval(() => {
  fetch(`http://localhost:${PORT}`)
    .then(() => console.log("🔁 Self ping OK"))
    .catch(() => {});
}, 300000);
