// Import required modules and initialize environment variables
console.log('Starting server.js...');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { getModeratorReply } = require('./utils/moderator');

// Check for required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL or SUPABASE_KEY is not set in .env');
  process.exit(1);
}

// ===== TAVUS INTEGRATION: Added Tavus environment variable validation =====
if (!process.env.TAVUS_API_KEY) {
  console.warn('⚠️  TAVUS_API_KEY is not set in .env - Tavus features will be disabled');
}
// ===== END TAVUS INTEGRATION =====

const app = express();
const server = http.createServer(app);
// Initialize Socket.IO for real-time communication
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'PUT'],
    credentials: true
  }
});

const allowedOrigins = [
  'https://cosmic-meerkat-92b882.netlify.app', // your deployed frontend
  'https://echoroomio.netlify.app/', // your deployed frontend
  'http://localhost:5173',                     // your local dev frontend
];

// Middleware setup
console.log('Setting up middleware...');
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn('Blocked by CORS:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json()); // Parse JSON request bodies
app.set('view engine', 'ejs'); // Set EJS as the view engine
app.set('views', __dirname + '/views'); // Set views directory
app.use(express.static('public')); // Serve static files from 'public'

// Import and mount route handlers
console.log('Mounting route handlers...');
const sessionRoutes = require('./routes/sessions');
const messageRoutes = require('./routes/messages');
const participantRoutes = require('./routes/participants');
// const voiceRoutes = require('./routes/voice');

// ===== TAVUS INTEGRATION: Mount Tavus routes (UPDATED) =====
const tavusRoutes = require('./routes/tavus');
app.use('/api/tavus', tavusRoutes); // All Tavus routes now handled by the route file
console.log('✅ Tavus routes mounted at /api/tavus');
// ===== END TAVUS INTEGRATION =====

app.use('/api/sessions', sessionRoutes); // Session management API
app.use('/api/messages', messageRoutes); // Chat messages API
app.use('/api/participants', participantRoutes); // Participants API
// app.use('/api/voice', voiceRoutes); //Voice API

// Health check endpoint for uptime monitoring
app.get('/api/health', (req, res) => {
  console.log('Health check endpoint hit');
  res.json({ status: 'ok' });
});

// Initialize Supabase client for database operations
console.log('Initializing Supabase client...');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// === Custom Bad Words Filter ===
const badWords = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt',
  'crap', 'slut', 'whore', 'fag', 'nigger', 'retard', 'motherfucker', 'cock',
  'fucker', 'douche', 'bollocks', 'arsehole', 'twat', 'wanker', 'suck my', 'dickhead',
  'puta', 'mierda', 'idiot', 'moron', 'jackass', 'dumbass', 'prick', 'skank',
  'cum', 'shithead', 'dildo', 'bastardo', 'imbécil', 'coño', 'chingada', 'pendejo',
  'verga', 'malparido', 'zorra', 'estúpido', 'puta madre', 'mierdoso', 'tonto', 'culero',
  'asshat', 'nutsack', 'buttfuck', 'shitface', 'cockhead', 'fuckface', 'fucktard', 'cocksucker',
  'dickface', 'cumdumpster', 'fucknut', 'asswipe', 'crackhead', 'tard', 'hoe', 'knobhead'
];

function containsBadWords(text) {
  const lowerText = text.toLowerCase();
  return badWords.some(word => lowerText.includes(word));
}
function filterBadWords(text) {
  let filtered = text;
  badWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '****');
  });
  return filtered;
}
// Track strikes: socket.id -> count
const userStrikes = new Map();

// Inactivity Moderator
const sessionTimers = new Map();

