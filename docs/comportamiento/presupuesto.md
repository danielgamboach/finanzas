# Presupuesto

El presupuesto es el **plan del mes**: el dinero que entra, repartido de antemano según lo que es cada cosa. No es lo mismo que las categorías: las categorías clasifican lo que pasó; el presupuesto dice qué se piensa hacer con el ingreso.

Cada línea del plan es de uno de cuatro tipos, y cada tipo se comporta distinto:

| Tipo | Ejemplo | De dónde sale el monto | Qué significa "cumplido" |
|---|---|---|---|
| **Ahorro** | Emergencias, inversión, una meta | Lo elegís, sale primero | Se apartó |
| **Fijo** | Alquiler, internet, suscripciones | Exacto, del recurrente | Se pagó |
| **Variable** | Luz, agua | Estimado (≈ promedio de los últimos 3 pagos) | Se pagó, por el monto que fuera |
| **Límite** | Restaurantes, súper | Lo elegís, es un tope | No pasarse del tope |

La cuenta que importa:

```
Ingreso del mes                      1.200.000
− Ahorro (emergencias, inversión)      250.000
− Fijos (alquiler, internet…)          375.000
− Variables (≈ luz, agua)               28.000
− Límites (restaurantes, súper…)       270.000
= Sin asignar                          277.000
```

Todo se calcula por espacio y por mes, en la moneda de visualización (los montos en dólares se convierten con el tipo de cambio actual).

### PRS-01 · Ingreso del mes

**Estado:** Hecho

El ingreso del mes es el que se escribió para ese mes; si no se escribió, la suma de los ingresos recurrentes del espacio que caen en el mes (los ya cobrados por lo que entró y los que faltan por su monto). Escribirlo cambia solo ese mes.

- **Dado** que tengo un recurrente "Salario" de ¢1.200.000 mensual
- **Cuando** abro Presupuesto en noviembre
- **Entonces** el ingreso de noviembre es ¢1.200.000 sin escribir nada
- **Y** si escribo ¢1.350.000 (por un bono), noviembre usa ¢1.350.000 y diciembre vuelve a ¢1.200.000
- **Y** "Usar mis ingresos recurrentes" borra lo escrito y vuelve a ¢1.200.000

Junto al ingreso se muestra lo que realmente entró en el mes ("entraron ¢1.150.000"): ingresos del espacio más el dinero que llegó con Mover desde otro espacio.

| Caso | Resultado esperado |
|---|---|
| Sin ingreso escrito ni recurrentes | Presupuesto muestra el gasto del mes (como antes) y el botón "Agregar ingreso" |
| Salario quincenal de ¢600.000 | El ingreso del mes es ¢1.200.000 (dos fechas en el mes) |
| Salario en dólares | Se convierte con el tipo de cambio actual |

> Ver la pregunta abierta 2 (espacios compartidos).

<sub>Dónde vive: `budget_months.income`, `buildPlan` en `src/lib/budget.ts`, `IncomeSheet` en `src/ui/BudgetSheets.tsx`.</sub>

### PRS-02 · Fijos

**Estado:** Hecho

Los fijos salen solos de Recurrentes: cada gasto recurrente activo con al menos una fecha en el mes, y cada Mover dinero recurrente hacia una cuenta de **otro** espacio (por ejemplo, el aporte mensual al espacio compartido). No se configuran en Presupuesto: se editan en el recurrente.

- **Dado** el recurrente "Alquiler" de ¢350.000 que vence el 5 de cada mes
- **Cuando** abro Presupuesto el 2 de noviembre
- **Entonces** en Fijos aparece "Alquiler · Vence el 5 nov · 350.000 CRC"
- **Y** al registrar el pago (ligado al recurrente), la fila dice "Pagado el 5 nov" en verde y baja al final del grupo

| Caso | Resultado esperado |
|---|---|
| Se pagó ¢352.000 en vez de ¢350.000 | La línea cuenta ¢352.000 (lo pagado manda) |
| Recurrente semanal | Una línea con la suma de las fechas del mes ("4 pagos · el próximo el 7 nov") |
| Venció y no se pagó | "Venció el 5 nov" en advertencia |
| Recurrente anual que no cae este mes | No aparece |
| Mover dinero recurrente a una cuenta del mismo espacio | No aparece (es ahorro, ver PRS-05) |
| Recurrente pausado con un pago en el mes | Aparece con lo pagado |

