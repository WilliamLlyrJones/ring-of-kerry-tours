// netlify/functions/generate-itinerary.js - Main API function to generate itineraries

import { storeItinerary, logUsage } from '../../src/utils/database.js';

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
  let sessionId, userData, tokensUsed = 0;

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    userData = body.userData;
    sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log('Generating itinerary for session:', sessionId);

    // Validate required fields
    const required = ['groupSize', 'duration', 'travelMonth', 'budget'];
    const missing = required.filter(field => !userData[field]);
    
    if (missing.length > 0) {
      await logUsage({
        sessionId,
        action: 'generate',
        success: false
      });

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields',
          missingFields: missing
        })
      };
    }

    // Build the AI prompt
    const prompt = buildItineraryPrompt(userData);
    console.log('Prompt built, calling Claude API...');

    // Call Claude API
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
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API error:', errorData);
      throw new Error(`Claude API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    const itinerary = result.content[0].text;
    tokensUsed = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);

    console.log('Claude API successful, tokens used:', tokensUsed);

    // Store in database
    const storedItinerary = await storeItinerary({
      sessionId,
      userData,
      itinerary
    });

    // Log successful usage
    await logUsage({
      sessionId,
      action: 'generate',
      tokensUsed,
      success: true
    });

    console.log('Itinerary generated successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itineraryId: storedItinerary.id,
        sessionId,
        itinerary,
        canRefine: true
      })
    };

  } catch (error) {
    console.error('Error generating itinerary:', error);

    // Log failed usage
    if (sessionId) {
      await logUsage({
        sessionId,
        action: 'generate',
        tokensUsed,
        success: false
      });
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to generate itinerary',
        message: error.message
      })
    };
  }
}

// Build detailed prompt for Claude
function buildItineraryPrompt(userData) {
  const {
    groupSize,
    ageRange,
    duration,
    travelMonth,
    accommodation,
    transport,
    budget,
    interests,
    activityLevel,
    pace,
    specialNeeds,
    mustSee,
    concerns,
    previousVisits,
    drivingComfort
  } = userData;

  // Map user data to descriptive text
  const groupDescription = getGroupDescription(groupSize, ageRange);
  const transportDescription = getTransportDescription(transport, drivingComfort);
  const interestsText = formatInterests(interests);
  const activityText = getActivityLevelText(activityLevel);
  const paceText = getPaceDescription(pace);
  
  return `You are an expert Irish tourism consultant specializing in the Ring of Kerry. Create a detailed ${duration}-day itinerary for ${groupDescription} visiting in ${travelMonth} 2025.

TRAVELER PROFILE:
- Group: ${groupDescription}
- Budget: €${budget} per person per day (excluding accommodation)
- Transportation: ${transportDescription}
- Base: ${getAccommodationText(accommodation)}
- Previous Ireland visits: ${getExperienceText(previousVisits)}

INTERESTS & PREFERENCES:
- Primary interests: ${interestsText}
- Activity level: ${activityText}
- Travel pace: ${paceText}
${mustSee ? `- Must-see requests: ${mustSee}` : ''}
${specialNeeds ? `- Special considerations: ${specialNeeds}` : ''}
${concerns ? `- Concerns to address: ${concerns}` : ''}

${getSeasonalRequirements(travelMonth)}

FORMAT REQUIREMENTS:
- Structure as Day 1, Day 2, Day 3, etc. with clear morning/afternoon/evening sections
- Include specific driving times and distances between locations
- Provide 2-3 restaurant recommendations per day with price ranges (€${getBudgetRange(budget)})
- Suggest backup indoor activities for each day
- Include photography tips for best lighting at key locations
- Note accessibility features at recommended attractions
- Provide realistic timing estimates accounting for photo stops and leisurely pace

PRACTICAL DETAILS:
- All activities should be suitable for ${previousVisits === 'first-time' ? 'first-time Ireland visitors' : 'returning visitors'}
- Include booking requirements and contact information where relevant
- Suggest optimal routes to minimize driving stress
- Consider ${travelMonth} weather patterns and daylight hours
- Ensure recommendations match the specified budget range

Please create a comprehensive, practical itinerary that feels personal and achievable.`;
}

// Helper functions to format user data
function getGroupDescription(groupSize, ageRange) {
  if (groupSize === '2') {
    return ageRange.includes('family') ? 'a family' : 'an American couple';
  }
  const groupMap = {
    '3-4': 'a small American group',
    '5-8': 'an American family/group', 
    '9+': 'an American tour group'
  };
  return groupMap[groupSize] || 'an American group';
}

function getTransportDescription(transport, drivingComfort = []) {
  const transportMap = {
    'rental-car': 'Rental car (self-drive)',
    'private-driver': 'Private driver/guide',
    'bus-tours': 'Organized bus tours',
    'mix': 'Mix of transportation options',
    'unsure': 'Flexible transportation (recommend best option)'
  };
  
  let description = transportMap[transport] || 'Rental car (self-drive)';
  
  if (transport === 'rental-car' && drivingComfort && drivingComfort.length > 0) {
    const comfortLevels = {
      'left-side': 'comfortable with left-side driving',
      'narrow-roads': 'comfortable with narrow roads',
      'hills-winds': 'comfortable with hills and winding roads'
    };
    
    const comforts = drivingComfort.map(c => comfortLevels[c]).filter(Boolean);
    if (comforts.length > 0) {
      description += ` (${comforts.join(', ')})`;
    } else {
      description += ' (prefer main roads and easier driving conditions)';
    }
  }
  
  return description;
}

function formatInterests(interests) {
  if (!interests || interests.length === 0) {
    return 'general sightseeing and cultural experiences';
  }
  
  const interestMap = {
    'scenery': 'scenic drives and viewpoints',
    'history': 'Irish history and heritage sites',
    'culture': 'traditional music and cultural experiences', 
    'food': 'local cuisine and dining experiences',
    'adventure': 'outdoor activities and adventures',
    'photography': 'photography opportunities',
    'shopping': 'local crafts and shopping',
    'relaxation': 'relaxation and leisure activities'
  };
  
  return interests.map(i => interestMap[i] || i).join(', ');
}

function getActivityLevelText(level) {
  const levels = {
    '1': 'Prefer easy walking and minimal physical activity',
    '2': 'Light activity with short walks',
    '3': 'Moderate activity level with some walking',
    '4': 'Active travelers who enjoy hiking and adventure',
    '5': 'Very active - love hiking, long walks, and physical challenges'
  };
  return levels[level] || 'Moderate activity level';
}

function getPaceDescription(pace) {
  const paceMap = {
    'relaxed': 'Relaxed pace - prefer fewer stops with more time at each location',
    'moderate': 'Balanced itinerary with reasonable pacing',
    'packed': 'Packed schedule - want to see as much as possible'
  };
  return paceMap[pace] || 'Balanced itinerary with reasonable pacing';
}

function getAccommodationText(accommodation) {
  const accommMap = {
    'killarney-town': 'Staying in Killarney town center',
    'killarney-outskirts': 'Staying in Killarney area (outside town)',
    'kenmare': 'Staying in Kenmare',
    'sneem': 'Staying in Sneem',
    'waterville': 'Staying in Waterville',
    'cahersiveen': 'Staying in Cahersiveen',
    'multiple': 'Different accommodations each night',
    'unsure': 'Flexible accommodation (recommend best locations)'
  };
  return accommMap[accommodation] || 'Flexible accommodation';
}

function getExperienceText(previousVisits) {
  const expMap = {
    'first-time': 'First time visitors to Ireland',
    'been-elsewhere': 'Have visited other parts of Ireland',
    'kerry-before': 'Have been to Kerry before',
    'frequent': 'Frequent Ireland visitors'
  };
  return expMap[previousVisits] || 'First time visitors to Ireland';
}

function getSeasonalRequirements(month) {
  const seasonal = {
    'January': `JANUARY-SPECIFIC REQUIREMENTS:
- Winter season considerations (shorter days, some attractions may have limited hours)
- Weather-appropriate activities and indoor alternatives
- Recommend layered clothing and waterproof gear
- Note any January-specific events or closures`,
    
    'February': `FEBRUARY-SPECIFIC REQUIREMENTS:
- Late winter conditions (unpredictable weather, shorter daylight)
- Indoor backup plans essential
- Some seasonal attractions may be closed
- Recommend flexible scheduling for weather`,
    
    'March': `MARCH-SPECIFIC REQUIREMENTS:
- Early spring conditions (variable weather, longer days beginning)
- St. Patrick's Day considerations if relevant to travel dates
- Some attractions may have limited spring hours
- Perfect time for fewer crowds`,
    
    'April': `APRIL-SPECIFIC REQUIREMENTS:
- Spring weather (mild but unpredictable, longer daylight hours)
- Easter considerations if relevant to travel dates
- Many attractions reopening with full hours
- Great month for outdoor activities with moderate crowds`,
    
    'May': `MAY-SPECIFIC REQUIREMENTS:
- Late spring conditions (generally mild weather, long daylight hours)
- Peak season beginning - some advance booking recommended
- Excellent month for outdoor activities and photography
- Consider local festivals and events`,
    
    'June': `JUNE-SPECIFIC REQUIREMENTS:
- Early summer conditions (mild weather, very long daylight hours)
- Tourist season in full swing - advance booking recommended
- Perfect weather for outdoor activities
- Consider local summer festivals`,
    
    'July': `JULY-SPECIFIC REQUIREMENTS:
- Peak summer season (warm weather, longest daylight hours, highest crowds)
- Advanced booking essential for popular attractions and restaurants
- Perfect month for all outdoor activities
- Consider local summer festivals and events`,
    
    'August': `AUGUST-SPECIFIC REQUIREMENTS:
- Peak summer season (warm weather, long daylight, very busy)
- Book everything in advance - highest tourist season
- All attractions open with full hours
- Consider local festivals and traditional music sessions`,
    
    'September': `SEPTEMBER-SPECIFIC REQUIREMENTS:
- Early autumn conditions (mild weather, fewer crowds, shorter days beginning)
- Excellent month for travel - good weather with smaller crowds
- Some seasonal attractions may reduce hours
- Perfect for photography with autumn light`,
    
    'October': `OCTOBER-SPECIFIC REQUIREMENTS:
- Autumn conditions (cooler weather, fewer tourists, shorter days)
- Some attractions may have reduced hours or close for season
- Halloween/Samhain cultural considerations
- Great month for cozy pub experiences and indoor activities`,
    
    'November': `NOVEMBER-SPECIFIC REQUIREMENTS:
- Late autumn/early winter (shorter days, unpredictable weather)
- Many seasonal attractions closed or limited hours
- Indoor activities and cultural experiences emphasized
- Fewer crowds but weather backup plans essential`,
    
    'December': `DECEMBER-SPECIFIC REQUIREMENTS:
- Winter season (shortest days, cold weather, many seasonal closures)
- Christmas season activities and traditions
- Limited daylight hours for sightseeing
- Focus on indoor cultural experiences, pubs, and holiday events`
  };
  
  return seasonal[month] || `${month.toUpperCase()}-SPECIFIC REQUIREMENTS:
- Consider seasonal weather patterns and daylight hours for ${month}
- Include weather-appropriate activities and backup plans
- Note any seasonal attraction availability or events`;
}

function getBudgetRange(budget) {
  const budgetNum = parseInt(budget);
  if (budgetNum < 100) return '10-25 per person';
  if (budgetNum < 200) return '15-35 per person';
  if (budgetNum < 300) return '20-45 per person';
  return '25-60 per person';
}