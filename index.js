console.log('▶ Starting AI voice dialer');

const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const OpenAI = require('openai');
const twilio = require('twilio');

const app = express();

// ─── DEBUG: Log environment variables ───────────────────────────────────────────
console.log("🔑 OPENAI_API_KEY set?", !!process.env.OPENAI_API_KEY);
console.log("🔑 ELEVENLABS_API_KEY set?", !!process.env.ELEVENLABS_API_KEY);
console.log("🔑 TWILIO_ACCOUNT_SID set?", !!process.env.TWILIO_ACCOUNT_SID);

const PORT = process.env.PORT || 10000;

// ─── API KEYS FROM ENVIRONMENT ─────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "1t1EeRixsJrKbiF1zwM6";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const REP_PHONE_NUMBER = process.env.REP_PHONE_NUMBER || "+18889711908";
const INSURED_NUMBER = process.env.INSURED_NUMBER || "+18336404820";
const UNINSURED_NUMBER = process.env.UNINSURED_NUMBER || "+18333961174";
const RENDER_BASE_URL = process.env.RENDER_BASE_URL || "https://ai-voice-funnel-1.onrender.com";

// ─── VALIDATE ENVIRONMENT VARIABLES ────────────────────────────────────────────
const requiredVars = ['ELEVENLABS_API_KEY', 'OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ─── IN-MEMORY SESSION STORE ──────────────────────────────────────────────────
const sessions = {};

// Clean up old sessions periodically
setInterval(() => {
  const cutoff = new Date(Date.now() - 3600000); // 1 hour
  Object.keys(sessions).forEach(sid => {
    if (sessions[sid].createdAt < cutoff) {
      delete sessions[sid];
    }
  });
}, 600000); // Every 10 minutes

// ─── RESPONSE TEMPLATES & HELPERS ─────────────────────────────────────────────
const responseTemplates = {
  greeting: [
    "Hello! This is Alex calling about your auto insurance. Do you have a moment to chat?",
    "Hi there! I'm calling about your car insurance options. Is now a good time?",
    "Good day! We're reaching out about potential savings on your auto insurance. Can we talk briefly?"
  ],
  insuranceContinuity: [
    "Are you currently insured?",
    "Do you have active auto insurance right now?",
    "Are you currently covered by an auto insurance policy?"
  ],
  insuranceCompany: [
    "Which company provides your current auto insurance?",
    "Who is your current auto insurance provider?",
    "What's the name of your current auto insurance company?"
  ],
  duration: [
    "How long have you been with your current insurance provider?",
    "For how many years have you had your current auto insurance?",
    "How many years have you been with your present insurance company?"
  ],
  transfer: [
    "Let me connect you with one of our licensed agents who can help.",
    "I'll transfer you to an agent who can assist with your specific needs.",
    "Please hold while I connect you with a specialist."
  ],
  clarification: [
    "I didn't quite catch that. Could you please repeat?",
    "Could you say that again please?",
    "I missed that, could you repeat your answer?"
  ]
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

// ─── AUDIO GENERATION ─────────────────────────────────────────────────────────
async function generateAudio(text, filename, expressiveness = "medium") {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key not configured");
  }

  const voiceSettings = {
    low: { stability: 0.3, similarity_boost: 0.75 },
    medium: { stability: 0.35, similarity_boost: 0.65 },
    high: { stability: 0.25, similarity_boost: 0.6 },
  };

  const body = {
    text: addSpeechMarkers(text),
    model_id: 'eleven_turbo_v2',
    voice_settings: voiceSettings[expressiveness] || voiceSettings.medium,
  };

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      body,
      { 
        headers: { 
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 10000
      }
    );

    if (!fs.existsSync('./public')) {
      fs.mkdirSync('./public', { recursive: true });
    }

    const out = fs.createWriteStream(`./public/${filename}.mp3`);
    response.data.pipe(out);
    
    return new Promise((resolve, reject) => {
      out.on('finish', () => resolve());
      out.on('error', err => reject(err));
    });
  } catch (error) {
    console.error('ElevenLabs API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Clean up old audio files
const cleanupAudioFiles = () => {
  const dir = './public';
  if (!fs.existsSync(dir)) return;

  fs.readdir(dir, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 3600000) { // Older than 1 hour
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('Error cleaning up file:', filePath, e);
      }
    });
  });
};

// Run cleanup every hour
setInterval(cleanupAudioFiles, 3600000);

// ─── OPENAI-POWERED PARSING ──────────────────────────────────────────────────
async function parseUserResponse(speech, currentQuestion = "", dialogueState = "") {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: `Extract any number or duration mentioned in: "${speech}". Return JSON { number: <value> }. JSON only.` 
        },
        { role: 'user', content: speech }
      ],
      temperature: 0
    });

    return JSON.parse(completion.choices[0].message.content.trim());
  } catch (e) {
    console.error('extractNumber error:', e);
    return null;
  }
}

