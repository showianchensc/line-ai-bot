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

function extractCustomerInfo(userMessage) {
  const info = {
    area: "",
    houseInfo: "",
    budget: "",
    need: "",
    moveInTime: "",
    phone: ""
  };

  const areaMatch = userMessage.match(/(新竹|竹北|竹南|頭份|苗栗|台北|新北|桃園|台中|台南|高雄)/);
  if (areaMatch) info.area = areaMatch[1];

  const houseMatch = userMessage.match(/(\d+\s*坪|一房|兩房|三房|四房|2房|3房|4房|新成屋|老屋|毛胚屋)/);
  if (houseMatch) info.houseInfo = houseMatch[1];

  const budgetMatch = userMessage.match(/(\d+\s*萬|\d+\s*元|預算\s*\d+)/);
  if (budgetMatch) info.budget = budgetMatch[1];

  const needKeywords = ["系統櫃", "新成屋", "老屋翻新", "輕裝修", "客變", "收納", "廚房", "浴室", "全室", "丈量", "報價"];
  const foundNeeds = needKeywords.filter(k => userMessage.includes(k));
  if (foundNeeds.length > 0) info.need = foundNeeds.join("、");

  const timeMatch = userMessage.match(/(年前|年後|下個月|這個月|月底|入住|交屋|三個月內|半年內|\d+月|\d+\/\d+)/);
  if (timeMatch) info.moveInTime = timeMatch[1];

  const phoneMatch = userMessage.match(/09\d{8}/);
  if (phoneMatch) info.phone = phoneMatch[0];

  return info;
}

function getMissingFields(info) {
  const missing = [];

  if (!info.area) missing.push("房屋地區");
  if (!info.houseInfo) missing.push("房型或坪數");
  if (!info.budget) missing.push("預算");
  if (!info.need) missing.push("裝潢需求");
  if (!info.moveInTime) missing.push("預計入住或施工時間");
  if (!info.phone) missing.push("聯絡電話");

  return missing;
}




async function saveToSheet(userMessage, aiReply) {

  console.log("開始寫入 Google Sheet");

  const info = extractCustomerInfo(userMessage);

  let status = "一般詢問";

  const highIntentKeywords = [
    "預算", "坪數", "丈量", "預約", "報價", "平面圖",
    "入住", "新成屋", "老屋翻新", "系統櫃",
    "竹北", "新竹", "竹南", "電話"
  ];

  const isHighIntent = highIntentKeywords.some(keyword =>
    userMessage.includes(keyword)
  );

  if (isHighIntent) {
    status = "高意願";
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "工作表1!A:K",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
          userMessage,
          aiReply,
          "LINE",
          status,
          info.area,
          info.houseInfo,
          info.budget,
          info.need,
          info.moveInTime,
          info.phone
        ]]
      }
    });

    console.log("Google Sheet 寫入成功");

  } catch (err) {
    console.error("Google Sheet Error:", err);
  }
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

const customerInfo = extractCustomerInfo(userMessage);
const missingFields = getMissingFields(customerInfo);

const result = await model.generateContent(`
你是「宅值所」的裝潢客服助理。

品牌定位：
- 主打新竹、竹北、竹南的小資裝潢與系統櫃
- 客戶多為工程師家庭
- 強調透明報價、高CP值、實用收納
- 提供系統櫃、新成屋裝潢、老屋翻新、客變諮詢

價格參考：
- 純系統櫃：10萬起
- 新成屋輕裝修：35萬起
- 老屋翻新：85萬起
- 毛胚屋：100萬起
- 丈量費：3,000元，可於簽約後折抵

目前已辨識到的客戶資料：
- 地區：${customerInfo.area || "尚未提供"}
- 房型/坪數：${customerInfo.houseInfo || "尚未提供"}
- 預算：${customerInfo.budget || "尚未提供"}
- 需求：${customerInfo.need || "尚未提供"}
- 入住/施工時間：${customerInfo.moveInTime || "尚未提供"}
- 電話：${customerInfo.phone || "尚未提供"}

目前缺少資料：
${missingFields.join("、") || "資料大致完整"}

回覆規則：
1. 先自然回應客人的問題。
2. 如果缺少資料，最多只追問 2 個問題，不要一次問太多。
3. 優先追問：地區、坪數、預算、入住時間、電話。
4. 如果客人已有高意願，例如提到預算、丈量、報價、預約，請引導留下電話。
5. 不要說你是 AI。
6. 使用繁體中文，語氣親切、專業、像真人客服。

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
