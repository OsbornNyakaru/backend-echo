# EchoRoom: Real-time Chat Application

This `README.md` provides a comprehensive guide to setting up, running, and understanding the integrated EchoRoom real-time chat application, which consists of a Node.js backend (Express + Socket.IO + Supabase) and a React frontend (Vite + Socket.IO Client).

## Table of Contents

1.  [Project Overview](#1-project-overview)
2.  [Prerequisites](#2-prerequisites)
3.  [Backend Setup (Node.js)](#3-backend-setup-nodejs)
    *   [Supabase Database Configuration](#31-supabase-database-configuration)
    *   [Backend Project Setup](#32-backend-project-setup)
    *   [Running the Backend](#33-running-the-backend)
4.  [Frontend Setup (React with Vite)](#4-frontend-setup-react-with-vite)
    *   [Frontend Project Setup](#41-frontend-project-setup)
    *   [Running the Frontend](#42-running-the-frontend)
5.  [Key Features & How They Work](#5-key-features--how-they-work)
    *   [Real-time Chat](#51-real-time-chat)
    *   [Room Selection](#52-room-selection)
    *   [Sender Name Input](#53-sender-name-input)
    *   [Error Handling & UI Feedback](#54-error-handling--ui-feedback)
6.  [Troubleshooting](#6-troubleshooting)
7.  [Future Enhancements](#7-future-enhancements)

---

## 1. Project Overview

EchoRoom is a real-time chat application designed to connect users within specific "mood-based" rooms. It leverages:
*   **Backend:** Node.js with Express for API routing, Socket.IO for real-time communication, and Supabase for database persistence.
*   **Frontend:** React with Vite for a fast development experience, and Socket.IO Client for real-time interaction.

## 2. Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js** (LTS version recommended)
*   **npm** (Node Package Manager, usually comes with Node.js)
*   **Git**
*   **A Supabase Account and Project:** You will need your Supabase Project URL and Public API Key (anon key).

## 3. Backend Setup (Node.js)

The backend is responsible for managing chat sessions (rooms), storing messages in Supabase, and handling real-time communication via Socket.IO.

### 3.1. Supabase Database Configuration

1.  **Log in to your Supabase project dashboard.**
2.  **Navigate to the `Table Editor` (or `Tables` in the sidebar).**
3.  **Create a new table named `sessions`** with the following columns:
    *   `id`: `uuid` (Primary Key)
    *   `name`: `text` (e.g., "Lonely Room")
    *   `category`: `text` (e.g., "Lonely" - used for display on frontend)
    *   `created_at`: `timestamp with time zone` (Default value: `now()`)
    *   Optionally, set Row Level Security (RLS) policies for `SELECT` access.
4.  **Create a new table named `messages`** with the following columns:
    *   `id`: `uuid` (Primary Key, Default value: `gen_random_uuid()`)
    *   `session_id`: `uuid` (Foreign Key referencing `sessions.id`)
    *   `sender`: `text`
    *   `text`: `text`
    *   `timestamp`: `timestamp with time zone` (Default value: `now()`)
    *   Optionally, set RLS policies for `SELECT` and `INSERT` access.
5.  **Populate `sessions` table:** Manually add a few entries to your `sessions` table, including an `id` (a valid UUID), `name`, and `category` for each room you want to display. For example, add the "Lonely" session with ID `ad209c8b-dde1-44e7-8642-7da4e1f8cfe3` and category "Lonely".
6.  **Get your Supabase Credentials:**
    *   Go to `Project Settings` > `API`.
    *   Note down your `Project URL` and `anon public` (Public API Key).

### 3.2. Backend Project Setup

1.  **Navigate to your project root:**
    ```bash
    cd EchoRoom_Project # Assuming this is your root folder
    ```
2.  **Create `package.json`:** If you don't have one, create it by running `npm init -y`.
3.  **Install backend dependencies:**
    ```bash
    npm install express cors dotenv socket.io @supabase/supabase-js
    ```
4.  **Create `server.js`:** In your `EchoRoom_Project` root, create a file named `server.js` and paste the following content into it:

    ```javascript
    const express = require('express');
    const cors = require('cors');
    require('dotenv').config();
    const http = require('http');
    const { Server } = require('socket.io');

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: { origin: '*' } // Consider restricting this in production for security
    });

    app.use(cors());
    app.use(express.json());

    // You might have existing route setups (e.g., for EJS views or other APIs)
    // app.set('view engine', 'ejs');
    // app.set('views', __dirname + '/views');
    // app.use(express.static('public'));

    // Example: If you have separate route files (uncomment and adjust paths if needed)
    // const sessionRoutes = require('./routes/sessions');
    // const messageRoutes = require('./routes/messages');
    // app.use('/api/sessions', sessionRoutes);
    // app.use('/api/messages', messageRoutes);

    // Supabase Client Initialization
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Socket.IO Connection and Event Handlers
    io.on('connection', (socket) => {
      console.log('🟢 A user connected:', socket.id);

      // Handler for joining a specific chat room
      socket.on('joinRoom', async (sessionId) => {
        // Basic check if session exists in Supabase
        const { data: existingSession, error: fetchError } = await supabase
          .from('sessions')
          .select('id')
          .eq('id', sessionId)
          .single();

        if (fetchError) {
          console.error(`Error fetching session ${sessionId}:`, fetchError.message);
          // If the session doesn't exist, the backend should not allow joining or creating here
          return;
        }

        socket.join(sessionId);
        console.log(`User ${socket.id} joined session ${sessionId}`);
      });

      // Handler for sending messages
      socket.on('sendMessage', async ({ session_id, sender, text }) => {
        // Save message to Supabase
        const { data, error } = await supabase
          .from('messages')
          .insert([{ session_id, sender, text }])
          .select()
          .single();

        if (error) {
          console.error('DB Error:', error.message);
          return;
        }

        console.log('Supabase insert data (backend):', data);

        // Emit the received message to all users in the specific room
        io.to(session_id).emit('receiveMessage', data);
      });

      // Handler for user disconnection
      socket.on('disconnect', () => {
        console.log('🔴 User disconnected:', socket.id);
      });

      // Generic Socket.IO error handler
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });

    // General Express error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).send('Something broke!');
    });

    // API endpoint to get all chat sessions (rooms)
    app.get('/api/sessions', async (req, res) => {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*') // Selects all columns, including 'category' for frontend display
        .order('created_at', { ascending: false }); // Order by creation time

      if (error) {
        console.error('Supabase error fetching sessions:', error.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(sessions);
    });

    // --- Existing Express routes (from your original backend) ---
    // These routes might exist in your project if you're serving traditional pages
    // or other API endpoints. Adjust or remove if not applicable.

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

    // -----------------------------------------------------------

    // Server listens on port 5000 (ensure frontend connects to this port)
    const PORT = process.env.PORT || 5000; 
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    ```
5.  **Create `.env` file:** In the `EchoRoom_Project` root, create a file named `.env` and add your Supabase credentials:
    ```dotenv
    SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL"
    SUPABASE_KEY="YOUR_SUPABASE_PUBLIC_API_KEY"
    ```

### 3.3. Running the Backend

1.  **Open your terminal** and navigate to the `EchoRoom_Project` root directory.
2.  **Start the backend server:**
    ```bash
    node server.js
    ```
    You should see "Server running on http://localhost:5000". Keep this terminal open.

---

## 4. Frontend Setup (React with Vite)

The frontend will display the chat rooms, allow selection, handle user input, and manage real-time message display.

### 4.1. Frontend Project Setup

1.  **Navigate into the `frontend` directory:**
    ```bash
    cd frontend
    ```
2.  **Initialize a new React/TypeScript project:** If you haven't already, do this in the `frontend` subdirectory.
    ```bash
    npm create vite@latest . -- --template react-ts # Note the '.' for current directory
    ```
    Follow the prompts.
3.  **Install frontend dependencies:**
    ```bash
    npm install socket.io-client
    npm install --save-dev @types/socket.io-client
    ```
    (Note: `react` and `react-dom` should be installed by Vite's template.)
4.  **Create `src/App.tsx`:** Replace the content of `src/App.tsx` with the following code. (If you have other top-level components or routing, you might integrate this `App` component as a sub-component within your existing structure.)

    ```typescript
    import { useState, useEffect } from 'react'
    import { io, Socket } from 'socket.io-client'
    // Remove if not using Vite's default assets:
    import reactLogo from './assets/react.svg' 
    import viteLogo from '/vite.svg' 
    import './App.css' // Ensure this path is correct for your project structure

    // IMPORTANT: Ensure this port matches your backend server's port
    const socket: Socket = io('http://localhost:5000')

    // Hardcoded for demonstration to connect to your specific "Lonely" session.
    // In a full app, this would be dynamic (e.g., from URL params, user selection on a Home page).
    const DEFAULT_SESSION_ID = 'ad209c8b-dde1-44e7-8642-7da4e1f8cfe3' 

    interface ChatSession {
      id: string;
      name?: string; // Optional, can be used for display
      category: string; // Used for displaying room names as per your request
    }

    interface ChatMessage {
      id?: string;
      session_id?: string;
      sender: string;
      text: string;
      timestamp?: string;
    }

    function App() { // This component is effectively your "Room" page/component
      const [messages, setMessages] = useState<ChatMessage[]>([])
      const [messageInput, setMessageInput] = useState('')
      const [isConnected, setIsConnected] = useState(socket.connected)
      const [transport, setTransport] = useState('N/A')
      const [senderName, setSenderName] = useState('User') // User can change this
      const [sessions, setSessions] = useState<ChatSession[]>([]) // Stores fetched rooms
      const [activeSessionId, setActiveSessionId] = useState<string | null>(null); // Current active chat room

      useEffect(() => {
        // Function to fetch available chat sessions from the backend
        const fetchSessions = async () => {
          try {
            const response = await fetch('http://localhost:5000/api/sessions'); // API endpoint on your backend
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: ChatSession[] = await response.json();
            setSessions(data);
            
            // Automatically join a default session if rooms are fetched and none is active
            if (data.length > 0 && !activeSessionId) {
              // Try to find and join the hardcoded DEFAULT_SESSION_ID first
              const defaultSessionExists = data.some(session => session.id === DEFAULT_SESSION_ID);
              if (defaultSessionExists) {
                setActiveSessionId(DEFAULT_SESSION_ID);
                socket.emit('joinRoom', DEFAULT_SESSION_ID); // Join the default session on mount
              } else if (data.length > 0) {
                // If the default doesn't exist, join the first available session
                setActiveSessionId(data[0].id);
                socket.emit('joinRoom', data[0].id);
              }
            }
          } catch (error) {
            console.error('Error fetching sessions:', error);
          }
        };

        fetchSessions();

        // Socket.IO event listeners
        socket.on('connect', () => {
          setIsConnected(true)
          setTransport(socket.io.engine.transport.name)
          console.log('Socket connected!')
          // Re-join room if already selected after a reconnect
          if (activeSessionId) {
            socket.emit('joinRoom', activeSessionId);
          }
        })

        socket.on('disconnect', () => {
          setIsConnected(false)
          setTransport('N/A')
          console.log('Socket disconnected.')
        })

        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message)
        })

        socket.on('receiveMessage', (data: any) => {
          console.log('Message received raw data (frontend):', data) 
          
          // Ensure received message matches ChatMessage interface
          const receivedMessage: ChatMessage = {
            sender: data.sender || 'Unknown',
            text: data.text || String(data) // Fallback if 'text' property is missing
          };

          console.log('Processed Message (frontend):', receivedMessage);
          setMessages((prevMessages) => [...prevMessages, receivedMessage]);
        })

        // Cleanup: remove socket listeners on component unmount
        return () => {
          socket.off('connect')
          socket.off('disconnect')
          socket.off('connect_error')
          socket.off('receiveMessage')
        }
      }, [activeSessionId]) // Re-run this effect if activeSessionId changes

      // Function to send messages
      const sendMessage = () => {
        if (messageInput.trim() && senderName.trim() && activeSessionId) {
          try {
            // Emit 'sendMessage' event to the backend
            socket.emit('sendMessage', { session_id: activeSessionId, sender: senderName, text: messageInput });
            console.log('Message sent (frontend):', { session_id: activeSessionId, sender: senderName, text: messageInput });
            setMessageInput(''); // Clear input after sending
          } catch (error) {
            console.error('Error sending message:', error);
          }
        } else {
            console.warn('Cannot send empty message, sender name, or without an active session.');
        }
      }

      // Handler for clicking a room button
      const handleJoinSession = (sessionId: string) => {
        if (activeSessionId !== sessionId) { // Only join if a different session is selected
          if (isConnected && activeSessionId) {
            socket.emit('leaveRoom', activeSessionId); // Optional: inform backend about leaving previous room
          }
          setActiveSessionId(sessionId);
          setMessages([]); // Clear chat history when changing rooms
          if (isConnected) {
            socket.emit('joinRoom', sessionId); // Join the newly selected room
          }
        }
      };

      return (
        <div className="App"> {/* Consider renaming this className */}
          <h1>EchoRoom Real-time Chat</h1>
          <p>Status: {' '}
            { isConnected ?
              <span className="connected">Connected</span> :
              <span className="disconnected">Disconnected</span>
            } - Transport: { transport }
          </p>

          <h2>Available Rooms</h2>
          <div className="session-buttons">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleJoinSession(session.id)}
                className={session.id === activeSessionId ? 'active-session-button' : 'session-button'}
                disabled={!isConnected}
              >
                {session.category} {/* Display the category as the room name */}
              </button>
            ))}
          </div>
          {activeSessionId && (
            <p>
              Currently in: <strong>
                {sessions.find(s => s.id === activeSessionId)?.category || activeSessionId}
              </strong>
            </p>
          )}

          <div className="chat-window">
            {messages.map((msg, index) => (
              <p key={index} style={{ color: 'black', margin: '5px 0' }}>
                <strong>{msg.sender}:</strong> {msg.text}
              </p>
            ))}
          </div>

          <div className="input-area">
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Your Name"
              className="sender-name-input"
              disabled={!isConnected}
            />
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  sendMessage()
                }
              }}
              placeholder="Type a message..."
              disabled={!isConnected || !activeSessionId}
              className="message-input"
            />
            <button onClick={sendMessage} disabled={!isConnected || !activeSessionId}>Send</button>
          </div>

          { !isConnected && <p className="error-message">Disconnected from server. Please ensure the backend is running.</p> }
          { isConnected && !activeSessionId && <p className="warning-message">Please select a session to start chatting.</p> }
        </div>
      )
    }

    export default App
    ```

5.  **Create `src/App.css`:** In your `frontend/src/` directory, create a file named `App.css` and paste the following content into it:

    ```css
    /* These are global styles. If your target repo uses a different CSS methodology
       (e.g., CSS Modules, Styled Components, Tailwind utility-first), you will need
       to adapt these rules accordingly. */

    #root {
      max-width: 1280px;
      margin: 0 auto;
      padding: 2rem;
      text-align: center;
    }

    /* Remove .logo, @keyframes logo-spin, .card, .read-the-docs if not needed */
    .logo { 
      height: 6em;
      padding: 1.5em;
      will-change: filter;
      transition: filter 300ms;
    }
    .logo:hover {
      filter: drop-shadow(0 0 2em #646cffaa);
    }
    .logo.react:hover {
      filter: drop-shadow(0 0 2em #61dafbaa);
    }

    @keyframes logo-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      a:nth-of-type(2) .logo {
        animation: logo-spin infinite 20s linear;
      }
    }

    .card {
      padding: 2em;
    }

    .read-the-docs {
      color: #888;
    }

    /* Core chat application layout */
    .App { 
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }

    .chat-window {
      border: 1px solid #ccc;
      width: 80%; 
      height: 300px; 
      overflow-y: scroll;
      margin-bottom: 10px;
      padding: 10px;
      text-align: left;
      border-radius: 8px; 
      background-color: #fff; 
    }

    .chat-window p {
      margin: 5px 0;
      word-wrap: break-word; 
    }

    /* Input area for sender name and message */
    .input-area {
      display: flex;
      width: 80%; 
      margin-top: 10px;
      gap: 10px; 
    }

    .sender-name-input {
      width: 150px; 
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 5px;
    }

    .message-input {
      flex-grow: 1; 
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 5px;
    }

    /* General button styling */
    button {
      padding: 10px 15px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    button:hover {
      background-color: #0056b3;
    }

    button:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }

    /* Session selection buttons */
    .session-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
      justify-content: center;
      width: 80%; 
    }

    .session-button,
    .active-session-button {
      background-color: #f0f0f0;
      color: #333;
      border: 1px solid #ccc;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: background-color 0.2s, border-color 0.2s;
      flex-grow: 1; 
      min-width: 100px; 
    }

    .session-button:hover {
      background-color: #e0e0e0;
      border-color: #bbb;
    }

    .active-session-button {
      background-color: #007bff;
      color: white;
      border-color: #007bff;
    }

    .active-session-button:hover {
      background-color: #0056b3;
      border-color: #0056b3;
    }

    /* Status messages */
    .warning-message {
      color: orange;
      margin-top: 10px;
    }

    .error-message { 
      color: red;
      margin-top: 10px;
    }

    .connected {
      color: green;
    }

    .disconnected {
      color: red;
    }
    ```

### 4.2. Running the Frontend

1.  **Open your terminal** and navigate to the `EchoRoom_Project/frontend` directory.
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the frontend development server:**
    ```bash
    npm run dev
    ```
    You should see output indicating the local URL (e.g., `http://localhost:5174/`).
4.  **Open your web browser** and navigate to the local URL.
5.  **Crucially: Clear your browser's cache and perform a hard reload** to ensure all new CSS and JavaScript are loaded.

---

## 5. Key Features & How They Work

### 5.1. Real-time Chat

*   **Socket.IO Connection:** The `socket` instance is initialized in `App.tsx` (or your chosen file) to connect to the backend Socket.IO server.
*   **`sendMessage` Event:** When you type a message and press Enter or click "Send", the `sendMessage` function emits a `sendMessage` event to the backend, including `session_id`, `sender`, and `text`.
*   **`receiveMessage` Event:** The frontend listens for `receiveMessage` events from the backend. When a message is received, it's added to the `messages` state and displayed in the `chat-window`.

### 5.2. Room Selection

*   **`fetchSessions`:** On component mount, the frontend fetches the list of available rooms (sessions) from your backend's `/api/sessions` endpoint.
*   **Dynamic Buttons:** Each fetched session is rendered as a clickable button. The `session.category` is used as the displayed room name.
*   **`handleJoinSession`:** Clicking a room button triggers this function:
    *   It updates the `activeSessionId` state.
    *   It clears the current chat messages.
    *   It emits a `joinRoom` event to the backend, ensuring the user joins the selected room's Socket.IO channel.
    *   The "Currently in:" indicator shows the active room.

### 5.3. Sender Name Input

*   A dedicated input field allows the user to set their `senderName`.
*   This `senderName` is included in every `sendMessage` event, ensuring messages are attributed correctly.

### 5.4. Error Handling & UI Feedback

*   **Connection Status:** The "Status:" indicator shows if the frontend is `Connected` or `Disconnected` from the Socket.IO server.
*   **Input/Button Disabling:** The message input and send button are disabled when not connected or when no session is active.
*   **Warning/Error Messages:** Visual messages are displayed if disconnected or if no session is selected.
*   **Backend Logging:** The `server.js` includes `console.error` for database errors and socket errors, aiding backend debugging.

---

## 6. Troubleshooting

*   **"Cannot GET /api/sessions"**:
    *   Ensure your backend server (`node server.js`) is running in the `EchoRoom_Project` root.
    *   Verify the `/api/sessions` route exists and is correctly defined in your `server.js`.
    *   Check your backend terminal for any startup errors.
*   **`net::ERR_CONNECTION_REFUSED` or Frontend not connecting**:
    *   Make sure your backend server is running.
    *   Verify the `io('http://localhost:5000')` URL in `frontend/src/App.tsx` exactly matches the port your backend is listening on (default 5000).
    *   Check backend terminal for any CORS errors.
*   **Messages not displaying / Only seeing ":"**:
    *   Ensure the `sender` and `text` properties are present and correctly formatted in the data sent from your backend (check backend `console.log('Supabase insert data (backend):', data);`).
    *   Ensure `frontend/src/App.tsx` is correctly extracting `msg.sender` and `msg.text` (check frontend console logs for "Processed Message (frontend):").
    *   **Crucially: Clear your browser's cache and hard reload the frontend page.** This is often the solution for rendering issues after CSS/JS changes.
*   **"invalid input syntax for type uuid: '...' "**:
    *   This means the `sessionId` being sent from the frontend does not exist as a UUID in your Supabase `sessions` table.
    *   Ensure you have created the `sessions` table with an `id` column of type `uuid` in Supabase.
    *   Verify that `DEFAULT_SESSION_ID` in `frontend/src/App.tsx` is set to an *actual UUID* that exists in your Supabase `sessions` table (e.g., `ad209c8b-dde1-44e7-8642-7da4e1f8cfe3`).

---

## 7. Future Enhancements

*   **Dynamic User IDs/Names:** Implement proper user authentication to assign unique user IDs and allow users to set their names persistently.
*   **Previous Message Fetching:** When a user joins a room, fetch and display the history of messages for that room from Supabase.
*   **Voice Chat Integration:** Leverage the `updateVoiceStatus` emitter and potentially integrate a WebRTC solution.
*   **Typing Indicators:** Implement the `typing-start` and `typing-stop` events on the frontend to show who is typing.
*   **Message Reactions:** Implement UI for `sendReaction` and display reactions on messages.
*   **Error Boundaries:** Add React Error Boundaries for more robust UI error handling.
*   **Styling Refinement:** Expand `App.css` or migrate to a more robust styling solution (e.g., Tailwind CSS, Styled Components) for a polished UI.
*   **Routing:** Integrate `react-router-dom` for multi-page navigation (Home -> Welcome -> Room).
*   **Scalability:** For large-scale applications, consider more advanced Socket.IO features like adapter patterns for horizontal scaling.
*   **Deployment:** Set up deployment for both frontend and backend to cloud platforms (e.g., Vercel for frontend, Render/Heroku for backend).

</rewritten_file>