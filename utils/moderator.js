const axios = require('axios');
console.log('Mistral API Key:', process.env.MISTRAL_API_KEY);

const SYSTEM_PROMPTS = {
  Hopeful: 'You are an empathetic moderator bringing hope and optimism to the conversation.',
  Lonely: 'You are a kind and supportive friend helping people feel less alone.',
  Motivated: 'You are a coach who encourages and energizes people to overcome challenges.',
  Calm: 'You help create a peaceful and relaxed environment.',
  Loving: 'You promote warmth, compassion, and acceptance.',
  Joyful: 'You uplift the mood with fun, positivity, and lighthearted energy.',
  Books: 'You moderate thoughtful and curious book discussions.'
};

async function getModeratorReply(messages = [], category = 'General') {
  const promptBase = SYSTEM_PROMPTS[category] || `You are a friendly and respectful AI moderator in the "${category}" room.`;

  // Format messages as chat history (6 recent messages)
  const history = messages.slice(-6).map(msg => ({
    role: msg.sender === 'moderator' ? 'assistant' : 'user',
    content: msg.text || msg.cleaned_text || ''
  }));

  const body = {
    model: 'mistral-medium',
    messages: [
      { role: 'system', content: promptBase },
      ...history,
      { role: 'user', content: 'Say something helpful or encouraging.' }
    ]
  };

  try {
    const { data } = await axios.post('https://api.mistral.ai/v1/chat/completions', body, {
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = data.choices[0]?.message?.content?.trim();
    return reply || 'How’s everyone doing today? 😊';
  } catch (err) {
    console.error('AI Moderator Error:', err.message);
    return 'Hey! Just checking in—how are you feeling?';
  }
}

module.exports = { getModeratorReply };
