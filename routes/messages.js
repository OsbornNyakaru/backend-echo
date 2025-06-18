const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// POST /api/messages - add a message to a session
router.post('/', async (req, res) => {
  const { session_id, sender, text } = req.body;

  if (!session_id || !sender || !text) {
    return res.status(400).json({ error: 'session_id, sender, and text are required' });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert([{ session_id, sender, text }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

// GET /api/messages/:sessionId - fetch messages for a session
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

module.exports = router;
