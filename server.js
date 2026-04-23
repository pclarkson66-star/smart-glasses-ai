import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";

/* GLOBAL SAFETY LOGGING */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

/* ENV CONFIG */
const PORT = Number(process.env.PORT) || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("API KEY LOADED:", !!OPENAI_API_KEY);
console.log("TOKEN LOADED:", !!TOKEN);

/* OPENAI SETUP */
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/* MEMORY (SAFE MODE) */
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

/* SESSION TRACKING */
const sessions = new Map();

/* HTTP SERVER (REQUIRED FOR RAILWAY) */
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  res.writeHead(404);
  res.end("Not Found");
});

/* WEBSOCKET SERVER */
const wss = new WebSocketServer({ server });

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running");

/* CONNECTION HANDLER */
wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let token = null;

  // 1. Try query param
  try {
    const url = new URL(req.url, "http://localhost");
    token = url.searchParams.get("token");
  } catch (e) {}

  // 2. Try Authorization header (OcuClaw may use this)
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  // 3. Validate token (optional but recommended)
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
      const text = msg.toString();
      console.log("MESSAGE:", text);

      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: text,
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
