# Backend Documentation

## Overview
This document describes the backend logic for the EchoRoom application, specifically focusing on the `server.js` and `routes/participant.js` files. It reflects the latest changes and best practices as implemented in the codebase.

---

## server.js

### Key Features
- Express server setup with CORS and JSON parsing
- Socket.IO for real-time communication
- Supabase client for database operations
- EJS templating for server-rendered pages
- REST API endpoints for sessions and participants
- Real-time chat, typing indicators, and voice status

### Main Logic

#### Initialization
- Loads environment variables from `.env`
- Initializes Express, HTTP server, and Socket.IO
- Sets up Supabase client using `SUPABASE_URL` and `SUPABASE_KEY`
- Serves static files and sets up EJS views

#### Routes
- `/api/sessions` - REST API for session data
- `/api/messages` - REST API for chat messages (if implemented)
- `/api/participants` - REST API for participant management (see participant.js)

#### Socket.IO Events
- **joinRoom**: Validates session, joins socket room, fetches and emits current participants, notifies others
- **leaveRoom**: Removes participant from DB, leaves socket room, notifies others
- **sendMessage**: Inserts a new message into the `messages` table using the `text` field as the main message body, emits to all users in the room
- **typing-start/typing-stop**: Emits typing indicators to other users in the room
- **voice-status**: Emits real-time voice status updates to the room
- **message-reaction**: Emits message reactions (DB logic can be added as needed)
- **disconnect**: Handles user disconnects (future: clean up participants)

#### Example: Complete server.js file 
```js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } //restrict in prod later
});

app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static('public'));

// Routes
const sessionRoutes = require('./routes/sessions');
const messageRoutes = require('./routes/messages');
const participantRoutes = require('./routes/participants');
app.use('/api/sessions', sessionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/participants', participantRoutes);

// SOCKET.IO
const { createClient } = require('@supabase/supabase-js');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Loaded' : 'Not Loaded');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'Loaded' : 'Not Loaded');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  // Join a session/room
  socket.on('joinRoom', async (data) => {
    const { session_id, user_id, username, mood } = data;

    // Check if session exists
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

    socket.join(session_id);
    console.log(`User ${user_id} (${username}) joined session ${session_id} with mood ${mood}`);

    // Get current participants from database
    const { data: participantsData, error: participantsError } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', session_id);

    if (participantsError) {
      console.error('Error fetching participants:', participantsError.message);
      socket.emit('error', { message: 'Failed to fetch participants' });
      return;
    }

    // Emit to the user who joined with current participants
    socket.emit('room-joined', {
      session_id,
      participants: participantsData
    });

    // Notify others in the room about the new user
    socket.to(session_id).emit('user-joined', {
      user_id,
      user_name: username,
      username,
      mood,
      avatar: '/avatars/default-avatar.png',
      is_speaking: false,
      is_muted: false
    });
  });

  // Leave a session/room
  socket.on('leaveRoom', async (data) => {
    const { session_id, user_id } = data;

    try {
      // Leave the socket room
      socket.leave(session_id);
      console.log(`User ${user_id} left session ${session_id}`);

      // Remove participant from database
      const { error: deleteError } = await supabase
        .from('participants')
        .delete()
        .eq('user_id', user_id)
        .eq('session_id', session_id);

      if (deleteError) {
        console.error('Error removing participant:', deleteError.message);
      }

      // Notify others in the room
      socket.to(session_id).emit('user-left', { user_id });

    } catch (error) {
      console.error('Error in leaveRoom:', error);
    }
  });

  // Receive and broadcast message
  socket.on('sendMessage', async (msg) => {
    const {
      session_id,
      sender,
      text,
      user_id,
      type,
      userName,
      avatar,
      reply_to
    } = msg;

    const mainText = text || ''; // fallback

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        session_id,
        user_id,
        sender,
        text: mainText, // best practice
        content: '',
        type,
        userName: userName || sender,
        avatar: avatar || '/avatars/default-avatar.png',
        reply_to: reply_to || null
      }])
      .select()
      .single();

    if (error) {
      console.error('DB Error saving message:', error.message);
      return;
    }

    console.log('Message saved to database:', data);

    io.to(session_id).emit('receiveMessage', data);
  });

  // Handle typing indicators
  socket.on('typing-start', (data) => {
    const { session_id, user_id, username } = data;
    socket.to(session_id).emit('typing-start', { user_id, username });
  });

  socket.on('typing-stop', (data) => {
    const { session_id, user_id } = data;
    socket.to(session_id).emit('typing-stop', { user_id });
  });

  // Handle voice status updates
  socket.on('voice-status', async (data) => {
    const { userId, isSpeaking, isMuted } = data;

    try {
      // Update participant voice status in database (handled by PUT /api/participants endpoint)
      // This socket event is primarily for real-time UI updates
      // The frontend is responsible for calling the PUT /api/participants endpoint
      // to persist the voice status change in the database.

      // Broadcast to all connected clients (assuming session_id is also in data for targeted broadcast)
      // If session_id is not in data, you might need to retrieve it from the socket's rooms
      const session_id = Array.from(socket.rooms).find(room => room !== socket.id); // Get the room the socket is in
      if (session_id) {
        io.to(session_id).emit('voice-status', { user_id: userId, isSpeaking, isMuted });
      } else {
        console.warn(`Voice status update for user ${userId} but no session_id found in socket rooms.`);
      }

    } catch (error) {
      console.error('Error in voice-status:', error);
    }
  });

  // Handle message reactions
  socket.on('message-reaction', async (data) => {
    const { messageId, reaction, userId } = data;

    try {
      // Save reaction to database (if you have a reactions table)
      // For now, just broadcast the reaction
      // You would typically also include session_id here to broadcast only to the relevant room
      io.emit('message-reaction', { messageId, reaction, userId });

    } catch (error) {
      console.error('Error in message-reaction:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
    // Handle user leaving room on disconnect if necessary
    // This might involve querying the database to find which room the user was in
    // and then emitting a 'user-left' event.
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// General error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.get('/session/:id', async (req, res) => {
  const sessionId = req.params.id;

  // Fetch session info
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError) return res.status(404).send('Session not found');

  // Fetch messages
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (messagesError) return res.status(500).send('DB Error');

  res.render('chat', { sessionId, session, messages });
});

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

// New API endpoint to get all sessions
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

```