// Socket.IO event handlers for real-time features
io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  // User joins a session/room
  socket.on('joinRoom', async (data) => {
    console.log('🔵 [SERVER] joinRoom event received:', data);
    const { session_id, user_id, username, mood } = data;

    try {
      // Validate session existence FIRST
      const { data: sessionData, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session_id)
        .single();
      
      if (fetchError) {
        console.error(`❌ [SERVER] Error fetching session ${session_id}:`, fetchError.message);
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      console.log(`✅ [SERVER] Session ${session_id} found:`, sessionData);

      // Join the socket.io room
      socket.join(session_id);
      console.log(`✅ [SERVER] User ${user_id} (${username}) joined socket room ${session_id}`);

      // Store user info on the socket for later use
      socket.session_id = session_id;
      socket.user_id = user_id;

      // Set up inactivity moderator for this session (only once per session)
      if (!sessionTimers.has(session_id)) {
        console.log(`🤖 [SERVER] Setting up inactivity moderator for session ${session_id}`);
        
        const interval = setInterval(async () => {
          try {
            const { data: messages } = await supabase
              .from('messages')
              .select('*')
              .eq('session_id', session_id)
              .order('timestamp', { ascending: false })
              .limit(5);

            const lastMessage = messages?.[0];
            const now = Date.now();

            if (!lastMessage) {
              // No conversation yet. If >1 min since session start, spark a convo
              const sessionStart = new Date(sessionData.created_at).getTime();
              if (now - sessionStart > 1 * 60 * 1000) {
                const modText = "Hi there 👋 Just checking in — what brings you here today?";
                const { data: modMessage } = await supabase
                  .from('messages')
                  .insert([{ session_id: session_id, sender: 'moderator', text: modText }])
                  .select()
                  .single();

                console.log('🤖 [SERVER] Moderator sparked conversation due to inactivity');
                io.to(session_id).emit('receiveMessage', modMessage);
              }
            } else {
              // Messages exist. Check for inactivity > 3 min
              const lastTime = new Date(lastMessage.timestamp).getTime();
              const isInactive = now - lastTime > 3 * 60 * 1000;

              if (isInactive) {
                const reversed = messages.reverse(); // for chronological order
                const modReply = await getModeratorReply(reversed, sessionData.category);
                const { data: modMessage } = await supabase
                  .from('messages')
                  .insert([{ session_id, sender: 'moderator', text: modReply }])
                  .select()
                  .single();

                console.log('🤖 [SERVER] Moderator replying due to inactivity');
                io.to(session_id).emit('receiveMessage', modMessage);
              }
            }
          } catch (error) {
            console.error('❌ [SERVER] Error in inactivity moderator:', error);
          }
        }, 60 * 1000); // Check every minute

        sessionTimers.set(session_id, interval);
        console.log(`✅ [SERVER] Session timer set for session_id: ${session_id}`);
      }

      // Fetch current participants
      const { data: participantsData, error: participantsError } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', session_id);
      
      if (participantsError) {
        console.error('❌ [SERVER] Error fetching participants:', participantsError.message);
        socket.emit('error', { message: 'Failed to fetch participants' });
        return;
      }

      console.log(`✅ [SERVER] Found ${participantsData?.length || 0} participants in session`);

      // Emit room-joined event to the user who just joined
      const roomJoinedData = { 
        session_id, 
        participants: participantsData || [] 
      };
      console.log(`📤 [SERVER] Emitting room-joined to user ${user_id}:`, roomJoinedData);
      socket.emit('room-joined', roomJoinedData);

      // Notify others in the room about the new user
      const userJoinedData = {
        user_id,
        user_name: username,
        username,
        mood,
        avatar: '/avatars/default-avatar.png',
        is_speaking: false,
        is_muted: false
      };
      console.log(`📤 [SERVER] Emitting user-joined to room ${session_id}:`, userJoinedData);
      socket.to(session_id).emit('user-joined', userJoinedData);

    } catch (error) {
      console.error('❌ [SERVER] Error in joinRoom:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // User leaves a session/room
  socket.on('leaveRoom', async (data) => {
    console.log('🔵 [SERVER] leaveRoom event received:', data);
    const { session_id, user_id } = data;
    try {
      socket.leave(session_id);
      console.log(`✅ [SERVER] User ${user_id} left session ${session_id}`);

      // Remove participant from DB
      const { error: deleteError } = await supabase
        .from('participants')
        .delete()
        .eq('user_id', user_id)
        .eq('session_id', session_id);
      if (deleteError) {
        console.error('❌ [SERVER] Error removing participant:', deleteError.message);
      } else {
        console.log(`✅ [SERVER] Participant ${user_id} removed from session ${session_id}`);
      }

      // Notify others in the room
      console.log(`📤 [SERVER] Emitting user-left to room ${session_id}`);
      io.to(session_id).emit('user-left', { user_id });
    } catch (error) {
      console.error('❌ [SERVER] Error in leaveRoom:', error);
    }
  });

  // Handle sending and broadcasting chat messages
  socket.on('sendMessage', async ({ session_id, sender, text, user_id, type = 'text' }) => {
    console.log('🔵 [SERVER] sendMessage event received:', { session_id, sender, text, user_id, type });
    const originalText = text;
    const filteredText = filterBadWords(text);

    try {
      // 1. Save filtered message to DB
      const { data: savedMsg, error } = await supabase
        .from('messages')
        .insert([{ session_id: session_id, sender, text: filteredText, user_id }])
        .select()
        .single();
      if (error) {
        console.error('❌ [SERVER] DB Error saving message:', error.message);
        return;
      }
      console.log('✅ [SERVER] Message saved to DB:', savedMsg);

      // 2. Emit user message FIRST
      console.log(`📤 [SERVER] Emitting receiveMessage to room ${session_id}`);
      io.to(session_id).emit('receiveMessage', savedMsg);

      // 3. Handle mod summon
      if (originalText.toLowerCase().includes('@mod')) {
        console.log('🤖 [SERVER] Moderator summoned in message');
        const { data: history } = await supabase
          .from('messages')
          .select('*')
          .eq('session_id', session_id)
          .order('timestamp', { ascending: false })
          .limit(5);
        const { data: sessionMeta } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', session_id)
          .single();
        const modReply = await getModeratorReply(history.reverse(), sessionMeta?.category);
        const { data: modMessage } = await supabase
          .from('messages')
          .insert([{ session_id, sender: 'moderator', text: modReply }])
          .select()
          .single();
        io.to(session_id).emit('receiveMessage', modMessage);
        return;
      }

      // 4. If profanity was detected, warn + have mod respond
      if (containsBadWords(originalText)) {
        let strikes = userStrikes.get(socket.id) || 0;
        strikes++;
        userStrikes.set(socket.id, strikes);
        console.warn(`⚠️ [SERVER] Profanity detected from ${sender}. Strike ${strikes}/3`);

        // Private warning
        socket.emit('warning', {
          message: `⚠️ Inappropriate language detected. Strike ${strikes}/3`
        });

        // Public moderator warning
        const modText = `@${sender}, please watch your language. This is strike ${strikes}/3.`;
        const { data: modMsg } = await supabase
          .from('messages')
          .insert([{ session_id, sender: 'moderator', text: modText }])
          .select()
          .single();
        io.to(session_id).emit('receiveMessage', modMsg);

        // Kick after 3 strikes
        if (strikes >= 3) {
          const kickMsg = `@${sender} has been removed from the chat for repeated violations.`;
          const { data: kickMessage } = await supabase
            .from('messages')
            .insert([{ session_id, sender: 'moderator', text: kickMsg }])
            .select()
            .single();
          io.to(session_id).emit('receiveMessage', kickMessage);
          io.to(session_id).emit('userKicked', { user: sender });
          socket.leave(session_id);
          socket.disconnect(true);
        }
      }
    } catch (error) {
      console.error('❌ [SERVER] Error in sendMessage:', error);
    }
  });

  // Typing indicators
  socket.on('typing-start', (data) => {
    console.log('🔵 [SERVER] typing-start event:', data);
    const { session_id, user_id, username } = data;
    socket.to(session_id).emit('typing-start', { user_id, username });
  });

  socket.on('typing-stop', (data) => {
    console.log('🔵 [SERVER] typing-stop event:', data);
    const { session_id, user_id } = data;
    socket.to(session_id).emit('typing-stop', { user_id });
  });

  // Voice status updates (emit only to the room)
  socket.on('voice-status', async (data) => {
    console.log('🔵 [SERVER] voice-status event:', data);
    const { userId, isSpeaking, isMuted } = data;
    try {
      // Update participant voice status in DB
      const { error } = await supabase
        .from('participants')
        .update({ is_speaking: isSpeaking, is_muted: isMuted })
        .eq('user_id', userId);
      if (error) {
        console.error('❌ [SERVER] Error updating voice status:', error.message);
      } else {
        console.log(`✅ [SERVER] Voice status updated for user ${userId}`);
      }
      // Emit to the relevant room
      const session_id = Array.from(socket.rooms).find(room => room !== socket.id);
      if (session_id) {
        console.log(`📤 [SERVER] Emitting voice-status to room ${session_id}`);
        io.to(session_id).emit('voice-status', { user_id: userId, isSpeaking, isMuted });
      }
    } catch (error) {
      console.error('❌ [SERVER] Error in voice-status:', error);
    }
  });

  // Message reactions
  socket.on('message-reaction', async (data) => {
    console.log('🔵 [SERVER] message-reaction event:', data);
    const { messageId, reaction, userId } = data;
    try {
      console.log(`📤 [SERVER] Emitting message-reaction`);
      io.emit('message-reaction', { messageId, reaction, userId });
    } catch (error) {
      console.error('❌ [SERVER] Error in message-reaction:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('🔴 [SERVER] User disconnected:', socket.id);
    userStrikes.delete(socket.id); // Cleanup strikes
    
    // Only attempt to remove if we have the info
    if (socket.user_id && socket.session_id) {
      try {
        const { error: deleteError } = await supabase
          .from('participants')
          .delete()
          .eq('user_id', socket.user_id)
          .eq('session_id', socket.session_id);
        if (deleteError) {
          console.error('❌ [SERVER] Error removing participant on disconnect:', deleteError.message);
        } else {
          console.log(`✅ [SERVER] Participant ${socket.user_id} removed from session ${socket.session_id} on disconnect`);
          // Notify others in the room
          io.to(socket.session_id).emit('user-left', { user_id: socket.user_id });
        }
      } catch (error) {
        console.error('❌ [SERVER] Error in disconnect cleanup:', error);
      }
    }
  });

  socket.on('error', (error) => {
    console.error(`❌ [SERVER] Socket error for ${socket.id}:`, error);
  });
});

// General error handling middleware for Express
app.use((err, req, res, next) => {
  console.error('Express error handler:', err.stack);
  res.status(500).send('Something broke!');
});

// EJS server-rendered chat room page
app.get('/session/:id', async (req, res) => {
  console.log('GET /session/:id called with id:', req.params.id);
  const session_id = req.params.id;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single();
  if (sessionError) {
    console.error('Session not found:', sessionError.message);
    return res.status(404).send('Session not found');
  }
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', session_id)
    .order('timestamp', { ascending: true });
  if (messagesError) {
    console.error('DB Error fetching messages:', messagesError.message);
    return res.status(500).send('DB Error');
  }
  console.log(`Rendering chat for session ${session_id} with ${messages.length} messages.`);
  res.render('chat', { session_id, session, messages });
});

// EJS server-rendered landing page
app.get('/', async (req, res) => {
  console.log('GET / (landing page) called');
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Supabase error:', error.message);
    return res.status(500).send('Database error');
  }
  console.log(`Rendering landing page with ${sessions.length} sessions.`);
  res.render('landing', { sessions });
});

// REST API endpoint to get all sessions
app.get('/api/sessions', async (req, res) => {
  console.log('GET /api/sessions called');
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Supabase error fetching sessions:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
  console.log(`Returning ${sessions.length} sessions.`);
  res.json(sessions);
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Available Tavus endpoints:`);
  console.log(`   GET /api/tavus/avatar/:personaId/url - Get avatar video URL`);
  console.log(`   GET /api/tavus/avatar/:personaId - Get full avatar data`);
  console.log(`   GET /api/tavus/persona/:personaId - Get persona data`);
  console.log(`   GET /api/tavus/personas - List all personas`);
  console.log(`   GET /api/tavus/avatars - List all avatars`);
  console.log(`🎭 Tavus CVI endpoints:`);
  console.log(`   POST /api/tavus/conversations - Create CVI conversation`);
  console.log(`   GET /api/tavus/conversations/:conversationId - Get conversation details`);
  console.log(`   DELETE /api/tavus/conversations/:conversationId - End conversation`);
  console.log(`   GET /api/tavus/replicas - List available replicas`);
});
