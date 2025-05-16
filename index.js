// index.js
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const OpenAI = require('openai');
const twilio = require('twilio');

const app = express();

// ─── DEBUG: Log whether the OpenAI key is present ───────────────────────────────
console.log("🔑 OPENAI_API_KEY set?", !!process.env.OPENAI_API_KEY);

const PORT = process.env.PORT || 10000;

// ─── API KEYS FROM ENVIRONMENT ───────────────────────────────────────────────────
const ELEVENLABS_API_KEY   = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID  = process.env.ELEVENLABS_VOICE_ID || "1t1EeRixsJrKbiF1zwM6";
const OPENAI_API_KEY       = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const REP_PHONE_NUMBER     = process.env.REP_PHONE_NUMBER   || "+18889711908";
const INSURED_NUMBER       = process.env.INSURED_NUMBER     || "+18336404820";
const UNINSURED_NUMBER     = process.env.UNINSURED_NUMBER   || "+18333961174";
const RENDER_BASE_URL      = process.env.RENDER_BASE_URL    || "https://ai-voice-funnel-1.onrender.com";

// ─── CLIENTS ─────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ─── IN-MEMORY SESSION STORE ────────────────────────────────────────────────────
const sessions = {};

// ─── RESPONSE TEMPLATES & HELPERS ────────────────────────────────────────────────
const responseTemplates = {
  greeting: [ /* … */ ],
  insuranceContinuity: [ /* … */ ],
  insuranceCompany: [ /* … */ ],
  duration: [ /* … */ ],
  transfer: [ /* … */ ],
  clarification: [ /* … */ ],
  thankyou: [ /* … */ ],
  callbackRequest: [ /* … */ ],
  callbackConfirmation: [ /* … */ ],
  notInterested: [ /* … */ ],
};

function getRandomResponse(type) {
  const list = responseTemplates[type] || [];
  return list[Math.floor(Math.random() * list.length)] || "";
}

function addSpeechMarkers(text) {
  return text
    .replace(/(Hello!|Hi there!|Hey,|Good day!)/g, "$1 <break time='300ms'/>")
    .replace(/(Thanks|Great|Perfect|Excellent|Alright)/g, "$1 <break time='200ms'/>")
    .replace(/(\.\s)/g, "$1<break time='500ms'/>")
    .replace(/(\?)/g, "$1<break time='400ms'/>")
    .replace(/,(?!\s*\d)/g, ",<break time='200ms'/>")
    .replace(/\b(um|uh|you know)\b/gi, "<break time='150ms'/>$1<break time='150ms'/>");
}

function createSSML(text, emphasis = "moderate") {
  return `<speak><prosody rate="95%" pitch="+0%" volume="loud">${text.replace(/\./g, '<break time="500ms"/>')}</prosody></speak>`;
}

// ─── AUDIO GENERATION ────────────────────────────────────────────────────────────
async function generateAudio(text, filename, expressiveness = "medium") {
  if (!ELEVENLABS_API_KEY) throw new Error("ElevenLabs API key not configured");
  const voiceSettings = {
    low:    { stability: 0.3, similarity_boost: 0.75 },
    medium: { stability: 0.35, similarity_boost: 0.65 },
    high:   { stability: 0.25, similarity_boost: 0.6 },
  };
  const body = {
    text: addSpeechMarkers(text),
    model_id: 'eleven_turbo_v2',
    voice_settings: voiceSettings[expressiveness] || voiceSettings.medium,
  };
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    body,
    { headers: { 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'stream' }
  );
  const out = fs.createWriteStream(`./public/${filename}.mp3`);
  response.data.pipe(out);
  return new Promise((res, rej) => {
    out.on('finish',  () => res());
    out.on('error',   err => rej(err));
  });
}

async function generateIntroVariations() {
  if (!fs.existsSync('./public')) fs.mkdirSync('./public', { recursive: true });
  const intros = [
    { text: getRandomResponse('greeting'), filename: "intro1", expressiveness: "medium" },
    { text: getRandomResponse('greeting'), filename: "intro2", expressiveness: "high"  },
    { text: getRandomResponse('greeting'), filename: "intro3", expressiveness: "high"  },
    { text: getRandomResponse('greeting'), filename: "intro4", expressiveness: "medium" },
  ];
  for (const intro of intros) {
    await generateAudio(intro.text, intro.filename, intro.expressiveness);
  }
}

// ─── OPENAI-POWERED PARSING ─────────────────────────────────────────────────────
async function parseUserResponse(speech, currentQuestion = "", dialogueState = "") {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Context: "${currentQuestion}", State: "${dialogueState}". Identify intent, sentiment, extracted_info, confidence. Return JSON.`,
        },
        { role: 'user', content: speech }
      ],
      temperature: 0.2
    });
    const json = completion.choices[0].message.content.trim();
    return JSON.parse(json);
  } catch (e) {
    console.error('parseUserResponse error:', e);
    return { intent: "unknown", sentiment: "neutral", extracted_info: {}, confidence: "low" };
  }
}

async function extractNumber(speech) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Extract any number or duration mentioned in: "${speech}". Return JSON { number: <value> }. JSON only.` },
        { role: 'user',   content: speech }
      ],
      temperature: 0
    });
    return JSON.parse(completion.choices[0].message.content.trim());
  } catch (e) {
    console.error('extractNumber error:', e);
    return null;
  }
}

// ─── HTTP ROUTES ─────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.post('/voice', async (req, res) => {
  try {
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: "You are a helpful call assistant." },
        { role: 'user',   content: JSON.stringify(req.body) }
      ],
      temperature: 0.2
    });
    const reply = chat.choices[0].message.content;
    const tts = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      { text: reply, model_id: 'eleven_turbo_v2', voice_settings: { stability:0.35, similarity_boost:0.65 } },
      { headers: { 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'stream' }
    );
    res.set('Content-Type', 'audio/mpeg');
    tts.data.pipe(res);
  } catch (err) {
    console.error('/voice error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── START SERVER ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✔️  Server running on port ${PORT}`);
});
