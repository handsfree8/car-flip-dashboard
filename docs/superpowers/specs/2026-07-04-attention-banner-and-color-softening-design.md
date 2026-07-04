# Attention Banner & Color Softening — Design

## Contexto

Tras el upgrade del dashboard (filtros, sub-pestañas, Reportes), el usuario reportó
que hay demasiado rojo disperso por toda la app: KPI "Profit Collected" en rojo
cuando es negativo, tarjetas de carro en rojo cuando el carro está en pérdida, la
gráfica de "Ganancia por Mes" con barras rojas, y las tablas de "Inventario
Envejecido"/"Pagos Atrasados" en Reportes enteramente en rojo. El feedback fue: no
se debe usar tanto rojo, hay que agrupar lo urgente en una sección aparte, y aplicar
un diseño más profesional. Se validó en una sesión de brainstorming con companion
visual: el usuario eligió la paleta "Ámbar profesional" sobre dos alternativas
(gris neutro, y neutro total sin color por signo).

## Alcance

- Franja persistente "Necesita Atención" visible en ambas pestañas (Inventario y
  Reportes), agrupando: carros con pérdida, pagos atrasados, e inventario viejo.
- Recoloreo de rojo → ámbar en todo lo que no sea la franja de atención (KPIs,
  grilla de carros, gráfica de ganancia por mes, tablas de Reportes).
- Rojo queda reservado exclusivamente para la franja de atención y sus badges.

Fuera de alcance: cambios de esquema en Supabase, deduplicación de carros que
aparecen en más de una categoría de atención (un carro puede aparecer en varias
listas simultáneamente, sin problema), paginación/truncado de las listas (se
asume inventario de tamaño manejable, igual que en el resto del dashboard).

## Arquitectura

### Lógica nueva en `src/lib/carCalculations.js`

- **`getCarProfitOrEquity(car)`** — nueva función que centraliza el patrón hoy
  repetido tres veces inline en `VehicleGrid.jsx` (`car.status === "sold" ?
  getExpectedProfit(car) : getInventoryEquity(car)`, en el comparador de orden
  por "profit" y en el render de cada tarjeta). Internamente usa `isSold(car)`
  (ya existe en `carCalculations.js`) en vez de comparar el string directamente.
  `VehicleGrid.jsx` se actualiza para llamar a esta función en sus tres usos,
  eliminando la duplicación del ternario.
- **`getVehiclesAtLoss(cars)`** — devuelve los carros donde
  `getCarProfitOrEquity(car) < 0`, cada uno como `{ car, amount }`, ordenados de
  mayor pérdida a menor (más negativo primero).
- Se reutilizan sin cambios: `getPaymentStatus(car)` (para pagos atrasados) y
  `getAgingInventory(cars)` (para inventario viejo, ya marca `isStale`).

### Componente nuevo: `src/components/AttentionBanner.jsx`

Props: `{ cars, onSelectCar }`.

- Calcula internamente `vehiclesAtLoss = getVehiclesAtLoss(cars)`,
  `overdue = cars.filter(car => getPaymentStatus(car).isOverdue)`, y
  `staleInventory = getAgingInventory(cars).filter(entry => entry.isStale)`.
- Estado colapsado (default): una barra con un ícono de alerta y el texto
  "`N` carro(s) necesitan atención", donde `N` es la suma de items en las tres
  categorías (sin deduplicar). Si `N === 0`, la barra cambia a un estado neutro
  positivo: "Todo en orden" con ícono de check, en verde esmeralda (no rojo).
- Al hacer click, se expande mostrando hasta tres subsecciones (solo las que
  tengan al menos un elemento), cada una con su propio encabezado:
  - "Con pérdida" — lista de `{car, amount}`, más negativo primero.
  - "Pagos atrasados" — lista de carros con su `paymentsBehind`/`amountOverdue`.
  - "Inventario viejo" — lista de `{car, days}` marcados `isStale`.
- Cada fila de carro en cualquier subsección es clickeable: llama a
  `onSelectCar(car)` (misma función que ya usa `VehicleGrid`) y cambia la pestaña
  activa a "Inventario" — el usuario cae directo en el formulario de ese carro.
  Para esto, `App.jsx` pasa tanto `onSelectCar` (existente) como una función que
  además fuerza `setActiveTab("inventory")`.
- Toda la franja (colapsada o expandida) usa rojo/rojo-claro únicamente aquí —
  es la única superficie del dashboard donde el rojo sigue existiendo.

### Ubicación en `App.jsx`

`<AttentionBanner>` se renderiza una sola vez, entre `<SummaryCards>` y el switch
de pestañas Inventario/Reportes — por eso es visible sin importar en cuál de las
dos pestañas esté el usuario, sin necesidad de duplicar el componente ni manejar
estado de pestaña dentro de él (solo dispara el cambio de pestaña vía prop).

## Recoloreo (ámbar reemplaza rojo fuera de la franja)

Se usan las clases de Tailwind ya disponibles en el proyecto (mismo mecanismo que
`text-emerald-600`/`text-red-600`/`bg-red-500` hoy): todo `text-red-600` que hoy
marca un valor negativo pasa a `text-amber-700`, y todo `bg-red-500` (barras)
pasa a `bg-amber-500`. El verde (`text-emerald-600`/`bg-emerald-500`) no cambia.
Estas dos clases (`amber-700` para texto, `amber-500` para barras/indicadores)
son las únicas nuevas clases de color que introduce este cambio.

Archivos afectados (cambian su color de negativo de rojo a ámbar; el positivo en
verde esmeralda no cambia):

- `src/components/SummaryCards.jsx` — las tarjetas "Expected Profit" y "Profit
  Collected" cuando `highlight === false`.
- `src/components/VehicleGrid.jsx` — el texto de ganancia/equidad por carro
  cuando es negativo (ahora vía `getCarProfitOrEquity`).
- `src/components/ReportsPanel.jsx` — las barras de "Ganancia por Mes" cuando el
  mes tuvo pérdida; las filas de "Inventario Envejecido" marcadas `isStale`; la
  tabla completa de "Pagos Atrasados" (hoy en `text-red-600` fijo).

## Flujo de datos

Sin cambios de esquema ni de las llamadas a Supabase. Todo lo nuevo se deriva de
`cars`, que ya fluye desde `App.jsx` hacia `VehicleGrid`, `VehicleForm`, y
`ReportsPanel` — `AttentionBanner` recibe la misma prop `cars` sin necesidad de
un nuevo estado.

## Manejo de errores

Ninguno nuevo: `getVehiclesAtLoss` sigue el mismo estilo que las funciones de
`carCalculations.js` ya existentes (devuelve un arreglo vacío si no hay datos,
sin lanzar excepciones).

## Verificación

Sin suite de tests de componentes (mismo criterio que el resto del proyecto):
`getCarProfitOrEquity` y `getVehiclesAtLoss` se prueban con `node:test` en
`carCalculations.test.js`. El resto se verifica manualmente en navegador:
franja colapsada/expandida con datos reales, click en un carro de la franja te
lleva a Inventario con el formulario abierto, colores ámbar en vez de rojo en
KPIs/grilla/Reportes, y el estado "Todo en orden" cuando no hay nada pendiente
(puede probarse filtrando manualmente o con datos de prueba si el inventario real
siempre tiene algo pendiente).
