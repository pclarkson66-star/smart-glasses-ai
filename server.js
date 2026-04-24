import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import OpenAI from "openai";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("API KEY LOADED:", !!OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const MEMORY_FILE = "./memory.json";

// Load memory
let longTermMemory = {};
if (fs.existsSync(MEMORY_FILE)) {
  try {
    longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  } catch {
    longTermMemory = {};
  }
}

function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(longTermMemory, null, 2));
}

const sessions = new Map();

// HTTP server (required for Railway)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Server is alive");
});

// WebSocket server
const wss = new WebSocketServer({ server });

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running");

// Handle connections
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
  console.log("UserId:", userId);

  // Validate connection
  if (token !== TOKEN || !userId) {
    console.log("REJECTED CONNECTION");
    ws.close();
    return;
  }

  // Initialize memory + session
  if (!longTermMemory[userId]) {
    longTermMemory[userId] = { facts: [] };
  }

  if (!sessions.has(userId)) {
    sessions.set(userId, []);
  }

  const history = sessions.get(userId);
  const memory = longTermMemory[userId];

  // Message handler
  ws.on("message", async (msg) => {
    try {
      const userText = msg.toString();
      console.log("MESSAGE:", userText);

      history.push({ role: "user", content: userText });

      const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: `You are a concise assistant. User facts: ${memory.facts.join(", ")}`
          },
          ...history
        ]
      });

      const reply = response.output_text || "No response";

      ws.send(reply);

      history.push({ role: "assistant", content: reply });

      // Simple memory capture
      if (userText.toLowerCase().includes("my name is")) {
        memory.facts.push(userText);
        saveMemory();
      }

    } catch (err) {
      console.error("AI ERROR:", err);
      ws.send("Error getting AI response");
    }
  });
});
