# AI Voice Dialer

This project is a small Node.js server that places outbound phone calls using Twilio, generates speech audio with ElevenLabs, and parses caller replies through OpenAI. It can be used to create automated call flows such as an insurance lead dialer.

## Prerequisites

- **Node.js** v18 or later
- A **Twilio** account with a phone number capable of making outbound voice calls
- An **OpenAI** API key
- An **ElevenLabs** API key for text‑to‑speech generation

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file in the project root (see [Environment Variables](#environment-variables)).

## Running the server

Start the application after the required environment variables are set:

```bash
node index.js
```

The server listens on the port specified by `PORT` or defaults to `10000`.

## Environment variables

The following variables configure the server. Values marked **required** must be provided.

| Variable | Description |
| -------- | ----------- |
| `ELEVENLABS_API_KEY` | **Required.** API key for ElevenLabs text-to-speech. |
| `ELEVENLABS_VOICE_ID` | Voice ID to use with ElevenLabs. Defaults to `1t1EeRixsJrKbiF1zwM6`. |
| `OPENAI_API_KEY` | **Required.** API key for OpenAI. |
| `TWILIO_ACCOUNT_SID` | **Required.** Twilio Account SID. |
| `TWILIO_AUTH_TOKEN` | **Required.** Twilio Auth Token used to validate webhooks. |
| `REP_PHONE_NUMBER` | Phone number of the agent for transfers. Defaults to `+18889711908`. |
| `INSURED_NUMBER` | Destination number when the caller is currently insured. Defaults to `+18336404820`. |
| `UNINSURED_NUMBER` | Destination number when the caller is not insured. Defaults to `+18333961174`. |
| `RENDER_BASE_URL` | Public URL where Twilio can reach this server. Defaults to `https://ai-voice-funnel-1.onrender.com`. |
| `PORT` | Port to run the server on. Defaults to `10000`. |

### Creating a `.env` file

Use the variables above to create a `.env` file in the project root. Only the required values are mandatory. Example:

```ini
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENAI_API_KEY=your-openai-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
```

Additional optional variables can be included to override their defaults.

