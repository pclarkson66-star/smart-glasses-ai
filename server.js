import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";

/* SAFETY LOGGING */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

/* ENV */
const PORT = Number(process.env.PORT) || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("API KEY LOADED:", !!OPENAI_API_KEY);
console.log("TOKEN LOADED:", !!TOKEN);

/* OPENAI */
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/* MEMORY (SAFE) */
const MEMORY_FILE = "./memory.json";
let longTermMemory = {};

try {
  if (fs.existsSync(MEMORY_FILE)) {
    longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  }
} catch (e) {
  console.error("Memory load failed:", e);
  longTermMemory = {};
}

function saveMemory() {
  try {
    fs.writeFileSync(
      MEMORY_FILE,
      JSON.stringify(longTermMemory, null, 2)
    );
  } catch (err) {
    console.error("Memory save failed:", err);
  }
}

/* SESSIONS */
const sessions = new Map();

/* HTTP SERVER (Railway requires this) */
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  res.writeHead(404);
  res.end("Not Found");
});

/* WEBSOCKET */
const wss = new WebSocketServer({ server });

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running");

/* CONNECTION */
wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let token = null;

  // Try query param
  try {
    const url = new URL(req.url, "http://localhost");
    token = url.searchParams.get("token");
  } catch {}

  // Try Authorization header
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  // Validate token (optional)
  if (TOKEN && token && token !== TOKEN) {
    console.log("REJECTED CONNECTION (bad token)");
    ws.close();
    return;
  }

  const userId = "default-user";

  console.log("AUTHORIZED:", userId);

  if (!longTermMemory[userId]) {
    longTermMemory[userId] = { facts: [] };
  }

  if (!sessions.has(userId)) {
    sessions.set(userId, []);
  }

  /* MESSAGE HANDLER */
  ws.on("message", async (msg) => {
    try {
      const raw = msg.toString();
      console.log("RAW MESSAGE:", raw);

      let data;

      // Try parsing JSON
      try {
        data = JSON.parse(raw);
      } catch {
        data = { text: raw };
      }

      // 🚫 Ignore OcuClaw handshake/system messages
      if (data.type === "protocolHello") {
        console.log("Handshake received");
        return;
      }

      // Extract user message safely
      const userText =
        data.text ||
        data.message ||
        data.input ||
        raw;

      if (!userText || typeof userText !== "string") {
        console.log("No usable message");
        return;
      }

      console.log("USER MESSAGE:", userText);

      /* CALL OPENAI */
      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: userText,
      });

      const reply =
        response.output?.[0]?.content?.[0]?.text ||
        response.output_text ||
        "No response";

      console.log("REPLY:", reply);

      ws.send(reply);

    } catch (err) {
      console.error("AI ERROR:", err);
      ws.send("Error getting AI response");
    }
  });

  ws.on("close", () => {
    console.log("CONNECTION CLOSED:", userId);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});
