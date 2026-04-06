// ─────────────────────────────────────────────────────────────
//  orsCalculator.js  —  Yaritao Moving Financial System
//  Cálculo automático de millas via OpenRouteService (Gratis)
//  Regístrate en: https://openrouteservice.org/dev/#/signup
//  Pega tu API key en el .env del proyecto:
//    VITE_ORS_API_KEY=tu_api_key_aqui
// ─────────────────────────────────────────────────────────────

const ORS_KEY = import.meta.env.VITE_ORS_API_KEY || "";
const GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";
const DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";

/**
 * Convierte una dirección en texto a coordenadas [lng, lat]
 * @param {string} address - Dirección completa ("123 Main St, Newark, NJ")
 * @returns {Promise<[number, number]>} - [longitude, latitude]
 */
async function geocodeAddress(address) {
  const params = new URLSearchParams({
    api_key: ORS_KEY,
    text: address,
    "boundary.country": "US",
    size: 1,
  });

  const res = await fetch(`${GEOCODE_URL}?${params}`);
  if (!res.ok) throw new Error("Error al geocodificar dirección");

  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    throw new Error(`No se encontró la dirección: "${address}"`);
  }

  return data.features[0].geometry.coordinates; // [lng, lat]
}

/**
 * Calcula las millas entre dos coordenadas usando ORS Directions
 * @param {[number,number]} origin - [lng, lat]
 * @param {[number,number]} destination - [lng, lat]
 * @returns {Promise<{ miles: number, durationMinutes: number }>}
 */
async function getRouteMiles(origin, destination) {
  const params = new URLSearchParams({
    api_key: ORS_KEY,
    start: `${origin[0]},${origin[1]}`,
    end: `${destination[0]},${destination[1]}`,
  });

  const res = await fetch(`${DIRECTIONS_URL}?${params}`);
  if (!res.ok) throw new Error("Error al calcular ruta");

  const data = await res.json();
  const segment = data.features?.[0]?.properties?.segments?.[0];
  if (!segment) throw new Error("No se pudo obtener la ruta");

  const distanceMeters = segment.distance;
  const durationSeconds = segment.duration;

  const miles = parseFloat((distanceMeters / 1609.344).toFixed(1));
  const durationMinutes = Math.round(durationSeconds / 60);

  return { miles, durationMinutes };
}

/**
 * Función principal: dirección texto → millas calculadas
 * @param {string} pickupAddress - Dirección de recogida
 * @param {string} deliveryAddress - Dirección de entrega
 * @returns {Promise<{ miles: number, durationMinutes: number, originCoords: [], destCoords: [] }>}
 */
export async function calculateMilesBetweenAddresses(pickupAddress, deliveryAddress) {
  if (!ORS_KEY) {
    throw new Error("Falta la API key de OpenRouteService. Agrega VITE_ORS_API_KEY en tu archivo .env");
  }
  if (!pickupAddress.trim() || !deliveryAddress.trim()) {
    throw new Error("Ingresa ambas direcciones para calcular las millas");
  }

  const [originCoords, destCoords] = await Promise.all([
    geocodeAddress(pickupAddress),
    geocodeAddress(deliveryAddress),
  ]);

  const { miles, durationMinutes } = await getRouteMiles(originCoords, destCoords);

  return { miles, durationMinutes, originCoords, destCoords };
}

/**
 * Formatea duración en minutos a texto legible
 * @param {number} minutes
 * @returns {string} - "2h 15min"
 */
export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
