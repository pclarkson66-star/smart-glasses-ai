import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const MEMORY_FILE = "./memory.json";

// Load memory
let longTermMemory = {};
if (fs.existsSync(MEMORY_FILE)) {
  longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(longTermMemory, null, 2));
}

const sessions = new Map();

// HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Smart AI WebSocket server running 🚀");
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running...");

// WebSocket connection
wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (err) {
    console.log("URL PARSE ERROR:", err);
    ws.close();
    return;
  }

  const token = url.searchParams.get("token");
  const userId = url.searchParams.get("userId");

  console.log("Incoming token:", token);
  console.log("Expected token:", TOKEN);
  console.log("UserId:", userId);

  // Validate
  if (token !== TOKEN || !userId) {
    console.log("REJECTED CONNECTION");
    ws.close();
    return;
  }

  // Init memory + session
  if (!longTermMemory[userId]) {
    longTermMemory[userId] = { facts: [] };
  }

  if (!sessions.has(userId)) {
    sessions.set(userId, []);
  }

  // Handle messages
  ws.on("message", async (msg) => {
    try {
      const text = msg.toString();
      console.log("MESSAGE:", text);

      const history = sessions.get(userId);
      const memory = longTermMemory[userId];

      history.push({ role: "user", content: text });

      // 🔥 OpenAI call (CORRECT)
      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: `You are a helpful assistant. User facts: ${memory.facts.join(", ")}`
          },
          ...history
        ]
      });

      const reply = response.output_text;

      // Save assistant reply
      history.push({ role: "assistant", content: reply });

      // Optional memory learning
      if (text.toLowerCase().includes("my name is")) {
        memory.facts.push(text);
        saveMemory();
      }

      ws.send(reply);

    } catch (err) {
      console.error("AI ERROR:", err);
      ws.send("Error getting AI response");
    }
  });
});
