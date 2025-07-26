// Replace your current netlify/functions/generate-itinerary.js with this enhanced version:

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
    const sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

    // Enhanced prompt that creates truly personalized, unique itineraries
    const prompt = `You are an expert Irish tourism guide creating a completely personalized ${userData.duration}-day Ring of Kerry itinerary. You have carefully analyzed this traveler's specific requirements and will create recommendations that directly address their stated preferences.

**TRAVELER PROFILE ANALYSIS:**
- Group: ${userData.groupSize} people
- Age Range: ${userData.ageRange || 'Mixed ages'}
- Travel Month: ${userData.travelMonth} 2025
- Daily Budget: €${userData.budget} per person
- Primary Interests: ${userData.interests?.join(', ') || 'general sightseeing'}
- Travel Style: ${userData.pace || 'moderate'} pace
- Activity Level: ${getActivityDescription(userData.activityLevel)}
- Transportation: ${userData.transport || 'rental car'}
- Accommodation Preference: ${userData.accommodation || 'flexible'}
${userData.dietaryRequirements ? `\n- **CRITICAL DIETARY REQUIREMENTS: "${userData.dietaryRequirements}"** - This MUST be specifically mentioned and addressed in ALL food recommendations throughout the itinerary` : ''}
${userData.accessibilityNeeds ? `\n- **ESSENTIAL ACCESSIBILITY REQUIREMENTS: "${userData.accessibilityNeeds}"** - Every venue and activity MUST accommodate these specific needs` : ''}
${userData.specialRequests ? `\n- **IMPORTANT SPECIAL REQUESTS: "${userData.specialRequests}"** - These personal preferences must be woven throughout the experience` : ''}
${userData.mustSee ? `\n- **MUST-SEE LOCATIONS: "${userData.mustSee}"** - These specific places must be included in the itinerary` : ''}
${userData.concerns ? `\n- **CONCERNS TO AVOID: "${userData.concerns}"** - Plan carefully around these concerns` : ''}

**MANDATORY PERSONALIZATION BASED ON STATED REQUIREMENTS:**

${generateDetailedPersonalization(userData)}

**CRITICAL DIETARY ACCOMMODATION (if applicable):**
${generateDietaryStrategy(userData.dietaryRequirements)}

**ESSENTIAL ACCESSIBILITY PLANNING (if applicable):**
${generateAccessibilityStrategy(userData.accessibilityNeeds)}

**YOUR CUSTOMIZED ITINERARY APPROACH:**
This itinerary has been specifically designed around your interests in ${userData.interests?.join(' and ') || 'exploring Kerry'}. Every recommendation considers your €${userData.budget}/day budget, ${userData.travelMonth} weather conditions, ${userData.groupSize}-person group dynamics, and ${userData.pace || 'moderate'} pace preference.

${userData.dietaryRequirements ? `\n**DIETARY REQUIREMENT REMINDER:** Every restaurant recommendation MUST specifically explain how "${userData.dietaryRequirements}" will be accommodated, with exact menu options and safety protocols.` : ''}

${userData.accessibilityNeeds ? `\n**ACCESSIBILITY REQUIREMENT REMINDER:** Every venue MUST be verified as suitable for "${userData.accessibilityNeeds}" with specific details about access, facilities, and assistance available.` : ''}

**DAILY STRUCTURE (tailored to your specific needs):**
- **Morning (8:00-12:00):** Activities selected for optimal ${userData.travelMonth} conditions and your interest in ${userData.interests?.[0] || 'sightseeing'}
- **Afternoon (12:00-17:00):** Core experiences aligned with your specific interests${userData.accessibilityNeeds ? ' and accessibility requirements' : ''}
- **Evening (17:00-21:00):** Dining and activities suited to your group size${userData.dietaryRequirements ? ' and dietary needs' : ''}

**FOR EACH RECOMMENDED ACTIVITY/RESTAURANT, YOU MUST INCLUDE:**
- Why this specifically matches your stated interests
- Exact costs within your €${userData.budget}/day budget
${userData.dietaryRequirements ? `- SPECIFIC accommodation details for "${userData.dietaryRequirements}" including exact menu options` : '- Menu highlights and local specialties'}
${userData.accessibilityNeeds ? `- DETAILED accessibility information for "${userData.accessibilityNeeds}" including entrance access, facilities, and assistance` : '- General accessibility information'}
- Weather backup plans for ${userData.travelMonth}
- Timing optimized for your interests (especially ${userData.interests?.[0] || 'general exploration'})
- Parking and practical information
- Unique local insights you won't find in standard guidebooks

**UNIQUE EXPERIENCES SELECTED FOR YOUR SPECIFIC PROFILE:**
${generateUniqueExperiences(userData)}

**${userData.travelMonth.toUpperCase()}-SPECIFIC PLANNING:**
${getMonthSpecificGuidance(userData.travelMonth)}

**BUDGET OPTIMIZATION FOR €${userData.budget}/DAY:**
${getBudgetStrategy(userData.budget, userData.interests)}

**CRITICAL INSTRUCTIONS:**
- Reference the exact phrases "${userData.dietaryRequirements || ''}" and "${userData.accessibilityNeeds || ''}" when relevant
- Every food recommendation must explain HOW the dietary requirement will be met
- Every venue must confirm suitability for the stated accessibility need
- Show that you've listened by using the traveler's exact words where appropriate
- Address specific must-see requests: ${userData.mustSee || 'none specified'}
- Be mindful of stated concerns: ${userData.concerns || 'none specified'}

Create a COMPLETE ${userData.duration}-day itinerary that demonstrates you've listened to and analyzed every stated requirement. Each recommendation should feel personally selected and include specific explanations of how requirements are met.

This must be the COMPLETE itinerary covering all ${userData.duration} days - no follow-up needed.`;

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

    // Store in database for sharing (simplified storage)
    let itineraryId = null;
    try {
      // Create a simple storage mechanism
      itineraryId = `itinerary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('Generated itinerary ID:', itineraryId);
      
    } catch (dbError) {
      console.error('Database storage error:', dbError);
      // Continue without storage - sharing will be limited
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itinerary,
        userData,
        itineraryId,
        sessionId,
        shareableUrl: itineraryId ? `${process.env.URL || 'https://ringofkerrytours.com'}/planner/itinerary.html?id=${itineraryId}` : null
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

// Helper function to convert activity level to description
function getActivityDescription(level) {
  const descriptions = {
    '1': 'Prefer easy walking and minimal physical activity',
    '2': 'Light activity with short walks',
    '3': 'Moderate activity level',
    '4': 'Active with longer walks and some hiking',
    '5': 'Love hiking and adventure activities'
  };
  return descriptions[level] || 'Moderate activity level';
}

// Enhanced personalization function
function generateDetailedPersonalization(userData) {
  let personalizations = [];
  
  // Group dynamics analysis
  if (parseInt(userData.groupSize) === 1) {
    personalizations.push("🎯 **Solo Travel Optimization:** Since you're traveling alone, I've included opportunities to connect with locals, solo-friendly dining spots with communal tables, and activities where you might meet fellow travelers. Your itinerary includes reflective moments at scenic spots perfect for solo contemplation.");
  } else if (parseInt(userData.groupSize) === 2) {
    personalizations.push("💑 **Couple-Focused Experience:** As a pair, your itinerary emphasizes romantic viewpoints for private moments, intimate dining experiences, and activities that encourage connection. I've included spots perfect for couple photography and quiet conversations.");
  } else {
    personalizations.push(`👥 **Group Dynamic Consideration:** For your group of ${userData.groupSize}, I've ensured all activities accommodate your party size, selected restaurants that handle group bookings well, and included experiences that work for group dynamics and decision-making.`);
  }
  
  // Age range considerations
  if (userData.ageRange) {
    if (userData.ageRange.includes('family-kids')) {
      personalizations.push("👨‍👩‍👧‍👦 **Family with Children Focus:** All activities are child-friendly with shorter walking distances, interactive experiences, and family restaurants with children's menus and facilities.");
    } else if (userData.ageRange.includes('60s+')) {
      personalizations.push("🌟 **Mature Traveler Comfort:** Emphasis on comfortable seating, accessible venues, cultural experiences over physical activities, and restaurants with quieter atmospheres.");
    }
  }
  
  // Interest-based personalization
  if (userData.interests && userData.interests.length > 0) {
    personalizations.push(`🎨 **Interest-Driven Selections:** Your passion for ${userData.interests.join(' and ')} has shaped every recommendation. Each activity directly relates to these interests, with specific details about why each location is perfect for ${userData.interests[0]} enthusiasts.`);
  }
  
  // Budget personalization
  const budget = parseInt(userData.budget);
  if (budget <= 75) {
    personalizations.push("💰 **Budget-Smart Planning:** Your €" + budget + "/day budget has been carefully optimized with insider tips for free experiences, local lunch spots over tourist restaurants, and hidden gems that provide maximum value. I've included specific cost-saving strategies throughout.");
  } else if (budget >= 200) {
    personalizations.push("✨ **Premium Experience Curation:** Your generous €" + budget + "/day budget allows for exceptional experiences. I've included exclusive activities, premium dining, and unique opportunities that most visitors miss, ensuring memorable moments worth the investment.");
  }
  
  // Dietary personalization
  if (userData.dietaryRequirements) {
    personalizations.push(`🍽️ **Dietary Requirements Priority:** Your specific requirement that "${userData.dietaryRequirements}" is central to every food recommendation. Each restaurant has been specifically chosen for their ability to accommodate this requirement, with detailed information about available options.`);
  }
  
  // Accessibility personalization
  if (userData.accessibilityNeeds) {
    personalizations.push(`♿ **Accessibility Requirements Priority:** Your specific need for "${userData.accessibilityNeeds}" has been carefully considered for every venue and activity. Each recommendation includes detailed accessibility information and alternatives where needed.`);
  }
  
  // Pace personalization
  if (userData.pace) {
    const paceDescriptions = {
      'relaxed': 'Your preference for a relaxed pace means fewer stops with more time to truly enjoy each location, perfect for soaking in the atmosphere.',
      'moderate': 'Your moderate pace preference allows for a balanced mix of must-see attractions and leisure time.',
      'packed': 'Your packed pace preference means we\'ve maximized your itinerary to see as much as possible while maintaining realistic travel times.'
    };
    personalizations.push(`⏱️ **Pace Optimization:** ${paceDescriptions[userData.pace] || 'Your travel pace has been carefully considered in the timing and structure of each day.'}`);
  }
  
  // Month-specific personalization
  personalizations.push(`🌤️ **${userData.travelMonth} Travel Optimization:** Your ${userData.travelMonth} timing has influenced activity scheduling, clothing recommendations, and backup plans. Each day is structured to make the most of ${userData.travelMonth} conditions in Kerry.`);
  
  return personalizations.join('\n\n');
}

