# Cuentas y saldos

Qué puede hacer cada tipo de cuenta, cómo se calcula lo que hay en cada una, lo que se debe en tarjetas y préstamos, los CDP, el patrimonio neto y el avance de las metas.

**Cuentas de los ejemplos** (todas en el mismo espacio, tipo de cambio ¢500 por dólar):

| Cuenta | Tipo | Moneda |
|---|---|---|
| Débito BAC | Débito | Colones |
| Ahorro | Ahorro | Dólares |
| Inversión | Inversión | Colones |
| Visa | Tarjeta de crédito | Colones y dólares |
| Préstamo carro | Préstamo | Colones |

---

## Tipos de cuenta

### CTA-12 · Qué puede hacer cada tipo de cuenta

**Estado:** Hecho

Cada tipo de cuenta funciona distinto. El formulario de movimientos solo ofrece las cuentas que sirven para ese movimiento.

| Tipo | Su número | Paga gastos | Recibe ingresos | Origen de Mover | Destino de Mover |
|---|---|---|---|---|---|
| Débito o corriente | Saldo | Sí | Sí | Sí | Sí |
| Ahorro | Saldo | Sí | Sí | Sí | Sí |
| Efectivo | Saldo, si lo lleva (CTA-14) | Sí | Sí | Sí | Sí |
| Otra | Saldo | Sí | Sí | Sí | Sí |
| Tarjeta de crédito | Lo que se debe | Sí | No | No | Sí: es un pago a la tarjeta |
| CDP | Monto más intereses | No | Solo sus intereses | Sí | Sí |
| Inversión | Valor actual | No | Sí: rendimientos | Sí | Sí |
| Préstamo | Lo que se debe | No | No | No | Sí: es un abono |

- **Dado** que el espacio tiene Débito BAC, un CDP y el Préstamo carro
- **Cuando** abro "Nuevo gasto" y toco la cuenta
- **Entonces** puedo elegir Débito BAC y Efectivo, pero no el CDP ni el Préstamo carro

La base también lo valida: un gasto con un préstamo, por ejemplo, se rechaza aunque llegue por otro lado. La regla se aplica al crear un movimiento o al cambiarle la cuenta o el tipo; los movimientos viejos no se tocan.

<sub>Dónde vive: `check_tx_refs` en la base; `canPay`, `canReceiveIncome` y `canSendMoney` en `src/lib/transfers.ts`.</sub>

### CTA-13 · Todo espacio tiene una cuenta de Efectivo

**Estado:** Hecho

Cada espacio tiene siempre una cuenta "Efectivo" en colones, creada sola junto con el espacio. Se le puede cambiar el nombre, pero no se puede eliminar, archivar ni cambiar de tipo o de espacio. Es la cuenta por defecto de un movimiento cuando la persona no elige otra (MOV-02). No cuenta como el paso "Agregá una cuenta" de Primeros pasos.

<sub>Dónde vive: `accounts.system = 'cash'`, `cash_account()` y `protect_cash_account` en la base.</sub>

### CTA-14 · El efectivo puede llevar saldo o no

**Estado:** Hecho

La cuenta Efectivo tiene un interruptor "Llevar saldo", apagado por defecto.

| Llevar saldo | Comportamiento |
|---|---|
| Apagado | Los movimientos se registran (cuentan en el gasto del mes), pero la cuenta no muestra saldo, no suma al patrimonio ni cuenta como saldo sin actualizar |
| Encendido | Funciona igual que una cuenta de débito: saldo escrito más movimientos |

Se cambia en la cuenta → Editar → "Llevar saldo".

### CTA-15 · Una cuenta puede tener tarjeta de débito

**Estado:** Hecho

Una cuenta de débito o ahorro puede tener los últimos 4 dígitos de su tarjeta de débito. Sirven para reconocer la cuenta en los vouchers y en los estados de cuenta. Las compras con esa tarjeta son gastos de la cuenta y bajan su saldo.

---

## Saldos de las cuentas

Aplica a todas las cuentas menos las tarjetas: débito, ahorro, efectivo, inversión, CDP, préstamo y otra.

La idea general: **el saldo es el último que escribiste a mano, más todo lo que se movió en esa cuenta después.** Así no hay que actualizar saldos a cada rato; basta con escribirlo de vez en cuando para corregir lo que el app no vio.

