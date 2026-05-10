const { google } = require("googleapis");

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

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

async function saveToSheet(userMessage, aiReply) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "工作表1!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
        userMessage,
        aiReply,
        "LINE",
        "新詢問"
      ]]
    }
  });
}



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
        model: "gemini-2.5-flash",
      });

      const result = await model.generateContent(`
你是「宅值所」的裝潢客服助理。

品牌定位：
- 主打新竹、竹南、小資裝潢
- 客戶多為工程師家庭
- 強調透明報價、高CP值、實用收納
- 提供系統櫃、新成屋裝潢、老屋翻新

價格參考：
- 純系統櫃：10萬起
- 新成屋輕裝修：35萬起
- 老屋翻新：85萬起
- 毛胚屋：100萬起

當客戶有高意願時：
請主動詢問：
1. 地區
2. 坪數
3. 預算
4. 預計入住時間
5. 聯絡方式

請使用：
- 繁體中文
- 親切自然
- 像真人客服
- 不要太機器人

客人訊息：
${userMessage}
`);

      const replyText = result.response.text();

      await saveToSheet(userMessage, replyText);
      
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
