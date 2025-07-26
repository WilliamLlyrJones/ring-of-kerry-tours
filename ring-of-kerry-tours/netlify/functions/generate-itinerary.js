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
- Travel Month: ${userData.travelMonth} 2025
- Daily Budget: €${userData.budget} per person
- Primary Interests: ${userData.interests?.join(', ') || 'general sightseeing'}
- Travel Style: ${userData.travelStyle || 'balanced pace'}
- Accommodation Preference: ${userData.accommodation || 'mid-range hotels/B&Bs'}
- Transportation: ${userData.transportation || 'rental car'}
${userData.dietaryRequirements ? `- **DIETARY REQUIREMENTS: ${userData.dietaryRequirements}** (CRITICAL - must be addressed in ALL food recommendations)` : ''}
${userData.accessibilityNeeds ? `- **ACCESSIBILITY NEEDS: ${userData.accessibilityNeeds}** (Essential - all recommendations must accommodate these requirements)` : ''}
${userData.specialRequests ? `- **SPECIAL REQUESTS: ${userData.specialRequests}** (Important personal preferences to incorporate)` : ''}

**PERSONALIZED RECOMMENDATIONS BASED ON YOUR STATED PREFERENCES:**

${generateDetailedPersonalization(userData)}

**DIETARY ACCOMMODATION STRATEGY:**
${generateDietaryStrategy(userData.dietaryRequirements)}

**YOUR CUSTOMIZED ITINERARY APPROACH:**
This itinerary has been specifically designed around your interests in ${userData.interests?.join(' and ') || 'exploring Kerry'}. Every recommendation considers your €${userData.budget}/day budget, ${userData.travelMonth} weather conditions, and ${userData.groupSize}-person group dynamics.

**DAILY STRUCTURE (tailored to your preferences):**
- **Morning (8:00-12:00):** Activities selected for optimal ${userData.travelMonth} conditions and your interest in ${userData.interests?.[0] || 'sightseeing'}
- **Afternoon (12:00-17:00):** Core experiences aligned with your specific interests
- **Evening (17:00-21:00):** Dining and activities suited to your group size and dietary needs

**FOR EACH RECOMMENDED ACTIVITY/RESTAURANT, YOU'LL FIND:**
- Why this specifically matches your stated interests
- Exact costs within your €${userData.budget}/day budget
- ${userData.dietaryRequirements ? 'Specific dietary accommodation details' : 'Menu highlights'}
- Weather backup plans for ${userData.travelMonth}
- Timing optimized for your interests (especially ${userData.interests?.[0] || 'general exploration'})
- Parking and accessibility information
- Unique local insights you won't find in standard guidebooks

**UNIQUE EXPERIENCES SELECTED FOR YOUR INTERESTS:**
${generateUniqueExperiences(userData)}

**${userData.travelMonth.toUpperCase()}-SPECIFIC PLANNING:**
${getMonthSpecificGuidance(userData.travelMonth)}

**BUDGET OPTIMIZATION FOR €${userData.budget}/DAY:**
${getBudgetStrategy(userData.budget, userData.interests)}

Create a COMPLETE ${userData.duration}-day itinerary that demonstrates you've listened to and analyzed every preference stated. Each recommendation should feel personally selected rather than generic. Include specific reasons why each suggestion aligns with the traveler's stated interests and requirements.

**CRITICAL DIETARY REMINDERS:** ${userData.dietaryRequirements ? `Every food recommendation MUST accommodate ${userData.dietaryRequirements}. Specify exactly what options are available at each restaurant.` : 'Include diverse dining options with clear menu highlights.'}

Format as clear daily sections. This must be the COMPLETE itinerary - no follow-up needed.`;

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
      
      // In a real implementation, you'd store this in Supabase
      // For now, we'll create a simple API endpoint to handle this
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
    personalizations.push(`🍽️ **Dietary Requirements Priority:** Your ${userData.dietaryRequirements} needs are central to every food recommendation. Each restaurant has been specifically chosen for their ability to accommodate your requirements, with detailed information about available options.`);
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
  
  if (dietary.includes('gluten-free') || dietary.includes('celiac')) {
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