### CTA-01 · Una cuenta sin saldo escrito no tiene saldo

**Estado:** Hecho

Mientras no se escriba un saldo, la cuenta muestra "Sin saldo", no suma al patrimonio y cuenta como saldo sin actualizar. Los movimientos que tenga no le inventan un saldo.

- **Dado** que creé la cuenta Débito BAC sin escribir saldo
- **Cuando** registro un ingreso de ¢100.000 en Débito BAC
- **Entonces** Débito BAC sigue diciendo "Sin saldo"
- **Y** el patrimonio neto no cambia

<sub>Dónde vive: `accountBalanceAt` en `src/lib/calc.ts` devuelve null sin saldo.</sub>

### CTA-02 · El saldo escrito es el punto de partida

**Estado:** Hecho

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

**Estado:** Hecho

Un movimiento con fecha y hora anterior al momento en que se escribió el saldo no lo cambia, porque el saldo del banco ya lo incluía.

- **Dado** que el 29 oct a las 9:00 escribí que Débito BAC tiene ¢500.000
- **Cuando** registro un gasto de ¢20.000 con fecha 28 oct
- **Entonces** Débito BAC sigue en 500.000 CRC

> Ver la pregunta abierta 2: un voucher que llega tarde.

<sub>Dónde vive: `accountDelta` solo suma movimientos con fecha posterior al saldo.</sub>

### CTA-04 · Un ingreso suma a su cuenta

**Estado:** Hecho

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

**Estado:** Hecho

- **Dado** que Débito BAC tiene ¢1.700.000
- **Cuando** registro un gasto de ¢23.450 en Débito BAC
- **Entonces** Débito BAC muestra 1.676.550 CRC
- **Y** el gasto del mes sube ¢23.450

| Variante | Resultado esperado |
|---|---|
| El gasto es con la Visa | Débito BAC no cambia; la Visa debe ¢23.450 más (TAR-01) |
| Es una preautorización de Uber "Por confirmar" | No resta todavía (CTA-10) |

### CTA-06 · Una devolución suma a su cuenta

**Estado:** Hecho

- **Dado** que Débito BAC tiene ¢1.676.550
- **Cuando** llega una devolución de ¢23.450 a Débito BAC
- **Entonces** Débito BAC vuelve a 1.700.000 CRC
- **Y** el gasto del mes baja ¢23.450

En una tarjeta, una devolución baja lo que se debe (TAR-01).

### CTA-07 · Mover dinero resta en una cuenta y suma en la otra

**Estado:** Hecho

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

**Estado:** Eliminada. Los aportes ahora son Mover dinero entre espacios (MOV-03), que sí baja la cuenta de origen.

Un aporte es dinero que una persona pone en un espacio compartido (por ejemplo, la parte de cada uno para los gastos de la casa).

- **Dado** que la cuenta de débito del espacio compartido tiene ¢200.000
- **Cuando** registro un aporte de Dani de ¢300.000 a esa cuenta
- **Entonces** esa cuenta muestra 500.000 CRC

> Este tipo de movimiento se elimina: ver MOV-03.

### CTA-09 · Un movimiento en la otra moneda se convierte

**Estado:** Hecho

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

**Estado:** Hecho

- **Dado** que Débito BAC tiene ¢1.700.000
- **Cuando** llegan dos preautorizaciones de Uber de ¢4.500 en 10 minutos y quedan "Por confirmar"
- **Entonces** Débito BAC sigue en 1.700.000 CRC

| Variante | Resultado esperado |
|---|---|
| Pasan 48 horas | Se confirma sola y resta ¢4.500 |
| Toco "No se cobró" | Desaparece del app y nunca resta |

Misma regla que el gasto del mes: lo que está por confirmar no cuenta en ningún lado.

### CTA-11 · Editar, eliminar y deshacer recalculan el saldo

**Estado:** Hecho

Cualquier cambio a un movimiento (monto, cuenta, fecha, tipo) se refleja en el saldo de las cuentas afectadas en cuanto se guarda. Eliminar lo quita y deshacer lo devuelve.

