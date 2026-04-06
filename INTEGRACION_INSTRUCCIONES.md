# 🚛 Yaritao Moving — Integración de Millas y Truck UHaul
## Instrucciones paso a paso

---

## 📁 Archivos nuevos a agregar al proyecto

```
src/
├── utils/
│   ├── truckCalculator.js       ← NUEVO
│   └── orsCalculator.js         ← NUEVO
└── components/
    └── MilesAndTruckSection.jsx ← NUEVO
```

---

## 🔑 PASO 1 — Obtener API Key gratuita de OpenRouteService

1. Ve a: https://openrouteservice.org/dev/#/signup
2. Crea cuenta gratis (email + contraseña)
3. Confirma tu email
4. Ve a tu Dashboard → copia tu **API Key**
5. En la raíz del proyecto, abre (o crea) el archivo `.env`:

```
VITE_ORS_API_KEY=tu_api_key_aqui
```

6. Agrega `.env` a tu `.gitignore` si no está ya:
```
echo ".env" >> .gitignore
```

---

## ⚙️ PASO 2 — Agregar campos al estado del Job

En tu componente de creación/edición de jobs (probablemente `Jobs.jsx` o `JobForm.jsx`), busca el `useState` con el objeto del job y agrega estos campos nuevos:

```js
const [jobData, setJobData] = useState({
  // ... tus campos existentes ...

  // ── NUEVOS campos ──
  pickupAddress: "",
  deliveryAddress: "",
  calculatedMiles: "",
  estimatedDuration: "",
  homeType: "",
  truckSize: "",
  moveType: "local",       // "local" | "oneway"
  rentalDays: 1,
  includeInsurance: true,
  uhaulBreakdown: "",      // JSON string del desglose
  // truckCost ya existe en tu sistema — el componente lo actualiza automáticamente
});
```

---

## 🔗 PASO 3 — Insertar el componente en el formulario del Job

```jsx
import MilesAndTruckSection from "../components/MilesAndTruckSection";

// Dentro del JSX del form, REEMPLAZA o COMPLEMENTA donde estaban
// los campos de dirección y truck cost:

<MilesAndTruckSection
  jobData={jobData}
  onChange={(e) => setJobData(prev => ({ ...prev, [e.target.name]: e.target.value }))}
/>
```

> El componente llama a `onChange` con el mismo formato `{ target: { name, value } }`
> que tus inputs normales, así que tu handler existente funciona sin cambios.

---

## 💾 PASO 4 — Guardar los nuevos campos en localStorage

En la función donde guardas el job, ya debería funcionar si usas spread (`...jobData`).
Verifica que el objeto completo se guarda, no solo campos individuales.

Los campos clave que alimentan el resto del sistema son:
- `calculatedMiles` → para reportes de millas
- `truckCost` → ya se usa en P&L y costo del job (el componente lo auto-actualiza)
- `uhaulBreakdown` → desglose detallado para facturas

---

## 🌐 PASO 5 — Agregar variable en Vercel (para producción)

1. Ve a tu proyecto en vercel.com
2. Settings → Environment Variables
3. Agrega:
   - Name: `VITE_ORS_API_KEY`
   - Value: tu API key
   - Environment: Production + Preview

---

## ✅ Resultado final en el formulario de job

El flujo completo queda así:
1. **Escribes** dirección de pickup y delivery
2. **Presionas** "🗺️ Calcular Millas" → aparece "X millas / ~Yh de manejo"
3. **Seleccionas** tipo de residencia → el sistema **sugiere automáticamente** el truck
4. **Cambias** si lo deseas (ej. cliente tiene piano → upgrade a truck más grande)
5. **Seleccionas** Local o One-Way + número de días + seguro
6. El sistema muestra el **desglose completo de UHaul** y actualiza `truckCost` automáticamente
7. Ese costo entra directo al cálculo de **P&L y profit del job**

---

## 📊 Lógica de recomendación de trucks

| Tipo de hogar | Truck recomendado |
|---|---|
| Studio / Cuarto | 10 ft |
| 1 Bedroom | 15 ft |
| 2 Bedrooms | 20 ft |
| 3 Bedrooms | 26 ft |
| 4 Bedrooms | 26 ft ⚠️ (posible 2 viajes) |
| 5+ Bedrooms | 26 ft ⚠️ (probablemente 2 viajes) |
| Oficina pequeña | 15 ft |
| Oficina grande | 26 ft ⚠️ |
| Storage | 10 ft |

El usuario siempre puede cambiar el truck manualmente si el cliente tiene
circunstancias especiales (piano, safe, equipo pesado, etc.)

---

## 💰 Lógica de precios UHaul (aproximados, mercado NJ)

### Local (regresa el truck al mismo UHaul)
`Total = (tarifa diaria × días) + (millas × $0.79) + (seguro × días)`

| Truck | Tarifa/día | Por milla |
|---|---|---|
| 10 ft | $19.95 | $0.79 |
| 15 ft | $29.95 | $0.79 |
| 20 ft | $39.95 | $0.79 |
| 26 ft | $49.95 | $0.79 |

### One-Way (entrega en diferente ciudad)
Precio base varía por distancia y truck. Rango real aproximado:

| Truck | <50 mi | 50–200 mi | 200–500 mi | 500+ mi |
|---|---|---|---|---|
| 10 ft | $149 | $199 | $349 | $599 |
| 15 ft | $199 | $299 | $499 | $849 |
| 20 ft | $299 | $449 | $699 | $1,099 |
| 26 ft | $449 | $699 | $999 | $1,599 |

*Siempre se muestra disclaimer que confirmen en uhaul.com*
