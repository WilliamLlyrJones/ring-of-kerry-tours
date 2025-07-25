// Simple in-memory storage for demo purposes
// In production, you'd use a proper database
const itineraryStorage = new Map();

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Extract itinerary ID from path
    const pathSegments = event.path.split('/');
    const itineraryId = pathSegments[pathSegments.length - 1];
    
    if (!itineraryId || itineraryId === 'get-itinerary') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing itinerary ID',
          message: 'Please provide an itinerary ID in the URL path.'
        })
      };
    }

    // For demo purposes, return a sample itinerary
    // In production, you'd fetch from your database
    const sampleItinerary = {
      id: itineraryId,
      title: "3-Day Ring of Kerry Adventure",
      duration: 3,
      travelMonth: "September",
      itineraryText: `# Day 1: Killarney & Muckross

## Morning (9:00 AM - 12:00 PM)
**Killarney National Park Visitor Centre**
- Duration: 1 hour
- Cost: Free
- Perfect introduction to Kerry's natural heritage

**Muckross House & Gardens**
- Duration: 2 hours  
- Cost: €15 per person
- Victorian mansion with stunning lake views

## Afternoon (1:00 PM - 6:00 PM)
**Lunch at The Laurels Pub**
- Traditional Irish fare
- Price range: €15-25 per person

**Ross Castle**
- Duration: 1.5 hours
- Cost: €8 per person
- 15th-century castle on Lough Leane shores

## Evening (7:00 PM onwards)
**Traditional Music Session**
- O'Connor's Pub or The Shire
- Musicians start around 8:30 PM
- Free entertainment with drinks

# Day 2: Gap of Dunloe Adventure

## Morning (9:00 AM - 12:00 PM)
**Gap of Dunloe Scenic Drive**
- Duration: 3 hours with photo stops
- Narrow mountain pass with dramatic scenery
- Take your time - road can be challenging

## Afternoon (1:00 PM - 6:00 PM)
**Ladies View**
- Duration: 30 minutes
- Free viewpoint
- Famous for Queen Victoria's ladies-in-waiting

**Lunch in Sneem**
- Charming village stop
- Several cafes and pubs available

## Evening
**Return to Killarney**
- Driving time: 1 hour
- Dinner at hotel or local restaurant

# Day 3: Coastal Kerry

## Morning (9:00 AM - 1:00 PM)
**Skellig Ring Coastal Drive**
- Alternative to main Ring of Kerry
- Less crowded, more dramatic coastline
- Stop in Portmagee village

## Afternoon (2:00 PM - 6:00 PM)
**Waterville**
- Seaside town on the Wild Atlantic Way
- Charlie Chaplin connections
- Beach walk and refreshments

## Weather Backup Plans
- **Rainy Day**: Museum of Irish Transport, craft shops in Killarney
- **Indoor Alternatives**: Traditional pubs, shopping centers
- **Covered Attractions**: Muckross House interior tours

## Insider Tips
- Book dinner reservations in advance
- Carry rain gear - weather changes quickly
- Best photography light: early morning and late afternoon
- Drive slowly on narrow roads - be courteous to other drivers`,
      userData: {
        duration: "3",
        groupSize: "2",
        travelMonth: "September",
        budget: "250",
        interests: ["scenery", "history", "culture"]
      },
      version: 1,
      createdAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itinerary: sampleItinerary
      })
    };

  } catch (error) {
    console.error('Error retrieving itinerary:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to retrieve itinerary',
        message: 'We encountered an error while retrieving your itinerary. Please try again.'
      })
    };
  }
};