| Caso | Resultado esperado |
|---|---|
| Cambio el monto de un gasto de ¢20.000 a ¢25.000 | La cuenta baja ¢5.000 más |
| Cambio la fecha de un gasto a antes del último saldo escrito | Deja de contar (CTA-03) |
| Elimino un movimiento y toco Deshacer | El saldo queda igual que antes de eliminar |

---

## Préstamos

### PRE-01 · El saldo de un préstamo es lo que se debe

**Estado:** Parcial. Hoy el saldo del préstamo se escribe a mano; debería calcularse con los datos del préstamo (PRE-02 y PRE-03).

Se escribe como número positivo: lo que falta por pagar. El dinero que entra al préstamo baja la deuda; un gasto cargado al préstamo la sube. En el patrimonio, un préstamo siempre resta.

- **Dado** que Préstamo carro tiene un saldo escrito de ¢4.000.000 y Débito BAC tiene ¢1.700.000
- **Cuando** muevo ¢150.000 de Débito BAC a Préstamo carro (la cuota)
- **Entonces** Préstamo carro muestra 3.850.000 CRC
- **Y** Débito BAC muestra 1.550.000 CRC
- **Y** el patrimonio neto no cambia (hay ¢150.000 menos en la cuenta y ¢150.000 menos de deuda)

<sub>Dónde vive: el caso `loan` al final de `accountBalanceAt`.</sub>

### PRE-02 · Datos de un préstamo

**Estado:** Falta

Al crear un préstamo se piden:

| Dato | Ejemplo |
|---|---|
| Monto del préstamo | ¢5.000.000 |
| Tasa de interés y si es anual o mensual | 12% anual |
| Fecha de inicio | 1 nov 2026 |
| Cuota | ¢111.222 |
| Día de pago (opcional) | El 1 de cada mes |

Con el monto, la tasa y la cuota, el app calcula cuántas cuotas faltan y cuándo termina. Si hay día de pago, ofrece crear el recurrente de la cuota (PRE-05, REC-10).

### PRE-03 · El saldo de un préstamo se calcula solo

**Estado:** Falta

Cada vez que entra un pago de cuota al préstamo (un Mover dinero hacia él), el app separa intereses y capital: el interés es el saldo por la tasa del período, y el resto de la cuota baja el saldo.

- **Dado** el Préstamo carro de ¢5.000.000 al 12% anual (1% mensual) con cuota de ¢111.222
- **Cuando** muevo ¢111.222 de Débito BAC al Préstamo carro el 1 dic
- **Entonces** ¢50.000 son intereses y ¢61.222 son capital
- **Y** el préstamo debe ¢4.938.778
- **Y** la vista del préstamo muestra cuánto se ha pagado en intereses y la fecha estimada de la última cuota

Los intereses de cada cuota cuentan como gasto (categoría Intereses); el capital no, porque es plata que se le debía al banco.

### PRE-04 · Abono extraordinario

**Estado:** Falta

Al mover dinero a un préstamo se puede marcar "Abono extraordinario". Todo el monto va a capital, sin intereses.

- **Dado** que el Préstamo carro debe ¢4.938.778
- **Cuando** muevo ¢500.000 al préstamo marcado como abono extraordinario
- **Entonces** el préstamo debe ¢4.438.778
- **Y** la cuota sigue igual y la fecha estimada de la última cuota se adelanta

> Ver la pregunta abierta 7.

### PRE-05 · Un préstamo solo recibe dinero

**Estado:** Parcial

Un préstamo no paga gastos ni manda dinero a otras cuentas (CTA-12). Solo recibe cuotas y abonos desde otras cuentas. Si tiene día de pago, el recurrente de la cuota es un Mover dinero mensual desde la cuenta que se elija.

**Hoy:** las restricciones ya se aplican; falta el día de pago con su recurrente (REC-10).

## CDP

### CDP-01 · Datos de un CDP

**Estado:** Falta

| Dato | Ejemplo |
|---|---|
| Monto | ¢1.000.000 |
| Moneda | Colones |
| Tasa de interés anual | 6% |
| Fecha de inicio y plazo | 1 nov 2026, 6 meses |
| Cómo paga los intereses | Al vencimiento, o cada mes |
| A dónde van los intereses | Al mismo CDP o a otra cuenta |
| Retención de impuesto | Porcentaje que el banco retiene de los intereses |

