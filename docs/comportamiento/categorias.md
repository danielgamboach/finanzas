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
- **Y** el tope que tenga Comida suma los ¢10.000
- **Y** la vista de Comida muestra cuánto va en cada subcategoría

Un gasto puede ir directo en la categoría padre; en la vista de la categoría aparece como la parte "directa".

### CAT-03 · Límite opcional

**Estado:** Eliminada

Las categorías ya no tienen límite: solo clasifican. Los límites viven en las partidas de tope del presupuesto (presupuesto.md, PPT-03).

### CAT-04 · Categorías fijas

**Estado:** Eliminada

La marca de fija ya no se usa: los pagos fijos son partidas del presupuesto (PPT-02). La columna sigue en la base, sin uso en el app.

Una categoría marcada como fija (alquiler, servicios, suscripciones) no muestra proyección de fin de mes ni se marca en rojo al llegar al límite, porque se espera gastarla completa.

---

### CAT-05 · La lista de categorías

**Estado:** Hecho

Ajustes → Más → **Categorías** (`#/mis-categorias`) muestra todas las categorías del espacio, también las que no tienen movimientos:

- Arriba, Gastos o Ingresos.
- Cada categoría principal con sus subcategorías debajo, un poco corridas. Tocar una abre la categoría (sus movimientos, y de ahí Editar).
- **+** o "Nueva" crea una categoría del tipo que se está viendo.
- Al final, las **archivadas**, que se pueden abrir para restaurarlas.

## Preguntas abiertas

Ninguna por ahora: la pregunta sobre límites en subcategorías se resuelve con los topes (PPT-03).
