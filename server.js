import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TOKEN;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");

  console.log("Incoming token:", token);

  if (token !== TOKEN) {
    console.log("REJECTED CONNECTION");
    ws.close(1008, "Unauthorized");
    return;
  }

  console.log("AUTHORIZED CONNECTION");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("Received:", data);

      // REQUIRED: respond to protocolHello
      if (data.type === "protocolHello") {
        ws.send(JSON.stringify({
          type: "protocolHelloAck",
          version: "v2"
        }));
        return;
      }

      // Example: respond to user inputif (data.type === "protocolHello") {
  ws.send(JSON.stringify({
    type: "protocolHello",
    protocolVersion: "v2",
    serverName: "smart-glasses-ai",
    capabilities: {
      streaming: false
    }
  }));
  return;
}
      if (data.type === "userMessage") {
        const userText = data.text || "Hello";

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: userText }
          ]
        });

        const reply = completion.choices[0].message.content;

        ws.send(JSON.stringify({
          type: "assistantMessage",
          text: reply
        }));
      }

    } catch (err) {
      console.log("ERROR:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
