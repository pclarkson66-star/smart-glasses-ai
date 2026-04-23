import WebSocket, { WebSocketServer } from "ws";
import fs from "fs";
import OpenAI from "openai";

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const MEMORY_FILE = "./memory.json";

let longTermMemory = {};
if (fs.existsSync(MEMORY_FILE)) {
longTermMemory = JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory() {
fs.writeFileSync(MEMORY_FILE, JSON.stringify(longTermMemory, null, 2));
}

const sessions = new Map();

import http from "http";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Smart AI WebSocket server running 🚀");
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

console.log("Smart AI running...");

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

// Debug logs (keep these for now)
console.log("Incoming token:", token);
console.log("Expected token:", process.env.TOKEN);
console.log("UserId:", userId);

ws.on("message", async (msg) => {
  try {
    const text = msg.toString();
    console.log("MESSAGE:", text);

    // 🧠 Ask ChatGPT
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: text }
      ],
    });

    const reply = response.choices[0].message.content;

    // 🔁 Send back to client
    ws.send(reply);

  } catch (err) {
    console.error("AI ERROR:", err);
    ws.send("Error getting AI response");
  }
});
  
// ✅ SINGLE validation block
if (token !== process.env.TOKEN || !userId) {
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

ws.on("message", async (message) => {
  const text = message.toString();
  console.log("User:", text);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful AI assistant." },
        { role: "user", content: text }
      ],
    });

    const reply = response.choices[0].message.content;

    console.log("AI:", reply);

    ws.send(reply);
  } catch (err) {
    console.error("AI Error:", err);
    ws.send("Error talking to AI");
  }
});

const history = sessions.get(userId);
const memory = longTermMemory[userId];

history.push({ role: "user", content: userText });

try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are a concise assistant. User facts: ${memory.facts.join(", ")}`,

        },
        ...history
      ]
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let fullReply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.replace("data: ", "");
        if (data === "[DONE]") break;

        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content;

          if (token) {
            fullReply += token;
            ws.send(token);
          }
        } catch {}
      }
    }
  }

  history.push({ role: "assistant", content: fullReply });

  if (userText.toLowerCase().includes("my name is")) {
    memory.facts.push(userText);
    saveMemory();
  }

} catch {
  ws.send("Error");
}

});
});
