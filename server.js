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
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("API KEY LOADED:", !!OPENAI_API_KEY);
console.log("TOKEN LOADED:", !!TOKEN);

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
}

if (!TOKEN) {
  console.error("Missing TOKEN");
}

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
  console.error("Memory load failed, resetting:", e);
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

/* HTTP SERVER */
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    return res.end("OK");
  }

  res.writeHead(200);
  res.end("Server is alive");
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

  let url;

  try {
    url = new URL(req.url, "http://localhost");
  } catch (err) {
    console.error("Invalid URL:", err);
    ws.close();
    return;
  }

  const token = url.searchParams.get("token");
  const userId = url.searchParams.get("userId");

  if (token !== TOKEN || !userId) {
    console.log("REJECTED CONNECTION");
    ws.close();
    return;
  }

  console.log("AUTHORIZED:", userId);

  if (!longTermMemory[userId]) {
    longTermMemory[userId] = { facts: [] };
  }

  if (!sessions.has(userId)) {
    sessions.set(userId, []);
  }

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
