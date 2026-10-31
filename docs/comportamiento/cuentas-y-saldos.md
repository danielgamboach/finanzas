# Cuentas y saldos

Cómo se calcula lo que hay en cada cuenta, lo que se debe en las tarjetas y préstamos, el patrimonio neto y el avance de las metas.

**Cuentas de los ejemplos** (todas en el mismo espacio, tipo de cambio ¢500 por dólar):

| Cuenta | Tipo | Moneda |
|---|---|---|
| Débito BAC | Débito | Colones |
| Ahorro | Ahorro | Dólares |
| Inversión | Inversión | Colones |
| Visa | Tarjeta de crédito | Colones y dólares |
| Préstamo carro | Préstamo | Colones |

---

## Saldos de las cuentas

Aplica a todas las cuentas menos las tarjetas: débito, ahorro, efectivo, inversión, CDP, préstamo y otra.

La idea general: **el saldo es el último que escribiste a mano, más todo lo que se movió en esa cuenta después.** Así no hay que actualizar saldos a cada rato; basta con escribirlo de vez en cuando para corregir lo que el app no vio.

### CTA-01 · Una cuenta sin saldo escrito no tiene saldo

Mientras no se escriba un saldo, la cuenta muestra "Sin saldo", no suma al patrimonio y cuenta como saldo sin actualizar. Los movimientos que tenga no le inventan un saldo.

- **Dado** que creé la cuenta Débito BAC sin escribir saldo
- **Cuando** registro un ingreso de ¢100.000 en Débito BAC
- **Entonces** Débito BAC sigue diciendo "Sin saldo"
- **Y** el patrimonio neto no cambia

<sub>Dónde vive: `accountBalanceAt` en `src/lib/calc.ts` devuelve null sin saldo.</sub>

### CTA-02 · El saldo escrito es el punto de partida

Un saldo se escribe al crear o editar la cuenta, o en Cuentas → Saldos. Desde ese momento, el app le suma y resta los movimientos de la cuenta.

- **Dado** que Débito BAC no tiene movimientos
- **Cuando** el 29 oct a las 9:00 escribo en Saldos que tiene ¢500.000
- **Entonces** Débito BAC muestra 500.000 CRC
- **Y** la vista de la cuenta dice "Saldo del 29 oct"

| Variante | Resultado esperado |
|---|---|
| El mismo día a las 15:00 escribo otro saldo, ¢480.000 | El de las 15:00 reemplaza al de las 9:00. Lo que se movió entre las 9:00 y las 15:00 ya no cuenta, porque se supone que el saldo nuevo ya lo incluye |
| Escribo el saldo de hoy y al día siguiente escribo otro | El del día siguiente es el nuevo punto de partida; el viejo queda en el historial |

<sub>Dónde vive: `Saldos` y `snapshotMoment` en `src/screens/Patrimonio.tsx` y `src/lib/calc.ts`. Tabla `balance_snapshots`, uno por cuenta y día.</sub>

### CTA-03 · Lo que pasó antes del saldo no cuenta

Un movimiento con fecha y hora anterior al momento en que se escribió el saldo no lo cambia, porque el saldo del banco ya lo incluía.

- **Dado** que el 29 oct a las 9:00 escribí que Débito BAC tiene ¢500.000
- **Cuando** registro un gasto de ¢20.000 con fecha 28 oct
- **Entonces** Débito BAC sigue en 500.000 CRC

> Ver la pregunta abierta 2: un voucher que llega tarde.

<sub>Dónde vive: `accountDelta` solo suma movimientos con fecha posterior al saldo.</sub>

### CTA-04 · Un ingreso suma a su cuenta

- **Dado** que Débito BAC tiene un saldo escrito de ¢500.000 el 29 oct
- **Cuando** registro un ingreso (salario) de ¢1.200.000 en Débito BAC el 31 oct
- **Entonces** Débito BAC muestra 1.700.000 CRC
- **Y** la vista de la cuenta dice "Desde ¢500.000 el 29 oct, más movimientos"
- **Y** el patrimonio neto sube ¢1.200.000
- **Y** el gasto del mes en Inicio no cambia
- **Y** "Disponible" del presupuesto no cambia

