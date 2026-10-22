/** Short welcome lines for the home title. `{n}` is replaced with the user's first name. */
const GREETINGS = [
  '{n}, esta vez sí llegamos a fin de mes.',
  'Pura vida, {n}. Veamos cómo van los números.',
  'Qué dicha verte, {n}.',
  'Diay, {n}, ¿cómo vamos?',
  'Hola, {n}. La billetera amaneció tranquila.',
  '{n}, los colones te estaban esperando.',
  '{n}, hoy los números vienen de buenas.',
  'Hola, {n}. Café en mano y cuentas claras.',
  '{n}, cuentas claras, amistades largas.',
  'Buenas, {n}. Cero sustos hoy, ojalá.',
  '{n}, aquí todo suma. Bueno, casi todo.',
  'Hola, {n}. El presupuesto te manda saludos.',
  '{n}, veamos qué hizo la plata hoy.',
  'Tuanis verte, {n}.',
  '{n}, hoy es buen día para no comprar nada. Tal vez.',
  'Hola, {n}. Respirá hondo y abramos las cuentas.',
  '{n}, tus colones y tus dólares te saludan.',
  '{n}, el carrito de compras puede esperar.',
  'Qué bueno tenerte de vuelta, {n}.',
  '{n}, ahorrar también es un deporte.',
  '{n}, poco a poco se llena el chanchito.',
  '{n}, cada colón cuenta. Literalmente, aquí los contamos.',
  'Hola, {n}. Todo en orden, o casi.',
  '{n}, hoy no hacen falta cálculos mentales.',
  '{n}, tu yo del futuro te lo agradece.',
  'Buenas, {n}. ¿Revisamos sin miedo?',
  '{n}, fin de mes ya no da tanto miedo.',
  'Hola, {n}. Los gastos hormiga no se cuentan solos.',
  '{n}, aquí los números no muerden.',
  '{n}, hoy invita el presupuesto. Mentira.',
  '{n}, menos sustos, más saldo.',
  'Pura vida, {n}. Todo bajo control.',
  '{n}, la billetera te extrañaba.',
  '{n}, ordenar la plata también relaja.',
  'Hola, {n}. Hoy sí cuadra todo.',
  '{n}, el antojo puede esperar a mañana.',
  '{n}, ordenar la plata es quererse un poquito.',
  '{n}, aquí no se juzga ningún antojo.',
  'Hola de nuevo, {n}.',
  '{n}, que los números te sonrían hoy.',
  '{n}, una revisadita y a seguir.',
  '{n}, hoy la plata rinde. Ojalá.',
  '{n}, la tarjeta y vos, mejores amistades.',
  'Hola, {n}. Cero dramas financieros hoy.',
  '{n}, el chanchito manda saludos.',
  '{n}, esto es como el gym, pero para la billetera.',
  '{n}, aquí manda el presupuesto, no los antojos.',
  '{n}, que no te agarre la tarde con las cuentas.',
  '{n}, a ponerle orden al mes.',
  '{n}, hoy las finanzas vienen en paz.',
];

const KEY = 'greeting-last';

/** One pick per app load, never the same line as the previous load. */
const pick = (() => {
  let last = -1;
  try {
    last = Number(localStorage.getItem(KEY) ?? -1);
  } catch {}
  let i = Math.floor(Math.random() * GREETINGS.length);
  if (i === last) i = (i + 1) % GREETINGS.length;
  try {
    localStorage.setItem(KEY, String(i));
  } catch {}
  return i;
})();

/** The welcome line for this session, or null when there is no name to greet. */
export function greeting(name: string | null | undefined): string | null {
  const first = (name || '').trim().split(/\s+/)[0];
  if (!first) return null;
  return GREETINGS[pick].replace('{n}', first);
}
