# Profitability Grouping & English Translation — Design

## Contexto

Este es el sub-proyecto A de una petición más grande del usuario que también
incluye un bot de Telegram con IA (sub-proyecto B, fuera de alcance aquí —
tiene su propio ciclo de diseño). El usuario pidió: (1) separar los carros
"profitable" de los "non-profitable" en el Vehicle Grid, y (2) traducir todo
el texto visible que sigue en español a inglés.

## Alcance

- Agrupar visualmente los carros del Vehicle Grid en dos secciones apiladas:
  Profitable y Non-Profitable.
- Traducir a inglés cada string en español que queda hoy en la UI (ver
  inventario exacto abajo). Cambio puramente de texto — cero cambios de
  lógica, cero cambios de comportamiento.

Fuera de alcance: el bot de Telegram/IA (sub-proyecto B, spec separado),
cambios de esquema en Supabase, cambios a la lógica de filtros/orden/búsqueda
ya existente en `VehicleGrid.jsx` (solo se les agrega la partición por
rentabilidad encima de lo que ya calculan).

## Arquitectura

### Agrupado por rentabilidad (`src/components/VehicleGrid.jsx`)

Un carro es "Profitable" si `getCarProfitOrEquity(car) >= 0` (misma función y
mismo criterio de signo que ya define hoy el color verde/ámbar del texto de
ganancia en cada tarjeta) y "Non-Profitable" si es negativo.

`visibleCars` (el resultado ya filtrado y ordenado por los controles
existentes de búsqueda/estatus/tipo de venta/orden — sin cambios ahí) se
particiona en dos arreglos: `profitableCars` y `nonProfitableCars`, en ese
orden, preservando el orden relativo que ya traían de `sortCars`.

Se renderizan dos secciones, cada una con un encabezado (título + contador,
ej. "Profitable · 8 cars") seguido de la misma grilla de tarjetas que existe
hoy (sin cambios al diseño de la tarjeta individual — eso ya se hizo en el
rediseño anterior). Si uno de los dos arreglos queda vacío, esa sección
completa (encabezado + grilla) no se renderiza — mismo patrón que ya usa
`AttentionBanner` para sus subsecciones condicionales.

Los dos estados vacíos generales que ya existen (`cars.length === 0` → "No
cars yet"; `visibleCars.length === 0` → sin resultados de filtro) se
mantienen exactamente igual y solo se evalúan antes de la partición — es
decir, si ambos grupos quedan vacíos tras filtrar, se sigue mostrando el
mensaje de "sin resultados" existente, no dos secciones vacías.

### Traducción a inglés

Inventario completo y exacto de los strings a cambiar (solo texto):

**`src/App.jsx`**
- Pestaña "Inventario" → "Inventory"
- Pestaña "Reportes" → "Reports"
- Subtítulo del header: "Controla carros vendidos cash o a crédito, pagos
  recibidos, balance pendiente y ganancia real desde la nube." → "Track cars
  sold cash or on credit, payments received, pending balance, and real
  profit — all from the cloud."

**`src/components/VehicleGrid.jsx`**
- "Click Add Vehicle para empezar." → "Click Add Vehicle to get started."
- "No hay carros que coincidan con el filtro" → "No vehicles match your
  filters"
- "Atrasado · {N} pago(s)" → "Overdue · {N} payment(s)"

**`src/components/VehicleForm.jsx`**
- Sub-pestaña "Costos" → "Costs"
- Sub-pestaña "Venta / Financiamiento" → "Sale / Financing"
- Sub-pestaña "Notas" → "Notes"
- "Este vehículo aún no está vendido. Cambia el estatus a "Sold" en la
  pestaña Info para capturar los datos de venta." → "This vehicle hasn't been
  sold yet. Change the status to "Sold" on the Info tab to capture the sale
  details."

**`src/components/ReportsPanel.jsx`**
- "Reportes" → "Reports"
- "Desglose de Costos (Total)" → "Cost Breakdown (Total)"
- "Aún no hay carros vendidos." → "No cars sold yet."
- "Ganancia por Mes" → "Profit by Month"
- "Inventario Envejecido" → "Aging Inventory"
- "No hay carros disponibles en inventario." → "No available vehicles in
  inventory."
- "Pagos Atrasados" (título de sección) → "Overdue Payments"
- "Pagos Atrasados" (columna de tabla) → "Payments Behind"
- "Monto Atrasado" (columna de tabla) → "Amount Overdue"
- "No hay pagos atrasados." → "No overdue payments."
- "Exportar CSV" → "Export CSV"

**`src/components/AttentionBanner.jsx`**
- "Todo en orden" → "All Clear"
- "{N} carro(s) necesitan atención" → "{N} vehicle(s) need attention"
- "Con pérdida" → "At a Loss"
- "Pagos atrasados" → "Overdue Payments"
- "Inventario viejo" → "Aging Inventory"

Nota: en la tabla de "Pagos Atrasados" de `ReportsPanel.jsx` hay dos strings
distintos con el mismo texto en español hoy — el título de la sección y el
encabezado de columna. En inglés se distinguen: el título de sección queda
"Overdue Payments" y la columna que cuenta cuántos pagos van atrasados queda
"Payments Behind" (para no repetir "Overdue Payments" dos veces en la misma
tabla y quedar ambiguo sobre cuál es cuál).

## Flujo de datos

Sin cambios. `getCarProfitOrEquity` ya existe y ya se usa en este mismo
archivo (`VehicleGrid.jsx`) para el color de cada tarjeta — el agrupado solo
lo reutiliza para particionar el arreglo antes de renderizar.

## Manejo de errores

Ninguno nuevo. Si `visibleCars` está vacío, el comportamiento existente
(mensajes de "no cars yet" / "sin resultados") no cambia.

## Verificación

Sin test automatizado de componentes (mismo criterio que el resto del
proyecto). Verificación manual en navegador: confirmar que los carros
aparecen bajo la sección correcta según su ganancia/equidad, que una sección
vacía no se muestra, que buscar/filtrar sigue funcionando dentro de cada
sección, y una revisión visual de que ya no queda ningún texto en español en
ninguna pantalla (Inventario, Reportes, franja de atención, formulario).
