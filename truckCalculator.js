// ─────────────────────────────────────────────────────────────
//  truckCalculator.js  —  Yaritao Moving Financial System
//  Lógica de: tipo de hogar → truck → costo estimado UHaul
// ─────────────────────────────────────────────────────────────

export const HOME_TYPES = [
  { value: "studio", label: "Studio / Solo un cuarto" },
  { value: "1br", label: "Apartamento 1 Bedroom" },
  { value: "2br", label: "Apartamento / Casa 2 Bedrooms" },
  { value: "3br", label: "Casa 3 Bedrooms" },
  { value: "4br", label: "Casa 4 Bedrooms" },
  { value: "5br_plus", label: "Casa 5+ Bedrooms / Estate" },
  { value: "office_small", label: "Oficina pequeña" },
  { value: "office_large", label: "Oficina grande / Comercial" },
  { value: "storage", label: "Solo Storage Unit" },
];

export const TRUCK_SPECS = {
  "10ft": {
    label: '10 ft',
    description: 'Cargo Van / 10ft',
    ratePerDay: 19.95,
    ratePerMile: 0.79,
    insurancePerDay: 14.00,
    oneWayBase: {
      under50: 149,
      "50_200": 199,
      "200_500": 349,
      "500_plus": 599,
    },
    oneWayPerMileOver: 0.35,
  },
  "15ft": {
    label: '15 ft',
    description: '15ft Truck',
    ratePerDay: 29.95,
    ratePerMile: 0.79,
    insurancePerDay: 14.00,
    oneWayBase: {
      under50: 199,
      "50_200": 299,
      "200_500": 499,
      "500_plus": 849,
    },
    oneWayPerMileOver: 0.40,
  },
  "20ft": {
    label: '20 ft',
    description: '20ft Truck',
    ratePerDay: 39.95,
    ratePerMile: 0.79,
    insurancePerDay: 14.00,
    oneWayBase: {
      under50: 299,
      "50_200": 449,
      "200_500": 699,
      "500_plus": 1099,
    },
    oneWayPerMileOver: 0.55,
  },
  "26ft": {
    label: '26 ft',
    description: '26ft Truck (el más grande)',
    ratePerDay: 49.95,
    ratePerMile: 0.79,
    insurancePerDay: 14.00,
    oneWayBase: {
      under50: 449,
      "50_200": 699,
      "200_500": 999,
      "500_plus": 1599,
    },
    oneWayPerMileOver: 0.75,
  },
};

// Mapa: tipo de hogar → truck recomendado
export const HOME_TO_TRUCK = {
  studio: "10ft",
  "1br": "15ft",
  "2br": "20ft",
  "3br": "26ft",
  "4br": "26ft",
  "5br_plus": "26ft",
  office_small: "15ft",
  office_large: "26ft",
  storage: "10ft",
};

// Nota extra para 4BR+ (puede necesitar 2 viajes)
export const HOME_NOTES = {
  "4br": "⚠️ Puede requerir 2 viajes o trailer adicional según volumen.",
  "5br_plus": "⚠️ Muy probablemente requiere 2 viajes o trailer. Confirmar con cliente.",
  office_large: "⚠️ Confirmar volumen exacto. Posible necesidad de 2 viajes.",
};

/**
 * Retorna el truck recomendado para un tipo de hogar
 */
export function getRecommendedTruck(homeType) {
  return HOME_TO_TRUCK[homeType] || null;
}

/**
 * Calcula el costo estimado de UHaul
 * @param {string} truckSize - "10ft" | "15ft" | "20ft" | "26ft"
 * @param {string} moveType - "local" | "oneway"
 * @param {number} miles - millas totales del viaje
 * @param {number} days - número de días
 * @param {boolean} includeInsurance - incluir SafeMove
 * @returns {{ subtotal, insurance, total, breakdown }}
 */
export function calculateUHaulCost(truckSize, moveType, miles, days, includeInsurance = true) {
  const truck = TRUCK_SPECS[truckSize];
  if (!truck) return null;

  let subtotal = 0;
  let breakdown = [];

  if (moveType === "local") {
    const baseCost = truck.ratePerDay * days;
    const mileageCost = miles * truck.ratePerMile;
    subtotal = baseCost + mileageCost;

    breakdown = [
      { label: `Renta diaria (${days} día${days > 1 ? "s" : ""} × $${truck.ratePerDay})`, amount: baseCost },
      { label: `Millas (${miles} mi × $${truck.ratePerMile})`, amount: mileageCost },
    ];
  } else {
    // One-Way: precio base según distancia
    let base = 0;
    let distanceKey = "";

    if (miles < 50) {
      base = truck.oneWayBase.under50;
      distanceKey = "menos de 50 millas";
    } else if (miles < 200) {
      base = truck.oneWayBase["50_200"];
      distanceKey = "50–200 millas";
    } else if (miles < 500) {
      base = truck.oneWayBase["200_500"];
      distanceKey = "200–500 millas";
    } else {
      base = truck.oneWayBase["500_plus"];
      distanceKey = "500+ millas";
    }

    // Cargo extra por cada día adicional más allá del primero
    const extraDays = Math.max(0, days - 1);
    const extraDayCost = extraDays * truck.ratePerDay;
    subtotal = base + extraDayCost;

    breakdown = [
      { label: `Tarifa One-Way (${distanceKey}, ${miles} mi)`, amount: base },
    ];
    if (extraDays > 0) {
      breakdown.push({ label: `Días adicionales (${extraDays} × $${truck.ratePerDay})`, amount: extraDayCost });
    }
  }

  const insuranceCost = includeInsurance ? truck.insurancePerDay * days : 0;
  if (includeInsurance) {
    breakdown.push({ label: `SafeMove Insurance (${days} día${days > 1 ? "s" : ""} × $${truck.insurancePerDay})`, amount: insuranceCost });
  }

  const total = subtotal + insuranceCost;

  return {
    subtotal,
    insurance: insuranceCost,
    total: parseFloat(total.toFixed(2)),
    breakdown,
  };
}