### CDP-02 · El CDP muestra lo que espera ganar y se actualiza al pagar intereses

**Estado:** Falta

La vista del CDP muestra el monto, los intereses esperados al vencimiento (netos de impuesto) y la fecha de vencimiento. Cada vez que el CDP paga intereses, el app registra solo un ingreso por ese monto, en la cuenta que se eligió.

- **Dado** un CDP de ¢1.000.000 al 6% anual a 6 meses, con intereses al vencimiento al mismo CDP y retención del 15% (ejemplo)
- **Entonces** la vista dice que espera ganar ¢25.500 netos (¢30.000 brutos menos ¢4.500 de retención) el 1 may 2027
- **Cuando** llega el 1 may 2027
- **Entonces** el app registra un ingreso de ¢25.500 en el CDP, categoría Intereses
- **Y** el CDP vale ¢1.025.500

| Variante | Resultado esperado |
|---|---|
| Paga intereses cada mes a Débito BAC | Cada mes se registra un ingreso de ¢4.250 en Débito BAC; el CDP sigue en ¢1.000.000 |

> Ver la pregunta abierta 8.

### CDP-03 · Al vencer, renovar o sacar

**Estado:** Falta

El día del vencimiento, Inicio avisa que el CDP venció y ofrece: **Renovar** (nuevo plazo y tasa, con el monto que quedó) o **Mover a otra cuenta** (un Mover dinero por todo el monto).

### CDP-04 · Un CDP no paga cosas

**Estado:** Hecho

Un CDP no paga gastos (CTA-12), pero se le puede sacar dinero con Mover dinero, por ejemplo al cancelarlo antes de tiempo.

## Inversiones

### INV-01 · Una inversión vale lo que se escribe

**Estado:** Hecho

El valor de una inversión cambia con el mercado, así que su número es el último valor escrito a mano (Saldos) más el dinero que entra o sale con Mover dinero o ingresos (rendimientos). No paga gastos (CTA-12). Muestra el cambio contra el valor anterior (PAT-03).



---

## Tarjetas de crédito

Una tarjeta lleva lo que se debe en colones y en dólares por separado, como el estado de cuenta del banco. Los cargos suman, las devoluciones y los pagos restan, cada uno en su moneda. Con la fecha de corte y la fecha máxima de pago, el app sabe cuánto falta del pago de contado y hasta cuándo.

**Tarjeta de los ejemplos:** Visa, corte el día 15, fecha máxima de pago el día 2, límite ¢1.500.000, dólar a ¢500.

### TAR-01 · Lo que se debe: saldo escrito más cargos, menos pagos

**Estado:** Hecho

Lo que se debe es lo último que se escribió como deuda de la tarjeta (TAR-02), más los cargos, menos las devoluciones y los pagos registrados después. Se lleva por moneda. Las preautorizaciones por confirmar no cuentan.

- **Dado** que el 1 oct escribí que la Visa debía ¢180.000 y $15
- **Y** después hubo cargos por ¢215.000 y $15,49, una devolución de ¢3.450 y un pago de ¢100.000
- **Entonces** la Visa debe ¢291.550 + $30,49
- **Y** su vista muestra 306.795 CRC (los dólares a ¢500) y debajo "¢291.550 + $30,49"
- **Y** el patrimonio neto resta 306.795 CRC por la Visa

| Variante | Resultado esperado |
|---|---|
| Nunca escribí lo que se debe, y la tarjeta tiene fecha de corte | Cuenta desde el último corte, como si el estado anterior se hubiera pagado completo |
| Nunca escribí lo que se debe, y no tiene fecha de corte | Cuenta desde el inicio del mes |
| Pago más de lo que debo en colones | Ese saldo queda a favor (negativo) |

<sub>Dónde vive: `cardOwedAt` y `cardStatus` en `src/lib/cards.ts`; la misma regla en la base, `card_owed`.</sub>

### TAR-02 · Lo que debés hoy se puede escribir

**Estado:** Hecho

En Editar tarjeta, "Lo que debés hoy" tiene un campo en colones y otro en dólares. Es lo que dice el banco; desde ese momento, los cargos suman y los pagos restan. Sirve para empezar y para corregir lo que el app no vio (intereses, comisiones, un cargo que no se registró).

