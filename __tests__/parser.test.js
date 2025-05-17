const { parseUserResponse, extractNumber } = require('../index');

describe('parseUserResponse', () => {
  it('parses structured response from OpenAI', async () => {
    const mockData = { intent: 'greet', sentiment: 'positive', extracted_info: { hi: true }, confidence: 'high' };
    const mockOpenAI = {
      chat: { completions: { create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockData) } }]
      }) } }
    };

    const result = await parseUserResponse(mockOpenAI, 'hello', 'hi?', '');
    expect(result).toEqual(mockData);
  });
});

describe('extractNumber', () => {
  it('returns parsed number from speech', async () => {
    const mockNumber = { number: 42 };
    const mockOpenAI = {
      chat: { completions: { create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockNumber) } }]
      }) } }
    };

    const result = await extractNumber(mockOpenAI, 'the number is forty two');
    expect(result).toEqual(mockNumber);
  });
});
