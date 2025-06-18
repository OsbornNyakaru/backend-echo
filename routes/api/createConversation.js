const fetch = require('node-fetch');

/**
 * Create a Tavus conversation with a given API key and personaId.
 * @param {string} apiKey - Tavus API key
 * @param {string|null} personaId - Persona ID (can be null)
 * @returns {Promise<Object>} - The created conversation object
 */
module.exports = async function createConversation(apiKey, personaId) {
  const url = 'https://api.tavus.io/v2/conversations';
  const body = personaId ? { persona_id: personaId } : {};

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tavus API error:', errorText);
      throw new Error(`Tavus API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error creating Tavus conversation:', error);
    if (error.stack) console.error(error.stack);
    throw new Error('Failed to create conversation');
  }
}; 