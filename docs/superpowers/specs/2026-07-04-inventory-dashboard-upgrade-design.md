# Inventory Dashboard Upgrade — Design

## Contexto

El dashboard actual (`src/App.jsx`, ~636 líneas) es una sola pantalla que muestra
KPIs, una grilla de carros, y un formulario de detalle largo, todo en un solo
archivo. Los datos viven en Supabase en una tabla `cars` con una columna JSON
`data`. No hay búsqueda, filtros, orden, ni ninguna vista de reportes; el
formulario de detalle es un scroll largo sin subdivisión visual.

Dolor identificado por el usuario:
- Difícil encontrar/administrar carros en la grilla (sin búsqueda/filtro/orden).
- Formulario de detalle largo y confuso.
- Faltan reportes o una vista general del negocio.

## Alcance

Mejoras enfocadas sobre el dashboard existente. Sin cambios de esquema en
Supabase — todo lo nuevo se deriva de los campos que ya existen
(`purchaseDate`, `paymentStartDate`, `monthlyPayment`, `numberOfPayments`,
`paymentsReceived`, `soldDate`, `status`, `saleType`).

Fuera de alcance: autenticación/roles, router con URLs, base de datos nueva o
cambios de esquema, suite de tests automatizada.

## Arquitectura

Navegación por pestañas dentro de la misma pantalla (estado local, sin
router): **Inventario** y **Reportes**. Las tarjetas KPI (resumen) actuales se
mantienen arriba, visibles en ambas pestañas.

`App.jsx` pasa a ser el orquestador: mantiene el estado (`cars`, `form`,
`selectedCarId`, pestaña activa) y delega el render a componentes nuevos.

### Módulos nuevos

- **`src/lib/carCalculations.js`** — extrae toda la lógica pura de dinero /
  inversión / ganancia / balance que hoy vive inline en `App.jsx`
  (`money`, `numberValue`, `getInvestment`, `isSold`, `getEstimatedValue`,
  `getExpectedSaleValue`, `getCollectedSoFar`, `getBalanceRemaining`,
  `getExpectedProfit`, `getInventoryEquity`, `getCollectedProfit`,
  `getBreakEvenPayment`, `rowToCar`), más dos funciones nuevas:
  - `getDaysInInventory(car)` — días desde `purchaseDate` hasta hoy (o hasta
    `soldDate` si ya se vendió). Devuelve `null` si no hay `purchaseDate`.
  - `getPaymentStatus(car)` — para ventas a crédito, calcula cuántos pagos
    deberían haberse recibido a la fecha (basado en `paymentStartDate` +
    cadencia mensual) vs. `paymentsReceived`, y devuelve
    `{ isOverdue, paymentsBehind, amountOverdue }`. Para cash o no vendidos,
    devuelve `{ isOverdue: false, paymentsBehind: 0, amountOverdue: 0 }`.

- **`src/lib/exportCsv.js`** — función `carsToCsv(cars)` que arma un CSV en
  memoria (campos clave + totales calculados) y dispara la descarga en el
  navegador (blob + link temporal). Sin dependencias nuevas.

- **`src/components/SummaryCards.jsx`** — las tarjetas KPI de arriba,
  recibiendo `summary` como prop.

- **`src/components/VehicleGrid.jsx`** — barra de herramientas + grilla.
  Props: `cars`, `selectedCarId`, `onSelectCar`. Mantiene su propio estado de
  búsqueda/filtro/orden (no necesita subir a `App.jsx` porque no afecta otras
  vistas).
  - Buscador de texto libre (contra `model` y `year`).
  - Filtro de estatus: Todos / Disponible / Listado / Vendido.
  - Filtro de tipo de venta: Todos / Cash / Crédito.
  - Orden: Más reciente (default, orden actual de Supabase), Año, Ganancia
    (desc), Días en inventario (desc).
  - Cada tarjeta muestra, además de lo actual, badges condicionales:
    - Días en inventario (si `status !== "sold"`).
    - "Atrasado" en rojo si `getPaymentStatus(car).isOverdue`.
  - Si el filtro no produce resultados, muestra un estado vacío distinto al de
    "no cars yet" ("No hay carros que coincidan con el filtro").

- **`src/components/VehicleForm.jsx`** — el formulario de detalle actual,
  reorganizado con una sub-navegación de botones (no un `<form>` con
  submit, solo botones que cambian una pestaña interna): **Info** | **Costos**
  | **Venta/Financiamiento** | **Notas**. Misma lógica de guardado/borrado,
  misma barra sticky de acciones. El contenido de cada campo es el mismo que
  hoy, solo agrupado.

- **`src/components/ReportsPanel.jsx`** — nueva vista, recibe `cars`.
  - Desglose de costos promedio por categoría: barras horizontales con CSS
    (ancho proporcional al valor máximo), una fila por categoría de costo
    (auction, repair, parts, transport, admin, title, taxes, detailing,
    advertising, repo, misc).
  - Ganancia por mes: agrupa carros vendidos por mes de `soldDate`, suma
    `getExpectedProfit`, muestra como barras verticales simples con CSS.
  - Inventario envejecido: tabla de carros no vendidos ordenada por días en
    inventario descendente; fila resaltada en ámbar si > 45 días.
  - Pagos atrasados: tabla de carros a crédito con `isOverdue`, mostrando
    carro, pagos atrasados, monto atrasado, balance restante.
  - Botón "Exportar CSV" que llama a `carsToCsv(cars)`.

### Fix menor

- `src/lib/supabase.js` — eliminar `console.log(import.meta.env)` (dejaba
  configuración/keys visibles en la consola del navegador).

## Flujo de datos

Sin cambios en el modelo de datos ni en las llamadas a Supabase existentes
(`select`, `insert`, `update`, `delete` sobre `cars`). Todas las funciones
nuevas son puras y derivan de los campos ya guardados en `data`.

## Manejo de errores

Mismo patrón que hoy: mensajes de estado en texto (`setStatus`) para
operaciones de Supabase. Las funciones de cálculo nuevas (`getDaysInInventory`,
`getPaymentStatus`) devuelven valores neutros (`null` / `false` / `0`) cuando
faltan datos, en vez de lanzar errores, siguiendo el mismo estilo que las
funciones de cálculo existentes.

## Verificación

No existe suite de tests en el proyecto; no se agrega una ahora (fuera de
alcance). Verificación manual en navegador vía servidor de desarrollo:
1. Agregar un carro nuevo y guardarlo.
2. Buscar/filtrar/ordenar en la grilla y confirmar resultados correctos.
3. Cambiar entre pestañas Inventario/Reportes.
4. Confirmar que Reportes calcula bien desglose de costos, ganancia por mes,
   inventario envejecido y pagos atrasados contra datos de prueba conocidos.
5. Exportar CSV y confirmar que el archivo descargado tiene los datos
   correctos.
6. Confirmar que el formulario reorganizado en sub-pestañas guarda/borra igual
   que antes.
