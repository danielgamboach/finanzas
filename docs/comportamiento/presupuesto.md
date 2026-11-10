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
2. Una tarjeta por grupo: **Entra** (ingresos y lo que llega de otro espacio), una por **cada categoría principal de gastos del espacio** (también las que no tienen nada este mes, al final, atenuadas y con "Nada este mes"), ordenadas de mayor a menor, y **Apartar** (lo que se mueve a ahorro, inversión, CDP u otro espacio).
3. Al final, "Agregar un movimiento" (igual que el + de la cabecera, PRM-03).

Cada tarjeta muestra la cara de la categoría, su nombre, el monto del mes (real más lo planeado que falta) y una flecha. Debajo del nombre, lo más importante:

| Caso | Detalle |
|---|---|
| Algún pago atrasado | "1 atrasado" en advertencia |
| Tiene límite (PRM-04) | "Gastado 23.450", y la barra del límite debajo; "Te pasaste por …" en rojo |
| Pagos que se repiten | "1 de 2 pagados" (en Entra "recibidos", en Apartar "movidos") |
| Solo gastos sueltos | "3 movimientos" |

Tocarla abre la página de esa categoría (PRM-09). Tocar un círculo de arriba (PRM-08) abre la misma página.

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

Un pago real va en la categoría que tiene él, no en la de su recurrente: si se cambia la categoría de un pago, en Presupuesto se mueve a la nueva. Y al cambiarla desde Editar movimiento, el recurrente se va con él: los pagos que vienen también quedan en la categoría nueva.

Un pago planeado no existe en la base: se arma desde su recurrente (`plannedTx`, id `plan_<recurrente>_<fecha>`).


Un Mover dinero con categoría (o un recurrente de Mover dinero con categoría) va en el grupo de esa categoría y cuenta ahí como lo que sale, no en Apartar. Sin categoría sigue la regla de siempre (Apartar si va a ahorro, inversión, CDP u otro espacio).

- **Dado** Dinero Simbiótico, Mover ¢830.000 a Simbiosis, con categoría Responsabilidades
- **Entonces** aparece en Responsabilidades con ¢830.000 y no en Apartar

### PRM-03 · Planear

**Estado:** Hecho

Un movimiento planeado se crea **con el mismo formulario de cualquier movimiento** (gasto, ingreso o mover dinero). El + de Presupuesto y "Planear un movimiento" lo abren con **Recurrente** ya prendido; desde Inicio se llega igual prendiendo Recurrente.

Con Recurrente prendido, el formulario pide cada cuánto, la **primera vez** (una fecha) y si es pago manual o cargo automático:

| Primera vez | Qué pasa | Botón |
|---|---|---|
| Hoy o antes | Se registra el movimiento ese día y se repite desde ahí | Guardar gasto |
| Un día que viene | No se registra nada todavía: queda planeado desde ese día (sale en Presupuesto y en Pagos pendientes cuando toca, y ahí se marca como pagado) | Planear |

- **Dado** que el salario llega el 30 de cada mes
- **Cuando** abro +, elijo Ingreso, ¢1.100.000, "Salario", y pongo la primera vez el 30 nov
- **Entonces** el botón dice "Planear" y al guardarlo Entra muestra "Salario · Llega el 30 nov"
- **Y** no aparece ningún ingreso real hasta que marque Cobré

Un movimiento con fecha futura sin Recurrente se guarda como siempre y aparece en su grupo como algo que viene.

Los **límites** (PRM-04) no son movimientos: se ponen desde "Poner un límite" al final de Presupuesto o desde "Poner límite" dentro de la tarjeta de una categoría.

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
- Se crean desde "Poner un límite" (al final) o "Poner límite" dentro de la tarjeta de la categoría, que ya trae la categoría elegida; se editan desde la fila "Límite de …" de la tarjeta.
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

**Estado:** Reemplazada por PRM-13

Debajo del gasto del rango, Inicio dice "Libre en noviembre" con el mismo número de PRM-05. Si en el mes no entra nada (ni real ni planeado), dice "Para gastar" con lo que queda en los planeados abiertos. Sin ninguno de los dos, no se muestra.

### PRM-07 · Lo que había antes

**Estado:** Hecho

- Los pagos fijos ya eran recurrentes: la partida se quitó y el recurrente sigue.
- Los topes pasaron a ser planeados abiertos con el mismo monto.
- Un ahorro con cuenta pasó a ser un recurrente mensual de Mover dinero, de la primera cuenta de débito del espacio a esa cuenta, el último día del mes.
- El salario del espacio (`budget_settings`) ya no se usa: el salario es un ingreso recurrente.

### PRM-08 · Los límites en círculos

