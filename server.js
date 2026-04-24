import http from "http";
import { WebSocketServer } from "ws";
import OpenAI from "openai";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

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
      const data = JSON.parse(message.toString());
      console.log("Received:", data);

      // 🔑 FIXED HANDSHAKE
      if (data.type === "protocolHello") {
        ws.send(JSON.stringify({
          type: "protocolAck",
          protocolVersion: data.preferredProtocolVersion || "v2"
        }));
        return;
      }

      // Handle text input from glasses
      if (data.type === "text") {
        const userText = data.text;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "user", content: userText }
          ],
        });

        const reply = response.choices[0].message.content;

        console.log("AI Reply:", reply);

        ws.send(JSON.stringify({
          type: "text",
          text: reply
        }));
      }

    } catch (err) {
      console.error("Error:", err);
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
