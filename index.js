const express = require("express");
const line = require("@line/bot-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
}

if (!process.env.LINE_CHANNEL_SECRET) {
  throw new Error("Missing LINE_CHANNEL_SECRET");
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY");
}

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;

    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") {
        continue;
      }

      const userMessage = event.message.text;

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const result = await model.generateContent(`
你是宅值所裝潢客服助理。

請使用繁體中文。
語氣專業、親切、像真人客服。

客人訊息：
${userMessage}
`);

      const replyText = result.response.text();

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText,
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