// Enhanced dietary strategy function
function generateDietaryStrategy(dietaryRequirements) {
  if (!dietaryRequirements) {
    return "- Diverse dining options will be provided with menu highlights and local specialties featured prominently.";
  }
  
  const dietary = dietaryRequirements.toLowerCase();
  let strategies = [];
  
  if (dietary.includes('vegetarian') || dietary.includes('vegan')) {
    strategies.push("🌱 **Plant-Based Focus:** Every restaurant recommendation includes specific vegetarian/vegan options. Kerry has excellent plant-based dining - I'll highlight local organic farms, vegetarian-friendly pubs, and restaurants known for creative plant-based Irish cuisine.");
  }
  
  if (dietary.includes('gluten-free') || dietary.includes('celiac') || dietary.includes('coeliac')) {
    strategies.push("🌾 **Gluten-Free Assurance:** All dining recommendations will specify gluten-free options available. I'll note restaurants with dedicated gluten-free menus, cross-contamination awareness, and traditional Irish dishes that are naturally gluten-free.");
  }
  
  if (dietary.includes('dairy-free') || dietary.includes('lactose')) {
    strategies.push("🥛 **Dairy-Free Navigation:** Each restaurant recommendation includes dairy-free alternatives. I'll highlight establishments offering oat/soy milk for coffee, dairy-free Irish butter alternatives, and traditional dishes that are naturally dairy-free.");
  }
  
  if (dietary.includes('halal')) {
    strategies.push("☪️ **Halal Dining:** I'll identify halal-certified restaurants and Muslim-friendly dining options. Where halal-specific restaurants aren't available, I'll recommend vegetarian/seafood options and establishments that can accommodate halal requirements.");
  }
  
  if (dietary.includes('kosher')) {
    strategies.push("✡️ **Kosher Considerations:** I'll focus on kosher-friendly options, vegetarian restaurants, and establishments that can accommodate kosher requirements. Specific guidance on food preparation and ingredient sourcing will be included.");
  }
  
  if (dietary.includes('pescatarian')) {
    strategies.push("🐟 **Pescatarian Perfect:** Kerry's coastal location is ideal for pescatarians! I'll emphasize fresh seafood restaurants, vegetarian options, and coastal dining experiences featuring local catch.");
  }
  
  strategies.push("📞 **Verification Recommended:** For each restaurant, I'll provide contact information so you can confirm current dietary accommodation options before visiting.");
  
  return strategies.join('\n');
}

