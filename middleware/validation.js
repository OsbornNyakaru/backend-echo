// Validation middleware for Tavus requests
export const validateTavusRequest = (req, res, next) => {
    const { persona_id } = req.body
  
    // Check if we have either a persona_id in request or in environment
    if (!persona_id && !process.env.TAVUS_PERSONA_ID) {
      return res.status(400).json({
        error: "Validation failed",
        message: "persona_id is required either in request body or as environment variable",
      })
    }
  
    // Check if API key is configured
    if (!process.env.TAVUS_API_KEY) {
      return res.status(500).json({
        error: "Server configuration error",
        message: "Tavus API key not configured",
      })
    }
  
    next()
  }
  
  // Validation middleware for conversation ID
  export const validateConversationId = (req, res, next) => {
    const { conversation_id } = req.body || req.params
  
    if (!conversation_id) {
      return res.status(400).json({
        error: "Validation failed",
        message: "conversation_id is required",
      })
    }
  
    // Basic format validation for conversation ID
    if (typeof conversation_id !== "string" || conversation_id.length < 10) {
      return res.status(400).json({
        error: "Validation failed",
        message: "Invalid conversation_id format",
      })
    }
  
    next()
  }
  
  // Validate API key middleware
  export const validateApiKey = (req, res, next) => {
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"]
  
    if (!apiKey) {
      return res.status(401).json({
        error: "Authentication failed",
        message: "API key is required",
      })
    }
  
    // You can add more sophisticated API key validation here
    next()
  }
  