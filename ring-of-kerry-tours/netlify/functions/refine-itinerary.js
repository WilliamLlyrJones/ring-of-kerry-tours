// netlify/functions/refine-itinerary.js - API function to refine existing itineraries

import { getItinerary, storeRefinement, logUsage } from '../../src/utils/database.js';

export async function handler(event, context) {
  // CORS headers for web requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const startTime = Date.now();
  let tokensUsed = 0;
  let sessionId, itineraryId;

  try {
    // Parse request body
    const { itineraryId: requestItineraryId, feedback, sessionId: requestSessionId } = JSON.parse(event.body);
    
    itineraryId = requestItineraryId;
    sessionId = requestSessionId;

    console.log('Refining itinerary:', itineraryId, 'for session:', sessionId);

    // Validate required fields
    if (!itineraryId || !feedback) {
      await logUsage({
        sessionId,
        action: 'refine',
        success: false
      });

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing itineraryId or feedback',
          message: 'Both itinerary ID and feedback are required to refine an itinerary.'
        })
      };
    }

    // Get original itinerary from database
    console.log('Retrieving original itinerary...');
    const originalData = await getItinerary(itineraryId);
    
    if (!originalData) {
      await logUsage({
        sessionId,
        action: 'refine',
        success: false
      });

      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Itinerary not found',
          message: 'The requested itinerary could not be found. It may have been deleted or the ID is incorrect.'
        })
      };
    }

    // Build refinement prompt
    const refinementPrompt = buildRefinementPrompt(originalData, feedback);
    console.log('Refinement prompt built, calling Claude API...');

    // Call Claude API for refinement
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: refinementPrompt
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API error during refinement:', errorData);
      throw new Error(`Claude API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    const refinedItinerary = result.content[0].text;
    tokensUsed = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);

    console.log('Claude API refinement successful, tokens used:', tokensUsed);

    // Store refinement in database
    const newVersion = originalData.version + 1;
    await storeRefinement(itineraryId, feedback, refinedItinerary, newVersion);

    // Log successful refinement
    await logUsage({
      sessionId,
      action: 'refine',
      tokensUsed,
      success: true
    });

    console.log('Itinerary refined successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itineraryId,
        itinerary: refinedItinerary,
        version: newVersion,
        message: 'Your itinerary has been successfully updated based on your feedback!'
      })
    };

  } catch (error) {
    console.error('Error refining itinerary:', error);

    // Log failed refinement
    if (sessionId) {
      await logUsage({
        sessionId,
        action: 'refine',
        tokensUsed,
        success: false
      });
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to refine itinerary',
        message: 'We encountered an error while updating your itinerary. Please try again, and if the problem persists, contact our support team.'
      })
    };
  }
}

// Build refinement prompt for Claude
function buildRefinementPrompt(originalData, feedback) {
  const { itinerary_text, user_data, duration, travel_month } = originalData;
  
  return `You are an expert Irish tourism consultant specializing in the Ring of Kerry. A traveler has reviewed their itinerary and provided feedback for improvements.

ORIGINAL TRAVELER CONTEXT:
- Duration: ${duration} days in the Ring of Kerry
- Month: ${travel_month} 2025
- Group: ${getGroupContext(user_data)}
- Budget: €${user_data.budget} per person per day
- Interests: ${formatUserInterests(user_data.interests)}
- Activity Level: ${getActivityContext(user_data.activityLevel)}
- Special Needs: ${user_data.specialNeeds || 'None specified'}
- Transportation: ${user_data.transport}

TRAVELER FEEDBACK:
"${feedback}"

ORIGINAL ITINERARY:
${itinerary_text}

REFINEMENT INSTRUCTIONS:
Based on the traveler's feedback, please modify the itinerary while maintaining:
- The same ${duration}-day structure
- The €${user_data.budget} per person daily budget
- Consideration for their activity level and special needs
- The ${travel_month} seasonal context

Make specific changes that directly address their feedback. If they want:
- "More indoor activities" → Add museums, cultural centers, covered markets, traditional pubs
- "Less driving" → Consolidate locations, suggest walking tours, reduce daily distances
- "More authentic experiences" → Replace tourist attractions with local pubs, traditional music sessions, local markets
- "More time at each place" → Reduce number of stops, extend time allocations
- "Better food options" → Upgrade restaurant recommendations, add food tours, local specialties

Provide the complete updated itinerary (not just changes) in the same detailed format as the original, with:
- Clear day-by-day structure
- Specific times and locations
- Restaurant recommendations with prices
- Driving/transport details
- Weather backup options

At the end, briefly explain what changes were made and why they address the feedback.`;
}

// Helper functions for refinement prompts
function getGroupContext(userData) {
  const { groupSize, ageRange } = userData;
  
  if (groupSize === '2') {
    return `Couple in their ${ageRange}`;
  }
  
  const groupMap = {
    '3-4': 'Small group',
    '5-8': 'Large family/group', 
    '9+': 'Tour group'
  };
  
  return `${groupMap[groupSize] || 'Group'} (${ageRange})`;
}

function formatUserInterests(interests) {
  if (!interests || interests.length === 0) {
    return 'General sightseeing';
  }
  
  const interestMap = {
    'scenery': 'scenic views',
    'history': 'Irish history',
    'culture': 'traditional culture', 
    'food': 'local cuisine',
    'adventure': 'outdoor activities',
    'photography': 'photography',
    'shopping': 'local crafts',
    'relaxation': 'relaxation'
  };
  
  return interests.map(i => interestMap[i] || i).join(', ');
}

function getActivityContext(activityLevel) {
  const levels = {
    '1': 'Low activity (easy walking only)',
    '2': 'Light activity',
    '3': 'Moderate activity',
    '4': 'High activity (hiking/adventures)',
    '5': 'Very high activity (challenging hikes)'
  };
  return levels[activityLevel] || 'Moderate activity';
}

// Additional helper function to handle common refinement requests
export function parseCommonRefinements(feedback) {
  const commonRequests = {
    indoor: /indoor|museum|inside|rain|weather|covered/i.test(feedback),
    lessDriving: /less driving|too much driving|reduce travel|shorter distances/i.test(feedback),
    moreTime: /more time|too rushed|slow down|longer at each/i.test(feedback),
    moreFood: /food|restaurant|dining|eat|cuisine|local dishes/i.test(feedback),
    moreMusic: /music|traditional|pub|session|irish culture/i.test(feedback),
    moreAuthentic: /authentic|local|off beaten path|hidden gems|real ireland/i.test(feedback),
    moreShopping: /shopping|crafts|souvenirs|markets/i.test(feedback),
    accessibility: /accessible|wheelchair|mobility|walking|stairs/i.test(feedback)
  };
  
  return commonRequests;
}