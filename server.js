import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";
import fs from "fs";

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
  longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

// Save memory
function saveMemory() {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(longTermMemory, null, 2));
}

// HTTP server (required for Railway)
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Server is alive");
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  console.log("Incoming token:", token);

  if (token !== TOKEN) {
    console.log("REJECTED CONNECTION");
    ws.close();
    return;
  }

  console.log("AUTHORIZED CONNECTION");

  ws.on("message", async (message) => {
    try {
      const text = message.toString();
      console.log("Received:", text);

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: text }],
      });

      const reply = response.choices[0].message.content;

      ws.send(reply);

      // Optional: store memory
      longTermMemory.lastMessage = text;
      saveMemory();

    } catch (err) {
      console.error("Error:", err);
      ws.send("Error processing request");
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
