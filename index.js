require('dotenv').config();
const express = require('express');
const fs = require('fs-extra');
const axios = require('axios');
const { OpenAI } = require('openai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

fs.ensureDirSync('./public');
fs.ensureDirSync('./logs');

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

const sessions = {};

// 👇 Shortened, realistic system prompt for Tom
const SYSTEM_PROMPT = {
  role: 'system',
  content: `
Your name is Tom. You are a friendly, helpful outbound agent calling from Quoting Fast.

You're calling someone who just completed an auto insurance quote request online.

Start with:
"Hi this is Tom from Quoting Fast calling about the auto insurance quote you just submitted. Do you have a sec to review the rates we found?"

Then, ask one question at a time to confirm:
1. Are they currently insured?
2. If yes, how long? (months/years)
3. Who they're insured with

Then ask permission to bring on a licensed agent to go over the quotes.

Be confident and casual. Use phrases like "Cool", "Nice", "Awesome", "Gotcha", etc.

If they say they're not insured or had insurance for less than 12 months, connect them to the uninsured agent.

If they’re insured for 12+ months, connect them to the insured agent.

If they decline the transfer, ask if they'd like a callback. If they decline entirely, thank them and hang up.

NEVER say you're an AI.
Keep it short, human, conversational.
`
};

async function askGPT(sessionId, userText = '') {
  const session = sessions[sessionId];
  session.history.push({ role: 'user', content: userText });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [SYSTEM_PROMPT, ...session.history],
    temperature: 0.4
  });

  const reply = response.choices[0].message.content;
  session.history.push({ role: 'assistant', content: reply });
  return reply;
}

async function generateVoice(text, filename) {
  const ssml = `<speak><prosody rate="92%" pitch="+0%">
${text.replace(/\.\s/g, '. <break time="500ms"/>')}
</prosody></speak>`;

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
    {
      text: ssml,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.65
      }
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      responseType: 'stream'
    }
  );

  const writer = fs.createWriteStream(`./public/${filename}.mp3`);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

app.post('/voice', async (req, res) => {
  const sid = req.body.CallSid || Date.now().toString();
  sessions[sid] = { history: [], converted: false };

  const greeting = await askGPT(sid, '');
  const filename = `${sid}_start`;

  await generateVoice(greeting, filename);

  res.type('text/xml').send(`
<Response>
  <Play>https://${req.headers.host}/public/${filename}.mp3</Play>
  <Gather action="/gather" input="speech" timeout="5" speechTimeout="auto"/>
</Response>`);
});

app.post('/gather', async (req, res) => {
  const sid = req.body.CallSid;
  const speech = req.body.SpeechResult || '';

  const reply = await askGPT(sid, speech);
  const filename = `${sid}_${sessions[sid].history.length}`;
  await generateVoice(reply, filename);

  const lower = reply.toLowerCase();
  const isTransfer = /connecting you now|transferring you/i.test(lower);
  const isUninsured = /uninsured agent|not insured|less than 12 months/i.test(lower);

  if (isTransfer) {
    const target = isUninsured ? process.env.UNINSURED_NUMBER : process.env.INSURED_NUMBER;
    sessions[sid].converted = true;
    return res.type('text/xml').send(`
<Response>
  <Play>https://${req.headers.host}/public/${filename}.mp3</Play>
  <Dial>${target}</Dial>
</Response>`);
  }open -e index.js

  res.type('text/xml').send(`
<Response>
  <Play>https://${req.headers.host}/public/${filename}.mp3</Play>
  <Gather action="/gather" input="speech" timeout="5" speechTimeout="auto"/>
</Response>`);
});

app.listen(PORT, () => console.log(`🟢 GPT-led Voice AI (Tom) running on port ${PORT}`));