| Variante | Resultado esperado |
|---|---|
| El ingreso tiene fecha 5 nov (futura) | Hoy Débito BAC sigue en ¢500.000. El 5 nov pasa a ¢1.700.000 sin hacer nada |
| El ingreso tiene fecha 28 oct (antes del saldo) | No cambia nada (CTA-03) |
| El ingreso es de $2.400 en vez de colones | Suma su equivalente en colones (CTA-09) |
| Elimino el ingreso | Débito BAC vuelve a ¢500.000 |
| Edito el ingreso y lo paso a la cuenta Ahorro | Débito BAC vuelve a ¢500.000 y Ahorro sube |

### CTA-05 · Un gasto resta de su cuenta

- **Dado** que Débito BAC tiene ¢1.700.000
- **Cuando** registro un gasto de ¢23.450 en Débito BAC
- **Entonces** Débito BAC muestra 1.676.550 CRC
- **Y** el gasto del mes sube ¢23.450

| Variante | Resultado esperado |
|---|---|
| El gasto es con la Visa | Débito BAC no cambia; la Visa debe ¢23.450 más (TAR-01) |
| Es una preautorización de Uber "Por confirmar" | No resta todavía (CTA-10) |

### CTA-06 · Una devolución suma a su cuenta

- **Dado** que Débito BAC tiene ¢1.676.550
- **Cuando** llega una devolución de ¢23.450 a Débito BAC
- **Entonces** Débito BAC vuelve a 1.700.000 CRC
- **Y** el gasto del mes baja ¢23.450

En una tarjeta, una devolución baja lo que se debe (TAR-01).

### CTA-07 · Mover dinero resta en una cuenta y suma en la otra

- **Dado** que Débito BAC tiene ¢1.700.000 y Ahorro tiene $2.000
- **Cuando** muevo ¢500.000 de Débito BAC a Ahorro, un día en que el dólar está a ¢500
- **Entonces** Débito BAC muestra 1.200.000 CRC
- **Y** Ahorro muestra 3.000 USD
- **Y** el patrimonio neto no cambia
- **Y** el gasto del mes no cambia

| Variante | Resultado esperado |
|---|---|
| Muevo de Débito BAC a la Visa | Es un pago de tarjeta (TAR-03) |
| Muevo de Débito BAC al Préstamo carro | Débito baja y el préstamo debe menos (PRE-01) |
| Origen y destino son la misma cuenta | No cambia nada |

### CTA-08 · Un aporte suma a la cuenta que lo recibe

Un aporte es dinero que una persona pone en un espacio compartido (por ejemplo, la parte de cada uno para los gastos de la casa).

- **Dado** que la cuenta de débito del espacio compartido tiene ¢200.000
- **Cuando** registro un aporte de Dani de ¢300.000 a esa cuenta
- **Entonces** esa cuenta muestra 500.000 CRC

> Ver la pregunta abierta 3: la cuenta de donde sale el aporte no baja.

### CTA-09 · Un movimiento en la otra moneda se convierte

| Caso | Cómo se convierte |
|---|---|
| Cuenta en dólares, movimiento en colones | Se divide entre el tipo de cambio del día del movimiento |
| Cuenta en colones, movimiento en dólares | Se usa el monto en colones que quedó guardado en el movimiento (el tipo de cambio de cuando se registró) |
| Misma moneda | Sin conversión |

- **Dado** que Ahorro (dólares) tiene $2.000 y el 30 oct el dólar estaba a ¢500
- **Cuando** registro un ingreso de ¢100.000 en Ahorro con fecha 30 oct
- **Entonces** Ahorro muestra 2.200 USD

<sub>Dónde vive: `accountDelta` en `src/lib/calc.ts`, tipos de cambio en la tabla `fx_rates`.</sub>

### CTA-10 · Las preautorizaciones no cuentan hasta que se cobran

