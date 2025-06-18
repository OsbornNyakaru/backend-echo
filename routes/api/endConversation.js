const fetch = require('node-fetch');

/**
 * End a Tavus conversation with a given conversationId and API key.
 * @param {string} conversationId - The conversation ID
 * @param {string} apiKey - Tavus API key
 * @returns {Promise<void>}
 */
module.exports = async function endConversation(conversationId, apiKey) {
  const url = `https://api.tavus.io/v2/conversations/${conversationId}/end`;

  const response = await fetch(url, {
    method: 'POST', // or 'DELETE' if Tavus API uses DELETE
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavus API error: ${response.status} - ${errorText}`);
  }
}; 