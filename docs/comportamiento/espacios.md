# Espacios

Un espacio agrupa cuentas, movimientos, categorías, recurrentes y metas. Cada persona tiene un espacio personal y puede estar en espacios compartidos con otras personas.

### ESP-01 · Cada persona tiene un espacio personal, y es el principal

**Estado:** Hecho

Al registrarse se crea su espacio personal con categorías por defecto. Es su espacio principal: el primero de la lista y el que se abre si no eligió otro. No se puede abandonar ni eliminar (solo desaparece si la persona elimina su cuenta de usuario).

- **Dado** que una persona se registra
- **Entonces** tiene un espacio "Personal" donde es dueña
- **Y** no ve la opción de abandonarlo ni eliminarlo

La base lo impide: un espacio solo se borra cuando lo abandona la última persona (ESP-04), y el personal no se puede abandonar.

<sub>Dónde vive: `handle_new_user`, `seed_space_defaults`.</sub>

### ESP-02 · Los espacios compartidos son secundarios

**Estado:** Hecho

Se crean desde Ajustes → Espacios (o en la configuración inicial, si la persona dice que va a usar el app con alguien) e invitan a otros con un enlace. En el menú aparecen debajo del personal.

<sub>Dónde vive: `create_space`, `create_invite`, `accept_invite`.</sub>

### ESP-03 · Abandonar un espacio compartido

**Estado:** Hecho

Cualquier miembro puede abandonar un espacio compartido desde Ajustes → Espacios. Antes de hacerlo, el app advierte qué pasa.

- **Dado** que Kimmy y Dani están en el espacio compartido "Casa"
- **Cuando** Kimmy toca "Abandonar Casa"
- **Entonces** ve una advertencia: deja de ver todo lo de "Casa"; Dani lo sigue teniendo
- **Cuando** confirma
- **Entonces** "Casa" desaparece de su menú y el app la lleva a su espacio personal
- **Y** Dani sigue viendo "Casa" con toda su información

| Variante | Resultado esperado |
|---|---|
| Kimmy era la dueña y Dani queda solo | Dani pasa a ser el dueño |
| Kimmy es la última persona en el espacio | La advertencia dice que se va a borrar todo para siempre (ESP-04) |

### ESP-04 · Si todos abandonan un espacio, se borra

**Estado:** Hecho

Cuando la última persona abandona un espacio compartido, el espacio y toda su información (cuentas, movimientos, categorías, recurrentes, metas, saldos, invitaciones) se borran definitivamente en ese momento. No queda oculto ni archivado.

- **Dado** que Dani es la única persona en "Casa"
- **Cuando** toca "Abandonar Casa"
- **Entonces** la advertencia dice: "Sos la última persona en Casa. Si la abandonás, se borra todo lo que tiene y no se puede recuperar."
- **Cuando** confirma
- **Entonces** "Casa" y todos sus datos dejan de existir en la base

### ESP-05 · Nadie elimina un espacio con otras personas adentro

**Estado:** Hecho

No existe "eliminar espacio": solo abandonarlo. Un espacio se borra cuando sale la última persona (ESP-04). Así nadie pierde datos por la decisión de otro.

El borrado arrastra todo lo del espacio: cuentas, movimientos, categorías, recurrentes, metas, saldos, invitaciones, reglas y respuestas de suscripciones. Los movimientos que alguien había mandado a ese espacio desde su cuenta personal se quedan en su espacio personal, sin destino. Los logos de comercios no se borran porque son del catálogo común.

<sub>Dónde vive: `leave_space` y `protect_spaces` en la base; Ajustes → Espacios → Abandonar.</sub>

### ESP-06 · Cada espacio tiene su propia información

**Estado:** Hecho

Lo que se ve en un espacio es solo de ese espacio: cuentas, movimientos, presupuesto, recurrentes, patrimonio y metas. Un movimiento pertenece a un solo espacio; se puede cambiar de espacio al editarlo. Una persona solo ve los espacios de los que es miembro.

<sub>Dónde vive: RLS con `is_space_member` en todas las tablas.</sub>

---

## Preguntas contestadas

**Nadie elimina un espacio con otras personas adentro**: solo se abandona, y se borra cuando sale la última (decisión de Dani, 31 oct).

## Preguntas abiertas

**1. ¿Qué pasa con las cuentas de quien se va?** Por ejemplo, si Kimmy registró su tarjeta en el espacio compartido y lo abandona, la tarjeta se queda en el espacio (es información del espacio, no de la persona). ¿Está bien así?

**2. Vouchers de una tarjeta en un espacio que abandoné.** Si el script de alguien manda vouchers a un espacio del que salió, hoy se perderían o fallarían. Deberían quedar sin espacio y avisarle.