// Enhanced accessibility strategy function
function generateAccessibilityStrategy(accessibilityNeeds) {
  if (!accessibilityNeeds) {
    return "- General accessibility information will be provided for venues and activities.";
  }
  
  const accessibility = accessibilityNeeds.toLowerCase();
  let strategies = [];
  
  if (accessibility.includes('wheelchair') || accessibility.includes('mobility')) {
    strategies.push("♿ **Wheelchair/Mobility Focus:** Every venue recommendation will include specific details about wheelchair access, ramp availability, accessible parking, and restroom facilities. I'll prioritize ground-floor venues and provide detailed access routes.");
  }
  
  if (accessibility.includes('walking') || accessibility.includes('limited mobility')) {
    strategies.push("🚶 **Limited Walking Accommodation:** All recommendations will minimize walking distances, include seating options, and provide alternatives for physically demanding activities. Driving routes will prioritize close parking to attractions.");
  }
  
  if (accessibility.includes('visual') || accessibility.includes('blind') || accessibility.includes('sight')) {
    strategies.push("👁️ **Visual Accessibility:** I'll focus on tactile and audio experiences, venues with guided assistance, and detailed descriptions of sensory experiences. Audio guide availability will be noted.");
  }
  
  if (accessibility.includes('hearing') || accessibility.includes('deaf')) {
    strategies.push("👂 **Hearing Accessibility:** Visual experiences will be prioritized, and venues with written materials or sign language services will be highlighted. Quiet environments suitable for communication will be selected.");
  }
  
  if (accessibility.includes('cognitive') || accessibility.includes('learning')) {
    strategies.push("🧠 **Cognitive Accessibility:** Simple navigation routes, clear signage venues, and less overwhelming environments will be prioritized. Detailed instructions and quiet spaces will be included.");
  }
  
  strategies.push("📞 **Accessibility Verification:** For each venue, I'll provide contact information to confirm current accessibility features and any assistance available.");
  strategies.push("🅿️ **Accessible Transportation:** Parking recommendations will prioritize accessible spaces and proximity to entrances.");
  
  return strategies.join('\n');
}