<sub>Dónde vive: `balance_snapshots` de la tarjeta, con `balance` (colones) y `balance_usd`.</sub>

### TAR-03 · Un pago resta lo que pagaste

**Estado:** Hecho

Pagar la tarjeta es un Mover dinero hacia ella. Resta exactamente el monto, de la moneda que se eligió. Un pago parcial deja el resto pendiente.

- **Dado** que la Visa debe ¢291.550 + $30,49
- **Cuando** registro un pago de ¢100.000 desde Débito BAC
- **Entonces** la Visa debe ¢191.550 + $30,49
- **Y** Débito BAC baja ¢100.000

| Variante | Resultado esperado |
|---|---|
| Pago $30,49 desde una cuenta en colones | La parte en dólares queda en cero; la cuenta en colones baja el equivalente con el tipo de cambio del día (CTA-09) |
| Elimino el pago o toco Deshacer | La Visa vuelve a deber lo de antes y Débito BAC recupera el monto |

### TAR-04 · Pagar desde la tarjeta o desde Inicio

**Estado:** Hecho

La vista de la tarjeta tiene **Pagar**, que abre una hoja con: desde qué cuenta, qué saldo se paga (colones o dólares), el monto y la fecha. Ofrece atajos con el monto ya calculado:

| Atajo | Monto |
|---|---|
| Desde el último pago | Lo que se cargó desde el último pago (un pago anticipado) |
| Pago de contado | Lo que falta del último estado de cuenta (TAR-08) |
| Todo lo que debo | Todo |

El monto arranca con el primer atajo que tenga algo y se puede cambiar.

Inicio muestra en Pagos pendientes "Pago de Visa" desde tres días antes de la fecha máxima de pago, con lo que falta del pago de contado y el botón Pagar. Desaparece cuando el pago de contado queda cubierto. Si la fecha pasa sin cubrirlo, dice "Venció el 2 nov" hasta el siguiente corte.

<sub>Dónde vive: `CardPaySheet` en `src/ui/CardPay.tsx`; `CardDueRow` en `src/ui/PendingPayments.tsx`.</sub>

### TAR-05 · Pagos anticipados

**Estado:** Hecho

En Editar tarjeta, "Pagos anticipados" se programa cada semana, cada dos semanas o cada mes, el día que se elija y desde una cuenta. Es un recurrente manual de Mover dinero hacia la tarjeta: el día que toca aparece en Pagos pendientes (y llega una notificación), y al tocar Pagar se abre la hoja de la tarjeta con "Desde el último pago" ya puesto. Cada pago resta lo que se reporta (TAR-03), así que también baja el saldo al corte y el pago de contado.

- **Dado** que la Visa tiene pagos anticipados cada viernes desde Débito BAC
- **Y** desde el pago del viernes pasado se cargaron ¢75.110
- **Cuando** el viernes toco Pagar y confirmo ¢75.110
- **Entonces** la Visa debe ¢75.110 menos
- **Y** el próximo pago anticipado es el viernes siguiente

Se puede posponer, ignorar ese pago o dejar de repetir, como cualquier recurrente (REC-07).

**Antes** existía "Pago semanal de las tarjetas" como ajuste del espacio, que dejaba todas las tarjetas en cero sin importar el monto. Se reemplazó por esto. En Simbiosis quedó programado cada viernes desde su cuenta de débito.

<sub>Dónde vive: `recurring.purpose = 'card_early'`; `saveEarlyPlan` en `AccountEdit`; `card_payment_reminders` en la base.</sub>

### TAR-06 · Fecha de corte y fecha máxima de pago

**Estado:** Hecho

Se ponen en Editar tarjeta (están en el estado de cuenta). Si la fecha de pago es un día menor que el de corte, es del mes siguiente: corte el 15, pago el 2 del mes siguiente. En meses más cortos, un día que no existe pasa al último día del mes (corte el 31 → 30 nov).

El corte cierra al final de su día: un cargo del día de corte entra en ese estado de cuenta.

### TAR-07 · Tarjetas adicionales

**Estado:** Hecho

Una tarjeta puede ser adicional (extensión) de otra del mismo espacio. Comparte el saldo, el corte, la fecha de pago y el límite de la principal: lo que se carga en la adicional se debe y se paga en la principal. En Cuentas la adicional dice "Adicional", y su vista lleva a la principal.

