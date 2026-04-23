import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("API KEY LOADED:", !!OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const MEMORY_FILE = "./memory.json";

let longTermMemory = {};
if (fs.existsSync(MEMORY_FILE)) {
  try {
    longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  } catch (e) {
    console.log("Memory load failed, resetting.");
    longTermMemory = {};
  }
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(longTermMemory, null, 2));
}

const sessions = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Server is alive ✅");
});

const wss = new WebSocketServer({ server });

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running...");

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (err) {
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
        input: text
      });

      const reply = response.output_text || "No response";

      ws.send(reply);

    } catch (err) {
      console.error("AI ERROR:", err);
      ws.send("Error getting AI response");
    }
  });
});