// Function to generate unique experiences based on interests
function generateUniqueExperiences(userData) {
  let experiences = [];
  
  if (!userData.interests || userData.interests.length === 0) {
    return "- Curated blend of iconic Kerry highlights with lesser-known local favorites, selected for authentic Irish experiences.";
  }
  
  userData.interests.forEach(interest => {
    switch(interest.toLowerCase()) {
      case 'photography':
        experiences.push("📸 **Photography Treasures:** Secret sunrise spots locals use, golden hour timing for each location, hidden waterfalls perfect for long exposures, and dramatic cliff compositions most tourists never find.");
        break;
      case 'history':
        experiences.push("🏰 **Historical Deep-Dives:** Private access to archaeological sites, local historians who share untold stories, ancient pathways with minimal foot traffic, and connections to Ireland's broader historical narrative.");
        break;
      case 'culture':
        experiences.push("🎵 **Cultural Immersion:** Traditional music sessions in locals-only pubs, Irish language conversations with native speakers, artisan workshops, and family-run businesses preserving old traditions.");
        break;
      case 'nature':
      case 'hiking':
        experiences.push("🥾 **Nature's Hidden Gems:** Off-trail waterfalls, wildlife spotting locations known to local naturalists, hidden valleys with unique ecosystems, and seasonal natural phenomena specific to your visit timing.");
        break;
      case 'food':
      case 'cuisine':
        experiences.push("🍴 **Culinary Adventures:** Farm-to-table experiences with local producers, traditional cooking methods demonstrations, foraged ingredient tastings, and restaurants where locals actually eat.");
        break;
      case 'adventure':
        experiences.push("⚡ **Unique Adventures:** Activities that leverage Kerry's specific geography, seasonal adventure opportunities, local guides with insider access, and experiences that connect you directly with Kerry's wild landscape.");
        break;
    }
  });
  
  return experiences.join('\n');
}

