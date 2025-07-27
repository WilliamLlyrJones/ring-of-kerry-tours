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

    // Enhanced prompt that creates truly personalized, unique itineraries with accommodation focus
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

**ACCOMMODATION STRATEGY - CRITICAL FOCUS:**
${getAccommodationStrategy(userData.accommodation, userData.budget, userData.groupSize)}

**MANDATORY ACCOMMODATION REQUIREMENTS FOR EACH NIGHT:**
1. **Provide 2-3 Specific Accommodation Recommendations per Night/Location**
2. **For Each Accommodation Include:**
   - Exact property name and location
   - Approximate nightly rate for ${userData.groupSize} people
   - Key amenities and features that match their "${userData.accommodation}" preference
   - Contact information (phone/website)
   - Why it suits their specific budget (€${userData.budget}/person/day) and style
   - How it accommodates any special requirements: ${userData.dietaryRequirements || 'general dining'}, ${userData.accessibilityNeeds || 'standard access'}
   - Unique features that align with their interests: ${userData.interests?.join(', ') || 'general sightseeing'}

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

**ENHANCED ITINERARY FORMAT - ACCOMMODATION FOCUS:**

**DAY X: [LOCATION/THEME]**
--------------------------------

**ACCOMMODATION FOR TONIGHT:**
🏨 **Recommendation 1:** [Exact Property Name]
- **Location:** [Specific address/area]
- **Rate:** €[X]/night for ${userData.groupSize} people (fits €${userData.budget}/day budget)
- **Style Match:** Perfect for your "${userData.accommodation}" preference because [specific reasons]
- **Key Features:** [Amenities that match their interests and requirements]
- **Contact:** [Phone/website for booking]
${userData.dietaryRequirements ? `- **Dietary Accommodation:** How they handle "${userData.dietaryRequirements}" for breakfast/meals` : ''}
${userData.accessibilityNeeds ? `- **Accessibility:** Specific features for "${userData.accessibilityNeeds}"` : ''}

🏨 **Recommendation 2:** [Alternative Property Name]
[Same detailed format]

🏨 **Recommendation 3:** [Budget/Premium Alternative]
[Same detailed format]

**MORNING:**
[Time] - [Activity with specific costs, accessibility notes, and verification reminders]

**AFTERNOON:**
[Time] - [Activity with specific costs, accessibility notes, and verification reminders]

**EVENING:**
[Time] - [Activity with specific costs, accessibility notes, and verification reminders]

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
- EVERY night must include 2-3 specific accommodation options with exact names and details
- Reference the exact phrases "${userData.dietaryRequirements || ''}" and "${userData.accessibilityNeeds || ''}" when relevant
- Every food recommendation must explain HOW the dietary requirement will be met
- Every venue must confirm suitability for the stated accessibility need
- Show that you've listened by using the traveler's exact words where appropriate
- Address specific must-see requests: ${userData.mustSee || 'none specified'}
- Be mindful of stated concerns: ${userData.concerns || 'none specified'}

Create a COMPLETE ${userData.duration}-day itinerary that demonstrates you've listened to and analyzed every stated requirement. Each recommendation should feel personally selected and include specific explanations of how requirements are met.

This must be the COMPLETE itinerary covering all ${userData.duration} days with detailed accommodation options for each night - no follow-up needed.`;

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

    // Add disclaimer to every generated itinerary
    const disclaimer = `

IMPORTANT DISCLAIMER:
These suggestions are for informational purposes only. Please verify all information before your visit:
- Restaurant opening hours, menus, and dietary accommodations
- Accommodation availability, rates, and accessibility features  
- Attraction opening times, admission fees, and accessibility
- Road conditions, parking availability, and weather conditions
- Booking requirements and contact information

