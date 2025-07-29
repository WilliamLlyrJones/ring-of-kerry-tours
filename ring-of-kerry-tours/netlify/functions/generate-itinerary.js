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

    // BALANCED PROMPT: Comprehensive but optimized for 8192 token output
    const prompt = `You are an expert Irish tourism guide creating a completely personalized ${userData.duration}-day Ring of Kerry itinerary. This must be the COMPLETE itinerary covering all ${userData.duration} days.

**TRAVELER PROFILE:**
- Group: ${userData.groupSize} people
- Age Range: ${userData.ageRange || 'Mixed ages'}
- Travel Month: ${userData.travelMonth} 2025
- Daily Budget: €${userData.budget} per person
- Primary Interests: ${userData.interests?.join(', ') || 'general sightseeing'}
- Travel Style: ${userData.pace || 'moderate'} pace
- Activity Level: ${getActivityDescription(userData.activityLevel)}
- Transportation: ${userData.transport || 'rental car'}
- Accommodation Preference: ${userData.accommodation || 'flexible'}
${userData.dietaryRequirements ? `\n- **CRITICAL DIETARY: "${userData.dietaryRequirements}"** - Must be addressed in ALL food recommendations` : ''}
${userData.accessibilityNeeds ? `\n- **ESSENTIAL ACCESSIBILITY: "${userData.accessibilityNeeds}"** - Every venue must accommodate this` : ''}
${userData.specialRequests ? `\n- **SPECIAL REQUESTS: "${userData.specialRequests}"** - Incorporate throughout` : ''}
${userData.mustSee ? `\n- **MUST-SEE: "${userData.mustSee}"** - Must be included` : ''}
${userData.concerns ? `\n- **CONCERNS TO AVOID: "${userData.concerns}"** - Plan around these` : ''}

**ACCOMMODATION STRATEGY:**
${getAccommodationStrategy(userData.accommodation, userData.budget, userData.groupSize)}

**MANDATORY REQUIREMENTS:**
1. **Provide 2-3 Specific Accommodation Options per Night**
2. **Each Accommodation Must Include:**
   - Exact property name and location
   - Approximate rate for ${userData.groupSize} people
   - Contact information (phone/website)
   - Why it suits ${userData.accommodation} preference and €${userData.budget} budget
   - How it accommodates: ${userData.dietaryRequirements || 'general dining'}, ${userData.accessibilityNeeds || 'standard access'}

**PERSONALIZATION BASED ON YOUR REQUIREMENTS:**
${generateDetailedPersonalization(userData)}

**DIETARY STRATEGY:**
${generateDietaryStrategy(userData.dietaryRequirements)}

**ACCESSIBILITY PLANNING:**
${generateAccessibilityStrategy(userData.accessibilityNeeds)}

**${userData.travelMonth.toUpperCase()} OPTIMIZATION:**
${getMonthSpecificGuidance(userData.travelMonth)}

**BUDGET STRATEGY FOR €${userData.budget}/DAY:**
${getBudgetStrategy(userData.budget, userData.interests)}

**ITINERARY FORMAT:**

**DAY X: [LOCATION/THEME]**
--------------------------------

**ACCOMMODATION FOR TONIGHT:**
🏨 **Recommendation 1:** [Exact Property Name]
- **Location:** [Specific address/area]
- **Rate:** €[X]/night for ${userData.groupSize} people
- **Style Match:** Perfect for "${userData.accommodation}" preference because [reasons]
- **Contact:** [Phone/website]
${userData.dietaryRequirements ? `- **Dietary:** How they handle "${userData.dietaryRequirements}"` : ''}
${userData.accessibilityNeeds ? `- **Accessibility:** Features for "${userData.accessibilityNeeds}"` : ''}

🏨 **Recommendation 2:** [Alternative Property]
[Same detailed format]

**MORNING (8:00-12:00):**
[Time] - [Activity with costs, accessibility, dietary notes]

**AFTERNOON (12:00-17:00):**
[Time] - [Activity with costs, accessibility, dietary notes]

**EVENING (17:00-21:00):**
[Time] - [Activity with costs, accessibility, dietary notes]

**UNIQUE EXPERIENCES FOR YOUR INTERESTS:**
${generateUniqueExperiences(userData)}

**CRITICAL INSTRUCTIONS:**
- COMPLETE ${userData.duration}-day itinerary required
- Every recommendation must address "${userData.dietaryRequirements || 'general'}" and "${userData.accessibilityNeeds || 'standard'}"
- Include specific costs within €${userData.budget}/day budget
- Reference exact phrases from traveler requirements
- No follow-up needed - this is the complete itinerary

Create the FULL ${userData.duration}-day itinerary now:`;

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
          'anthropic-version': '2023-06-01',
          // CRITICAL: Add the beta header for 8192 token output
          'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 8192, // Now properly supported with beta header
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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const result = await response.json();
      console.log('Claude API successful');
      console.log('Usage stats:', result.usage);

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
      console.log(`Output tokens used: ${result.usage?.output_tokens || 'unknown'}`);

      // Enhanced cleanup
      rawItinerary = cleanupItinerary(rawItinerary, userData);

      // Validate completeness
      if (isItineraryComplete(rawItinerary, userData)) {
        itinerary = rawItinerary;
        console.log('Complete itinerary generated successfully');
      } else {
        console.log(`Attempt ${attempts}: Itinerary appears incomplete, retrying...`);
        if (attempts >= maxAttempts) {
          // Use what we have but add completion note
          itinerary = rawItinerary + '\n\n*This itinerary was generated but may be incomplete. Please verify all details and contact venues directly.*';
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
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

// Comprehensive cleanup function
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
    /Would you like the complete.*?\?/gi,
    /I'll continue with.*?\./gi,
    /This continues with.*?\./gi
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

// Function to validate itinerary completeness
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
  const minLength = expectedDays * 1000; // Roughly 1000 chars per day minimum
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

// Enhanced accommodation strategy function
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
        - Target holiday homes, apartments, vacation rentals €60-90/night for ${groupNum} people
        - Focus on properties with full kitchens, parking, Wi-Fi
        - Include Airbnb, local rental agencies, holiday home specialists
        - Emphasize cost savings from cooking vs dining out
        - Highlight grocery stores and markets near accommodations`;
      } else if (budgetNum < 200) {
        return `🏠 **Self-Catering Mid-Range Strategy (€${accommodationBudget}/night total):**
        - Premium holiday homes and well-equipped apartments €120-180/night for ${groupNum} people
        - Modern amenities: dishwashers, quality appliances, Wi-Fi, parking
        - Mix of rural retreats and convenient town center locations
        - Include properties with outdoor spaces, fireplaces, scenic views`;
      } else {
        return `🏠 **Self-Catering Luxury Strategy (€${accommodationBudget}/night total):**
        - Luxury holiday homes, premium cottages, designer apartments €200+/night for ${groupNum} people
        - Premium features: hot tubs, fireplaces, exceptional views, unique character
        - Historic properties, architect-designed homes, exceptional locations`;
      }
    
    case 'bed-breakfast':
    case 'b&b':
      if (budgetNum < 100) {
        return `🛏️ **B&B Budget Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Traditional Irish B&Bs €50-75 per person including Irish breakfast
        - Family-run establishments with authentic hospitality and local knowledge
        - Emphasis on hearty breakfasts that reduce lunch costs
        - Include B&Bs with parking, central locations, good reviews`;
      } else if (budgetNum < 200) {
        return `🛏️ **B&B Mid-Range Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Superior B&Bs and boutique guesthouses €85-130 per person including breakfast
        - En-suite bathrooms, quality furnishings, some with evening meals available
        - Award-winning establishments known for excellent hospitality`;
      } else {
        return `🛏️ **B&B Luxury Strategy (€${Math.round(accommodationBudget/groupNum)}/person/night):**
        - Luxury B&Bs, manor houses, country estates €150+ per person including gourmet breakfast
        - Historic properties, exceptional locations, premium amenities
        - May include spa services, fine dining, concierge assistance`;
      }
    
    case '3-4-star-hotels':
    case 'hotels':
      if (budgetNum < 150) {
        return `🏨 **3-4 Star Hotel Budget Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Quality 3-star hotels and well-located properties €100-140/night total
        - Standard amenities: restaurant, bar, Wi-Fi, parking included
        - Focus on town center locations for walking convenience`;
      } else if (budgetNum < 250) {
        return `🏨 **3-4 Star Hotel Mid-Range Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Superior 4-star hotels €160-240/night total
        - Enhanced amenities: spa facilities, quality restaurants, room service
        - Prime locations with views, historic significance, unique character`;
      } else {
        return `🏨 **3-4 Star Hotel Premium Strategy (€${accommodationBudget}/night for ${groupNum} people):**
        - Premium 4-star and boutique hotels €250+/night total
        - Luxury amenities: spa, fine dining, concierge services, premium locations`;
      }
    
    case '5-star-luxury':
    case 'luxury':
      return `🌟 **5-Star Luxury Strategy (€${accommodationBudget}/night for ${groupNum} people):**
      - Luxury 5-star hotels, castle accommodations, resort properties €350+/night total
      - World-class amenities: multiple restaurants, spas, golf courses, concierge
      - Historic castles, manor houses, award-winning luxury properties`;
    
    default:
      return `🏨 **Flexible Accommodation Strategy (€${accommodationBudget}/night for ${groupNum} people):**
      - Mix of B&Bs and 3-star hotels based on location and availability
      - Focus on quality, location, and value within budget`;
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
    personalizations.push("🎯 **Solo Travel:** Opportunities to connect with locals, solo-friendly dining, activities to meet fellow travelers.");
  } else if (parseInt(userData.groupSize) === 2) {
    personalizations.push("💑 **Couple Focus:** Romantic viewpoints, intimate dining, activities that encourage connection.");
  } else {
    personalizations.push(`👥 **Group Dynamic:** All activities accommodate ${userData.groupSize} people, group-friendly restaurants and experiences.`);
  }
  
  // Interest-based personalization
  if (userData.interests && userData.interests.length > 0) {
    personalizations.push(`🎨 **Interest-Driven:** Your passion for ${userData.interests.join(' and ')} shapes every recommendation.`);
  }
  
  // Budget personalization
  const budget = parseInt(userData.budget);
  if (budget <= 75) {
    personalizations.push("💰 **Budget-Smart:** €" + budget + "/day optimized with insider tips, free experiences, cost-saving strategies.");
  } else if (budget >= 200) {
    personalizations.push("✨ **Premium Curation:** €" + budget + "/day allows exceptional experiences and unique opportunities.");
  }
  
  // Month-specific personalization
  personalizations.push(`🌤️ **${userData.travelMonth} Optimization:** Timing influences activity scheduling and ${userData.travelMonth} conditions.`);
  
  return personalizations.join('\n');
}

// Enhanced dietary strategy function
function generateDietaryStrategy(dietaryRequirements) {
  if (!dietaryRequirements) {
    return "- Diverse dining options with menu highlights and local specialties.";
  }
  
  const dietary = dietaryRequirements.toLowerCase();
  let strategies = [];
  
  if (dietary.includes('vegetarian') || dietary.includes('vegan')) {
    strategies.push("🌱 **Plant-Based Focus:** Every restaurant includes specific vegetarian/vegan options with local organic highlights.");
  }
  
  if (dietary.includes('gluten-free') || dietary.includes('celiac') || dietary.includes('coeliac')) {
    strategies.push("🌾 **Gluten-Free Assurance:** All dining recommendations specify gluten-free options and cross-contamination awareness.");
  }
  
  if (dietary.includes('dairy-free') || dietary.includes('lactose')) {
    strategies.push("🥛 **Dairy-Free Navigation:** Each restaurant includes dairy-free alternatives and naturally dairy-free dishes.");
  }
  
  if (dietary.includes('halal')) {
    strategies.push("☪️ **Halal Dining:** Halal-certified restaurants and Muslim-friendly dining options identified.");
  }
  
  if (dietary.includes('kosher')) {
    strategies.push("✡️ **Kosher Considerations:** Kosher-friendly options and vegetarian establishments accommodating kosher requirements.");
  }
  
  if (dietary.includes('pescatarian')) {
    strategies.push("🐟 **Pescatarian Perfect:** Kerry's coastal location emphasized with fresh seafood restaurants and vegetarian options.");
  }
  
  strategies.push("📞 **Verification:** Contact information provided for confirming dietary accommodation options.");
  
  return strategies.join('\n');
}

// Enhanced accessibility strategy function
function generateAccessibilityStrategy(accessibilityNeeds) {
  if (!accessibilityNeeds) {
    return "- General accessibility information provided for venues and activities.";
  }
  
  const accessibility = accessibilityNeeds.toLowerCase();
  let strategies = [];
  
  if (accessibility.includes('wheelchair') || accessibility.includes('mobility')) {
    strategies.push("♿ **Wheelchair/Mobility:** Detailed wheelchair access, ramp availability, accessible parking, restroom facilities for every venue.");
  }
  
  if (accessibility.includes('walking') || accessibility.includes('limited mobility')) {
    strategies.push("🚶 **Limited Walking:** Minimized walking distances, seating options, close parking prioritized.");
  }
  
  if (accessibility.includes('visual') || accessibility.includes('blind') || accessibility.includes('sight')) {
    strategies.push("👁️ **Visual Accessibility:** Tactile and audio experiences, guided assistance, sensory descriptions emphasized.");
  }
  
  if (accessibility.includes('hearing') || accessibility.includes('deaf')) {
    strategies.push("👂 **Hearing Accessibility:** Visual experiences prioritized with written materials and sign language services noted.");
  }
  
  strategies.push("📞 **Accessibility Verification:** Contact information to confirm accessibility features and assistance.");
  strategies.push("🅿️ **Accessible Transportation:** Accessible parking and proximity to entrances prioritized.");
  
  return strategies.join('\n');
}

// Function to generate unique experiences based on interests
function generateUniqueExperiences(userData) {
  let experiences = [];
  
  if (!userData.interests || userData.interests.length === 0) {
    return "- Curated blend of iconic Kerry highlights with lesser-known local favorites.";
  }
  
  userData.interests.forEach(interest => {
    switch(interest.toLowerCase()) {
      case 'photography':
        experiences.push("📸 **Photography:** Secret sunrise spots, golden hour timing, hidden waterfalls, dramatic compositions.");
        break;
      case 'history':
        experiences.push("🏰 **Historical:** Archaeological sites, local historians, ancient pathways, historical connections.");
        break;
      case 'culture':
        experiences.push("🎵 **Cultural:** Traditional music sessions, Irish language conversations, artisan workshops, family traditions.");
        break;
      case 'nature':
      case 'hiking':
        experiences.push("🥾 **Nature:** Off-trail waterfalls, wildlife spotting, hidden valleys, unique ecosystems.");
        break;
      case 'food':
      case 'cuisine':
        experiences.push("🍴 **Culinary:** Farm-to-table experiences, traditional cooking, foraged ingredients, local producers.");
        break;
      case 'adventure':
        experiences.push("⚡ **Adventure:** Activities leveraging Kerry's geography, seasonal opportunities, local guides.");
        break;
    }
  });
  
  return experiences.join('\n');
}

// Helper function for month-specific guidance
function getMonthSpecificGuidance(month) {
  const monthGuidance = {
    'january': "- Winter: Shorter daylight (8:30am-4:30pm), storms possible, indoor alternatives essential",
    'february': "- Late winter: Increasing daylight, stormy weather, fewer crowds, indoor focus",
    'march': "- Early spring: Longer days, variable weather, St. Patrick's celebrations, spring flowers",
    'april': "- Spring: Mild temperatures, longer daylight, Easter crowds, good hiking conditions",
    'may': "- Late spring: Pleasant weather, outdoor activities optimal, mild temperatures, spring colors",
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

// Enhanced budget strategy function
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