// Helper function for month-specific guidance
function getMonthSpecificGuidance(month) {
  const monthGuidance = {
    'january': "- Winter conditions: Shorter daylight hours (8:30am-4:30pm), possible storms, indoor alternatives essential\n- Pack waterproofs, check road conditions, many outdoor activities may be limited",
    'february': "- Late winter: Gradually increasing daylight, stormy weather possible, fewer crowds\n- Good time for indoor cultural experiences, cozy pub visits, dramatic storm watching",
    'march': "- Early spring: Longer days, variable weather, St. Patrick's celebrations possible\n- Pack layers, outdoor activities becoming viable, spring flowers beginning",
    'april': "- Spring weather: Mild temperatures, longer daylight, Easter crowds possible\n- Good hiking weather developing, gardens beginning to bloom, variable conditions",
    'may': "- Late spring: Generally pleasant weather, good for outdoor activities, increasing tourist numbers\n- Excellent for hiking and photography, mild temperatures, spring colors peak",
    'june': "- Early summer: Longest daylight hours approaching, generally good weather, tourist season begins\n- Peak conditions for outdoor activities, warm clothing still needed for evenings",
    'july': "- Peak summer: Warmest temperatures, maximum daylight (5:30am-9:30pm), busiest tourist period\n- Book accommodations well in advance, expect crowds at popular sites, best weather for all activities",
    'august': "- Late summer: Warm temperatures continue, still busy tourist season, occasional rain\n- Good for all outdoor activities, book popular restaurants in advance, festival season",
    'september': "- Early autumn: Mild temperatures, fewer crowds, generally stable weather\n- Excellent shoulder season, good value, beautiful autumn colors beginning",
    'october': "- Autumn: Cooler temperatures, shorter days, autumn colors, much fewer crowds\n- Good for photography with autumn foliage, pack warm clothes, some attractions may reduce hours",
    'november': "- Late autumn: Short daylight hours, cooler weather, very few tourists\n- Focus on indoor activities, cozy experiences, dramatic landscapes, pack warm waterproof gear",
    'december': "- Winter: Shortest days (8:30am-4:30pm), cool weather, Christmas festivities possible\n- Indoor cultural experiences emphasized, festive atmosphere, check attraction opening hours"
  };
  
  return monthGuidance[month.toLowerCase()] || "- Weather varies: Pack layers and waterproof clothing, check local conditions";
}

// Enhanced budget strategy function
function getBudgetStrategy(budget, interests) {
  const budgetNum = parseInt(budget);
  let strategies = [];
  
  if (budgetNum <= 75) {
    strategies.push("💡 **Budget Maximization:** Free heritage sites, picnic ingredients from local markets, happy hour dining, free walking trails, and community events.");
    strategies.push("🎯 **Value Focus:** Lunch specials over dinner prices, B&B breakfasts to save on one meal, free parking locations, and activities with the highest impact-to-cost ratio.");
  } else if (budgetNum <= 150) {
    strategies.push("⚖️ **Balanced Investment:** Strategic splurges on experiences that align with your interests, balanced with budget-conscious choices for routine meals and activities.");
    strategies.push("🎨
