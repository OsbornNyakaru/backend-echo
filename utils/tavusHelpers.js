import fetch from "node-fetch"

// Helper function to check Tavus API health
export const checkTavusApiHealth = async () => {
  try {
    const response = await fetch("https://tavusapi.com/v2/personas", {
      method: "GET",
      headers: {
        "x-api-key": process.env.TAVUS_API_KEY,
      },
    })

    return {
      healthy: response.ok,
      status: response.status,
      statusText: response.statusText,
    }
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    }
  }
}

// Helper function to validate persona exists
export const validatePersonaExists = async (personaId) => {
  try {
    const response = await fetch(`https://tavusapi.com/v2/personas/${personaId}`, {
      method: "GET",
      headers: {
        "x-api-key": process.env.TAVUS_API_KEY,
      },
    })

    return {
      exists: response.ok,
      status: response.status,
    }
  } catch (error) {
    return {
      exists: false,
      error: error.message,
    }
  }
}

// Helper function to format Tavus errors
export const formatTavusError = (error, context = "") => {
  return {
    message: `Tavus API Error${context ? ` (${context})` : ""}: ${error.message}`,
    timestamp: new Date().toISOString(),
    context,
  }
}