Un pago cuenta para su línea solo si está ligado al recurrente (`recurring_id`); si no se ligó, cuenta como gasto de su categoría (PRS-04).

<sub>Dónde vive: `buildPlan` y `dueDatesIn` en `src/lib/budget.ts`.</sub>

### PRS-03 · Variables

**Estado:** Hecho

Un recurrente marcado como variable (luz, agua) va en Variables con su monto estimado, que es el promedio de los últimos 3 pagos (REC). Mientras no se paga se muestra con "≈"; al pagarse cuenta lo pagado.

- **Dado** que la luz se pagó ¢26.000, ¢29.000 y ¢30.000 los últimos tres meses
- **Entonces** en Variables aparece "CNFL · ≈ 28.333 CRC"
- **Cuando** la pago por ¢31.200
- **Entonces** la línea pasa a "Pagado" con 31.200 CRC y el Sin asignar baja ¢2.867

### PRS-04 · Límites

**Estado:** Hecho

Un límite es el tope de una categoría (CAT-03): lo que se puede gastar y no es un pago fijo. Cada fila muestra lo que queda ("Quedan 31.000 de 60.000 CRC") con su barra. Lo que no se gasta sigue disponible el resto del mes. Un límite semanal cuenta una vez por cada semana del mes (días del mes ÷ 7).

Al límite le cuenta todo el gasto de la categoría (con sus subcategorías) que **no** es un pago de un fijo o variable del plan.

- **Dado** Restaurantes con límite de ¢60.000 y ¢29.000 gastados al 18 de noviembre
- **Entonces** la fila dice "Quedan 31.000 de 60.000 CRC" con la barra al 48%
- **Y** en la vista de Restaurantes dice "Quedan 31.000 CRC para 13 días (2.385 por día)"
- **Cuando** no salgo a comer esa semana
- **Entonces** el número no se mueve: los ¢31.000 siguen ahí

| Caso | Resultado esperado |
|---|---|
| Menos del 80% | Barra normal |
| Del 80% al 99% | Barra en advertencia |
| 100% o más | "Te pasaste por …" en rojo |
| Categoría fija (CAT-04) con límite y un fijo del plan en esa categoría | No se muestra como límite: el fijo ya la cuenta (si no, se contaría dos veces) |
| Categoría fija con límite y sin recurrente | Se muestra como límite, sin rojo |
| Categoría sin límite con gastos | Va en "Sin plan" con lo gastado |
| Gasto sin categoría | "Sin categoría" en "Sin plan" |

El ritmo por día solo aparece en la vista de la categoría, en el mes actual y para límites mensuales.

<sub>Dónde vive: `src/screens/Presupuesto.tsx` (`LimitRow`), `src/screens/CategoryEdit.tsx` (ritmo).</sub>

### PRS-05 · Ahorro

**Estado:** Hecho

Las líneas de ahorro tienen nombre, monto al mes, moneda y, opcional, una meta. Se reservan al inicio del mes: restan del Sin asignar y del Disponible desde el día 1, aunque todavía no se haya movido el dinero ("págate primero").

Una línea queda apartada cuando:

- tiene meta con cuentas y en el mes entró a esas cuentas al menos su monto (Mover dinero desde otra cuenta o un ingreso directo), o
- no tiene meta (o la meta no tiene cuentas) y se tocó "Aparté".

- **Dado** "Emergencias" de ¢100.000 sin meta
- **Entonces** la fila dice "100.000 CRC · por apartar" con el botón "Aparté"
- **Cuando** toco "Aparté"
- **Entonces** la fila dice "Apartado" en verde (con deshacer en el aviso)

- **Dado** "Casa propia" de ¢150.000 ligada a la meta Casa propia (cuenta Ahorro BAC)
- **Cuando** muevo ¢150.000 de Débito a Ahorro BAC
- **Entonces** la fila pasa sola a "Apartado · Casa propia"
- **Y** si muevo ¢200.000, el plan cuenta ¢200.000 de ahorro ese mes

"Dejar de apartar" saca la línea de los meses siguientes (no se borra: `active = false`, con deshacer).

