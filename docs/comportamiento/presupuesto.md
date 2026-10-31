# Presupuesto

El presupuesto responde una sola pregunta: **¿cuánto puedo gastar todavía?** No representa el dinero que hay en las cuentas ni el ingreso; representa lo que decidiste que vas a gastar.

Se arma con **sobres**. Un sobre es un monto para gastar en algo durante un período (semana, quincena o mes): "Comer afuera, ¢60.000 al mes". Cada gasto cae en un sobre según su categoría. Cuando termina el período, el sobre vuelve a empezar lleno: lo que sobró o lo que se pasó no se arrastra.

Las **categorías** solo dicen qué es un gasto (Restaurantes, Suscripciones). Ya no tienen límite: eso vive en los sobres.

> Esta versión reemplaza la del plan del mes con ingreso, ahorro, fijos y variables (PRS-01 a PRS-08), que se publicó el 31 oct y se descartó el mismo día. Esos IDs quedan reservados.

## Reglas

### SOB-01 · Un sobre

**Estado:** Hecho

Un sobre tiene nombre, monto, período y una o varias categorías.

- **Dado** que creo el sobre "Comer afuera" de ¢60.000 mensual con Restaurantes y Cafés
- **Cuando** registro ¢8.500 en Restaurantes y ¢2.400 en Cafés
- **Entonces** el sobre dice "Quedan 49.100 de 60.000 CRC" con la barra al 18%

| Caso | Resultado esperado |
|---|---|
| Elijo una categoría padre (Comida) | Entran ella y todas sus subcategorías |
| Elijo solo una subcategoría (Súper) | Entra solo esa; el resto de Comida queda libre para otro sobre |
| La categoría ya está en otro sobre | No se puede elegir: aparece con el nombre del sobre donde está |
| Elijo Comida y Súper ya está en otro sobre | No se puede: primero hay que sacar Súper del otro |
| Archivo una categoría | Sale del sobre; sus gastos viejos siguen contando en el período en que pasaron |
| Borro un sobre | Sus categorías pasan a "Todo lo demás" (SOB-05), con deshacer |

La cara del sobre es el emoji de su categoría si tiene una sola, o el ícono de sobre si tiene varias.

<sub>Dónde vive: `envelopes`, `envelope_categories` (una categoría en un solo sobre; el trigger `check_envelope_category` impide padre e hija en sobres distintos), `EnvelopeEdit` en `src/screens/Sobres.tsx`.</sub>

### SOB-02 · Qué cuenta en un sobre

**Estado:** Hecho

Cuenta todo gasto del espacio cuya categoría está en el sobre, con fecha dentro del período actual del sobre. Es la misma regla que el gasto del mes (`spend()`):

| Movimiento | En el sobre |
|---|---|
| Gasto | Suma |
| Devolución | Resta |
| Preautorización por confirmar (Uber, Didi) | No cuenta hasta que se cobra |
| Mover dinero (también a otro espacio) | No cuenta: no es gasto |
| Ingreso | No cuenta |
| Pago de un recurrente de esas categorías | Suma, como cualquier gasto |

### SOB-03 · Períodos

**Estado:** Hecho

Cada sobre elige su período. Al empezar uno nuevo, el sobre vuelve a su monto completo. Lo que sobró o lo que se pasó no se arrastra.

| Período | Va de | Ejemplo |
|---|---|---|
| Semanal | El día en que empieza la semana del espacio (Ajustes) hasta 6 días después | Semana de lunes: del lunes 2 al domingo 8 nov |
| Quincenal | Del 1 al 15 y del 16 al último día del mes | 16 al 30 nov |
| Mensual | El mes calendario | 1 al 30 nov |

- **Dado** "Súper" de ¢50.000 semanal y una semana que empieza el lunes
- **Cuando** el domingo llevo ¢62.000
- **Entonces** el domingo dice "Te pasaste por 12.000 CRC"
- **Y** el lunes dice "Quedan 50.000 de 50.000 CRC"

<sub>Dónde vive: `envRange` en `src/lib/envelopes.ts`; en la base, `envelope_period`.</sub>

### SOB-04 · Comprometido: los recurrentes del sobre

**Estado:** Hecho

Los recurrentes de gasto cuyas categorías están en el sobre y que vencen en el período, pero que todavía no se pagaron, son dinero **comprometido**: no se puede gastar en otra cosa. Se descuentan de lo que queda.

```
Para gastar = monto − lo gastado − lo comprometido
```

- **Dado** el sobre "Suscripciones" de ¢40.000 mensual, con Netflix (¢7.900, ya cobrado), Spotify (¢5.900, vence el 20) e iCloud (¢1.500, vence el 25)
- **Entonces** el sobre dice "Quedan 24.700 para gastar · 7.400 comprometidos"
- **Cuando** se cobra Spotify
- **Entonces** lo que queda para gastar no cambia (24.700): se movió de comprometido a gastado

| Caso | Resultado esperado |
|---|---|
| Recurrente variable (luz ≈ ¢28.000) | Compromete su monto estimado; al pagarse cuenta lo pagado |
| Recurrente que vence dos veces en el período (semanal en un sobre mensual) | Compromete cada fecha pendiente |
| Recurrente atrasado (venció y no se pagó) | Sigue comprometido hasta que se pague, se ignore o se pause |
| Recurrente pagado pero sin ligar | Cuenta como gasto y su fecha sigue comprometida hasta que se ligue (REC) |
| Recurrente pausado | No compromete |
| Ingreso o Mover dinero recurrente | No compromete |

