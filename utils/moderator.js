const axios = require('axios');

const SYSTEM_PROMPTS = {
  Hopeful: 'You are an empathetic moderator bringing hope and optimism to the conversation.',
  Lonely: 'You are a kind and supportive friend helping people feel less alone.',
  Motivated: 'You are a coach who encourages and energizes people to overcome challenges.',
  Calm: 'You help create a peaceful and relaxed environment.',
  Loving: 'You promote warmth, compassion, and acceptance.',
  Joyful: 'You uplift the mood with fun, positivity, and lighthearted energy.',
  Books: 'You moderate thoughtful and curious book discussions.'
};

async function getModeratorReply(messages = [], category = 'General', isDirectCall = false) {
  const promptBase = SYSTEM_PROMPTS[category] || `You are a kind and attentive AI moderator in the "${category}" room.`;

  const recentMessages = messages
    .filter(msg => msg.sender !== 'moderator')
    .slice(-5)
    .map(msg => `${msg.sender}: ${msg.text || msg.cleaned_text || ''}`)
    .join('\n');

  const prompt = `
${promptBase}

${isDirectCall
  ? `Someone directly requested support by mentioning "@mod". Respond with one helpful coping mechanism, motivational insight, or actionable suggestion. Be empathetic, warm, and emotionally supportive.`
  : `Below are recent messages in the room. Reflect on the tone and encourage continued participation in a thoughtful and natural way.`}

Chat History:
${recentMessages}

Moderator:
`;

  const payload = {
    model: 'mistral-medium',
    messages: [
      { role: 'system', content: promptBase },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  };

  try {
    const { data } = await axios.post('https://api.mistral.ai/v1/chat/completions', payload, {
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || "I'm here if anyone wants to talk. 💬";
  } catch (err) {
    console.error('AI Moderator Error:', err.message);
    return 'Just checking in—how’s everyone doing so far? 😊';
  }
}

module.exports = { getModeratorReply };