**Estado:** Hecho

Debajo de "Libre en noviembre", **cada categoría o subcategoría con límite** (PRM-04) es un círculo de progreso: el emoji en el centro, el anillo lleno según lo gastado del límite (amarillo desde el 80%, rojo al pasarse) y el nombre debajo. Las que no tienen límite no aparecen. Van uno tras otro en una fila que se desliza de lado (de borde a borde en el teléfono). Tocar uno abre la página de esa categoría (PRM-09).

- **Dado** Súper con ¢200.000 y ¢23.450 gastados
- **Entonces** su anillo va al 12%

| Uso | Anillo |
|---|---|
| Menos del 80% | Normal |
| Del 80% al 99% | Advertencia |
| 100% o más | Rojo y lleno |

Sin gastos variables, la fila no aparece. Uno sin categoría sale con el anillo vacío y un ícono de sobre; tocarlo abre su edición para elegirla.

<sub>Dónde vive: átomo `ProgressRing` y molécula `RingRail` en `src/ds/`.</sub>

### PRM-09 · La página de una categoría

**Estado:** Hecho

Tocar una categoría en Presupuesto abre **la página de la categoría** (`#/categoria/<id>`, la misma que se abre desde un movimiento o desde Ajustes → Categorías; ya no hay páginas de rubro aparte), con la flecha atrás y ⋯ arriba. Entra y Apartar, que no son categorías, siguen en `#/rubro/in` y `#/rubro/save`.

1. Arriba, "Gastado en noviembre ¢X" y debajo "Falta ¢Y · ¢Z en total". Si tiene límite, lo destacado es **lo disponible**: un círculo de progreso grande con el emoji de la categoría (mismos colores que PRM-08) y debajo "Disponible en noviembre ¢176.550", con "Gastado ¢23.450 de ¢200.000 · ¢6.539 por día"; si se pasó, "Te pasaste por …" en rojo.
2. Los movimientos del mes en tres grupos: **Atrasados** (planeados que ya vencieron), **Vienen** (planeados que faltan, por fecha) y **Este mes** (los reales, del más nuevo al más viejo). Todos son movimientos y abren su detalle.

3. Debajo del resumen, el período (‹ Noviembre ›): otro mes o período muestra los movimientos de la categoría por día, sin planeados. Si tiene subcategorías, chips para ver una sola (también filtran el mes actual).

Al final, **Agregar un movimiento** abre el formulario de siempre con la categoría ya puesta y Recurrente prendido: ahí se elige si se repite y cada cuánto, si el monto es **siempre el mismo o varía** (luz, agua), si es pago manual o cargo automático, y la primera vez (PRM-03). Apagando Recurrente queda un movimiento de una vez.

El menú ⋯ ofrece, según el caso: **Poner límite** (si no tiene), **Editar límite** y **Quitar límite** (con deshacer), **Agregar un movimiento** y **Editar la categoría**.

### PRM-10 · Pagado con check

**Estado:** Hecho

Un movimiento real ligado a un recurrente lleva un check verde pequeño abajo a la derecha de su cara, igual que el logo de Apple en los cobros de Apple, en todas las listas y en el detalle. Si es un cobro de Apple, gana el logo de Apple. Los planeados no lo llevan.


### PRM-11 · Aviso semanal de un límite

**Estado:** Hecho

En el editor del límite, "Avisarme por semana" (apagado por defecto). Cada semana le toca el límite entre 4,3, y lo que no se gastó pasa a la siguiente: hasta la semana k se puede llevar k × límite / 4,3 (nunca más que el límite). Las semanas son las del espacio ("La semana empieza el"); la del día 1 cuenta sola si tiene 4 días o más del mes, si no se junta con la siguiente. Si lo gastado del mes pasa lo que tocaba hasta esta semana, llega un aviso (uno por semana, `check_limit_alert`). La página de la categoría dice "Esta semana te quedan ¢X" o "Esta semana te pasaste por ¢X", con la semana y hasta cuánto tocaba. Los avisos de 80% y de pasarse del mes siguen igual.

- **Dado** Bares con ¢52.000 al mes y el aviso semanal, semanas de viernes a jueves
- **Cuando** en la semana 1 se gastan ¢15.000
- **Entonces** llega "Te pasaste esta semana en Bares" (tocaban ¢12.093)
- **Dado** en la semana 1 se gastaron ¢8.000
- **Entonces** en la semana 2 tocan hasta ¢24.186 en total (sobraron ¢4.093 de la primera)

---

### PRM-12 · Empezar mes el día de pago

