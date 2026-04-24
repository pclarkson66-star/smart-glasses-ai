import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("Server starting...");
console.log("TOKEN:", TOKEN);
console.log("API KEY LOADED:", !!OPENAI_API_KEY);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const server = http.createServer();

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  // Extract token from URL query
  const url = new URL(req.url, `http://${req.headers.host}`);
  const incomingToken = url.searchParams.get("token");

  console.log("Incoming token:", incomingToken);

  if (incomingToken !== TOKEN) {
    console.log("REJECTED CONNECTION");
    ws.close();
    return;
  }

  console.log("AUTHORIZED CONNECTION");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("Received:", data);

      // Handle protocol hello (REQUIRED by Ocuclaw)
      if (data.type === "protocolHello") {
        console.log("Protocol handshake received");

        ws.send(JSON.stringify({
          type: "protocolAck",
          version: "v2"
        }));

        return;
      }

      // Handle user message from glasses
      if (data.type === "userMessage") {
        const userText = data.text || "Hello";

        console.log("User said:", userText);

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant responding for smart glasses. Keep responses short." },
            { role: "user", content: userText }
          ],
        });

        const aiText = response.choices[0].message.content;

        console.log("AI response:", aiText);

        ws.send(JSON.stringify({
          type: "assistantMessage",
          text: aiText
        }));

        return;
      }

    } catch (err) {
      console.log("Error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