---

## routes/participant.js

### Key Features
- REST API for managing participants in sessions
- Uses Supabase for all DB operations
- Handles create, update, fetch, and delete for participants

### Endpoints
- `GET /api/participants` - List all participants
- `GET /api/participants/:sessionId` - List participants for a session
- `POST /api/participants` - Create or upsert a participant (by user_id and session_id)
- `PUT /api/participants/:userId/:sessionId` - Update participant fields (name, avatar, mood, speaking/muted status)
- `DELETE /api/participants/:userId/:sessionId` - Remove a participant from a session

### Example: routes/participants.js 
```js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client (ensure environment variables are accessible)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// GET /api/participants - Get all participants (for testing/admin)
router.get('/', async (req, res) => {
  try {
    const { data: participants, error } = await supabase
      .from('participants')
      .select('*')
      .order('joined_at', { ascending: false });

    if (error) {
      console.error('Error fetching all participants:', error.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(participants);
  } catch (error) {
    console.error('Error in GET /api/participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/participants/:sessionId - Get participants for a specific session
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: participants, error } = await supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('Error fetching session participants:', error.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(participants);
  } catch (error) {
    console.error('Error in GET /api/participants/:sessionId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/participants - Create or update a participant
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      session_id,
      user_name,
      avatar = '/avatars/default-avatar.png', // Default value if not provided
      mood = 'calm', // Default value if not provided
      is_speaking = false, // Default value if not provided
      is_muted = false // Default value if not provided
    } = req.body;

    // Validate required fields
    if (!user_id || !session_id || !user_name) {
      return res.status(400).json({
        error: 'Missing required fields: user_id, session_id, user_name'
      });
    }

    // Use upsert to handle both create and update cases based on user_id and session_id
    const { data: participant, error } = await supabase
      .from('participants')
      .upsert({
        user_id,
        session_id,
        user_name,
        avatar,
        mood,
        is_speaking,
        is_muted,
        joined_at: new Date().toISOString() // Ensure joined_at is set/updated
      }, {
        onConflict: 'user_id,session_id' // Specify the composite primary key for conflict resolution
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase upsert participant error:', error.message);
      return res.status(500).json({ error: 'Failed to create/update participant' });
    }
    res.status(201).json(participant); // Use 201 for successful creation/update
  } catch (error) {
    console.error('Error in POST /api/participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/participants/:userId/:sessionId - Update participant information
router.put('/:userId/:sessionId', async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const updates = req.body;

    // Only allow specific fields to be updated to prevent malicious updates
    const allowedUpdates = {
      user_name: updates.user_name,
      avatar: updates.avatar,
      mood: updates.mood,
      is_speaking: updates.is_speaking,
      is_muted: updates.is_muted
    };

    // Remove undefined values from allowedUpdates to avoid setting them to null
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });

    const { data: participant, error } = await supabase
      .from('participants')
      .update(allowedUpdates)
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Supabase update participant error:', error.message);
      return res.status(500).json({ error: 'Failed to update participant' });
    }
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    res.status(200).json(participant);
  } catch (error) {
    console.error('Error in PUT /api/participants/:userId/:sessionId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/participants/:userId/:sessionId - Remove participant from session
router.delete('/:userId/:sessionId', async (req, res) => {
  try {
    const { userId, sessionId } = req.params;

    const { data: participant, error } = await supabase
      .from('participants')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Supabase delete participant error:', error.message);
      return res.status(500).json({ error: 'Failed to remove participant' });
    }
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    res.status(200).json({ message: 'Participant removed successfully', participant });
  } catch (error) {
    console.error('Error in DELETE /api/participants/:userId/:sessionId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

```

---

## Best Practices
- Always validate required fields in API endpoints
- Use upsert for idempotent participant creation
- Use socket events for real-time updates, REST for persistence
- Use the `text` field as the main message body for chat messages
- Use default values for optional fields (avatar, mood, etc.)
- Handle errors gracefully and log them for debugging

---

## Change Log
- Updated `sendMessage` to use `text` as the main message body
- Updated participant creation to use upsert and set `joined_at`
- Added robust error handling and logging
- Ensured all endpoints and socket events match the latest frontend and DB schema 