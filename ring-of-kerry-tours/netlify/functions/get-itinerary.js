// netlify/functions/get-itinerary.js - API function to retrieve saved itineraries

import { getItinerary, logUsage } from '../../src/utils/database.js';

export async function handler(event, context) {
  // CORS headers for web requests
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Extract itinerary ID from path parameters
    const pathSegments = event.path.split('/');
    const itineraryId = pathSegments[pathSegments.length - 1];
    
    // Extract session ID from query parameters (optional)
    const sessionId = event.queryStringParameters?.sessionId;

    console.log('Retrieving itinerary:', itineraryId);

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

    // Get itinerary from database
    const itineraryData = await getItinerary(itineraryId);
    
    if (!itineraryData) {
      // Log the failed retrieval
      if (sessionId) {
        await logUsage({
          sessionId,
          action: 'view',
          success: false
        });
      }

      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Itinerary not found',
          message: 'The requested itinerary could not be found. It may have been deleted or the ID is incorrect.'
        })
      };
    }

    // Log successful retrieval
    if (sessionId) {
      await logUsage({
        sessionId: sessionId || itineraryData.session_id,
        action: 'view',
        success: true
      });
    }

    console.log('Itinerary retrieved successfully');

    // Return the itinerary data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        itinerary: {
          id: itineraryData.id,
          title: itineraryData.title,
          duration: itineraryData.duration,
          travelMonth: itineraryData.travel_month,
          itineraryText: itineraryData.itinerary_text,
          userData: itineraryData.user_data,
          version: itineraryData.version,
          createdAt: itineraryData.created_at,
          updatedAt: itineraryData.updated_at,
          refinements: itineraryData.itinerary_refinements || []
        }
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
}

// Additional function to get multiple itineraries by session (for future use)
export async function getSessionItineraries(sessionId) {
  try {
    const { data, error } = await supabase
      .from('itineraries')
      .select('id, title, duration, travel_month, created_at, version')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Database error getting session itineraries:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getSessionItineraries:', error);
    throw error;
  }
}