# Google Maps API Setup Guide

To enable real Google Maps search functionality in your towing app, you need to set up Google Maps Platform APIs.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable billing for your project (required for Maps APIs)

## Step 2: Enable Required APIs

Enable these APIs in your Google Cloud Console for comprehensive location search:

1. **Places API** - For location search and autocomplete
2. **Maps JavaScript API** - For map display
3. **Geocoding API** - For address conversion and fallback geocoding
4. **Places API (New)** - Enhanced place search (if available)

To enable APIs:
1. Go to "APIs & Services" > "Library"
2. Search for each API and click "Enable"
3. Make sure all APIs show "Enabled" status

## Step 3: Create API Key

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy your API key

## Step 4: Restrict API Key (Recommended)

For security, restrict your API key:

1. Click on your API key in the credentials list
2. Under "API restrictions", select "Restrict key"
3. Choose the APIs you enabled:
   - Places API
   - Maps JavaScript API
   - Geocoding API

## Step 5: Configure Your App

1. Open your `.env` file
2. Replace `your_google_maps_api_key_here` with your actual API key:

```env
GOOGLE_MAPS_API_KEY=YOUR_ACTUAL_API_KEY_HERE
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_ACTUAL_API_KEY_HERE
```

## Step 6: Test the Integration

1. Restart your development server
2. Go to the "Request Tow" page
3. Try searching for locations in the "Pilih Lokasi" fields
4. You should see real Google Maps results for Indonesian locations

## Features Enabled

With Google Maps API configured, your app will have:

✅ **Comprehensive location search** - Search ANY place in Indonesia including:
   - Small villages and remote areas
   - Street addresses and building numbers
   - Landmarks, malls, and points of interest
   - Government buildings and institutions
   - Natural features and tourist spots
✅ **Real-time autocomplete** - Get suggestions as you type
✅ **Precise coordinates** - Exact latitude/longitude for all locations
✅ **Indonesian language** - All results in Bahasa Indonesia
✅ **Indonesia-focused** - Results restricted to Indonesia only
✅ **Multiple search types** - Searches establishments, addresses, and regions simultaneously
✅ **Smart fallback** - Uses geocoding API if place details fail
✅ **Enhanced accuracy** - Combines multiple Google APIs for best results

## Fallback Behavior

If the API key is not configured, the app will:
- Use local fallback data with popular Indonesian locations
- Still provide basic functionality
- Show a warning in the console

## Pricing

Google Maps Platform has a generous free tier:
- Places API (Autocomplete): $2.83 per 1,000 requests
- Places API (Details): $17 per 1,000 requests  
- Geocoding API: $5 per 1,000 requests
- First $200/month is free (covers ~7,000+ searches)
- Most small to medium apps stay within free limits

**Cost optimization tips:**
- App uses session tokens to reduce autocomplete costs
- Fallback system reduces API calls when possible
- Results are cached and deduplicated

## Troubleshooting

### API Key Not Working?
1. Check if billing is enabled on your Google Cloud project
2. Verify the APIs are enabled
3. Check API key restrictions
4. Look for error messages in the browser console

### No Search Results?
1. Check your internet connection
2. Verify the API key is correctly set in `.env`
3. Check browser console for API errors

### Still Using Fallback Data?
1. Make sure you restarted the development server after updating `.env`
2. Check that the API key doesn't equal `your_google_maps_api_key_here`

For more help, check the [Google Maps Platform documentation](https://developers.google.com/maps/documentation).