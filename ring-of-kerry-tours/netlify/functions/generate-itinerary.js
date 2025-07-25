exports.handler = async (event, context) => {
  console.log('Function starting...');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('Parsing request body...');
    const body = JSON.parse(event.body);
    const userData = body.userData;

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Server configuration error',
          message: 'API key not configured'
        })
      };
    }

    const required = ['groupSize', 'duration', 'travelMonth', 'budget'];
    const missing = required.filter(field => !userData[field]);
    
    if (missing.length > 0) {
      console.log('Missing required fields:', missing);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields',
          missingFields: missing
        })
      };
    }

    const prompt = `Create a detailed ${userData.duration}-day Ring of Kerry itinerary for ${userData.groupSize} people visiting in ${userData.travelMonth}. Budget: €${userData.budget} per person per day. Interests: ${userData.interests?.join(', ') || 'general sightseeing'}. Include day-by-day schedule with specific times, exact locations, restaurant recommendations with prices, driving directions, and weather backup plans.`;

    console.log('Calling Claude API...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    console.log('Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error response:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'AI service error',
          message: errorData.error?.message || 'Failed to generate itinerary'
        })
      };
    }

    const result = await response.json();
    console.log('Claude API successful');

    if (!result.content || !result.content[0] || !result.content[0].text) {
      console.error('Unexpected Claude response format:', result);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Unexpected response format',
          message: 'The AI service returned an unexpected response'
        })
      };
    }

    const itinerary = result.content[0].text;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itinerary,
        userData
      })
    };

  } catch (error) {
    console.error('Function error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
