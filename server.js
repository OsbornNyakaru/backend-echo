// Import required modules and initialize environment variables
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

// ===== TAVUS INTEGRATION: Added fetch for API calls =====
// const fetch = require('node-fetch'); // Add this import for Tavus API calls
// ===== END TAVUS INTEGRATION =====

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
  'http://localhost:5173',                     // your local dev frontend
];

// Middleware setup
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json()); // Parse JSON request bodies
app.set('view engine', 'ejs'); // Set EJS as the view engine
app.set('views', __dirname + '/views'); // Set views directory
app.use(express.static('public')); // Serve static files from 'public'

// Import and mount route handlers
const sessionRoutes = require('./routes/sessions');
const messageRoutes = require('./routes/messages');
const participantRoutes = require('./routes/participants');
// const voiceRoutes = require('./routes/voice');

const tavusRoutes = require('./routes/tavus');
app.use(tavusRoutes);

app.use('/api/sessions', sessionRoutes); // Session management API
app.use('/api/messages', messageRoutes); // Chat messages API
app.use('/api/participants', participantRoutes); // Participants API
// app.use('/api/voice', voiceRoutes); //Voice API

// Load your Tavus API key from environment variables
const TAVUS_API_KEY = process.env.TAVUS_API_KEY;

// Proxy endpoint
app.get('/api/tavus-avatar/:personaId', async (req, res) => {
  console.log('Received request for personaId:', req.params.personaId);
  const { personaId } = req.params;
  if (!personaId) {
    return res.status(400).json({ error: 'Missing personaId' });
  }
  const options = {
    method: 'GET',
    headers: { 'x-api-key': process.env.TAVUS_API_KEY }
  };
  try {
    const response = await axios.get(`https://tavusapi.com/v2/avatars/${personaId}`, {
      headers: { Authorization: `Bearer ${TAVUS_API_KEY}` }
    }, options);
    console.log('Tavus API response:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error from Tavus API:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});


// Health check endpoint for uptime monitoring
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Initialize Supabase client for database operations
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Socket.IO event handlers for real-time features
io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  // User joins a session/room
  socket.on('joinRoom', async (data) => {
    const { session_id, user_id, username, mood } = data;
    try {
      // Validate session existence
      const { data: existingSession, error: fetchError } = await supabase
        .from('sessions')
        .select('id')
        .eq('id', session_id)
        .single();

      if (fetchError) {
        console.error(`Error fetching session ${session_id}:`, fetchError.message);
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      socket.join(session_id); // Join the socket.io room
      console.log(`User ${user_id} (${username}) joined session ${session_id} with mood ${mood}`);

      // Fetch current participants
      const { data: participantsData, error: participantsError } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', session_id);

      if (participantsError) {
        console.error('Error fetching participants:', participantsError.message);
        socket.emit('error', { message: 'Failed to fetch participants' });
        return;
      }

      // Notify the user and others in the room
      socket.emit('room-joined', { session_id, participants: participantsData });
      socket.to(session_id).emit('user-joined', {
        user_id,
        user_name: username,
        username,
        mood,
        avatar: '/avatars/default-avatar.png',
        is_speaking: false,
        is_muted: false
      });
    } catch (error) {
      console.error('Error in joinRoom:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // User leaves a session/room
  socket.on('leaveRoom', async (data) => {
    const { session_id, user_id } = data;
    try {
      socket.leave(session_id);
      console.log(`User ${user_id} left session ${session_id}`);

      // Remove participant from DB
      const { error: deleteError } = await supabase
        .from('participants')
        .delete()
        .eq('user_id', user_id)
        .eq('session_id', session_id);

      if (deleteError) {
        console.error('Error removing participant:', deleteError.message);
      }

      // Notify others in the room
      io.to(session_id).emit('user-left', { user_id });
    } catch (error) {
      console.error('Error in leaveRoom:', error);
    }
  });

  // Handle sending and broadcasting chat messages
  socket.on('sendMessage', async ({ session_id, sender, text, user_id, type = 'text' }) => {
    try {
      // Save message to DB
      const { data, error } = await supabase
        .from('messages')
        .insert([{ session_id, sender, text, user_id, type }])
        .select()
        .single();

      if (error) {
        console.error('DB Error saving message:', error.message);
        return;
      }

      console.log('Message saved to database:', data);
      io.to(session_id).emit('receiveMessage', data); // Broadcast to room
    } catch (error) {
      console.error('Error in sendMessage:', error);
    }
  });

  // Typing indicators
  socket.on('typing-start', (data) => {
    const { session_id, user_id, username } = data;
    socket.to(session_id).emit('typing-start', { user_id, username });
  });

  socket.on('typing-stop', (data) => {
    const { session_id, user_id } = data;
    socket.to(session_id).emit('typing-stop', { user_id });
  });

  // Voice status updates (emit only to the room)
  socket.on('voice-status', async (data) => {
    const { userId, isSpeaking, isMuted } = data;
    try {
      // Update participant voice status in DB
      const { error } = await supabase
        .from('participants')
        .update({ is_speaking: isSpeaking, is_muted: isMuted })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating voice status:', error.message);
      }

      // Emit to the relevant room
      const session_id = Array.from(socket.rooms).find(room => room !== socket.id);
      if (session_id) {
        io.to(session_id).emit('voice-status', { user_id: userId, isSpeaking, isMuted });
      }
    } catch (error) {
      console.error('Error in voice-status:', error);
    }
  });

  // Message reactions
  socket.on('message-reaction', async (data) => {
    const { messageId, reaction, userId } = data;
    try {
      io.emit('message-reaction', { messageId, reaction, userId });
    } catch (error) {
      console.error('Error in message-reaction:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// General error handling middleware for Express
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// EJS server-rendered chat room page
app.get('/session/:id', async (req, res) => {
  const sessionId = req.params.id;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError) return res.status(404).send('Session not found');

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (messagesError) return res.status(500).send('DB Error');

  res.render('chat', { sessionId, session, messages });
});

// EJS server-rendered landing page
app.get('/', async (req, res) => {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase error:', error.message);
    return res.status(500).send('Database error');
  }

  res.render('landing', { sessions });
});

// REST API endpoint to get all sessions
app.get('/api/sessions', async (req, res) => {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase error fetching sessions:', error.message);
    return res.status(500).json({ error: 'Database error' });
  }
  res.json(sessions);
});

// // ===== DAILY.CO INTEGRATION: Add Daily API for fallback room creation =====
// const { DailyApi } = require("@daily-co/daily-js");
// let daily = null;
// if (process.env.DAILY_API_KEY) {
//   daily = DailyApi.createInstance({ apiKey: process.env.DAILY_API_KEY });
// } else {
//   console.warn('⚠️  DAILY_API_KEY is not set in .env - Daily.co fallback will be disabled');
// }
// // ===== END DAILY.CO INTEGRATION =====

// // Get Daily room URL for a conversation
// app.post('/api/tavus/get-daily-room', validateTavusRequest, async (req, res) => {
//   try {
//     const { conversation_id } = req.body;

//     if (!conversation_id) {
//       return res.status(400).json({
//         error: "Validation failed",
//         message: "conversation_id is required",
//       });
//     }

//     console.log("Getting Daily room for conversation:", conversation_id);

//     const response = await fetch(`https://tavusapi.com/v2/conversations/${conversation_id}`, {
//       method: "GET",
//       headers: {
//         "x-api-key": process.env.TAVUS_API_KEY,
//       },
//     });

//     let data = null;
//     if (response.ok) {
//       data = await response.json();
//     }

//     // If Tavus returns a room_url, use it
//     if (data && data.room_url) {
//       return res.json({
//         success: true,
//         room_url: data.room_url,
//         conversation_status: data.status,
//         message: "Room URL retrieved successfully (Tavus)",
//       });
//     }

//     // ===== DAILY.CO FALLBACK =====
//     if (!daily) {
//       return res.status(500).json({
//         error: "Daily.co fallback not available",
//         message: "DAILY_API_KEY is not configured on the server",
//       });
//     }
//     const roomName = `tavus-${conversation_id}`;
//     let room;
//     try {
//       try {
//         room = await daily.rooms.get(roomName);
//       } catch (e) {
//         room = await daily.rooms.create({
//           name: roomName,
//           properties: {
//             enable_chat: false,
//             enable_screenshare: false,
//             enable_recording: false,
//             start_video_off: true,
//             start_audio_off: false,
//             max_participants: 10,
//             exp: Math.round(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
//           },
//         });
//       }
//       return res.json({
//         success: true,
//         room_url: room.url,
//         conversation_status: data ? data.status : undefined,
//         message: "Room URL retrieved successfully (Daily.co fallback)",
//       });
//     } catch (error) {
//       console.error("Error creating/fetching Daily room:", error);
//       return res.status(500).json({
//         error: "Failed to create or fetch Daily room",
//         message: error.message,
//       });
//     }
//     // ===== END DAILY.CO FALLBACK =====
//   } catch (error) {
//     console.error("Error getting Daily room:", error);
//     res.status(500).json({
//       error: "Internal server error",
//       message: error.message,
//     });
//   }
// }); 

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});