- **Dado** que la tarjeta ••7731 es adicional de la Visa
- **Cuando** cargo ¢10.000 con la ••7731
- **Entonces** la Visa debe ¢10.000 más
- **Y** el patrimonio cuenta esa deuda una sola vez

En Simbiosis, la Tarjeta compartida (••7731) quedó como adicional de la Tarjeta Kimmy (••8665), porque se pagaban juntas.

<sub>Dónde vive: `accounts.parent_account_id` (la base valida mismo espacio y un solo nivel).</sub>

### TAR-08 · Este ciclo

**Estado:** Hecho

Con fecha de corte y de pago, la vista de la tarjeta muestra:

| Fila | Qué es |
|---|---|
| Pago de contado | Lo que falta del último estado de cuenta, y hasta cuándo. "Cubierto" si ya se pagó |
| Saldo al corte | Lo que se debía al cerrar el último corte |
| Pagado desde el corte | Los pagos registrados después del corte |
| Cargos nuevos | Lo cargado desde el corte, que entra en el próximo estado de cuenta |

- **Dado** que el corte del 15 oct cerró en ¢221.200 + $15
- **Y** el 26 oct pagué ¢100.000
- **Entonces** el pago de contado es ¢121.200 + $15 antes del 2 nov

Los pagos anticipados hechos antes del corte bajan el saldo al corte.

Sin fechas, en su lugar aparece "Agregá la fecha de corte y la de pago".

### TAR-09 · Límite de crédito

**Estado:** Hecho

Opcional, en colones o en dólares. La vista muestra "Disponible" (límite menos lo que se debe y menos las cuotas por cargar, convertido a la moneda del límite) con una barra que se pone en advertencia desde el 80% y en rojo al llegar al límite.

### TAR-10 · Recordatorios

**Estado:** Hecho

Con las notificaciones de "Pago de la tarjeta" activas, llega un aviso el día de cada pago anticipado y otro dos días antes y el mismo día de la fecha máxima de pago, mientras el pago de contado no esté cubierto ("Vence el pago de Visa: ¢121.200 + $15,00 para el pago de contado, antes del 2").

### TAR-11 · Compras a cuotas

**Estado:** Hecho

Un gasto con tarjeta de crédito se puede marcar "A cuotas" (2 a 48 meses) en Más detalles. La compra completa cuenta en el gasto del mes el día que se hizo, porque la decisión se tomó ese día. La tarjeta, en cambio, debe una cuota por mes: la primera el día de la compra y las demás el mismo día de los meses siguientes. La última cuota absorbe el redondeo.

- **Dado** que el 21 sep compré en iShop ¢600.000 a 6 cuotas con la Visa
- **Entonces** el gasto de septiembre sube ¢600.000
- **Y** la Visa debe ¢100.000 el 21 sep, ¢100.000 más el 21 oct, y así hasta el 21 feb
- **Y** el 31 oct la vista de la Visa muestra "Cuotas por cargar: ¢400.000"
- **Y** "Disponible" resta los ¢600.000 completos (el banco reserva toda la compra en el límite)
- **Y** la fila del movimiento dice "Casa · 6 cuotas" y el detalle "A cuotas: 6 meses de ¢100.000"

Las cuotas entran en el saldo al corte y en el pago de contado del mes en que se cargan. El banco no cobra intereses en estas compras (tasa cero); si los cobra, se corrige escribiendo lo que se debe (TAR-02).

<sub>Dónde vive: `transactions.installments`; `cardEntries` en `src/lib/cards.ts`; `card_owed` en la base.</sub>

### TAR-12 · Lo que el app no hace con las tarjetas

**Estado:** Hecho

- **No calcula intereses.** Cada banco los calcula distinto. Si el banco cobra intereses, se corrigen escribiendo lo que se debe (TAR-02) o importando el estado de cuenta.
- **No hay adelantos de efectivo.** Una tarjeta de crédito no manda dinero a otras cuentas, tampoco al Efectivo (CTA-12).
- **No maneja programas de lealtad.** Ni cashback, ni puntos, ni millas.

---

## Patrimonio neto

