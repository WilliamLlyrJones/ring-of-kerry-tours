// src/utils/database.js - Database connection and helper functions

import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Store a new itinerary in the database
export async function storeItinerary(data) {
  try {
    const { data: result, error } = await supabase
      .from('itineraries')
      .insert([{
        session_id: data.sessionId,
        title: `${data.userData.duration}-Day Ring of Kerry`,
        duration: parseInt(data.userData.duration),
        travel_month: data.userData.travelMonth,
        itinerary_text: data.itinerary,
        user_data: data.userData,
        version: 1
      }])
      .select()
      .single();

    if (error) {
      console.error('Database error storing itinerary:', error);
      throw error;
    }

    console.log('Itinerary stored successfully:', result.id);
    return result;
  } catch (error) {
    console.error('Error in storeItinerary:', error);
    throw error;
  }
}

// Get an itinerary by ID
export async function getItinerary(id) {
  try {
    const { data, error } = await supabase
      .from('itineraries')
      .select(`
        *,
        itinerary_refinements (
          feedback_text,
          version_number,
          created_at
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Database error getting itinerary:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getItinerary:', error);
    throw error;
  }
}

// Store a refinement and update the main itinerary
export async function storeRefinement(itineraryId, feedback, refinedItinerary, version) {
  try {
    // First, store the refinement
    const { data: refinementData, error: refinementError } = await supabase
      .from('itinerary_refinements')
      .insert([{
        itinerary_id: itineraryId,
        feedback_text: feedback,
        refined_itinerary: refinedItinerary,
        version_number: version
      }])
      .select()
      .single();

    if (refinementError) {
      console.error('Database error storing refinement:', refinementError);
      throw refinementError;
    }

    // Then, update the main itinerary
    const { error: updateError } = await supabase
      .from('itineraries')
      .update({
        itinerary_text: refinedItinerary,
        version: version,
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId);

    if (updateError) {
      console.error('Database error updating itinerary:', updateError);
      throw updateError;
    }

    console.log('Refinement stored successfully');
    return refinementData;
  } catch (error) {
    console.error('Error in storeRefinement:', error);
    throw error;
  }
}

// Log usage analytics
export async function logUsage(data) {
  try {
    const { error } = await supabase
      .from('usage_analytics')
      .insert([{
        session_id: data.sessionId,
        action_type: data.action,
        tokens_used: data.tokensUsed || null,
        success: data.success,
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Database error logging usage:', error);
      // Don't throw error for analytics - it shouldn't break the main flow
    }
  } catch (error) {
    console.error('Error in logUsage:', error);
    // Don't throw error for analytics
  }
}

// Test database connection
export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('itineraries')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Database connection test failed:', error);
      return false;
    }

    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}