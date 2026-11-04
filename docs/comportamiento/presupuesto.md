# Presupuesto

El presupuesto es **el mes escrito por adelantado**: los movimientos que ya pasaron y los que van a pasar, agrupados por categoría. No hay una lista aparte de partidas: todo lo que se ve es un movimiento real o uno planeado.

```
LIBRE EN NOVIEMBRE            403.400 CRC
Entra 1.150.000 · sale 746.600 CRC

Entra                                     1.150.000
  Salario              Llega el 30 nov    1.100.000
  ⌄ 1 ingreso                                50.000

🏠 Casa                                     350.000
  Alquiler             Vence el 5 nov       350.000

🛒 Súper                                    200.000
  Súper                Gastado 23.450       200.000   ▬▬──────

💡 Servicios                                 46.400
  Agua AyA             Venció el 2 nov     ≈ 18.400
  CNFL                 Vence el 23 nov     ≈ 28.000

🎬 Salidas                                   22.100
  Netflix              Vence el 13 nov        7.900   (planeado, atenuado)
  Spotify              Ayer · Salidas         5.900
  Café Britt           Ayer · Salidas         8.300

Apartar                                   2.000 USD
  Ahorros              Se mueve el 30 nov
```

Reemplaza las **partidas** (PPT-01 a PPT-09, descartadas el 4 nov 2026 por no ser movimientos). Antes se habían descartado el plan del mes (PRS) y los sobres (SOB). Esos IDs quedan reservados.

## Reglas

### PRM-01 · La pantalla

**Estado:** Hecho

Presupuesto (`#/categorias`) muestra el mes actual:

1. Arriba, "Libre en noviembre" (PRM-05) con "Entra … · sale … · apartás …" debajo.
2. **Entra**: los ingresos del mes y lo que llega de otro espacio (un Mover dinero hacia este espacio), reales y planeados.
3. Un grupo por **categoría principal**, con su total a la derecha, ordenados de mayor a menor. Adentro: los planeados abiertos (PRM-04) y después los movimientos del grupo por fecha: los pagos de los recurrentes, reales y planeados (PRM-02), y los gastos reales que ningún plan cubre. Si estos últimos son más de 3, van plegados en una fila ("8 gastos sin planear") que se despliega con un toque.
4. **Apartar**: lo que se mueve a una cuenta de ahorro, inversión o CDP, o a otro espacio.
5. "Planear algo más" al final (y el + de la cabecera).

Lo planeado (lo que todavía no pasó) va con el monto atenuado; lo real, normal.

- **Dado** Netflix y Disney+, los dos en Suscripciones
- **Entonces** aparecen juntos en el grupo "Suscripciones", con el total de los dos

Una subcategoría se agrupa en su categoría principal: Restaurantes va en Entretenimiento.

<sub>Dónde vive: `buildBudget` en `src/lib/budget.ts`, `Presupuesto` en `src/screens/Partidas.tsx`.</sub>

### PRM-02 · Pagos que se repiten

**Estado:** Hecho

Cada recurrente que cae en el mes es un movimiento planeado. Cuando se paga (con el voucher, "Pagué" o el cargo automático), el pago real lo reemplaza: la fila pasa de "Vence el 5 nov" a "Pagado el 5 nov" en verde, con lo que se pagó de verdad.

| Caso | Resultado esperado |
|---|---|
| Vence el 5 y no se ha pagado | "Vence el 5 nov", monto atenuado |
| Ya pasó el 5 y no se pagó | "Venció el 5 nov" en advertencia |
| Se pagó un monto distinto | Cuenta lo pagado |
| Monto variable (luz, agua) | "≈ 28.000", el promedio de los últimos pagos |
| Semanal | Cuenta cada pago del mes: "2 de 4 pagos · vence el 13 nov" |
| Pospuesto | Cuenta en la fecha nueva |
| Anual que no cae este mes | No aparece |
| Pausado | No aparece (lo ya pagado este mes sí) |
| Pago anticipado de una tarjeta | No aparece: los gastos de la tarjeta ya cuentan |

Ingreso: "Llega el 30 nov" / "Llegó el 30 nov". Ahorro: "Se mueve el 30 nov" / "Movido".

Un pago planeado **es un movimiento**: misma fila que cualquier movimiento (logo del comercio o emoji de la categoría, nombre, categoría, monto), con "Vence el 13 nov" en lugar del día y el monto atenuado. Cada pago del mes es su propia fila (un semanal tiene cuatro), ordenadas por fecha junto a los reales del grupo.

Tocarlo abre el mismo detalle de un movimiento, con la etiqueta "Planeado", "Vence vie 13 nov 2026", la cuenta, la frecuencia y "Más de Netflix" abajo. Arriba, en lugar de Editar:

- **Pagué** (Cobré, Lo moví): la hoja de pagar (cuenta, monto, fecha, Posponer, Ignorar, Dejar de repetir). Al pagar, el detalle pasa a ser el del movimiento real.
- **Editar**: abre el recurrente.

Un pago planeado no existe en la base: se arma desde su recurrente (`plannedTx`, id `plan_<recurrente>_<fecha>`).

### PRM-03 · Planear

**Estado:** Hecho

"Planear" ofrece cuatro cosas:

| Opción | Crea |
|---|---|
| Gasto variable | Un planeado abierto (PRM-04) |
| Pago que se repite | Un recurrente de gasto |
| Ingreso | Un recurrente de ingreso, pago manual, nombre "Salario" para empezar |
| Ahorro | Un recurrente de Mover dinero, pago manual |

Un movimiento con fecha futura (escrito en el formulario de siempre) también aparece en su grupo como algo que viene.

### PRM-04 · Planeado abierto

**Estado:** Hecho

Para gastos que no son un pago fijo (súper, restaurantes, gasolina): un monto al mes para una categoría (y sus subcategorías). Cada gasto real de esa categoría lo va usando. Se repite cada mes con el mismo monto; lo que sobró o se pasó no se arrastra.

- **Dado** Súper con ¢200.000
- **Cuando** al 18 de noviembre llevo ¢23.450
- **Entonces** la fila dice "Gastado 23.450", vale 200.000 y la barra va al 12%
- **Y** el grupo y "sale" cuentan los ¢200.000 (lo gastado más lo que queda)
- **Cuando** llego a ¢215.000
- **Entonces** dice "Te pasaste por 15.000" en rojo y cuenta ¢215.000

| Uso | Barra |
|---|---|
| Menos del 80% | Normal |
| Del 80% al 99% | Advertencia |
| 100% o más | Rojo |

- Una categoría solo puede estar en un planeado abierto.
- Los gastos ligados a un recurrente no lo usan: tienen su fila (PRM-02).
- Al elegir la categoría, sugiere el promedio de los últimos 3 meses completos (sin recurrentes), con "Usar".
- Su detalle (`#/partida/<id>`) muestra lo que queda, los días, el ritmo por día y los gastos del mes.
- Los avisos de "límites" (Ajustes → Notificaciones) llegan al 80% y al pasarse.

<sub>Dónde vive: tabla `envelopes` (`kind = 'cap'`) con su categoría en `envelope_categories`; `check_limit_alert`; `OpenPlanEdit` y `LineView` en `src/screens/Partidas.tsx`.</sub>

### PRM-05 · "Libre en noviembre"

**Estado:** Hecho

```
Libre = entra − sale − apartás
```

Cada término suma lo real del mes más lo planeado que falta:

- **Entra**: ingresos, lo que llega de otro espacio y los recurrentes de esas dos cosas que faltan.
- **Sale**: gastos (las devoluciones restan, las preautorizaciones por confirmar no cuentan), los pagos que faltan y lo que queda de los planeados abiertos.
- **Apartás**: lo movido a ahorro, inversión, CDP u otro espacio, y los ahorros planeados que faltan.

Mover dinero entre cuentas propias del mismo espacio (pagar la tarjeta, de débito a efectivo) no cuenta: no cambia lo libre.

| Caso | Resultado esperado |
|---|---|
| Libre menor que cero | "Te pasás en noviembre" en rojo |
| Nada planeado ni real | Estado vacío con "Planear" |
| Montos en dólares | Se convierten con el tipo de cambio |

### PRM-06 · Inicio

**Estado:** Hecho

Debajo del gasto del rango, Inicio dice "Libre en noviembre" con el mismo número de PRM-05. Si en el mes no entra nada (ni real ni planeado), dice "Para gastar" con lo que queda en los planeados abiertos. Sin ninguno de los dos, no se muestra.

### PRM-07 · Lo que había antes

**Estado:** Hecho

- Los pagos fijos ya eran recurrentes: la partida se quitó y el recurrente sigue.
- Los topes pasaron a ser planeados abiertos con el mismo monto.
- Un ahorro con cuenta pasó a ser un recurrente mensual de Mover dinero, de la primera cuenta de débito del espacio a esa cuenta, el último día del mes.
- El salario del espacio (`budget_settings`) ya no se usa: el salario es un ingreso recurrente.

---

## Preguntas abiertas

**1. Un gasto único planeado.** Hoy se planea escribiéndolo con fecha futura. Si después llega el voucher real, quedan los dos. ¿Hace falta ligarlos solos (como los recurrentes)?

**2. Meses anteriores y siguientes.** Presupuesto muestra solo el mes actual. ¿Hace falta ‹ › para ver cómo cerró octubre o planear diciembre?

**3. A fin de mes.** ¿Mostrar en Cuentas el saldo esperado a fin de mes con lo planeado?

**4. Kai y la nota de la IA.** Todavía no conocen el presupuesto.