### PAT-01 · Patrimonio = lo que hay menos lo que se debe

**Estado:** Hecho

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

**Estado:** Hecho

Cuentas muestra "N saldos sin actualizar" debajo del patrimonio. Cuenta las cuentas (no tarjetas) sin saldo escrito o cuyo último saldo escrito tiene más de 10 días.

- **Dado** que escribí el saldo de Débito BAC el 15 oct y Ahorro no tiene saldo
- **Cuando** abro Cuentas el 31 oct
- **Entonces** dice "2 saldos sin actualizar"

> Ver la pregunta abierta 5.

### PAT-03 · Cambio en las inversiones

**Estado:** Hecho

Las cuentas de inversión y los CDP muestran, en verde o rojo, cuánto cambió su último saldo escrito contra el anterior. Los movimientos no cuentan para este número.

- **Dado** que el CDP tenía un saldo escrito de ¢1.000.000
- **Cuando** escribo que ahora tiene ¢1.008.000
- **Entonces** la fila del CDP muestra "+¢8.000 (+0,80%)" en verde

---

## Metas

### MET-01 · El avance de una meta es la suma de sus cuentas

**Estado:** Hecho

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

**1. ~~Un pago parcial deja la tarjeta en cero.~~** Resuelta: un pago resta lo que se pagó (TAR-03).

**2. Un voucher que llega tarde no cuenta.** Compro algo a las 10:00, escribo el saldo de Débito BAC a las 10:30 (el banco ya lo había descontado) y el correo del BAC llega a las 10:45 con hora 10:00. Hoy no cuenta, lo cual es correcto si el banco ya lo había descontado. Pero si escribo el saldo y la compra todavía no aparecía en el banco, el saldo queda alto. ¿Lo dejamos así? Es raro, y se corrige escribiendo el saldo otra vez.

**3. ~~Un aporte no baja la cuenta de donde sale.~~** Resuelta: los aportes se eliminan y pasan a ser Mover dinero entre espacios, que sí baja la cuenta de origen (MOV-03).

**4. ~~El pago semanal sale de la primera cuenta de débito, sin mirar la moneda.~~** Resuelta: los dos prefieren la cuenta de débito en colones.

**5. ¿Sigue teniendo sentido "saldos sin actualizar" a los 10 días?** Antes el saldo solo cambiaba al escribirlo; ahora los movimientos lo mueven solo. Escribirlo cada tanto sigue sirviendo para corregir lo que el app no vio (comisiones, intereses), pero tal vez 10 días es muy poco y el aviso se vuelve ruido.

**6. Un ingreso cargado a una tarjeta no baja lo que se debe.** Solo las devoluciones y los pagos la bajan. Si llega un reembolso o un cashback registrado como ingreso en la Visa, la deuda no cambia. ¿Es correcto?

**7. Abono extraordinario: ¿baja el plazo o la cuota?** Los bancos suelen dejar elegir. Propuesta: por defecto baja el plazo (la cuota sigue igual), con opción de recalcular la cuota.

**8. ¿Cómo calcula intereses el banco?** Los bancos suelen calcular por días (sobre 360 o 365) y no por meses. Propuesta: usar días sobre 360 y permitir corregir el monto cuando el banco paga, porque el número del banco manda. También hay que confirmar el porcentaje de retención que aplica a cada CDP, porque depende del instrumento.

**9. Tasas variables.** Muchos préstamos en Costa Rica tienen tasa variable. Propuesta: la tasa se puede editar con fecha de vigencia, y aplica desde la siguiente cuota.

**10. ¿Qué pasa con el desembolso del préstamo?** Cuando se crea un préstamo nuevo, el dinero normalmente entra a una cuenta (o directo al vendedor del carro). Propuesta: al crear el préstamo, preguntar opcionalmente "¿A qué cuenta entró el dinero?" y registrar ese ingreso.

**11. ~~Compras a cuotas.~~** Resuelta: TAR-11.

**12. ~~Pago mínimo e intereses.~~** Resuelta: el app no calcula intereses (TAR-12).

**13. ~~Adelantos de efectivo.~~** Resuelta: no se permiten (TAR-12).

**14. ~~Cashback y reembolsos.~~** Resuelta: el app no maneja programas de lealtad (TAR-12).
