const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

// API Keys from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "1t1EeRixsJrKbiF1zwM6"; // Default voice ID if not in env
const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const REP_PHONE_NUMBER   = process.env.REP_PHONE_NUMBER || "+18889711908"; // Default number if not in env
const INSURED_NUMBER     = process.env.INSURED_NUMBER || "+18336404820"; // Default number if not in env
const UNINSURED_NUMBER   = process.env.UNINSURED_NUMBER || "+18333961174"; // Default number if not in env
const RENDER_BASE_URL    = process.env.RENDER_BASE_URL || "https://ai-voice-funnel.onrender.com"; // Default URL if not in env

// instantiate OpenAI client (v4 SDK)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// In-memory session storage
const sessions = {};

// Response templates with variations to sound more natural
const responseTemplates = {
  greeting: [
    "Hello! This is Quoting Fast calling about the car insurance quote you just requested online. I need two quick answers so we can connect you to the best agent.",
    "Hi there! I'm calling from Quoting Fast regarding your recent car insurance quote request. I just need to ask you a couple quick questions to get you connected with the right specialist.",
    "Hey, it's Tom from Quoting Fast. Calling about that auto insurance quote you submitted. Got a quick minute?",
    "Good day! Tom here from Quoting Fast. Just following up on your online car insurance quote. Got a moment to chat?"
  ],
  insuranceContinuity: [
    "Have you had continuous auto insurance for the last 12 months?",
    "Quick question - have you maintained auto insurance coverage continuously for the past year?",
    "I'm wondering if you've had auto insurance without any gaps for the past 12 months?",
    "Just need to confirm, have you been continuously insured for the last year?"
  ],
  insuranceCompany: [
    "Great! Which company are you insured with currently?",
    "Excellent. Could you tell me which insurance provider you're with right now?",
    "Perfect. Which insurance carrier do you currently have your policy with?",
    "And who is your current auto insurance provider?"
  ],
  duration: [
    "How many months have you been with them?",
    "And approximately how long have you been insured with them?",
    "Could you tell me how many months you've had coverage with them?",
    "Roughly how long have you been with your current insurer?"
  ],
  transfer: [
    "Perfect—would you like me to connect you with a licensed agent to finalize your quote?",
    "Great! Would you like me to transfer you to a specialist who can complete your quote?",
    "Based on what you've shared, I can connect you with an agent who can help finalize everything. Would that work for you?",
    "Alright, can I quickly connect you with a licensed agent to go over the numbers?"
  ],
  clarification: [
    "I'm sorry, I didn't quite catch that. Could you repeat that for me?",
    "I didn't hear your response clearly. Do you mind saying that one more time?",
    "Could you please repeat that? I want to make sure I get your information correctly.",
    "Excuse me, could you say that again?"
  ],
  thankyou: [
    "Thank you for that information!",
    "Great, thanks for letting me know.",
    "I appreciate you sharing that with me.",
    "Got it, thank you."
  ],
  callbackRequest: [
    "Okay, no problem at all. Was there a better time that I could give you a call back so we can get you those quotes?",
    "Alright, if now isn't a good time, when would be a better time to reach you to discuss your quote?",
    "No worries. When would be a convenient time for me to call you back to go over your insurance options?"
  ],
  callbackConfirmation: [
    "Perfect, I've scheduled a callback for [DATE] at [TIME].",
    "Got it. We'll call you back on [DATE] at [TIME].",
    "Okay, your callback is set for [DATE] at [TIME]."
  ],
  notInterested: [
    "Okay, not a problem. If you ever change your mind, just give us a call back. We'll be happy to help you out.",
    "No worries. Feel free to reach out if you have any questions in the future.",
    "Alright, thanks for your time. Have a great day!"
  ]
};

// Get a random variation to sound more human
function getRandomResponse(responseType) {
  const templates = responseTemplates[responseType];
  return templates[Math.floor(Math.random() * templates.length)];
}

// Add SSML-like breaks for more natural speech cadence
function addSpeechMarkers(text) {
  return text
    .replace(/(Hello!|Hi there!|Hey,|Good day!)/g, "$1 <break time='300ms'/>")
    .replace(/(Thanks|Great|Perfect|Fantastic|Excellent|Alright)/g, "$1 <break time='200ms'/>")
    .replace(/(\.\s)/g, "$1<break time='500ms'/>")
    .replace(/(\?)/g, "$1<break time='400ms'/>")
    .replace(/,(?!\s*\d)/g, ",<break time='200ms'/>") // Add pauses after commas (except before numbers)
    .replace(/\b(um|uh|you know)\b/gi, "<break time='150ms'/>$1<break time='150ms'/>"); // Add slight pauses around "um", "uh", "you know"
}

