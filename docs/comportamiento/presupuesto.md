# Presupuesto

El presupuesto es una lista de **partidas**, como una hoja de Excel: cuánto va para cada cosa en el mes. Al final dice cuánto te queda libre del salario.

```
Salario                          1.200.000
Presupuestado                      900.000
Te queda libre                     300.000

PAGOS FIJOS                        370.000
  Alquiler de la casa    350.000   Vence el 5
  Suscripciones           20.000   2 de 2 pagados

GASTOS CON TOPE                    280.000
  Súper                  200.000   Quedan 80.490
  Servicios               80.000   Quedan 51.100

AHORRO                             250.000
  Emergencias            100.000   Por apartar   [Aparté]
  Casa propia            150.000   Por mover a Ahorro BAC
```

Todo es **mensual**. El mes nuevo arranca con las mismas partidas y los mismos montos; lo que sobró o lo que se pasó no se arrastra.

Las **categorías** solo dicen qué es un gasto. No tienen límite: los límites viven en las partidas de tope.

> Reemplaza dos versiones descartadas el 31 oct: el plan del mes con ingreso, fijos y variables (PRS-01 a PRS-08) y los sobres semanales, quincenales y mensuales (SOB-01 a SOB-09). Esos IDs quedan reservados.

## Reglas

### PPT-01 · Una partida

**Estado:** Hecho

Una partida tiene nombre, monto al mes, moneda y un tipo. Al agregarla se elige el tipo primero, y cada tipo pide solo lo suyo:

| Tipo | Ejemplo | Pide además | Se ve como |
|---|---|---|---|
| Pago fijo | Alquiler | Día del mes y categoría (opcional) | Vence el 5 / Pagado el 2 |
| Tope | Restaurantes | Qué categorías cuentan | Quedan 31.000 de 60.000, con barra |
| Ahorro | Emergencias | La cuenta a donde va (opcional) | Por apartar / Apartado |

Borrar una partida la saca del presupuesto, con deshacer. Si era un pago fijo, su recurrente sigue en Recurrentes.

<sub>Dónde vive: tabla `envelopes` (columna `kind`), `LineEdit` en `src/screens/Partidas.tsx`.</sub>

### PPT-02 · Pago fijo

**Estado:** Hecho

Un pago fijo **es** un recurrente mensual: al crearlo en Presupuesto se crea en Recurrentes (pago manual, ese día de cada mes), y al editarlo se actualizan los dos. Así sigue apareciendo en Pagos pendientes cuando toca pagarlo.

- **Dado** que agrego "Alquiler de la casa", ¢500.000, el día 5
- **Entonces** aparece en Pagos fijos con "Vence el 5 nov"
- **Y** en Recurrentes hay un "Alquiler de la casa" mensual de ¢500.000
- **Cuando** registro el pago (desde Pagos pendientes o ligado al recurrente)
- **Entonces** la fila dice "Pagado el 5 nov" en verde

**Varios pagos de una categoría:** un pago fijo puede agrupar todos los recurrentes de gasto de una categoría, por ejemplo Suscripciones. No crea recurrentes; muestra "3 de 4 pagados" con los que caen en el mes. Al elegir la categoría, sugiere la suma de sus recurrentes como monto.

| Caso | Resultado esperado |
|---|---|
| Venció y no se pagó | "Venció el 5 nov" en advertencia |
| No toca este mes (un pago anual) | "No se paga este mes" |
| El día es 31 y el mes tiene 30 | Vence el último día del mes |
| Cambio el día de 5 a 10 | El próximo vencimiento pasa al 10 |

El monto que cuenta en el presupuesto es el de la partida, aunque el pago real sea distinto.

### PPT-03 · Tope

**Estado:** Hecho

Un tope es lo máximo que querés gastar en el mes en una o varias categorías. Le cuenta todo gasto de esas categorías (y sus subcategorías) del mes, con la misma regla que el gasto del mes: devoluciones restan, preautorizaciones por confirmar no cuentan, Mover dinero no es gasto.

- **Dado** "Restaurantes" con tope de ¢60.000
- **Cuando** al 18 de noviembre llevo ¢29.000
- **Entonces** la fila dice "Quedan 31.000 de 60.000 CRC" con la barra al 48%
- **Y** su detalle dice "Quedan en noviembre 31.000 CRC · 13 días · 2.385 CRC por día"

