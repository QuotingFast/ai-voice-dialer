// index.js
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const OpenAI = require("openai");
const twilio = require("twilio");

const app = express();
const PORT = process.env.PORT || 10000;

// — OpenAI (v4 style) —
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// — ElevenLabs config —
const elevenLabsApiKey  = process.env.ELEVENLABS_API_KEY;
const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;

// — Twilio config —
const twilioSid    = process.env.TWILIO_ACCOUNT_SID;
const twilioToken  = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const client       = twilio(twilioSid, twilioToken);

// ensure logs folder exists
fs.ensureDirSync("./logs");

// parse form & JSON bodies, serve static
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));

// Load your qualification script
const qfScript = require("./qf_outbound.jsonl");

app.post("/voice", async (req, res) => {
  try {
    // 1) Run your Q&A logic via OpenAI
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You’re a call-qualification assistant…" },
        { role: "user", content: JSON.stringify(req.body) }
      ],
      temperature: 0.2
    });
    const replyText = chat.choices[0].message.content;

    // 2) Generate TTS from ElevenLabs
    const tts = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      { text: replyText, voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { "xi-api-key": elevenLabsApiKey } }
    );

    // 3) Stream the MP3 back to Twilio
    res.set("Content-Type", "audio/mpeg");
    tts.data.pipe(res);

  } catch (err) {
    console.error("⚠️  /voice error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(PORT, () => {
  console.log(`✔️  Server running on port ${PORT}`);
});
