import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RELAY_TOKEN = process.env.RELAY_TOKEN;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("OK");
});

wss.on("connection", (ws) => {
  console.log("NEW CONNECTION");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("RAW MESSAGE:", data);

      // Handshake
      if (data.type === "protocolHello") {
        console.log("Handshake received");

        ws.send(
          JSON.stringify({
            type: "protocolAck",
            supportedProtocolVersions: ["v2"],
            preferredProtocolVersion: "v2",
          })
        );

        return;
      }

      // Token check
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
            {
              role: "system",
              content: "You are a helpful AI assistant for smart glasses.",
            },
            {
              role: "user",
              content: userText,
            },
          ],
        });

        replyText = completion.choices[0].message.content;

      } catch (err) {
        console.error("OPENAI ERROR:", err.message);

        if (err.status === 429) {
          replyText = "Rate limit reached. Try again shortly.";
        } else if (err.status === 401) {
          replyText = "Invalid API key.";
        } else {
          replyText = "AI error occurred.";
        }
      }

      ws.send(
        JSON.stringify({
          type: "response",
          text: replyText,
        })
      );

    } catch (err) {
      console.error("MESSAGE ERROR:", err);

      ws.send(
        JSON.stringify({
          error: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("CONNECTION CLOSED");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Keep alive
setInterval(() => {
  fetch(`http://localhost:${PORT}`).catch(() => {});
}, 300000);