| Uso | Barra |
|---|---|
| Menos del 80% | Normal |
| Del 80% al 99% | Advertencia |
| 100% o más | Rojo y "Te pasaste por …" |

Una categoría solo puede estar en un tope. Una principal incluye sus subcategorías; si una subcategoría ya está en otro tope, la principal no se puede elegir.

Los avisos de "límites" (Ajustes → Notificaciones) llegan al 80% y al pasarse de un tope.

<sub>Dónde vive: `envelope_categories`, `check_limit_alert`, `LineView` en `src/screens/Partidas.tsx`.</sub>

### PPT-04 · Ahorro

**Estado:** Hecho

Un ahorro es lo que querés separar en el mes.

- Con cuenta: queda **apartado** cuando en el mes entra a esa cuenta al menos el monto (Mover dinero desde otra cuenta, o un ingreso directo).
- Sin cuenta: la fila muestra "¢100.000 · por apartar" con el botón **Aparté**, que lo marca para ese mes (con deshacer).

- **Dado** "Casa propia", ¢150.000, a la cuenta Ahorro BAC
- **Cuando** muevo ¢150.000 de Débito a Ahorro BAC
- **Entonces** la fila dice "Apartado en Ahorro BAC"

<sub>Dónde vive: `envelopes.account_id`, `envelope_marks`.</sub>

### PPT-05 · Salario y "Te queda libre"

**Estado:** Hecho

El salario del espacio se escribe una vez y se repite cada mes; se edita o se quita desde el botón "Salario".

```
Te queda libre = salario − suma de todas las partidas
```

- **Dado** salario ¢1.200.000 y partidas por ¢900.000
- **Entonces** arriba dice "Te queda libre 300.000 CRC" y debajo "Salario 1.200.000 · presupuestado 900.000 CRC"

| Caso | Resultado esperado |
|---|---|
| Sin salario | Arriba dice "Presupuestado" con la suma y el botón "Agregar salario" |
| Las partidas suman más que el salario | "Presupuestaste de más" en rojo |
| Salario en dólares | Se convierte con el tipo de cambio actual |

<sub>Dónde vive: `budget_settings`.</sub>

### PPT-06 · "Para gastar" en Inicio

**Estado:** Hecho

Inicio dice "… CRC Para gastar": la suma de lo que queda en todos los topes del mes. No cuenta pagos fijos ni ahorro, porque esa plata ya tiene destino. Responde "¿puedo ir hoy al restaurante?".

- **Dado** Súper (quedan ¢80.490) y Servicios (quedan ¢51.100)
- **Entonces** Inicio dice "131.590 CRC Para gastar"

Si un tope se pasa, lo que se pasó resta del total. Sin topes, no se muestra.

<sub>Dónde vive: `buildBudget` en `src/lib/budget.ts`, `useHomeSummary` en `src/screens/Home.tsx`.</sub>

### PPT-07 · La pantalla

**Estado:** Hecho

Presupuesto (`#/categorias`) muestra el mes actual:

1. Arriba, "Te queda libre" (PPT-05).
2. Tres grupos con su total a la derecha, en este orden: **Pagos fijos**, **Gastos con tope** y **Ahorro**. Un grupo sin partidas no se muestra.
3. "Agregar partida" al final (y el + de la cabecera).

Tocar un tope abre su detalle (lo que queda, el ritmo por día, sus categorías y los movimientos del mes). Tocar un pago fijo o un ahorro abre su edición.

Los gastos que no están en ningún tope no aparecen aquí: se ven en Mis finanzas.

### PPT-08 · Lo que había antes

**Estado:** Hecho

Los sobres que ya existían pasaron a ser topes mensuales con el mismo monto y las mismas categorías. "Todo lo demás" ya no se usa.

---

## Preguntas abiertas

**1. Salario distinto un mes.** Hoy el salario es uno solo y se repite. Si un mes entra un bono, ¿hace falta poder cambiarlo solo para ese mes?

**2. Meses anteriores.** Presupuesto muestra solo el mes actual. ¿Hace falta ver cómo cerró un mes pasado (qué topes se pasaron)?

**3. Kai y la nota de la IA.** Todavía no conocen las partidas.
