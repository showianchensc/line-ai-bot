const express = require("express");
const line = require("@line/bot-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/", (req, res) => {
  res.status(200).send("LINE AI Bot is running");
});

app.post("/webhook", line.middleware(config), async (req, res) => {
  res.status(200).send("OK");

  try {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;

      const userMessage = event.message.text;

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const result = await model.generateContent(`
你是宅值所裝潢客服助理。
請使用繁體中文，語氣專業、親切、像真人客服。

客人訊息：
${userMessage}
`);

      const replyText = result.response.text();

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText || "您好，我是宅值所客服助理，請問有什麼可以協助您的？",
      });
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