- **Dado** que Débito BAC tiene ¢1.700.000
- **Cuando** llegan dos preautorizaciones de Uber de ¢4.500 en 10 minutos y quedan "Por confirmar"
- **Entonces** Débito BAC sigue en 1.700.000 CRC

| Variante | Resultado esperado |
|---|---|
| Pasan 48 horas | Se confirma sola y resta ¢4.500 |
| Toco "No se cobró" | Desaparece del app y nunca resta |

Misma regla que el gasto del mes: lo que está por confirmar no cuenta en ningún lado.

### CTA-11 · Editar, eliminar y deshacer recalculan el saldo

Cualquier cambio a un movimiento (monto, cuenta, fecha, tipo) se refleja en el saldo de las cuentas afectadas en cuanto se guarda. Eliminar lo quita y deshacer lo devuelve.

| Caso | Resultado esperado |
|---|---|
| Cambio el monto de un gasto de ¢20.000 a ¢25.000 | La cuenta baja ¢5.000 más |
| Cambio la fecha de un gasto a antes del último saldo escrito | Deja de contar (CTA-03) |
| Elimino un movimiento y toco Deshacer | El saldo queda igual que antes de eliminar |

---

## Préstamos

### PRE-01 · El saldo de un préstamo es lo que se debe

Se escribe como número positivo: lo que falta por pagar. El dinero que entra al préstamo baja la deuda; un gasto cargado al préstamo la sube. En el patrimonio, un préstamo siempre resta.

- **Dado** que Préstamo carro tiene un saldo escrito de ¢4.000.000 y Débito BAC tiene ¢1.700.000
- **Cuando** muevo ¢150.000 de Débito BAC a Préstamo carro (la cuota)
- **Entonces** Préstamo carro muestra 3.850.000 CRC
- **Y** Débito BAC muestra 1.550.000 CRC
- **Y** el patrimonio neto no cambia (hay ¢150.000 menos en la cuenta y ¢150.000 menos de deuda)

<sub>Dónde vive: el caso `loan` al final de `accountBalanceAt`.</sub>

---

## Tarjetas de crédito

Las tarjetas no tienen saldo escrito. Lo que se debe sale solo de los movimientos.

### TAR-01 · Lo que se debe son los cargos desde el último pago

Gastos menos devoluciones, desde el último pago registrado. Las preautorizaciones por confirmar no cuentan. Nunca es negativo.

- **Dado** que la Visa se pagó el 15 oct
- **Y** después tuvo un gasto de ¢23.450 el 20 oct, uno de ¢10.000 el 25 oct y una devolución de ¢3.450 el 26 oct
- **Y** tiene una preautorización de Uber de ¢4.500 por confirmar
- **Entonces** la Visa debe 30.000 CRC
- **Y** el patrimonio neto resta ¢30.000 por la Visa

| Variante | Resultado esperado |
|---|---|
| Un gasto del 10 oct (antes del pago) | No cuenta |
| La devolución es mayor que los cargos | La Visa debe 0, no un número negativo |

<sub>Dónde vive: `cardPaidThrough` y `cardOutstanding` en `src/lib/calc.ts`.</sub>

### TAR-02 · Sin pagos registrados, cuenta solo el mes actual

- **Dado** que la Visa nunca tuvo un pago registrado
- **Y** tuvo gastos el 28 sep por ¢50.000 y el 3 oct por ¢20.000
- **Cuando** abro Cuentas el 31 oct
- **Entonces** la Visa debe 20.000 CRC

### TAR-03 · Pagar la tarjeta la deja en cero

Cualquier movimiento de "Mover" hacia la tarjeta cuenta como pago y la deja en cero hasta ese momento, sin importar el monto. Los cargos posteriores al pago vuelven a sumar.

- **Dado** que la Visa debe ¢30.000
- **Cuando** muevo ¢30.000 de Débito BAC a la Visa el 31 oct a las 10:00
- **Entonces** la Visa debe 0 CRC y su vista dice "Al día"
- **Y** Débito BAC baja ¢30.000
- **Y** un gasto con la Visa a las 11:00 la pone en deuda otra vez