// ─── HTTP ROUTES ──────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.post('/voice', async (req, res) => {
  try {
    if (!req.body || !req.body.From) {
      return res.status(400).json({ error: 'Invalid request format' });
    }

    console.log('Received voice input:', req.body.SpeechResult);

    const callSid = req.body.CallSid || 'test-' + Date.now();
    if (!sessions[callSid]) {
      sessions[callSid] = {
        createdAt: new Date(),
        from: req.body.From,
        history: []
      };
    }

    // Use the SpeechResult from Twilio in the OpenAI prompt
    const userMessage = req.body.SpeechResult || 'Hello';
    
    const chat = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { 
          role: 'system', 
          content: `You are an insurance call assistant. Keep responses under 2 sentences. 
                    Current call from: ${req.body.From}. Be polite and professional.`
        },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.5
    });

    const reply = chat.choices[0].message.content;
    console.log('Generated response:', reply);

    // Add to session history
    sessions[callSid].history.push({
      timestamp: new Date(),
      request: { from: req.body.From, speech: userMessage },
      response: reply
    });

    // For Twilio, we need to return TwiML
    // Option 1: Generate audio file and serve it
    const audioFileName = `response-${Date.now()}.mp3`;
    const audioFilePath = path.join(__dirname, 'public', audioFileName);
    
    try {
      // Make directory if it doesn't exist
      if (!fs.existsSync(path.join(__dirname, 'public'))) {
        fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
      }
      
      // Generate audio
      const ttsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        { 
          text: reply, 
          model_id: 'eleven_turbo_v2', 
          voice_settings: { 
            stability: 0.35, 
            similarity_boost: 0.65 
          } 
        },
        { 
          headers: { 
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 10000
        }
      );
      
      // Save the audio file
      fs.writeFileSync(audioFilePath, Buffer.from(ttsResponse.data));
      
      // Return TwiML to play the audio file and continue the conversation
      res.type('text/xml');
      res.send(`
        <Response>
          <Play>${RENDER_BASE_URL}/public/${audioFileName}</Play>
          <Gather input="speech" action="${RENDER_BASE_URL}/voice" method="POST" timeout="3" speechTimeout="auto">
            <Say></Say>
          </Gather>
          <Say>I didn't hear anything. Goodbye for now.</Say>
        </Response>
      `);
    } catch (audioErr) {
      console.error('Audio generation error:', audioErr);
      
      // Fallback to TTS if audio generation fails
      res.type('text/xml');
      res.send(`
        <Response>
          <Say>${reply}</Say>
          <Gather input="speech" action="${RENDER_BASE_URL}/voice" method="POST" timeout="3" speechTimeout="auto">
            <Say></Say>
          </Gather>
          <Say>I didn't hear anything. Goodbye for now.</Say>
        </Response>
      `);
    }
  } catch (err) {
    console.error('/voice error:', err.response?.data || err.message);
    res.type('text/xml');
    res.send(`
      <Response>
        <Say>I'm sorry, I encountered an error. Please try again later.</Say>
        <Hangup/>
      </Response>
    `);
  }
});

app.post('/twilio-webhook', async (req, res) => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = RENDER_BASE_URL + '/twilio-webhook';
    const params = req.body;

    if (!twilio.validateRequest(
      TWILIO_AUTH_TOKEN,
      twilioSignature,
      url,
      params
    )) {
      return res.status(403).send('Invalid Twilio request');
    }

    console.log('Incoming call from:', req.body.From);
    
    res.type('text/xml');
    res.send(`
      <Response>
        <Play>${RENDER_BASE_URL}/public/intro1.mp3</Play>
        <Gather input="speech" action="${RENDER_BASE_URL}/voice" method="POST" timeout="3" speechTimeout="auto">
          <Say>Please let me know how I can assist you today.</Say>
        </Gather>
        <Say>I didn't hear anything. Please call back when you're ready to chat.</Say>
      </Response>
    `);
  } catch (err) {
    console.error('Twilio webhook error:', err);
    res.status(500).send('Internal Server Error');
  }
});


// Generate a single intro clip on startup
(async () => {
  try {
    await generateAudio(
      getRandomResponse('greeting'), 
      'intro1', 
      'medium'
    );
    console.log('✅ Generated intro audio file');
  } catch (err) {
    console.error('Failed to generate intro audio:', err);
  }
})();

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✔ Server listening on port ${PORT}`);
  console.log(`🔊 Public URL: ${RENDER_BASE_URL}`);
});