En el detalle del sobre se ven sus recurrentes del período, con "Pagado el 5 nov" o "Vence el 20 nov".

<sub>Dónde vive: `envelopeStats` en `src/lib/envelopes.ts`.</sub>

### SOB-05 · Todo lo demás

**Estado:** Hecho

Cada espacio tiene un sobre fijo, **Todo lo demás**, que recibe los gastos cuya categoría no está en ningún otro sobre (y los gastos sin categoría). No se borra, no se le eligen categorías y va siempre al final.

Puede tener monto y período como cualquier sobre, o no tener monto: entonces solo muestra lo gastado ("Gastado 23.400 CRC este mes") y no suma a "Para gastar" (SOB-07).

### SOB-06 · El monto y la sugerencia

**Estado:** Hecho

El monto lo escribís vos. Si las categorías del sobre tienen recurrentes con fecha en el período, al editar el sobre se sugiere su suma, y un toque la usa como monto.

- **Dado** que en Suscripciones tengo Netflix ¢7.900, Spotify ¢5.900, iCloud ¢1.500 y YouTube ¢4.100
- **Cuando** edito el sobre "Suscripciones"
- **Entonces** debajo del monto dice "Tus recurrentes de este mes suman 19.400 CRC · Usar"

La sugerencia no cambia el monto sola: si después agregás un recurrente, el sobre queda igual hasta que lo editás.

### SOB-07 · "Para gastar" en Inicio y en Presupuesto

**Estado:** Hecho

El número de Inicio que hoy dice "Disponible" pasa a ser **Para gastar**: la suma de lo que queda para gastar en el período actual de cada sobre con monto (SOB-04), incluido "Todo lo demás" si tiene monto. No mira el ingreso ni los saldos de las cuentas.

- **Dado** "Comer afuera" (quedan ¢49.100), "Súper" semanal (quedan ¢18.000) y "Suscripciones" (quedan ¢24.700 para gastar, ¢7.400 comprometidos)
- **Entonces** Inicio dice "91.800 CRC Para gastar"

| Caso | Resultado esperado |
|---|---|
| Un sobre se pasó por ¢12.000 | Resta ¢12.000 del total: lo que se pasó en uno se come lo de los otros |
| El total queda negativo | "Te pasaste por …" ("Se pasaron" en un espacio compartido) |
| No hay ningún sobre con monto | No se muestra; Inicio muestra solo lo gastado |
| Sobres con períodos distintos | Cada uno aporta lo de su período actual |

<sub>Dónde vive: `toSpend` en `src/lib/envelopes.ts`, `useHomeSummary` en `src/screens/Home.tsx`.</sub>

### SOB-08 · La pantalla Presupuesto

**Estado:** Hecho

De arriba abajo:

1. **Para gastar** en grande (SOB-07), con "de 330.000 CRC en 6 sobres" debajo.
2. Los sobres como filas con su cara, nombre, "Quedan 49.100 de 60.000 CRC" (o "Te pasaste por …" en rojo), el período cuando no es mensual ("Esta semana", "Esta quincena") y su barra. La barra muestra lo gastado y, más claro, lo comprometido.
3. Al final, **Todo lo demás**.
4. "Nuevo sobre".

Tocar un sobre abre su detalle: lo que queda, el ritmo ("Quedan 31.000 CRC para 13 días, 2.385 por día"; solo en el período actual), sus categorías, sus recurrentes del período (SOB-04) y los movimientos del período. Desde ahí se edita.

Los colores de la barra siguen la regla de antes:

| Uso del sobre | Barra |
|---|---|
| Menos del 80% | Normal |
| Del 80% al 99% | Advertencia |
| 100% o más | Rojo |

Presupuesto muestra siempre el período actual. Lo de meses anteriores por categoría vive en Mis finanzas.

### SOB-09 · Paso de los límites a sobres

**Estado:** Hecho

Una sola vez, al publicar los sobres: cada categoría que tenía límite se convierte en un sobre con su nombre, su monto y su período (mensual o semanal), con esa categoría adentro. Después se pueden juntar, renombrar o borrar. Las categorías dejan de tener el campo de límite.

- **Dado** que Restaurantes tenía límite de ¢60.000 mensual y Súper de ¢50.000 semanal
- **Entonces** quedan los sobres "Restaurantes" (¢60.000, mensual) y "Súper" (¢50.000, semanal)

Las categorías marcadas como fijas (CAT-04) con límite también pasan a sobre; la marca de fija deja de usarse en Presupuesto.

<sub>Dónde vive: migración `20261031220000_envelopes.sql`.</sub>

---

## Preguntas abiertas

**1. Sobres de varios espacios.** Los sobres son de cada espacio. ¿Hace falta ver en algún lugar cuánto te queda para gastar sumando tu personal y el compartido?

**2. Recordatorios.** Los avisos de "límites" (Ajustes → Notificaciones) ahora son de sobres: al 80% y al pasarse, en el período actual (`check_limit_alert`). No miran lo comprometido. ¿Deberían?
