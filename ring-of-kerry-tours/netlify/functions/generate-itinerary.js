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

    // UPDATED: More concise prompt to fit within token limits while maintaining quality
    const prompt = `Create a complete ${userData.duration}-day Ring of Kerry itinerary for ${userData.travelMonth} 2025.

**TRAVELER PROFILE:**
- ${userData.groupSize} people, €${userData.budget}/person/day budget
- Interests: ${userData.interests?.join(', ') || 'general sightseeing'}
- Pace: ${userData.pace || 'moderate'}
- Accommodation: ${userData.accommodation || 'flexible'}
${userData.dietaryRequirements ? `- DIETARY: ${userData.dietaryRequirements}` : ''}
${userData.accessibilityNeeds ? `- ACCESSIBILITY: ${userData.accessibilityNeeds}` : ''}
${userData.specialRequests ? `- SPECIAL REQUESTS: ${userData.specialRequests}` : ''}

**CRITICAL REQUIREMENTS:**
1. Include 2-3 specific accommodation options for EACH night with exact names, rates, and contact info
2. Every restaurant must specify how dietary requirements "${userData.dietaryRequirements || 'general'}" are accommodated
3. All venues must detail accessibility for "${userData.accessibilityNeeds || 'standard access'}"
4. Stay within €${userData.budget}/day budget per person
5. Cover ALL ${userData.duration} days completely - no partial itineraries

**FORMAT FOR EACH DAY:**

**DAY X: [Location/Theme]**

**ACCOMMODATION FOR TONIGHT:**
🏨 **Option 1:** [Exact Name]
- Rate: €X/night for ${userData.groupSize} people
- Contact: [phone/website]
- Features: [why perfect for their needs]
${userData.dietaryRequirements ? `- Dietary: How they handle "${userData.dietaryRequirements}"` : ''}
${userData.accessibilityNeeds ? `- Accessibility: Specific features for "${userData.accessibilityNeeds}"` : ''}

🏨 **Option 2:** [Alternative]
[Same format]

**MORNING (8:00-12:00):**
[Time] - [Activity with costs and practical details]

**AFTERNOON (12:00-17:00):**
[Time] - [Activity with costs and practical details]

**EVENING (17:00-21:00):**
[Time] - [Activity with costs and practical details]

**ESSENTIAL INSTRUCTIONS:**
- Must be COMPLETE ${userData.duration}-day itinerary
- Every accommodation recommendation must be specific and real
- Address exact dietary requirement: "${userData.dietaryRequirements || 'none'}"
- Address exact accessibility need: "${userData.accessibilityNeeds || 'none'}"
- Include specific costs within €${userData.budget}/day budget
- This must be the complete itinerary - do not ask for continuation

Create the FULL itinerary now:`;

    console.log('Calling Claude API...');

    // RETRY LOGIC: Try up to 2 times if we get truncated responses
    let itinerary = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !itinerary) {
      attempts++;
      console.log(`Attempt ${attempts} of ${maxAttempts}`);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 8192, // INCREASED: Maximum possible tokens
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

        // If this was our last attempt, return error
        if (attempts >= maxAttempts) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: 'AI service error',
              message: errorData.error?.message || 'Failed to generate itinerary'
            })
          };
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const result = await response.json();
      console.log('Claude API successful');

      if (!result.content || !result.content[0] || !result.content[0].text) {
        console.error('Unexpected Claude response format:', result);
        
        if (attempts >= maxAttempts) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: 'Unexpected response format',
              message: 'The AI service returned an unexpected response'
            })
          };
        }
        continue;
      }

      let rawItinerary = result.content[0].text;
      console.log(`Raw itinerary length: ${rawItinerary.length} characters`);

      // ENHANCED: Comprehensive truncation detection and cleanup
      rawItinerary = cleanupItinerary(rawItinerary, userData);

      // ENHANCED: Validate completeness
      if (isItineraryComplete(rawItinerary, userData)) {
        itinerary = rawItinerary;
        console.log('Complete itinerary generated successfully');
      } else {
        console.log(`Attempt ${attempts}: Itinerary appears incomplete, retrying...`);
        if (attempts >= maxAttempts) {
          // Use what we have but add completion note
          itinerary = rawItinerary + '\n\n*This itinerary was generated but may be incomplete. Please verify all details and contact venues directly.*';
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Store in database for sharing (simplified storage)
    let itineraryId = null;
    try {
      itineraryId = `itinerary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('Generated itinerary ID:', itineraryId);
    } catch (dbError) {
      console.error('Database storage error:', dbError);
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

// NEW: Comprehensive cleanup function
function cleanupItinerary(itinerary, userData) {
  let cleaned = itinerary;

  // Remove all continuation prompts and questions
  const continuationPatterns = [
    /\[I can continue with[^\]]*\]/gi,
    /\[Would you like me to[^\]]*\]/gi,
    /\[Should I continue[^\]]*\]/gi,
    /\[Do you want me to[^\]]*\]/gi,
    /\[Let me know if[^\]]*\]/gi,
    /\[I can provide more[^\]]*\]/gi,
    /Would you like me to continue.*?\?/gi,
    /Shall I continue.*?\?/gi,
    /Do you want me to.*?\?/gi,
    /Should I continue.*?\?/gi,
    /Let me know if you.*?\./gi,
    /I can continue with.*?\./gi,
    /Would you like the complete.*?\?/gi
  ];

  continuationPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // Remove trailing incomplete sentences
  cleaned = cleaned.replace(/\n[^A-Z\d\*\-\n]*$/g, '');
  
  // Remove multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

// NEW: Function to validate itinerary completeness
function isItineraryComplete(itinerary, userData) {
  const expectedDays = parseInt(userData.duration);
  
  // Check if all days are present
  const dayPattern = /DAY \d+/gi;
  const dayMatches = itinerary.match(dayPattern);
  
  if (!dayMatches || dayMatches.length < expectedDays) {
    console.log(`Missing days: expected ${expectedDays}, found ${dayMatches ? dayMatches.length : 0}`);
    return false;
  }

  // Check for accommodation sections
  const accommodationPattern = /ACCOMMODATION FOR TONIGHT:|🏨.*?Recommendation/gi;
  const accommodationMatches = itinerary.match(accommodationPattern);
  
  if (!accommodationMatches || accommodationMatches.length < expectedDays - 1) {
    console.log(`Missing accommodations: expected ${expectedDays - 1}, found ${accommodationMatches ? accommodationMatches.length : 0}`);
    return false;
  }

  // Check minimum length (should be substantial for multi-day itinerary)
  const minLength = expectedDays * 800; // Roughly 800 chars per day minimum
  if (itinerary.length < minLength) {
    console.log(`Itinerary too short: ${itinerary.length} chars, expected at least ${minLength}`);
    return false;
  }

  // Check that the last day is actually completed (not cut off)
  const lastDayPattern = new RegExp(`DAY ${expectedDays}[\\s\\S]*?EVENING`, 'i');
  if (!lastDayPattern.test(itinerary)) {
    console.log('Last day appears incomplete - missing evening section');
    return false;
  }

  return true;
}

// Keep all your existing helper functions below...
function getAccommodationStrategy(accommodationType, budget, groupSize) {
  const budgetNum = parseInt(budget);
  const groupNum = parseInt(groupSize);
  
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

function generateDetailedPersonalization(userData) {
  let personalizations = [];
  
  if (parseInt(userData.groupSize) === 1) {
    personalizations.push("🎯 **Solo Travel Optimization:** Since you're traveling alone, I've included opportunities to connect with locals, solo-friendly dining spots with communal tables, and activities where you might meet fellow travelers.");
  } else if (parseInt(userData.groupSize) === 2) {
    personalizations.push("💑 **Couple-Focused Experience:** As a pair, your itinerary emphasizes romantic viewpoints for private moments, intimate dining experiences, and activities that encourage connection.");
  } else {
    personalizations.push(`👥 **Group Dynamic Consideration:** For your group of ${userData.groupSize}, I've ensured all activities accommodate your party size, selected restaurants that handle group bookings well.`);
  }
  
  if (userData.interests && userData.interests.length > 0) {
    personalizations.push(`🎨 **Interest-Driven Selections:** Your passion for ${userData.interests.join(' and ')} has shaped every recommendation.`);
  }
  
  const budget = parseInt(userData.budget);
  if (budget <= 75) {
    personalizations.push("💰 **Budget-Smart Planning:** Your €" + budget + "/day budget has been carefully optimized with insider tips for free experiences and cost-saving strategies.");
  } else if (budget >= 200) {
    personalizations.push("✨ **Premium Experience Curation:** Your generous €" + budget + "/day budget allows for exceptional experiences and unique opportunities.");
  }
  
  if (userData.dietaryRequirements) {
    personalizations.push(`🍽️ **Dietary Requirements Priority:** Your specific requirement for "${userData.dietaryRequirements}" is central to every food recommendation.`);
  }
  
  if (userData.accessibilityNeeds) {
    personalizations.push(`♿ **Accessibility Requirements Priority:** Your specific need for "${userData.accessibilityNeeds}" has been carefully considered for every venue.`);
  }
  
  personalizations.push(`🌤️ **${userData.travelMonth} Travel Optimization:** Your ${userData.travelMonth} timing has influenced activity scheduling and planning.`);
  
  return personalizations.join('\n\n');
}

function generateDietaryStrategy(dietaryRequirements) {
  if (!dietaryRequirements) {
    return "- Diverse dining options will be provided with menu highlights and local specialties featured prominently.";
  }
  
  const dietary = dietaryRequirements.toLowerCase();
  let strategies = [];
  
  if (dietary.includes('vegetarian') || dietary.includes('vegan')) {
    strategies.push("🌱 **Plant-Based Focus:** Every restaurant recommendation includes specific vegetarian/vegan options with local organic options highlighted.");
  }
  
  if (dietary.includes('gluten-free') || dietary.includes('celiac') || dietary.includes('coeliac')) {
    strategies.push("🌾 **Gluten-Free Assurance:** All dining recommendations specify gluten-free options with cross-contamination awareness noted.");
  }
  
  if (dietary.includes('dairy-free') || dietary.includes('lactose')) {
    strategies.push("🥛 **Dairy-Free Navigation:** Each restaurant includes dairy-free alternatives and naturally dairy-free traditional dishes.");
  }
  
  if (dietary.includes('halal')) {
    strategies.push("☪️ **Halal Dining:** Halal-certified restaurants and Muslim-friendly dining options identified.");
  }
  
  if (dietary.includes('kosher')) {
    strategies.push("✡️ **Kosher Considerations:** Kosher-friendly options and vegetarian establishments that accommodate kosher requirements.");
  }
  
  if (dietary.includes('pescatarian')) {
    strategies.push("🐟 **Pescatarian Perfect:** Kerry's coastal location emphasized with fresh seafood restaurants and vegetarian options.");
  }
  
  strategies.push("📞 **Verification Recommended:** Contact information provided for confirming dietary accommodation options.");
  
  return strategies.join('\n');
}

function generateAccessibilityStrategy(accessibilityNeeds) {
  if (!accessibilityNeeds) {
    return "- General accessibility information will be provided for venues and activities.";
  }
  
  const accessibility = accessibilityNeeds.toLowerCase();
  let strategies = [];
  
  if (accessibility.includes('wheelchair') || accessibility.includes('mobility')) {
    strategies.push("♿ **Wheelchair/Mobility Focus:** Detailed wheelchair access, ramp availability, accessible parking, and restroom facilities included for every venue.");
  }
  
  if (accessibility.includes('walking') || accessibility.includes('limited mobility')) {
    strategies.push("🚶 **Limited Walking Accommodation:** Minimized walking distances, seating options, and close parking prioritized.");
  }
  
  if (accessibility.includes('visual') || accessibility.includes('blind') || accessibility.includes('sight')) {
    strategies.push("👁️ **Visual Accessibility:** Tactile and audio experiences, guided assistance, and sensory descriptions emphasized.");
  }
  
  if (accessibility.includes('hearing') || accessibility.includes('deaf')) {
    strategies.push("👂 **Hearing Accessibility:** Visual experiences prioritized with written materials and sign language services noted.");
  }
  
  strategies.push("📞 **Accessibility Verification:** Contact information provided to confirm accessibility features and assistance.");
  strategies.push("🅿️ **Accessible Transportation:** Accessible parking and proximity to entrances prioritized.");
  
  return strategies.join('\n');
}

function generateUniqueExperiences(userData) {
  let experiences = [];
  
  if (!userData.interests || userData.interests.length === 0) {
    return "- Curated blend of iconic Kerry highlights with lesser-known local favorites.";
  }
  
  userData.interests.forEach(interest => {
    switch(interest.toLowerCase()) {
      case 'photography':
        experiences.push("📸 **Photography Treasures:** Secret sunrise spots, golden hour timing, hidden waterfalls, and dramatic compositions.");
        break;
      case 'history':
        experiences.push("🏰 **Historical Deep-Dives:** Archaeological sites, local historians, ancient pathways, and historical connections.");
        break;
      case 'culture':
        experiences.push("🎵 **Cultural Immersion:** Traditional music sessions, Irish language conversations, artisan workshops, and family traditions.");
        break;
      case 'nature':
      case 'hiking':
        experiences.push("🥾 **Nature's Hidden Gems:** Off-trail waterfalls, wildlife spotting, hidden valleys, and unique ecosystems.");
        break;
      case 'food':
      case 'cuisine':
        experiences.push("🍴 **Culinary Adventures:** Farm-to-table experiences, traditional cooking, foraged ingredients, and local producers.");
        break;
      case 'adventure':
        experiences.push("⚡ **Unique Adventures:** Activities leveraging Kerry's geography, seasonal opportunities, and local guides.");
        break;
    }
  });
  
  return experiences.join('\n');
}

function getMonthSpecificGuidance(month) {
  const monthGuidance = {
    'january': "- Winter conditions: Shorter daylight (8:30am-4:30pm), storms possible, indoor alternatives essential",
    'february': "- Late winter: Increasing daylight, stormy weather, fewer crowds, good for indoor experiences",
    'march': "- Early spring: Longer days, variable weather, St. Patrick's celebrations, spring flowers beginning",
    'april': "- Spring weather: Mild temperatures, longer daylight, Easter crowds, good hiking conditions",
    'may': "- Late spring: Pleasant weather, outdoor activities optimal, mild temperatures, spring colors peak",
    'june': "- Early summer: Longest daylight approaching, good weather, tourist season begins",
    'july': "- Peak summer: Warmest temperatures, maximum daylight (5:30am-9:30pm), busiest period",
    'august': "- Late summer: Warm temperatures, busy season, occasional rain, festival season",
    'september': "- Early autumn: Mild temperatures, fewer crowds, stable weather, excellent shoulder season",
    'october': "- Autumn: Cooler temperatures, shorter days, autumn colors, fewer crowds",
    'november': "- Late autumn: Short daylight, cooler weather, few tourists, indoor focus",
    'december': "- Winter: Shortest days (8:30am-4:30pm), cool weather, Christmas festivities"
  };
  
  return monthGuidance[month.toLowerCase()] || "- Weather varies: Pack layers and waterproof clothing";
}

function getBudgetStrategy(budget, interests) {
  const budgetNum = parseInt(budget);
  let strategies = [];
  
  if (budgetNum <= 75) {
    strategies.push("💡 **Budget Maximization:** Free heritage sites, market picnics, happy hours, free trails, community events.");
    strategies.push("🎯 **Value Focus:** Lunch specials, B&B breakfasts, free parking, high impact-to-cost activities.");
  } else if (budgetNum <= 150) {
    strategies.push("⚖️ **Balanced Investment:** Strategic splurges on interest-aligned experiences, budget-conscious routine choices.");
    strategies.push("🎨 **Interest Prioritization:** Higher spending on " + (interests?.[0] || 'key') + " activities.");
  } else {
    strategies.push("✨ **Premium Curation:** Exclusive experiences, private guides, fine dining, unique accommodations.");
    strategies.push("🏆 **Memorable Moments:** Investment in once-in-a-lifetime Kerry experiences.");
  }
  
  return strategies.join('\n');
}