El mes del presupuesto puede empezar el día que entra el salario, no el 1. En Presupuesto, la fila "Este mes" (o "Mes calendario") tiene **Empezar mes**: se elige el día (hoy por defecto, nunca futuro) y desde ahí cuenta el mes hasta que alguien empiece el siguiente. Cualquier miembro del espacio puede hacerlo. Se guarda en `budget_cycles` (`space_id`, `starts_on`), con deshacer.

- Usan el mes así: Presupuesto (libre, límites, ritmo por día), Inicio ("Libre este mes", rango Mes del gráfico y la comparación contra el mes anterior) y los filtros "Este mes" y "Mes pasado" de Movimientos.
- Los pagos fijos siguen venciendo por su fecha ("Vence el 5"): solo cuentan si caen dentro del mes.
- Sin empezar: el mes dura un mes desde su inicio y, si nadie empieza otro, se alarga hasta hoy; pasados 35 días la fila avisa "¿Ya te pagaron?". Un inicio de hace más de dos meses se olvida y vuelve el mes calendario.
- Sin ningún inicio, todo es el mes calendario como antes.
- Mis finanzas todavía usa meses calendario.

Dado que en Simbiosis el mes empezó el 30 oct, cuando se gasta ¢15.000 en Restaurantes el 31 oct, entonces cuenta en el límite de Restaurantes de este mes y no en octubre.

### PRM-13 · Inicio: lo libre primero

**Estado:** Hecho el resumen y los límites; falta "Esta semana" (reemplaza PRM-06)

Inicio contesta "¿voy bien y tengo que hacer algo?", no "¿cuánto gasté?". Arriba, en grande, lo libre del mes (mismo número de PRM-05) y debajo el ritmo:

```
LIBRE EN NOVIEMBRE         403.400 CRC
Unos 19.200 por día · quedan 21 días
Gastado 312.450 · ↓12% vs mismo día de octubre
```

- **Por día** = libre ÷ días que quedan del mes del presupuesto (PRM-12), contando hoy. Lo que queda en los límites ya está en "sale", así que no se suma.
- Debajo del número, una **barra del mes**: lo lleno es lo gastado sobre (gastado + libre) y una marca dice "Hoy" (la parte del mes que ya pasó). Si lo lleno pasa la marca, la barra se pone en advertencia y arriba dice "Más rápido que el mes"; si no, "A buen ritmo"; pasado, en rojo, "Sin margen".
- Por día y Gastado van en una tarjeta de dos columnas.
- **Gastado** pasa a ser contexto. La comparación es contra el mismo día del mes anterior, no contra el mes completo.
- Sin ingreso (ni real ni planeado), arriba va "Para gastar" con lo que queda en los límites (como PRM-06) y el ritmo sale de ese número. Sin ninguno de los dos, el número grande es lo gastado, como hoy.
- Libre menor que cero: "Te pasás por 15.000" en rojo y sin ritmo por día.

- **Dado** libre ¢403.400 el 10 nov, con el mes del 1 al 30
- **Entonces** dice "Unos 19.210 por día · quedan 21 días"

**Categorías en Inicio.** Solo los límites que piden atención, con los mismos círculos de PRM-08: los que van al 80% o más, o arriba de su ritmo semanal (PRM-11). Si ninguno, no aparece nada. El desglose completo por categoría vive en Presupuesto y en Mis finanzas.

- **Dado** Súper al 12%, Restaurantes al 85% y Bares al 104%
- **Entonces** Inicio muestra dos círculos: Restaurantes (advertencia) y Bares (rojo)

**Lo que pide acción** (pagos pendientes, por confirmar, ¿es una suscripción?) sigue arriba de la hoja, que ya se ve al abrir Inicio. El gráfico se queda: "Gastado" toma el rango de la rueda. Pendiente: "Esta semana" con los planeados de los próximos 7 días.

<sub>Dónde vive: `useHomeSummary` (`daysLeft`, `attention`) y `SpendOverview` en `src/screens/Home.tsx`; `BalanceSummary extra`.</sub>

## Preguntas abiertas

**5. Ingresos extra.** Un ingreso no planeado (un freelance) sube lo libre. ¿Inicio lo dice ("+50.000 que no esperabas") o solo cambia el número?

**1. Un gasto único planeado.** Hoy se planea escribiéndolo con fecha futura. Si después llega el voucher real, quedan los dos. ¿Hace falta ligarlos solos (como los recurrentes)?

**2. Meses anteriores y siguientes.** Presupuesto muestra solo el mes actual. ¿Hace falta ‹ › para ver cómo cerró octubre o planear diciembre?

**3. A fin de mes.** ¿Mostrar en Cuentas el saldo esperado a fin de mes con lo planeado?

**4. Kai y la nota de la IA.** Todavía no conocen el presupuesto.