<sub>Dónde vive: `budget_savings`, `budget_saving_marks`, `SavingSheet` en `src/ui/BudgetSheets.tsx`.</sub>

### PRS-06 · Cerrar el mes: lo que sobró de los límites

**Estado:** Hecho

Al abrir Presupuesto en un mes nuevo, si el mes anterior tuvo movimientos y le sobró algo en los límites, aparece una sola pregunta arriba: "Te sobraron ¢23.000 en 3 categorías".

- **Pasar a noviembre**: lo que sobró en cada categoría se suma a su límite de noviembre (sobres).
- **Dejarlo**: los límites de noviembre arrancan de cero; lo que sobró queda en las cuentas como ahorro.

Cualquiera de las dos cierra el mes anterior y la pregunta no vuelve. Las dos se pueden deshacer desde el aviso.

- **Dado** que en octubre Restaurantes tenía ¢60.000 y se gastaron ¢45.000
- **Cuando** el 1 de noviembre toco "Pasar a noviembre"
- **Entonces** Restaurantes en noviembre tiene un límite de ¢75.000
- **Y** el Sin asignar de noviembre baja ¢15.000

Solo pregunta en el mes actual y por el mes inmediatamente anterior; un mes que se saltó queda abierto sin preguntar.

<sub>Dónde vive: `budget_carry`, `budget_months.closed_at` y `carried`, `closePrev` en `src/screens/Presupuesto.tsx`.</sub>

### PRS-07 · "Disponible" en Inicio

**Estado:** Hecho

Con ingreso (PRS-01), "Disponible en noviembre" es:

```
ingreso − ahorro − fijos − variables (pagados o no) − lo gastado que no es un pago del plan
```

Así lo comprometido que todavía no salió no se ve como disponible.

- **Dado** ingreso ¢1.200.000, ahorro ¢250.000, alquiler ¢350.000 que vence el 5 y luz ≈ ¢28.000
- **Cuando** el 2 de noviembre llevo ¢40.000 gastados en el súper
- **Entonces** Inicio dice "532.000 CRC Disponible", aunque el alquiler todavía no se haya pagado

Si el disponible queda negativo: "Te pasaste del ingreso" (o "Se pasaron" en un espacio compartido).

Sin ingreso, se mantiene la regla anterior: la suma de los límites menos todo lo gastado en el mes (CAT-03).

<sub>Dónde vive: `useHomeSummary` en `src/screens/Home.tsx`.</sub>

### PRS-08 · Lo que muestra la pantalla

**Estado:** Hecho

Presupuesto (`#/categorias`), de arriba abajo:

1. El mes (‹ Nov 2026 ›).
2. **Sin asignar en noviembre** en grande, con "de ¢1.200.000 de ingreso · entraron ¢…" y el botón "Ingreso". Si es negativo: "Asignaste de más". Sin ingreso: el gasto del mes y "Agregar ingreso".
3. El cierre del mes anterior, si hace falta (PRS-06).
4. Grupos con su total a la derecha: Ahorro (con "Agregar ahorro"), Fijos, Variables, Límites (con "Nueva") y Sin plan. Sin fijos ni variables, una fila lleva a Recurrentes.

El análisis por categoría (mes contra el anterior, top comercios) vive en Mis finanzas.

---

## Preguntas abiertas

**1. ¿El ahorro cuenta también lo que sobra al final?** Hoy "Dejarlo" (PRS-06) no registra nada: el dinero queda en las cuentas. Se podría sumar a una línea de ahorro o a una meta.

**2. Ingreso en un espacio compartido.** Hoy el ingreso de un espacio compartido es el que se escribe o sus ingresos recurrentes. Lo natural sería la suma de los aportes recurrentes de cada persona (Mover dinero recurrente desde su espacio personal), pero esos recurrentes viven en el espacio de cada uno y el otro no los ve. ¿Se escribe a mano, o se busca la forma de mostrarlos?

**3. ¿Límites en dólares?** Los límites están en colones. Si se cambia la moneda de visualización se convierten, pero no se puede poner un límite en dólares.

**4. Meses futuros.** Hoy se pueden ver (‹ ›) con sus fijos y ahorro, pero no se puede escribir un ingreso distinto por adelantado desde otra pantalla que no sea Presupuesto de ese mes. ¿Hace falta planear varios meses?
