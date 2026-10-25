/**
 * Weather configuration for GRO-06/GRO-07.
 *
 * Defines country centroids and major cities for each edition's weather panel.
 * Data fetched from Open-Meteo API during build snapshot generation.
 */

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
}

export interface EditionWeather {
  centroid: WeatherLocation;
  cities: WeatherLocation[];
}

export const EDITION_WEATHER: Record<string, EditionWeather> = {
  uk: {
    centroid: { name: 'London', lat: 51.5074, lon: -0.1278 },
    cities: [
      { name: 'London', lat: 51.5074, lon: -0.1278 },
      { name: 'Manchester', lat: 53.4808, lon: -2.2426 },
      { name: 'Edinburgh', lat: 55.9533, lon: -3.1883 },
    ],
  },
  us: {
    centroid: { name: 'Washington DC', lat: 38.9072, lon: -77.0369 },
    cities: [
      { name: 'New York', lat: 40.7128, lon: -74.006 },
      { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
      { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
    ],
  },
  au: {
    centroid: { name: 'Canberra', lat: -35.2809, lon: 149.13 },
    cities: [
      { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
      { name: 'Melbourne', lat: -37.8136, lon: 144.9631 },
      { name: 'Brisbane', lat: -27.4698, lon: 153.0251 },
    ],
  },
  ca: {
    centroid: { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
    cities: [
      { name: 'Toronto', lat: 43.6532, lon: -79.3832 },
      { name: 'Vancouver', lat: 49.2827, lon: -123.1207 },
      { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
    ],
  },
  ie: {
    centroid: { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
    cities: [
      { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
      { name: 'Cork', lat: 51.8989, lon: -8.4753 },
    ],
  },
  nz: {
    centroid: { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
    cities: [
      { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
      { name: 'Auckland', lat: -36.8485, lon: 174.7633 },
    ],
  },
  in: {
    centroid: { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
    cities: [
      { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
      { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
      { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
    ],
  },
  'in-hi': {
    centroid: { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
    cities: [
      { name: 'New Delhi', lat: 28.6139, lon: 77.209 },
      { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
      { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
    ],
  },
};

/**
 * Open-Meteo API base URL.
 * CC BY 4.0 attribution required in footer.
 */
export const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast';
export const WEATHER_ATTRIBUTION = 'Open-Meteo (CC BY 4.0)';
