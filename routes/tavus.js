const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

// Middleware to validate Tavus API key
const validateTavusApiKey = (req, res, next) => {
  if (!process.env.TAVUS_API_KEY) {
    return res.status(500).json({ 
      success: false, 
      error: 'Tavus API key is not configured on server' 
    });
  }
  next();
};

// Common Tavus API request configuration
const createTavusRequest = (endpoint, method = 'GET') => ({
  method,
  headers: { 
    'x-api-key': process.env.TAVUS_API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 15000 // 15 second timeout
});

// Helper function to clean up old conversations
const cleanupOldConversations = async () => {
  try {
    console.log('🧹 Checking for old conversations to clean up...');
    
    // Get all conversations
    const response = await axios.get(
      'https://tavusapi.com/v2/conversations',
      createTavusRequest()
    );

    const conversations = response.data || [];
    console.log(`📊 Found ${conversations.length} existing conversations`);

    // Clean up conversations that are older than 5 minutes or in error state
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    
    for (const conversation of conversations) {
      const shouldCleanup = 
        conversation.status === 'failed' ||
        conversation.status === 'ended' ||
        (conversation.created_at && new Date(conversation.created_at) < cutoffTime);

      if (shouldCleanup) {
        try {
          await axios.delete(
            `https://tavusapi.com/v2/conversations/${conversation.conversation_id}`,
            createTavusRequest('', 'DELETE')
          );
          console.log(`✅ Cleaned up conversation: ${conversation.conversation_id}`);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup conversation ${conversation.conversation_id}:`, cleanupError.message);
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to cleanup old conversations:', error.message);
  }
};

// ===== TAVUS CVI INTEGRATION: Conversation API endpoints =====

// POST /conversations - Create a new Tavus CVI conversation
router.post('/conversations', validateTavusApiKey, async (req, res) => {
  const { personaId, replicaId, conversationalContext } = req.body;
  
  console.log('🎭 Tavus CVI: Creating conversation for personaId:', personaId, 'replicaId:', replicaId);
  console.log('📋 Full request body:', req.body);

  // Enhanced validation
  if (!personaId || !replicaId) {
    console.error('❌ Missing required parameters:', { personaId, replicaId });
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameters: personaId and replicaId are required',
      received: { personaId: !!personaId, replicaId: !!replicaId }
    });
  }

  // Validate parameter types and format
  if (typeof personaId !== 'string' || typeof replicaId !== 'string') {
    console.error('❌ Invalid parameter types:', { 
      personaIdType: typeof personaId, 
      replicaIdType: typeof replicaId 
    });
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid parameter types: personaId and replicaId must be strings'
    });
  }

  // Trim whitespace
  const cleanPersonaId = personaId.trim();
  const cleanReplicaId = replicaId.trim();

  if (!cleanPersonaId || !cleanReplicaId) {
    console.error('❌ Empty parameters after trimming');
    return res.status(400).json({ 
      success: false, 
      error: 'personaId and replicaId cannot be empty'
    });
  }

  try {
    console.log('🔄 Calling Tavus CVI API to create conversation...');
    
    // First, let's verify the persona and replica exist
    console.log('🔍 Verifying persona exists...');
    try {
      const personaResponse = await axios.get(
        `https://tavusapi.com/v2/personas/${cleanPersonaId}`,
        createTavusRequest()
      );
      console.log('✅ Persona verified:', personaResponse.data?.persona_id || cleanPersonaId);
    } catch (personaError) {
      console.error('❌ Persona verification failed:', {
        status: personaError.response?.status,
        data: personaError.response?.data
      });
      
      if (personaError.response?.status === 404) {
        return res.status(400).json({
          success: false,
          error: `Persona '${cleanPersonaId}' not found. Please check the persona ID or create a persona first.`,
          suggestion: 'Use GET /api/tavus/personas to see available personas'
        });
      }
    }

    console.log('🔍 Verifying replica exists...');
    try {
      const replicaResponse = await axios.get(
        `https://tavusapi.com/v2/replicas/${cleanReplicaId}`,
        createTavusRequest()
      );
      console.log('✅ Replica verified:', replicaResponse.data?.replica_id || cleanReplicaId);
    } catch (replicaError) {
      console.error('❌ Replica verification failed:', {
        status: replicaError.response?.status,
        data: replicaError.response?.data
      });
      
      if (replicaError.response?.status === 404) {
        return res.status(400).json({
          success: false,
          error: `Replica '${cleanReplicaId}' not found. Please check the replica ID.`,
          suggestion: 'Use GET /api/tavus/replicas to see available replicas'
        });
      }
    }
    
    // Try to create conversation, but handle concurrent limit
    let createAttempt = 0;
    const maxAttempts = 2;
    
    while (createAttempt < maxAttempts) {
      createAttempt++;
      
      try {
        console.log(`🧪 Attempt ${createAttempt}: Trying minimal CVI payload...`);
        
        const minimalPayload = {
          replica_id: cleanReplicaId,
          persona_id: cleanPersonaId
        };

        // Only add conversational_context if provided and convert to string
        if (conversationalContext && Object.keys(conversationalContext).length > 0) {
          minimalPayload.conversational_context = JSON.stringify(conversationalContext);
          console.log('📝 Conversational context added:', minimalPayload.conversational_context);
        }

        console.log('📤 Sending minimal CVI conversation request:', {
          replica_id: cleanReplicaId,
          persona_id: cleanPersonaId,
          has_conversational_context: !!minimalPayload.conversational_context,
          payload_keys: Object.keys(minimalPayload),
          attempt: createAttempt
        });

        // Make request to Tavus CVI API with minimal payload
        const response = await axios.post(
          'https://tavusapi.com/v2/conversations',
          minimalPayload,
          {
            headers: { 
              'x-api-key': process.env.TAVUS_API_KEY,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        console.log('✅ Tavus CVI conversation created successfully');
        console.log('📊 CVI response structure:', {
          hasData: !!response.data,
          dataKeys: response.data ? Object.keys(response.data) : [],
          status: response.status
        });

        // Extract the conversation URL from Tavus response
        const conversationData = response.data;
        const conversationUrl = conversationData.conversation_url;

        if (!conversationUrl) {
          console.error('❌ No conversation URL received from Tavus CVI API');
          console.error('📋 Full response data:', conversationData);
          return res.status(500).json({
            success: false,
            error: 'Invalid response from Tavus CVI API: missing conversation URL',
            debug: process.env.NODE_ENV === 'development' ? conversationData : undefined
          });
        }

        console.log('🎬 Conversation URL received:', conversationUrl);

        // Return the conversation data to frontend
        return res.json({ 
          success: true, 
          conversationUrl: conversationUrl,
          conversationId: conversationData.conversation_id,
          personaId: cleanPersonaId,
          replicaId: cleanReplicaId,
          status: conversationData.status,
          timestamp: new Date().toISOString(),
          // Include any additional metadata from Tavus response
          ...(conversationData.expires_at && { expiresAt: conversationData.expires_at }),
          ...(conversationData.created_at && { createdAt: conversationData.created_at })
        });

      } catch (attemptError) {
        // Check if it's a concurrent conversations limit error
        if (attemptError.response?.status === 400 && 
            attemptError.response?.data?.message?.includes('maximum concurrent conversations')) {
          
          console.log(`⚠️ Attempt ${createAttempt}: Hit concurrent conversations limit`);
          
          if (createAttempt < maxAttempts) {
            console.log('🧹 Cleaning up old conversations and retrying...');
            await cleanupOldConversations();
            
            // Wait a moment before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; // Try again
          } else {
            // Final attempt failed
            console.error('❌ All attempts failed due to concurrent conversations limit');
            return res.status(429).json({
              success: false,
              error: 'Maximum concurrent conversations reached. Please wait a moment and try again.',
              suggestion: 'You can only have a limited number of active conversations. Please end any existing conversations first.',
              retryAfter: 30 // seconds
            });
          }
        } else {
          // Different error, don't retry
          throw attemptError;
        }
      }
    }

  } catch (error) {
    console.error('❌ Tavus CVI conversation creation error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    });

    // Log the full error response for debugging
    if (error.response?.data) {
      console.error('📋 Tavus API error details:', error.response.data);
    }

    return handleTavusError(error, res, 'CVI conversation creation', cleanPersonaId);
  }
});

// GET /conversations - List all conversations (for debugging)
router.get('/conversations', validateTavusApiKey, async (req, res) => {
  console.log('📋 Tavus CVI: Listing all conversations');

  try {
    const response = await axios.get(
      'https://tavusapi.com/v2/conversations',
      createTavusRequest()
    );

    console.log('✅ Tavus CVI conversations list retrieved');
    console.log('📊 Found conversations:', response.data?.length || 0);

    res.json({ 
      success: true, 
      conversations: response.data || [],
      count: response.data?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus CVI conversations list error:', error.message);
    return handleTavusError(error, res, 'conversations list');
  }
});

// DELETE /conversations/cleanup - Clean up old conversations
router.delete('/conversations/cleanup', validateTavusApiKey, async (req, res) => {
  console.log('🧹 Tavus CVI: Manual cleanup of old conversations');

  try {
    await cleanupOldConversations();
    
    res.json({ 
      success: true, 
      message: 'Cleanup completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus CVI cleanup error:', error.message);
    return handleTavusError(error, res, 'cleanup');
  }
});

// GET /conversations/:conversationId - Get conversation details
router.get('/conversations/:conversationId', validateTavusApiKey, async (req, res) => {
  const { conversationId } = req.params;
  
  console.log('🎭 Tavus CVI: Getting conversation details for:', conversationId);

  if (!conversationId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing conversationId parameter' 
    });
  }

  try {
    const response = await axios.get(
      `https://tavusapi.com/v2/conversations/${conversationId}`,
      createTavusRequest(`https://tavusapi.com/v2/conversations/${conversationId}`)
    );

    console.log('✅ Tavus CVI conversation details retrieved');

    res.json({ 
      success: true, 
      conversation: response.data,
      conversationId: conversationId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus CVI conversation details error:', error.message);
    return handleTavusError(error, res, 'conversation details', conversationId);
  }
});

// DELETE /conversations/:conversationId - End a conversation
router.delete('/conversations/:conversationId', validateTavusApiKey, async (req, res) => {
  const { conversationId } = req.params;
  
  console.log('🛑 Tavus CVI: Ending conversation:', conversationId);

  if (!conversationId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing conversationId parameter' 
    });
  }

  try {
    const response = await axios.delete(
      `https://tavusapi.com/v2/conversations/${conversationId}`,
      createTavusRequest(`https://tavusapi.com/v2/conversations/${conversationId}`, 'DELETE')
    );

    console.log('✅ Tavus CVI conversation ended successfully');

    res.json({ 
      success: true, 
      conversationId: conversationId,
      message: 'Conversation ended successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus CVI conversation termination error:', error.message);
    return handleTavusError(error, res, 'conversation termination', conversationId);
  }
});

// GET /replicas - List available replicas for CVI
router.get('/replicas', validateTavusApiKey, async (req, res) => {
  console.log('🎭 Tavus CVI: Fetching available replicas');

  try {
    const response = await axios.get(
      'https://tavusapi.com/v2/replicas',
      createTavusRequest('https://tavusapi.com/v2/replicas')
    );

    console.log('✅ Tavus CVI replicas list retrieved');
    console.log('📊 Found replicas:', response.data?.length || 0);

    res.json({ 
      success: true, 
      replicas: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus CVI replicas list error:', error.message);
    return handleTavusError(error, res, 'replicas list');
  }
});

// ===== END TAVUS CVI INTEGRATION =====

// GET /avatar/:personaId/url - Get avatar video URL (matches frontend expectation)
router.get('/avatar/:personaId/url', validateTavusApiKey, async (req, res) => {
  const { personaId } = req.params;
  
  console.log('🎭 Tavus Route: Fetching avatar URL for personaId:', personaId);

  if (!personaId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing personaId parameter' 
    });
  }

  try {
    console.log('🔄 Calling Tavus avatars API...');
    console.log('🔑 Using API key:', process.env.TAVUS_API_KEY ? `${process.env.TAVUS_API_KEY.substring(0, 8)}...` : 'NOT SET');
    
    // Try the avatars endpoint first
    let response;
    let avatarData;
    
    try {
      response = await axios.get(
        `https://tavusapi.com/v2/avatars/${personaId}`, 
        createTavusRequest()
      );
      avatarData = response.data;
      console.log('✅ Tavus avatars API response received');
    } catch (avatarError) {
      console.log('⚠️ Avatars endpoint failed, trying personas endpoint...');
      
      // Fallback to personas endpoint
      try {
        response = await axios.get(
          `https://tavusapi.com/v2/personas/${personaId}`, 
          createTavusRequest()
        );
        avatarData = response.data;
        console.log('✅ Tavus personas API response received as fallback');
      } catch (personaError) {
        console.error('❌ Both avatars and personas endpoints failed');
        throw avatarError; // Throw the original avatar error
      }
    }

    console.log('📊 Avatar data structure:', {
      hasData: !!avatarData,
      dataKeys: avatarData ? Object.keys(avatarData) : [],
      sampleData: avatarData ? JSON.stringify(avatarData).substring(0, 200) + '...' : null
    });

    // Prioritize image URLs first, then video URLs
    let avatarUrl = null;
    let isStaticImage = false;

    // First, try to find image URLs from Tavus
    if (avatarData.image_url) {
      avatarUrl = avatarData.image_url;
      isStaticImage = true;
      console.log('🖼️ Found Tavus image URL:', avatarUrl);
    } else if (avatarData.thumbnail_url) {
      avatarUrl = avatarData.thumbnail_url;
      isStaticImage = true;
      console.log('🖼️ Found Tavus thumbnail URL:', avatarUrl);
    } else if (avatarData.preview_image_url) {
      avatarUrl = avatarData.preview_image_url;
      isStaticImage = true;
      console.log('🖼️ Found Tavus preview image URL:', avatarUrl);
    } else if (avatarData.avatar_image_url) {
      avatarUrl = avatarData.avatar_image_url;
      isStaticImage = true;
      console.log('🖼️ Found Tavus avatar image URL:', avatarUrl);
    }
    
    // If no image found, try video URLs
    if (!avatarUrl) {
      if (avatarData.video_url) {
        avatarUrl = avatarData.video_url;
        isStaticImage = false;
        console.log('🎬 Found Tavus video URL:', avatarUrl);
      } else if (avatarData.videoUrl) {
        avatarUrl = avatarData.videoUrl;
        isStaticImage = false;
        console.log('🎬 Found Tavus videoUrl:', avatarUrl);
      } else if (avatarData.url) {
        avatarUrl = avatarData.url;
        isStaticImage = false;
        console.log('🎬 Found Tavus URL:', avatarUrl);
      } else if (avatarData.avatar_url) {
        avatarUrl = avatarData.avatar_url;
        isStaticImage = false;
        console.log('🎬 Found Tavus avatar URL:', avatarUrl);
      } else if (avatarData.download_url) {
        avatarUrl = avatarData.download_url;
        isStaticImage = false;
        console.log('🎬 Found Tavus download URL:', avatarUrl);
      } else if (avatarData.preview_video_url) {
        avatarUrl = avatarData.preview_video_url;
        isStaticImage = false;
        console.log('🎬 Found Tavus preview video URL:', avatarUrl);
      } else if (avatarData.sample_video_url) {
        avatarUrl = avatarData.sample_video_url;
        isStaticImage = false;
        console.log('🎬 Found Tavus sample video URL:', avatarUrl);
      }
    }

    // If no Tavus URL found, provide a demo image
    if (!avatarUrl) {
      console.log('⚠️ No avatar URL found in Tavus response, using demo image');
      
      // Use a high-quality AI avatar image for demo purposes
      avatarUrl = "https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2";
      isStaticImage = true;
      
      console.log('🖼️ Using demo image URL:', avatarUrl);

      return res.json({ 
        success: true, 
        avatarUrl: avatarUrl,
        personaId: personaId,
        timestamp: new Date().toISOString(),
        isDemo: true,
        isStaticImage: true,
        message: "Using demo image - Tavus avatar URL not found in API response",
        // Include debug info in development
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            tavusResponse: avatarData,
            availableFields: Object.keys(avatarData || {})
          }
        })
      });
    }

    console.log(`${isStaticImage ? '🖼️' : '🎬'} Avatar URL found:`, avatarUrl);

    // Return in the format your frontend expects
    res.json({ 
      success: true, 
      avatarUrl: avatarUrl,
      personaId: personaId,
      timestamp: new Date().toISOString(),
      isDemo: false,
      isStaticImage: isStaticImage,
      // Include additional metadata if available
      ...(avatarData.status && { status: avatarData.status }),
      ...(avatarData.created_at && { createdAt: avatarData.created_at })
    });

  } catch (error) {
    console.error('❌ Tavus API error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
      data: typeof error.response?.data === 'string' ? 
        error.response.data.substring(0, 500) + '...' : 
        error.response?.data
    });

    return handleTavusError(error, res, 'avatar', personaId);
  }
});

// GET /avatar/:personaId - Get full avatar data
router.get('/avatar/:personaId', validateTavusApiKey, async (req, res) => {
  const { personaId } = req.params;
  
  console.log('🎭 Tavus Route: Fetching full avatar data for personaId:', personaId);

  if (!personaId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing personaId parameter' 
    });
  }

  try {
    const response = await axios.get(
      `https://tavusapi.com/v2/avatars/${personaId}`, 
      createTavusRequest()
    );

    console.log('✅ Tavus avatars API full data response received');

    res.json({ 
      success: true, 
      avatar: response.data,
      personaId: personaId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus avatars API error:', error.message);
    return handleTavusError(error, res, 'avatar', personaId);
  }
});

// GET /persona/:personaId - Get persona data
router.get('/persona/:personaId', validateTavusApiKey, async (req, res) => {
  const { personaId } = req.params;
  
  console.log('👤 Tavus Route: Fetching persona data for personaId:', personaId);

  if (!personaId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing personaId parameter' 
    });
  }

  try {
    const response = await axios.get(
      `https://tavusapi.com/v2/personas/${personaId}`, 
      createTavusRequest()
    );

    console.log('✅ Tavus personas API response received');

    res.json({ 
      success: true, 
      persona: response.data,
      personaId: personaId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus personas API error:', error.message);
    return handleTavusError(error, res, 'persona', personaId);
  }
});

// GET /personas - List all personas
router.get('/personas', validateTavusApiKey, async (req, res) => {
  console.log('👥 Tavus Route: Fetching all personas');

  try {
    const response = await axios.get(
      'https://tavusapi.com/v2/personas', 
      createTavusRequest()
    );

    console.log('✅ Tavus personas list API response received');
    console.log('📊 Found personas:', response.data?.length || 0);

    res.json({ 
      success: true, 
      personas: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus personas list API error:', error.message);
    return handleTavusError(error, res, 'personas');
  }
});

// GET /avatars - List all avatars
router.get('/avatars', validateTavusApiKey, async (req, res) => {
  console.log('🎭 Tavus Route: Fetching all avatars');

  try {
    const response = await axios.get(
      'https://tavusapi.com/v2/avatars', 
      createTavusRequest()
    );

    console.log('✅ Tavus avatars list API response received');

    res.json({ 
      success: true, 
      avatars: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Tavus avatars list API error:', error.message);
    return handleTavusError(error, res, 'avatars');
  }
});

// Test endpoint to verify API key and connection
router.get('/test', validateTavusApiKey, async (req, res) => {
  console.log('🧪 Tavus Route: Testing API connection');

  try {
    // Try to fetch personas list as a simple test
    const response = await axios.get(
      'https://tavusapi.com/v2/personas', 
      createTavusRequest()
    );

    console.log('✅ Tavus API test successful');

    res.json({ 
      success: true, 
      message: 'Tavus API connection successful',
      apiKeyValid: true,
      timestamp: new Date().toISOString(),
      responseStatus: response.status
    });

  } catch (error) {
    console.error('❌ Tavus API test failed:', error.message);
    return handleTavusError(error, res, 'test');
  }
});

// Centralized error handling for Tavus API errors
function handleTavusError(error, res, resourceType = 'resource', resourceId = null) {
  if (error.code === 'ECONNABORTED') {
    return res.status(408).json({ 
      success: false, 
      error: `Request timeout - Tavus API took too long to respond for ${resourceType}` 
    });
  }

  if (error.response) {
    const status = error.response.status;
    let errorMessage = `Tavus API error for ${resourceType}`;

    switch (status) {
      case 400:
        // Check for specific error messages
        if (error.response.data?.message?.includes('maximum concurrent conversations')) {
          errorMessage = 'Maximum concurrent conversations reached. Please wait a moment and try again.';
        } else {
          errorMessage = resourceId ? 
            `Bad request for ${resourceType} '${resourceId}' - please check the ID format and try again` :
            `Bad request for ${resourceType} - please check your parameters`;
        }
        break;
      case 401:
        errorMessage = 'Invalid Tavus API key - check server configuration';
        break;
      case 404:
        errorMessage = resourceId ? 
          `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} '${resourceId}' not found` :
          `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found`;
        break;
      case 429:
        errorMessage = 'Tavus API rate limit exceeded - please try again later';
        break;
      case 500:
        errorMessage = 'Tavus API server error - please try again later';
        break;
      default:
        errorMessage = `Tavus API error: ${error.response.statusText}`;
    }

    return res.status(status).json({ 
      success: false, 
      error: errorMessage,
      resourceType,
      resourceId,
      // Include debug info in development
      ...(process.env.NODE_ENV === 'development' && {
        debug: {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: typeof error.response.data === 'string' ? 
            error.response.data.substring(0, 500) + '...' : 
            error.response.data
        }
      })
    });
  }

  // Network or other errors
  return res.status(500).json({ 
    success: false, 
    error: `Failed to connect to Tavus API for ${resourceType}`,
    resourceType,
    resourceId
  });
}

module.exports = router;