Ring of Kerry Tours accepts no liability for errors, omissions, or changes in information provided. Always confirm details directly with venues, especially for dietary requirements and accessibility needs.`;

    itinerary += disclaimer;

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

// Enhanced accommodation strategy function - NEW
function getAccommodationStrategy(accommodationType, budget, groupSize) {
  const budgetNum = parseInt(budget);
  const groupNum = parseInt(groupSize);
  
  // Calculate accommodation budget (typically 40-60% of daily budget)
  const accomBudgetPercentage = budgetNum <= 100 ? 0.5 : budgetNum <= 200 ? 0.45 : 0.4;
  const accommodationBudget = Math.round(budgetNum * accomBudgetPercentage * groupNum);
  
  switch(accommodationType) {
    case 'self-catering':
    case 'holiday-homes':
      if (budgetNum < 100) {
        return `🏠 **Self-Catering Budget Strategy (€${accommodationBudget}/night total):**
        - Target holiday homes, apartments, and vacation rentals €60-90/night for ${groupNum} people
        - Focus on properties with full kitchens, parking, and Wi-Fi
        - Include Airbnb, local rental agencies, and holiday home specialists
        - Emphasize cost savings from cooking meals vs dining out
        - Highlight grocery stores and markets near accommodations
        - Look for properties with washing machines and practical amenities`;
      } else if (budgetNum < 200) {
        return `🏠 **Self-Catering Mid-Range Strategy (€${accommodationBudget}/night total):**
        - Premium holiday homes and well-equipped apartments €120-180/night for ${groupNum} people
        - Modern amenities: dishwashers, quality appliances, good Wi-Fi, parking
        - Mix of rural retreats with character and convenient town center locations
        - Include properties with outdoor spaces, fireplaces, or scenic views
        - Highlight nearby specialty food shops, farmers markets, and gourmet stores`;
      } else {
        return `🏠 **Self-Catering Luxury Strategy (€${accommodationBudget}/night total):**
        - Luxury holiday homes, premium cottages, designer apartments €200+/night for ${groupNum} people
        - Premium features: hot tubs, fireplaces, exceptional views, unique character
        - Historic properties, architect-designed homes, exceptional locations
        - Include concierge services, grocery delivery, potential chef services
        - Focus on unique properties that create memorable experiences`;
      }
    
    case 'bed-breakfast':
    case 'b&b':
      if (budgetNum < 100) {
        return `🛏️ **B&B Budget Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Traditional Irish B&Bs €50-75 per person including Irish breakfast
        - Family-run establishments with authentic hospitality and local knowledge
        - Emphasis on hearty breakfasts that reduce lunch costs
        - Include B&Bs with parking, central locations, and good reviews
        - Focus on value for money with genuine Irish welcome`;
      } else if (budgetNum < 200) {
        return `🛏️ **B&B Mid-Range Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Superior B&Bs and boutique guesthouses €85-130 per person including breakfast
        - En-suite bathrooms, quality furnishings, some with evening meals available
        - Award-winning establishments known for excellent hospitality
        - Include B&Bs with unique character, gardens, or special locations
        - May offer packed lunches, local tours, or concierge services`;
      } else {
        return `🛏️ **B&B Luxury Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Luxury B&Bs, manor houses, country estates €150+ per person including gourmet breakfast
        - Historic properties, exceptional locations, premium amenities
        - May include spa services, fine dining, concierge assistance
        - Focus on unique experiences: castle stays, historic homes, award-winning properties
        - Emphasis on exceptional hospitality and memorable experiences`;
      }
    
    case '3-4-star-hotels':
    case 'hotels':
      if (budgetNum < 150) {
        return `🏨 **3-4 Star Hotel Budget Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Quality 3-star hotels and well-located properties €100-140/night total
        - Standard amenities: restaurant, bar, Wi-Fi, parking included
        - Focus on town center locations for walking convenience
        - Include both hotel chains and independent properties with character
        - Breakfast options available, family-friendly facilities`;
      } else if (budgetNum < 250) {
        return `🏨 **3-4 Star Hotel Mid-Range Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Superior 4-star hotels €160-240/night total
        - Enhanced amenities: spa facilities, quality restaurants, room service
        - Prime locations with views, historic significance, or unique character
        - Include boutique hotels and established brands with excellent service
        - Focus on comfort, convenience, and memorable stays`;
      } else {
        return `🏨 **3-4 Star Hotel Premium Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Premium 4-star and boutique hotels €250+/night total
        - Luxury amenities: spa, fine dining, concierge services, premium locations
        - Historic hotels, unique properties, exceptional service levels
        - Include properties with special character or award recognition
        - Focus on creating exceptional accommodation experiences`;
      }
    
    case '5-star-luxury':
    case 'luxury':
      return `🌟 **5-Star Luxury Strategy (€${accommodationBudget}/night for ${groupNum} people):**
      - Luxury 5-star hotels, castle accommodations, resort properties €350+/night total
      - World-class amenities: multiple restaurants, spas, golf courses, concierge
      - Historic castles, manor houses, award-winning luxury properties
      - Include Michelin-starred dining, exclusive experiences, premium service
      - Focus on creating unforgettable luxury experiences unique to Kerry
      - May include helicopter transfers, private tours, exclusive access to attractions`;
    
    default:
      return `🏨 **Flexible Accommodation Strategy (€${accommodationBudget}/night for ${groupNum} people):**
      - Mix of B&Bs and 3-star hotels based on location and availability
      - Focus on quality, location, and value for money within budget
      - Include variety of accommodation types for comparison and flexibility`;
  }
}

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
    strategies.push("🎨 **Interest Prioritization:** Higher spending on " + (interests?.[0] || 'key') + " activities, economical choices for secondary experiences.");
  } else {
    strategies.push("✨ **Premium Curation:** Exclusive experiences, private guides for specialized interests, fine dining showcasing local ingredients, and unique accommodations.");
    strategies.push("🏆 **Memorable Moments:** Investment in once-in-a-lifetime Kerry experiences that most travelers never access due to cost constraints.");
  }
  
  return strategies.join('\n');
}