// Create SSML for better voice control (if you choose to use SSML)
function createSSML(text, emphasis = "moderate") {
  return `<speak>
    <prosody rate="95%" pitch="+0%" volume="loud">
      ${text.replace(/\./g, '<break time="500ms"/>')}
    </prosody>
  </speak>`;
}

// Enhanced audio generation with ElevenLabs
async function generateAudio(text, filename, expressiveness = "medium") {
  try {
    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY environment variable not set.");
      throw new Error("ElevenLabs API key not configured.");
    }
    const voiceSettings = {
      low:    { stability: 0.3, similarity_boost: 0.75 },
      medium: { stability: 0.35, similarity_boost: 0.65 },
      high:   { stability: 0.25, similarity_boost: 0.6 }
    };
    const processedText = addSpeechMarkers(text);
    console.log(`Generating audio for "${filename}" with expressiveness: ${expressiveness}`);
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text: processedText,
        model_id: 'eleven_turbo_v2',
        voice_settings: voiceSettings[expressiveness]
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        responseType: 'stream'
      }
    );
    const writer = fs.createWriteStream(`./public/${filename}.mp3`);
    response.data.pipe(writer);
    return new Promise((res, rej) => {
      writer.on('finish', () => {
        console.log(`Successfully generated ${filename}.mp3`);
        res();
      });
      writer.on('error', (err) => {
        console.error(`Error writing ${filename}.mp3:`, err);
        rej(err);
      });
    });
  } catch (e) {
    console.error(`Error generating audio for ${filename}:`, e.message);
    throw e;
  }
}

// Generate multiple intro variations for A/B testing
async function generateIntroVariations() {
  try {
    console.log('Starting to generate intro audio variations...');
    if (!fs.existsSync('./public')) fs.mkdirSync('./public', { recursive: true });
    const intros = [
      { text: responseTemplates.greeting[0], filename: "intro_formal",   expressiveness: "medium" },
      { text: responseTemplates.greeting[1], filename: "intro_casual",  expressiveness: "high" },
      { text: responseTemplates.greeting[2], filename: "intro_friendly", expressiveness: "high" },
      { text: responseTemplates.greeting[3], filename: "intro_direct",   expressiveness: "medium" }
    ];
    for (const intro of intros) {
      await generateAudio(intro.text, intro.filename, intro.expressiveness);
    }
    console.log('Successfully generated all intro variations');
  } catch (e) {
    console.error('Error generating intro variations:', e);
    // fallback
    const basicText = "Hello, this is Quoting Fast calling about your car insurance quote.";
    await generateAudio(basicText, "intro_fallback", "medium").catch(err => console.error(err));
  }
}

// ------------------
// UPDATED parseUserResponse (uses v4 SDK)
// ------------------
async function parseUserResponse(speech, currentQuestion = "", dialogueState = "") {
  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY environment variable not set.");
      throw new Error("OpenAI API key not configured.");
    }
    console.log(`Parsing user response: "${speech}" with context: "${currentQuestion}" and state: "${dialogueState}"`);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze the caller's response in the context of the current question: "${currentQuestion}" and the current dialogue state: "${dialogueState}". Identify:
1. Primary intent (affirmation, negation, question, clarification_request, objection, information_provided, busy, not_interested)
2. Sentiment (positive, neutral, negative, frustrated)
3. Extracted information relevant to "${currentQuestion}" (e.g., insurance provider name, time period in months/years).
4. Confidence level (high, medium, low)
Return valid JSON only.`,
        },
        { role: 'user', content: speech }
      ],
      temperature: 0.2
    });
    const json = completion.choices[0].message.content.trim();
    return JSON.parse(json);
  } catch (e) {
    console.error('Error parsing intent:', e);
    return {
      intent: /yes|yeah|yep|sure|correct|absolutely|sounds good/i.test(speech) ? "affirmation" :
              /no|nope|not|not really|I don't think so/i.test(speech)       ? "negation"  :
              /what was that|could you repeat that|huh|excuse me/i.test(speech) ? "clarification_request" :
              /busy|can't talk now|don't have time/i.test(speech) ? "busy" :
              /not interested|don't need it|take me off your list/i.test(speech) ? "not_interested" : "unknown",
      sentiment: "neutral",
      extracted_info: {},
      confidence: "low"
    };
  }
}

// ------------------
// UPDATED extractNumber (uses v4 SDK)
// ------------------
async function extractNumber(speech) {
  try {
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY environment variable not set.");
      throw new Error("OpenAI API key not configured.");
    }
    const completion = await openai.chat.completions.create({