> Ver la pregunta abierta 1: un pago parcial también la deja en cero.

### TAR-04 · "Ya la pagué"

En la vista de una tarjeta que debe algo, el botón "Ya la pagué" registra el pago por lo que se debe.

- **Dado** que la Visa debe ¢30.000 y el espacio tiene Débito BAC en colones
- **Cuando** toco "Ya la pagué"
- **Entonces** se crea un movimiento "Pago de tarjeta" de ¢30.000 de Débito BAC a la Visa
- **Y** la Visa debe 0 CRC
- **Y** Débito BAC baja ¢30.000
- **Y** aparece el aviso "Visa: pagada" con Deshacer

| Variante | Resultado esperado |
|---|---|
| Toco Deshacer | Se borra el pago; la Visa vuelve a deber ¢30.000 y Débito BAC recupera los ¢30.000 |
| La tarjeta debe 0 | El botón no aparece |
| El espacio tiene una cuenta de débito en dólares y otra en colones | Sale de la de colones |
| El espacio no tiene cuenta de débito | La tarjeta queda en cero y ninguna cuenta baja |

<sub>Dónde vive: `CardPaid` en `src/screens/Patrimonio.tsx`.</sub>

### TAR-05 · Pago semanal de la tarjeta en el espacio compartido

En un espacio compartido, cada semana aparece "Pago de tarjeta" (en Inicio y en Recurrentes) con lo que se cargó a las tarjetas del espacio la semana anterior. La semana empieza el día configurado en el espacio (viernes por defecto).

- **Dado** que la semana pasada (viernes a jueves) se cargaron ¢80.000 entre todas las tarjetas del espacio
- **Y** esta semana van ¢15.000
- **Cuando** toco "Pagué"
- **Entonces** se registra un pago de ¢80.000 desde la cuenta de débito del espacio
- **Y** todas las tarjetas del espacio quedan pagadas hasta el final de la semana pasada
- **Y** las tarjetas deben solo los ¢15.000 de esta semana
- **Y** el aviso de pago no vuelve a aparecer hasta la semana siguiente

| Variante | Resultado esperado |
|---|---|
| La semana pasada no hubo cargos | No aparece el aviso |
| Es un espacio personal | No aparece el aviso |

> Ver la pregunta abierta 4: de qué cuenta sale.

<sub>Dónde vive: `useCardPayment` en `src/screens/Recurrentes.tsx`; el pago lleva `external_id = card-week:<inicio de semana>`.</sub>

### TAR-06 · Cargos en dólares

Lo que se debe se muestra como un solo número en la moneda de visualización. Si hay cargos en las dos monedas, la vista de la tarjeta además los separa debajo.

- **Dado** que desde el último pago la Visa tiene ¢30.000 en cargos en colones y $20 en cargos en dólares, con el dólar a ¢500
- **Entonces** la vista de la Visa dice "Por pagar" 40.000 CRC
- **Y** debajo dice "¢30.000 + $20,00"
- **Y** la lista de Cuentas muestra 40.000 CRC

---

## Patrimonio neto

### PAT-01 · Patrimonio = lo que hay menos lo que se debe

Suma débito, ahorro, efectivo, otra, inversión y CDP; resta tarjetas y préstamos. Las cuentas en dólares se convierten con el tipo de cambio de hoy. Las cuentas archivadas y las que no tienen saldo escrito no cuentan. Cada espacio tiene su propio patrimonio.

- **Dado** Débito BAC ¢1.700.000, Ahorro $1.000, Inversión ¢2.000.000, Visa debe ¢30.000 y Préstamo carro ¢3.850.000, con el dólar a ¢500
- **Entonces** el patrimonio neto es ¢320.000

| | |
|---|---|
| Débito BAC | + ¢1.700.000 |
| Ahorro ($1.000 × 500) | + ¢500.000 |
| Inversión | + ¢2.000.000 |
| Visa | − ¢30.000 |
| Préstamo carro | − ¢3.850.000 |
| **Patrimonio** | **¢320.000** |

