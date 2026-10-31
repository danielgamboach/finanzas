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
- **Y** el sobre que tenga Comida suma los ¢10.000
- **Y** la vista de Comida muestra cuánto va en cada subcategoría

Un gasto puede ir directo en la categoría padre; en la vista de la categoría aparece como la parte "directa".

### CAT-03 · Límite opcional

**Estado:** Eliminada

Las categorías ya no tienen límite: solo clasifican. Lo que se puede gastar vive en los sobres (presupuesto.md, SOB-01). Cada límite que existía se convirtió en un sobre (SOB-09).

### CAT-04 · Categorías fijas

**Estado:** Eliminada

Con los sobres, la marca de fija ya no se usa (SOB-09). La columna sigue en la base, sin uso en el app.

Una categoría marcada como fija (alquiler, servicios, suscripciones) no muestra proyección de fin de mes ni se marca en rojo al llegar al límite, porque se espera gastarla completa.

---

## Preguntas abiertas

Ninguna por ahora: la pregunta sobre límites en subcategorías se resuelve con los sobres (SOB-01).
