require('dotenv').config();

const express = require('express');
const axios = require('axios');
const redis = require('redis');
const cors = require('cors');

const app = express();
const PORT = 3000; // You can adjust this as needed

// Middleware
app.use(cors());

// Configure Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected successfully.');
});

redisClient.connect();

// Define your weather API endpoint
app.get('/api/weather', async (req, res) => {
  const { city, country, latitude, longitude, unit } = req.query;

  // Check if the required parameters are provided
  if ((!city || !country ) && (!latitude || !longitude)) {
    return res.status(400).json({ error: 'City and country or latitude and longitude are required' });
  }

  let cacheKey;
  if (city && country) {
    cacheKey = `${city}:${country}:${unit}`;
  } else {
    cacheKey = `${latitude}:${longitude}:${unit}`;
  }

  try {
    // Check Redis cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log('Cache hit:', cachedData);
      return res.json(JSON.parse(cachedData));
    }

    const unitGroup = unit === 'metric' || unit === 'us' ? unit : 'metric'; 
    // Fetch data from Visual Crossing API based on the parameters
    let apiUrl;
    if (city && country) {
      apiUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${city},${country}?unitGroup=${unitGroup}&key=${process.env.WEATHER_API_KEY}`;
    } else {
      apiUrl = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${latitude},${longitude}?unitGroup=${unitGroup}&key=${process.env.WEATHER_API_KEY}`;
    }

    const response = await axios.get(apiUrl);
    const weatherData = response.data;

    // Store data in Redis cache with a TTL of 1 hour
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(weatherData));
    console.log('Data saved to cache:', weatherData);

    res.json(weatherData);
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    res.status(500).json({ error: 'Error fetching weather data' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