<sub>Dónde vive: `useNetWorth` en `src/screens/Patrimonio.tsx`.</sub>

### PAT-02 · Saldos sin actualizar

Cuentas muestra "N saldos sin actualizar" debajo del patrimonio. Cuenta las cuentas (no tarjetas) sin saldo escrito o cuyo último saldo escrito tiene más de 10 días.

- **Dado** que escribí el saldo de Débito BAC el 15 oct y Ahorro no tiene saldo
- **Cuando** abro Cuentas el 31 oct
- **Entonces** dice "2 saldos sin actualizar"

> Ver la pregunta abierta 5.

### PAT-03 · Cambio en las inversiones

Las cuentas de inversión y los CDP muestran, en verde o rojo, cuánto cambió su último saldo escrito contra el anterior. Los movimientos no cuentan para este número.

- **Dado** que el CDP tenía un saldo escrito de ¢1.000.000
- **Cuando** escribo que ahora tiene ¢1.008.000
- **Entonces** la fila del CDP muestra "+¢8.000 (+0,80%)" en verde

---

## Metas

### MET-01 · El avance de una meta es la suma de sus cuentas

Lo ahorrado es el saldo actual de las cuentas ligadas a la meta, en colones. El porcentaje se redondea y no pasa de 100%. Una cuenta ligada sin saldo suma 0.

- **Dado** la meta Casa de $20.000 (¢10.000.000 con el dólar a ¢500), ligada a Ahorro ($1.000) e Inversión (¢2.000.000)
- **Entonces** la meta muestra "¢2.500.000 de ¢10.000.000" y 25%

| Variante | Resultado esperado |
|---|---|
| Registro un ingreso de $1.000 en Ahorro | La meta sube a ¢3.000.000 y 30% |
| Las cuentas suman más que la meta | Muestra 100% |

<sub>Dónde vive: lista de metas en `src/screens/Patrimonio.tsx`.</sub>

---

## Preguntas abiertas

Cosas que el app hace hoy y que hay que confirmar si son a propósito. Al contestar, la respuesta se vuelve regla (o se arregla el app).

**1. Un pago parcial deja la tarjeta en cero.** Si la Visa debe ¢30.000 y muevo ¢10.000 a la Visa, el app la muestra al día, aunque faltan ¢20.000. ¿Debería restar solo lo pagado?

**2. Un voucher que llega tarde no cuenta.** Compro algo a las 10:00, escribo el saldo de Débito BAC a las 10:30 (el banco ya lo había descontado) y el correo del BAC llega a las 10:45 con hora 10:00. Hoy no cuenta, lo cual es correcto si el banco ya lo había descontado. Pero si escribo el saldo y la compra todavía no aparecía en el banco, el saldo queda alto. ¿Lo dejamos así? Es raro, y se corrige escribiendo el saldo otra vez.

**3. Un aporte no baja la cuenta de donde sale.** Si Dani aporta ¢300.000 al espacio compartido y elige su cuenta personal como origen, esa cuenta no baja. ¿Debería bajar, o el aporte es solo "entra dinero al compartido" y la salida se registra aparte?

**4. El pago semanal sale de la primera cuenta de débito, sin mirar la moneda.** "Ya la pagué" prefiere la cuenta de débito en colones; el pago semanal del compartido toma la primera que encuentre, aunque sea en dólares. ¿Deberían comportarse igual?

**5. ¿Sigue teniendo sentido "saldos sin actualizar" a los 10 días?** Antes el saldo solo cambiaba al escribirlo; ahora los movimientos lo mueven solo. Escribirlo cada tanto sigue sirviendo para corregir lo que el app no vio (comisiones, intereses), pero tal vez 10 días es muy poco y el aviso se vuelve ruido.

**6. Un ingreso cargado a una tarjeta no baja lo que se debe.** Solo las devoluciones y los pagos la bajan. Si llega un reembolso o un cashback registrado como ingreso en la Visa, la deuda no cambia. ¿Es correcto?
