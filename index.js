require('dotenv').config();
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 10000;

// load credentials & routing numbers from environment
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OPENAI_API_KEY      = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const INSURED_NUMBER      = process.env.INSURED_NUMBER;
const UNINSURED_NUMBER    = process.env.UNINSURED_NUMBER;

const openaiConfig = new Configuration({ apiKey: OPENAI_API_KEY });
const openai       = new OpenAIApi(openaiConfig);
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ensure folders exist
fs.ensureDirSync(path.join(__dirname, 'public'));
fs.ensureDirSync(path.join(__dirname, 'logs'));

// generate two intro MP3s at startup
;(async () => {
  try {
    console.log('Starting to generate intro audio variations...');
    await generateIntro('intro_formal', 0.75);
    await generateIntro('intro_casual', 0.90);
    console.log('Successfully generated all intro variations');
  } catch (err) {
    console.error('Error generating intros:', err);
  }
})();

/**
 * Creates a TTS MP3 with ElevenLabs
 * @param {string} name     file basename
 * @param {number} boost    similarity_boost & stability (0–1)
 */
async function generateIntro(name, boost) {
  const text = name === 'intro_formal'
    ? 'Hello, this is QuotingFast calling about the car insurance quote you requested online.'
    : 'Hey there! QuotingFast here about that car insurance quote you just asked for online.';
  console.log(`Generating ${name}.mp3 (boost=${boost})`);
  const resp = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    { text, voice_settings: { stability: boost, similarity_boost: boost } },
    { headers: { 'xi-api-key': ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
  );
  fs.writeFileSync(path.join(__dirname, 'public', `${name}.mp3`), resp.data);
  console.log(`Saved public/${name}.mp3`);
}

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// initial voice endpoint: play intro, then record
app.post('/voice', (req, res) => {
  const host = req.get('Host');
  res.type('text/xml').send(`
    <Response>
      <Play>https://${host}/public/intro_formal.mp3</Play>
      <Record playBeep="true" maxLength="20" action="/recording" />
    </Response>
  `);
});

// handle recording: download, transcribe, classify, and dial out
app.post('/recording', async (req, res) => {
  const { RecordingUrl: url, CallSid } = req.body;
  console.log(`Recording received for ${CallSid}: ${url}`);
  try {
    // download the .mp3
    const audio = await axios.get(`${url}.mp3`, { responseType: 'arraybuffer' });
    const filePath = path.join(__dirname, 'logs', `${CallSid}.mp3`);
    fs.writeFileSync(filePath, audio.data);

    // transcribe with Whisper
    const transcription = await openai.createTranscription(
      fs.createReadStream(filePath),
      'whisper-1'
    );
    const transcript = transcription.data.text;
    console.log(`Transcript: ${transcript}`);

    // classify insured vs uninsured
    const intentResp = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Classify whether the speaker is INSURED or UNINSURED.' },
        { role: 'user',   content: transcript }
      ]
    });
    const answer = intentResp.data.choices[0].message.content.toLowerCase();
    const target = answer.includes('insured') ? INSURED_NUMBER : UNINSURED_NUMBER;
    console.log(`Routing to ${target}`);

    // forward the call
    res.type('text/xml').send(`
      <Response>
        <Dial>${target}</Dial>
      </Response>
    `);
  } catch (err) {
    console.error('Error in /recording:', err);
    res.type('text/xml').send(`
      <Response>
        <Say>Sorry, something went wrong. Goodbye.</Say>
      </Response>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
