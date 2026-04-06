// ─────────────────────────────────────────────────────────────
//  MilesAndTruckSection.jsx  —  Yaritao Moving Financial System
//  Sección completa: direcciones + millas ORS + truck + UHaul
//
//  USO en tu JobForm existente:
//  ─────────────────────────────
//  import MilesAndTruckSection from './MilesAndTruckSection';
//
//  En el estado del job agrega estos campos:
//    pickupAddress: '',
//    deliveryAddress: '',
//    calculatedMiles: '',
//    estimatedDuration: '',
//    homeType: '',
//    truckSize: '',
//    moveType: 'local',
//    rentalDays: 1,
//    includeInsurance: true,
//    truckCost: '',          ← este ya existe en tu sistema
//
//  <MilesAndTruckSection jobData={jobData} onChange={handleChange} />
//
//  El componente llama onChange con { name, value } igual que tus inputs
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { calculateMilesBetweenAddresses, formatDuration } from "../utils/orsCalculator";
import {
  HOME_TYPES,
  TRUCK_SPECS,
  HOME_NOTES,
  getRecommendedTruck,
  calculateUHaulCost,
} from "../utils/truckCalculator";

export default function MilesAndTruckSection({ jobData, onChange }) {
  const [loadingMiles, setLoadingMiles] = useState(false);
  const [milesError, setMilesError] = useState("");
  const [truckOverridden, setTruckOverridden] = useState(false);

  // ── Helper para disparar onChange como si fuera un input normal ──
  const set = (name, value) => onChange({ target: { name, value } });

  // ── Calcular millas con ORS ──────────────────────────────────────
  const handleCalculateMiles = async () => {
    setMilesError("");
    setLoadingMiles(true);
    try {
      const { miles, durationMinutes } = await calculateMilesBetweenAddresses(
        jobData.pickupAddress,
        jobData.deliveryAddress
      );
      set("calculatedMiles", miles);
      set("estimatedDuration", formatDuration(durationMinutes));

      // Si ya hay tipo de hogar seleccionado, recalcular UHaul con las nuevas millas
      if (jobData.truckSize) {
        recalcUHaul(jobData.truckSize, jobData.moveType, miles, jobData.rentalDays, jobData.includeInsurance);
      }
    } catch (err) {
      setMilesError(err.message);
    } finally {
      setLoadingMiles(false);
    }
  };

  // ── Cuando cambia el tipo de hogar → sugerir truck ───────────────
  const handleHomeTypeChange = (homeType) => {
    set("homeType", homeType);
    setTruckOverridden(false);

    const recommended = getRecommendedTruck(homeType);
    if (recommended) {
      set("truckSize", recommended);
      if (jobData.calculatedMiles) {
        recalcUHaul(recommended, jobData.moveType, jobData.calculatedMiles, jobData.rentalDays, jobData.includeInsurance);
      }
    }
  };

  // ── Cuando el usuario cambia el truck manualmente ────────────────
  const handleTruckChange = (truckSize) => {
    set("truckSize", truckSize);
    setTruckOverridden(true);
    if (jobData.calculatedMiles) {
      recalcUHaul(truckSize, jobData.moveType, jobData.calculatedMiles, jobData.rentalDays, jobData.includeInsurance);
    }
  };

  // ── Recalcular costo UHaul y actualizar truckCost ────────────────
  const recalcUHaul = (truckSize, moveType, miles, days, insurance) => {
    const result = calculateUHaulCost(truckSize, moveType, parseFloat(miles), parseInt(days), insurance);
    if (result) {
      set("truckCost", result.total);
      set("uhaulBreakdown", JSON.stringify(result));
    }
  };

  // ── Cuando cambia moveType, días o seguro ────────────────────────
  const handleUHaulParamChange = (field, value) => {
    set(field, value);
    const newParams = {
      truckSize: jobData.truckSize,
      moveType: jobData.moveType,
      miles: jobData.calculatedMiles,
      days: jobData.rentalDays,
      insurance: jobData.includeInsurance,
      [field]: value,
    };
    if (newParams.truckSize && newParams.miles) {
      recalcUHaul(newParams.truckSize, newParams.moveType, newParams.miles, newParams.days, newParams.insurance);
    }
  };

  // ── Parsear breakdown guardado ───────────────────────────────────
  const uhaulBreakdown = (() => {
    try { return JSON.parse(jobData.uhaulBreakdown || "null"); } catch { return null; }
  })();

  const recommendedTruck = getRecommendedTruck(jobData.homeType);
  const homeNote = HOME_NOTES[jobData.homeType];
  const truckSpec = TRUCK_SPECS[jobData.truckSize];

  // ── Estilos inline (dark theme + gold, igual que el sistema) ─────
  const s = {
    section: {
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: 10,
      padding: "20px 24px",
      marginBottom: 20,
    },
    sectionTitle: {
      color: "#d4a017",
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: "1px solid #2a2a2a",
      paddingBottom: 10,
    },
    row: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
      marginBottom: 12,
    },
    label: {
      color: "#aaa",
      fontSize: 12,
      marginBottom: 4,
      display: "block",
    },
    input: {
      width: "100%",
      background: "#111",
      border: "1px solid #333",
      borderRadius: 6,
      padding: "8px 12px",
      color: "#fff",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
    },
    select: {
      width: "100%",
      background: "#111",
      border: "1px solid #333",
      borderRadius: 6,
      padding: "8px 12px",
      color: "#fff",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box",
      cursor: "pointer",
    },
    btn: {
      background: "#d4a017",
      color: "#000",
      border: "none",
      borderRadius: 6,
      padding: "9px 18px",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6,
      whiteSpace: "nowrap",
    },
    btnDisabled: {
      background: "#555",
      color: "#999",
      cursor: "not-allowed",
    },
    milesBadge: {
      background: "#0d2e0d",
      border: "1px solid #2a6b2a",
      borderRadius: 6,
      padding: "8px 14px",
      color: "#4caf50",
      fontWeight: 700,
      fontSize: 14,
      display: "flex",
      gap: 16,
      alignItems: "center",
      flexWrap: "wrap",
    },
    truckBadge: {
      background: "#1a1200",
      border: "1px solid #d4a017",
      borderRadius: 6,
      padding: "10px 14px",
      marginBottom: 12,
    },
    truckBadgeTitle: {
      color: "#d4a017",
      fontWeight: 700,
      fontSize: 13,
    },
    truckBadgeSub: {
      color: "#888",
      fontSize: 12,
      marginTop: 2,
    },
    note: {
      background: "#1a0f00",
      border: "1px solid #8b4513",
      borderRadius: 6,
      padding: "8px 12px",
      color: "#f0a040",
      fontSize: 12,
      marginBottom: 10,
    },
    breakdown: {
      background: "#111",
      border: "1px solid #2a2a2a",
      borderRadius: 6,
      padding: "12px 14px",
      marginTop: 10,
    },
    breakdownRow: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 13,
      color: "#ccc",
      padding: "3px 0",
    },
    breakdownTotal: {
      display: "flex",
      justifyContent: "space-between",
      fontWeight: 700,
      fontSize: 15,
      color: "#d4a017",
      borderTop: "1px solid #333",
      paddingTop: 8,
      marginTop: 6,
    },
    error: {
      color: "#ef5350",
      fontSize: 12,
      marginTop: 6,
    },
    toggle: {
      display: "flex",
      gap: 0,
      borderRadius: 6,
      overflow: "hidden",
      border: "1px solid #333",
    },
    toggleBtn: (active) => ({
      flex: 1,
      padding: "8px 0",
      background: active ? "#d4a017" : "#111",
      color: active ? "#000" : "#888",
      border: "none",
      fontWeight: active ? 700 : 400,
      fontSize: 13,
      cursor: "pointer",
    }),
    checkbox: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      color: "#ccc",
      fontSize: 13,
    },
    fullRow: {
      gridColumn: "1 / -1",
    },
  };

  return (
    <div>
      {/* ── BLOQUE 1: Direcciones y millas ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>
          📍 Direcciones y Millas
        </div>

        <div style={s.row}>
          <div>
            <label style={s.label}>Dirección de Pickup</label>
            <input
              style={s.input}
              placeholder="123 Main St, Newark, NJ 07102"
              value={jobData.pickupAddress || ""}
              onChange={(e) => set("pickupAddress", e.target.value)}
            />
          </div>
          <div>
            <label style={s.label}>Dirección de Delivery</label>
            <input
              style={s.input}
              placeholder="456 Oak Ave, Jersey City, NJ 07306"
              value={jobData.deliveryAddress || ""}
              onChange={(e) => set("deliveryAddress", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            style={{
              ...s.btn,
              ...(loadingMiles || !jobData.pickupAddress || !jobData.deliveryAddress
                ? s.btnDisabled
                : {}),
            }}
            onClick={handleCalculateMiles}
            disabled={loadingMiles || !jobData.pickupAddress || !jobData.deliveryAddress}
          >
            {loadingMiles ? "⏳ Calculando..." : "🗺️ Calcular Millas"}
          </button>

          {jobData.calculatedMiles && (
            <div style={s.milesBadge}>
              <span>🛣️ <strong>{jobData.calculatedMiles} millas</strong></span>
              {jobData.estimatedDuration && (
                <span>⏱️ ~{jobData.estimatedDuration} de manejo</span>
              )}
            </div>
          )}
        </div>

        {milesError && <p style={s.error}>⚠️ {milesError}</p>}
      </div>

      {/* ── BLOQUE 2: Tipo de hogar y truck ── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>
          🚛 Tipo de Mudanza y Truck UHaul
        </div>

        <div style={s.row}>
          <div>
            <label style={s.label}>Tipo de Residencia / Propiedad</label>
            <select
              style={s.select}
              value={jobData.homeType || ""}
              onChange={(e) => handleHomeTypeChange(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {HOME_TYPES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={s.label}>
              Tamaño del Truck
              {recommendedTruck && !truckOverridden && (
                <span style={{ color: "#d4a017", marginLeft: 6 }}>✦ Recomendado</span>
              )}
              {truckOverridden && (
                <span style={{ color: "#888", marginLeft: 6 }}>(modificado)</span>
              )}
            </label>
            <select
              style={s.select}
              value={jobData.truckSize || ""}
              onChange={(e) => handleTruckChange(e.target.value)}
            >
              <option value="">— Seleccionar —</option>
              {Object.entries(TRUCK_SPECS).map(([key, spec]) => (
                <option key={key} value={key}>
                  {spec.label} — {spec.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nota de advertencia para casas grandes */}
        {homeNote && <div style={s.note}>{homeNote}</div>}

        {/* Info del truck seleccionado */}
        {truckSpec && (
          <div style={s.truckBadge}>
            <div style={s.truckBadgeTitle}>
              🚚 {truckSpec.label} — {truckSpec.description}
            </div>
            <div style={s.truckBadgeSub}>
              Local: ${truckSpec.ratePerDay}/día + ${truckSpec.ratePerMile}/milla &nbsp;|&nbsp;
              Seguro SafeMove: ${truckSpec.insurancePerDay}/día
            </div>
          </div>
        )}

        {/* ── Parámetros UHaul ── */}
        {jobData.truckSize && (
          <>
            <div style={s.row}>
              <div>
                <label style={s.label}>Tipo de Renta</label>
                <div style={s.toggle}>
                  <button
                    style={s.toggleBtn(jobData.moveType === "local")}
                    onClick={() => handleUHaulParamChange("moveType", "local")}
                  >
                    📍 Local (regresa el truck)
                  </button>
                  <button
                    style={s.toggleBtn(jobData.moveType === "oneway")}
                    onClick={() => handleUHaulParamChange("moveType", "oneway")}
                  >
                    🏁 One-Way (otra ciudad)
                  </button>
                </div>
              </div>

              <div>
                <label style={s.label}>Número de Días de Renta</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  style={s.input}
                  value={jobData.rentalDays || 1}
                  onChange={(e) => handleUHaulParamChange("rentalDays", e.target.value)}
                />
              </div>
            </div>

            <label style={s.checkbox}>
              <input
                type="checkbox"
                checked={jobData.includeInsurance !== false}
                onChange={(e) => handleUHaulParamChange("includeInsurance", e.target.checked)}
              />
              Incluir SafeMove Insurance (${truckSpec?.insurancePerDay}/día) — Recomendado
            </label>

            {/* ── Breakdown del costo UHaul ── */}
            {uhaulBreakdown && (
              <div style={s.breakdown}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>
                  📋 Estimado UHaul ({jobData.moveType === "local" ? "Local" : "One-Way"})
                  {!jobData.calculatedMiles && (
                    <span style={{ color: "#f0a040", marginLeft: 6 }}>
                      — Calcula las millas primero para mayor precisión
                    </span>
                  )}
                </div>
                {uhaulBreakdown.breakdown?.map((item, i) => (
                  <div key={i} style={s.breakdownRow}>
                    <span>{item.label}</span>
                    <span>${item.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div style={s.breakdownTotal}>
                  <span>Total Estimado UHaul</span>
                  <span>${uhaulBreakdown.total?.toFixed(2)}</span>
                </div>
                <div style={{ color: "#555", fontSize: 11, marginTop: 6 }}>
                  * Precios aproximados basados en tarifas UHaul NJ. El precio real puede variar
                  según disponibilidad y fecha. Se recomienda confirmar en uhaul.com.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
