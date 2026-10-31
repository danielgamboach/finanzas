# Categorías

### CAT-01 · Cada espacio tiene sus categorías

**Estado:** Hecho

Las categorías son de gasto o de ingreso, con nombre, emoji y color. Cada espacio nuevo trae un juego por defecto (distinto para personal y compartido) que se puede editar, archivar o ampliar.

Todo gasto e ingreso tiene categoría (MOV-04).

<sub>Dónde vive: `seed_space_defaults`, `src/screens/CategoryEdit.tsx`.</sub>

### CAT-02 · Subcategorías

**Estado:** Hecho

Una categoría puede tener subcategorías: funcionan igual que una categoría, pero con una categoría padre. Hay un solo nivel (una subcategoría no tiene hijas).

- **Dado** que Comida tiene las subcategorías Súper y Restaurantes
- **Cuando** registro un gasto de ¢10.000 en Restaurantes
- **Entonces** la fila del movimiento dice "Restaurantes"
- **Y** el detalle dice "Comida › Restaurantes"
- **Y** en Presupuesto, Comida suma los ¢10.000
- **Y** la vista de Comida muestra cuánto va en cada subcategoría

Un gasto puede ir directo en la categoría padre; en la vista de la categoría aparece como la parte "directa".

### CAT-03 · Límite opcional

**Estado:** Parcial

Una categoría puede tener límite mensual o semanal, o no tener límite. Los límites son una parte del plan del mes (presupuesto.md, PRS-04). Sin ingreso en el plan, el presupuesto del mes es la suma de los límites (los semanales cuentan unas 4,33 veces) y "Disponible" en Inicio es eso menos lo gastado; con ingreso, manda PRS-07.

| Uso del límite | Resultado esperado |
|---|---|
| Menos del 80% | Barra normal |
| Del 80% al 99% | Barra en advertencia |
| 100% o más | Barra en rojo, salvo las categorías fijas (alquiler, servicios), que no se marcan |

En Presupuesto, al límite solo le cuenta el gasto que no es un pago de un fijo o variable del plan (PRS-04).

**Hoy:** las subcategorías no pueden tener límite propio; solo la categoría padre.

> Ver la pregunta abierta 1.

### CAT-04 · Categorías fijas

**Estado:** Hecho

Una categoría marcada como fija (alquiler, servicios, suscripciones) no muestra proyección de fin de mes ni se marca en rojo al llegar al límite, porque se espera gastarla completa.

---

## Preguntas abiertas

**1. ¿Las subcategorías pueden tener límite?** Por ejemplo, Comida con ¢200.000 y adentro Restaurantes con ¢60.000. Si sí, el límite de la subcategoría es un tope dentro del de la padre, y el presupuesto del mes sigue sumando solo los límites de las padres (para no contar dos veces).
