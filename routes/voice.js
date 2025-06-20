// Backend API endpoints needed for voice chat functionality

const express = require("express")
const { DailyApi } = require("@daily-co/daily-js")
const router = express.Router()
const axios = require('axios')

const app = express()
app.use(express.json())

// Initialize Daily API
const daily = DailyApi.createInstance({
  apiKey: process.env.DAILY_API_KEY,
})

// Create voice room endpoint
router.post('/create-room', async (req, res) => {
  try {
    // Call Daily.co API to create a room
    const response = await axios.post(
      'https://api.daily.co/v1/rooms',
      {},
      {
        headers: {
          'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    res.json({ roomUrl: response.data.url })
  } catch (error) {
    console.error('Error creating Daily.co room:', error.response?.data || error.message)
    res.status(500).json({ error: 'Failed to create voice room' })
  }
})

// Get room info endpoint
app.get("/api/voice/room/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params
    const roomName = `voice-${roomId}`

    const room = await daily.rooms.get(roomName)
    res.json(room)
  } catch (error) {
    console.error("Error getting room info:", error)
    res.status(404).json({ error: "Room not found" })
  }
})

// Delete room endpoint
app.delete("/api/voice/room/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params
    const roomName = `voice-${roomId}`

    await daily.rooms.delete(roomName)
    res.json({ success: true })
  } catch (error) {
    console.error("Error deleting room:", error)
    res.status(500).json({ error: "Failed to delete room" })
  }
})

console.log("Voice chat backend endpoints ready!")
console.log("Required environment variables:")
console.log("- DAILY_API_KEY: Your Daily.co API key")

module.exports = router
