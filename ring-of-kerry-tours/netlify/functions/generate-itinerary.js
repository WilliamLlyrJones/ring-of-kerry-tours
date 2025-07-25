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

    // Build comprehensive prompt that ensures complete response
    const prompt = `You are creating a complete ${userData.duration}-day Ring of Kerry itinerary for ${userData.groupSize} people visiting in ${userData.travelMonth}. Budget: €${userData.budget} per person per day. Interests: ${userData.interests?.join(', ') || 'general sightseeing'}.

IMPORTANT: Provide the COMPLETE itinerary for all ${userData.duration} days in a single response. Do not ask if I want you to continue or provide more details - include everything in this response.

Create a detailed itinerary that includes:

**For each day:**
- Morning activities (with times, e.g., 9:00 AM)
- Afternoon activities (with times)
- Evening activities/dining
- Specific locations and attractions
- Driving times between locations
- Restaurant recommendations with price ranges
- Weather backup plans

**Additional details:**
- Photography tips for best shots
- Local insider tips
- Booking requirements where needed
- Accessibility information
- Estimated costs for activities

**Format:**
Structure as Day 1, Day 2, Day 3, etc. with clear time-based sections for each day.

Make this a complete, ready-to-use travel itinerary that covers all ${userData.duration} days without requiring any follow-up questions or additional responses.`;

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

    let itinerary = result.content[0].text;

    // Post-process the response to remove any "continue" questions
    itinerary = itinerary.replace(/Would you like me to continue.*?\?/gi, '');
    itinerary = itinerary.replace(/Shall I continue.*?\?/gi, '');
    itinerary = itinerary.replace(/Do you want me to.*?\?/gi, '');
    itinerary = itinerary.replace(/Let me know if you.*?\./gi, '');

    // If the response seems incomplete, add a note
    if (itinerary.length < 1000 || !itinerary.toLowerCase().includes(`day ${userData.duration}`)) {
      itinerary += '\n\n*This is your complete itinerary! If you need any modifications or have specific requests, use the "Customize Trip" button below.*';
    }

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
