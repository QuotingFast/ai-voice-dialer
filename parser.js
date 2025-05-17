// Parsing utilities extracted for unit testing

/**
 * Parses the user's speech using the OpenAI client.
 * @param {object} openai - OpenAI client instance.
 * @param {string} speech - User's speech text.
 * @param {string} [currentQuestion=""] - Current question context.
 * @param {string} [dialogueState=""] - Dialogue state context.
 * @returns {Promise<object>} Parsed response JSON.
 */
async function parseUserResponse(openai, speech, currentQuestion = "", dialogueState = "") {
  if (!openai) throw new Error("OpenAI client not provided");

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

/**
 * Extracts a number from the given speech using OpenAI.
 * @param {object} openai - OpenAI client instance.
 * @param {string} speech - User's speech text.
 * @returns {Promise<object|null>} Parsed number JSON or null on failure.
 */
async function extractNumber(openai, speech) {
  if (!openai) throw new Error("OpenAI client not provided");

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

module.exports = { parseUserResponse, extractNumber };
