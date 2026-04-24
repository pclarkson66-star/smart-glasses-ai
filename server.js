import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import OpenAI from "openai";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const server = http.createServer();
const wss = new WebSocketServer({ server });

console.log("Server starting...");

wss.on("connection", (ws, req) => {
  console.log("NEW CONNECTION");

  let authorized = false;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());

      // Handle authentication
      if (!authorized) {
        const incomingToken = data.token || data.authorization || null;
        console.log("Incoming token:", incomingToken);

        if (incomingToken !== TOKEN) {
          console.log("REJECTED CONNECTION");
          ws.close();
          return;
        }

        console.log("AUTHORIZED CONNECTION");
        authorized = true;
      }

      // Handle protocol handshake (CRITICAL FIX)
      if (data.type === "protocolHello") {
        console.log("Received protocolHello");

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

      // Handle incoming messages from glasses
      if (data.type === "text" || data.type === "message") {
        const userText = data.text || data.message || "";
        console.log("User said:", userText);

        let aiResponse = "Hello from AI";

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "user", content: userText }
            ]
          });

          aiResponse = completion.choices[0].message.content;
        } catch (err) {
          console.error("OpenAI error:", err.message);
        }

        // Send response back to glasses
        ws.send(JSON.stringify({
          type: "text",
          text: aiResponse
        }));

        return;
      }

    } catch (err) {
      console.error("Error parsing message:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
