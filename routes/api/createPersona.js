/**
 * Create a new persona in the Supabase 'persona' table.
 * @param {object} supabase - Supabase client instance
 * @param {string} personaId - The persona_id to insert
 * @returns {Promise<object>} - The created persona object
 */
module.exports = async function createPersona(supabase, personaId) {
  const { data, error } = await supabase
    .from('persona')
    .insert({ persona_id: personaId })
    .select()
    .single();

  if (error) {
    throw new Error('Failed to create persona: ' + error.message);
  }
  return data;
}; 