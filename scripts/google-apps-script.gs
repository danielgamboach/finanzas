/**
 * Finanzas · Google Apps Script
 *
 * Lee los vouchers del BAC en Gmail y los manda a la app (Supabase).
 * También actualiza el tipo de cambio oficial, genera los movimientos recurrentes
 * y mantiene activo el proyecto gratuito de Supabase.
 *
 * Instalación (una sola vez):
 *  1. script.google.com → Nuevo proyecto → pegar este archivo.
 *  2. Pegar tu token (Ajustes → Vouchers automáticos → Generar token) en FINANZAS_TOKEN abajo,
 *     o mejor: Configuración del proyecto → Propiedades del script → FINANZAS_TOKEN.
 *  3. Ejecutar `instalar` y aceptar los permisos (Gmail, Sheets y conexiones externas).
 *     La primera vez también importa el historial del Sheet.
 *
 * Segunda persona (ej. Kimmy), con su propia cuenta de Google:
 *  1. Entrar a la app con SU usuario y generar SU token en Ajustes → Vouchers automáticos.
 *  2. Mismos pasos 1 y 2 de arriba, pero ejecutar `instalarSoloVouchers` en vez de `instalar`.
 *     Solo lee sus correos del BAC; el tipo de cambio y el historial ya los maneja el script principal.
 *     Si un voucher también llega al otro correo, la app lo reconoce y no lo duplica.
 *
 * Historial (una vez, cada persona en su cuenta): ejecutar `importarHistorialCorreos`.
 * Lee todos los vouchers viejos desde HISTORIAL_DESDE, por tandas, y se reprograma solo hasta terminar.
 * Les pone la etiqueta Finanzas/Historial; para repetirlo desde cero, quitá esa etiqueta.
 * Las fechas que ya cubre un estado de cuenta importado se saltan para no duplicar.
 *
 * Recibos de Apple: el banco solo dice "APPLE.COM/BILL". Cada vez que revisa los vouchers, el script
 * también lee los recibos de Apple (no_reply@email.apple.com) y manda qué se pagó (YouTube, iCloud…);
 * la app lo empareja con el cobro del mismo monto. Solo sale el nombre de la app, el plan, el monto,
 * la fecha y los últimos 4 dígitos de la tarjeta; el correo no sale de tu cuenta.
 * Historial de recibos (una vez): ejecutar `importarRecibosApple`.
 */

const SUPABASE_URL = 'https://vzgnujopgryuskixcnnx.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6Z251am9wZ3J5dXNraXhjbm54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMTIwMDAsImV4cCI6MjEwNzc4ODAwMH0.gObwp-66r3G9o314yeIefYIhdNer6M9MAugTaQgI3k4';
const FINANZAS_TOKEN = ''; // o usar la propiedad del script FINANZAS_TOKEN

// Solo se procesan vouchers desde esta fecha (lo anterior viene del Sheet histórico).
const DESDE = '2026-10-16T00:00:00-06:00';
const LABEL = 'Finanzas/Procesado';
const QUERY = 'from:(baccredomatic.cr) subject:"Notificación de transacción" newer_than:14d';

// Historial: Sheet "Tracking Tarjeta Simbiotica"
const SHEET_ID = '1Jig5KJSYOqOmyAy8Y7No6fylIcN99lEapA6UsWZV3NU';
const SHEET_CARD_LAST4 = '7731';
const CATEGORY_MAP = { super: 'Súper', 'suscripción': 'Suscripciones', suscripcion: 'Suscripciones' };

function token_() {
  const t = PropertiesService.getScriptProperties().getProperty('FINANZAS_TOKEN') || FINANZAS_TOKEN;
  if (!t) throw new Error('Falta FINANZAS_TOKEN');
  return t;
}

function rpc_(fn, args) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify(args),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code >= 300) throw new Error(fn + ' → ' + code + ' ' + body);
  return body ? JSON.parse(body) : null;
}

/** Instala los disparadores automáticos. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarVouchers').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('actualizarTipoDeCambio').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('pulso').timeBased().everyDays(1).atHour(8).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  actualizarTipoDeCambio();
  pulso();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HISTORIAL_IMPORTADO')) {
    importarHistorialSheet();
    props.setProperty('HISTORIAL_IMPORTADO', new Date().toISOString());
  }
  procesarVouchers();
  Logger.log('Listo: vouchers cada 10 min, tipo de cambio y recurrentes cada día.');
}

// Historial de correos: desde cuándo leer vouchers viejos (formato de Gmail AAAA/MM/DD).
const HISTORIAL_DESDE = '2025/01/01';
// Etiqueta propia del historial: no depende de "Procesado", que el revisor automático
// también les pone a los vouchers que se salta por fecha.
const LABEL_HISTORIAL = 'Finanzas/Historial';
const LABEL_ERROR = 'Finanzas/Error';

/**
 * Carga los vouchers viejos del correo como historial. Corre por tandas y se reprograma hasta terminar.
 * Se puede correr de nuevo sin miedo: la app reconoce los vouchers que ya tiene y no los duplica.
 */
function importarHistorialCorreos(e) {
  const inicio = Date.now();
  const props = PropertiesService.getScriptProperties();
  const label = GmailApp.getUserLabelByName(LABEL_HISTORIAL) || GmailApp.createLabel(LABEL_HISTORIAL);
  const labelError = GmailApp.getUserLabelByName(LABEL_ERROR) || GmailApp.createLabel(LABEL_ERROR);
  const tok = token_();
  const q = 'from:(baccredomatic.cr) subject:"Notificación de transacción" after:' + HISTORIAL_DESDE +
    ' -label:' + LABEL_HISTORIAL.replace('/', '-') + ' -label:' + LABEL_ERROR.replace('/', '-');
  // corrido a mano empieza la cuenta de cero; la continuación automática la sigue
  if (!e || !e.triggerUid) props.deleteProperty('HISTORIAL_CORREOS');
  const st = JSON.parse(props.getProperty('HISTORIAL_CORREOS') ||
    '{"correos":0,"nuevos":0,"repetidos":0,"cubiertos":0,"sinCuenta":0,"ilegibles":0,"errores":0}');
  let quedan = true;
  while (Date.now() - inicio < 4.5 * 60 * 1000) {
    const threads = GmailApp.search(q, 0, 50);
    if (!threads.length) { quedan = false; break; }
    threads.forEach((thread) => {
      let ok = true;
      thread.getMessages().forEach((msg) => {
        st.correos++;
        const v = parseVoucher_(msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, '\n'));
        // sin fecha legible no se carga: quedaría con la fecha de hoy
        if (!v || !v.fechaOk) { st.ilegibles++; Logger.log('Sin datos de compra: ' + msg.getSubject()); return; }
        try {
          const r = rpc_('ingest_bac_voucher_bulk', {
            p_token: tok, p_message_id: msg.getId(), p_last4: v.last4, p_merchant: v.merchant,
            p_amount: v.amount, p_currency: v.currency, p_occurred_at: v.occurredAt, p_tx_type: v.tipo, p_auth: v.auth,
          });
          if (r === 'inserted') st.nuevos++;
          else if (r === 'duplicate') st.repetidos++;
          else if (r === 'covered_by_statement') st.cubiertos++;
          else if (r === 'unmatched') st.sinCuenta++;
        } catch (err) {
          ok = false;
          st.errores++;
          Logger.log('Error con ' + msg.getSubject() + ': ' + err);
        }
      });
      thread.addLabel(ok ? label : labelError);
    });
  }
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'importarHistorialCorreos')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  const resumen = st.correos + ' correos: ' + st.nuevos + ' nuevos, ' + st.repetidos + ' ya estaban, ' +
    st.cubiertos + ' cubiertos por estados de cuenta, ' + st.sinCuenta + ' de tarjetas sin registrar, ' +
    st.ilegibles + ' sin datos de compra, ' + st.errores + ' con error.';
  if (quedan) {
    props.setProperty('HISTORIAL_CORREOS', JSON.stringify(st));
    ScriptApp.newTrigger('importarHistorialCorreos').timeBased().after(60 * 1000).create();
    Logger.log('Faltan correos; sigue solo en un minuto. Hasta ahora: ' + resumen);
  } else {
    props.deleteProperty('HISTORIAL_CORREOS');
    Logger.log('Historial listo. ' + resumen);
  }
}

/** Para una segunda persona: solo revisa sus vouchers cada 10 minutos. */
function instalarSoloVouchers() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarVouchers').timeBased().everyMinutes(10).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  procesarVouchers();
  Logger.log('Listo: tus vouchers del BAC se revisan cada 10 minutos.');
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, set: 9, dic: 12 };

/** Extrae los datos de un voucher del BAC. Devuelve null si no es una transacción válida. */
function parseVoucher_(body) {
  const text = body.replace(/\r/g, '').replace(/ /g, ' ');
  const field = (label) => {
    const re = new RegExp(label + '\\s*:?\\s*\\|?\\s*([^\\n|]*)', 'i');
    const m = text.match(re);
    const v = m ? m[1].trim() : '';
    // an empty field can make the regex swallow the next label ("Ciudad y país: …")
    return /^[A-Za-zÁÉÍÓÚáéíóúñ ]+:/.test(v) ? '' : v;
  };
  const merchant = field('Comercio');
  const fecha = field('Fecha');
  const tipo = field('Tipo de Transacci[oó]n') || 'COMPRA';
  const monto = field('Monto');
  const card = text.match(/(?:AMEX|VISA|MASTER(?:\s?CARD)?|MC|TARJETA)[^:\n]*:\s*\|?\s*[*xX\s]*(\d{4})\b/i);
  const auth = field('Autorizaci[oó]n');

  const amt = monto.match(/(CRC|USD|\$|₡)\s*([\d.,]+)/i);
  if (!amt || !card) return null;
  const currency = /USD|\$/i.test(amt[1]) ? 'USD' : 'CRC';
  const amount = parseFloat(amt[2].replace(/,/g, ''));
  if (!(amount > 0)) return null;

  // "Oct 16, 2026, 21:54"
  const d = fecha.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*,\s*(\d{4})\s*,?\s*(\d{1,2}):(\d{2})/);
  let occurredAt = new Date().toISOString();
  if (d) {
    const mm = MONTHS[d[1].toLowerCase()] || 1;
    occurredAt = d[3] + '-' + pad_(mm) + '-' + pad_(d[2]) + 'T' + pad_(d[4]) + ':' + d[5] + ':00-06:00';
  }
  return { merchant: merchant, currency: currency, amount: amount, last4: card[1], tipo: tipo, auth: auth || null, occurredAt: occurredAt, fechaOk: !!d };
}

function pad_(n) { return String(n).padStart(2, '0'); }

/** Corre cada 10 minutos. */
function procesarVouchers() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(QUERY + ' -label:' + LABEL.replace('/', '-'), 0, 50);
  const tok = token_();
  const desde = new Date(DESDE).getTime();
  let n = 0;
  threads.forEach((thread) => {
    let ok = true;
    thread.getMessages().forEach((msg) => {
      const v = parseVoucher_(msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, '\n'));
      if (!v) return;
      if (new Date(v.occurredAt).getTime() < desde) return;
      try {
        const r = rpc_('ingest_bac_voucher', {
          p_token: tok, p_message_id: msg.getId(), p_last4: v.last4, p_merchant: v.merchant,
          p_amount: v.amount, p_currency: v.currency, p_occurred_at: v.occurredAt, p_tx_type: v.tipo, p_auth: v.auth,
        });
        if (r === 'inserted') n++;
      } catch (e) {
        ok = false;
        Logger.log('Error con ' + msg.getSubject() + ': ' + e);
      }
    });
    if (ok) thread.addLabel(label);
  });
  Logger.log(n + ' vouchers nuevos');
  try {
    procesarRecibosApple();
  } catch (e) {
    Logger.log('No se pudieron leer los recibos de Apple: ' + e);
  }
}

// ───────── Recibos de Apple ─────────
const APPLE_QUERY = 'from:(no_reply@email.apple.com) subject:(receipt OR invoice OR recibo OR factura)';
const LABEL_APPLE = 'Finanzas/Apple';
// Desde cuándo leer recibos viejos con importarRecibosApple (formato de Gmail AAAA/MM/DD).
const APPLE_DESDE = '2026/03/01';

/** Recibos recientes; corre junto con los vouchers. */
function procesarRecibosApple() {
  const r = recibosApple_('newer_than:21d', 60 * 1000);
  Logger.log('Recibos de Apple: ' + r.emparejados + ' emparejados, ' + r.pendientes + ' esperando el cobro');
}

/** Una vez: los recibos viejos, para nombrar los cobros de Apple que ya están en la app. */
function importarRecibosApple() {
  const r = recibosApple_('after:' + APPLE_DESDE, 5 * 60 * 1000);
  Logger.log('Recibos de Apple: ' + r.leidos + ' leídos, ' + r.emparejados + ' emparejados, ' + r.pendientes +
    ' sin cobro claro, ' + r.ilegibles + ' sin datos, ' + r.errores + ' con error' + (r.quedan ? '. Faltan: correlo otra vez.' : '.'));
}

function recibosApple_(cuando, tiempo) {
  const inicio = Date.now();
  const label = GmailApp.getUserLabelByName(LABEL_APPLE) || GmailApp.createLabel(LABEL_APPLE);
  const tok = token_();
  const st = { leidos: 0, emparejados: 0, pendientes: 0, ilegibles: 0, errores: 0, quedan: false };
  const q = APPLE_QUERY + ' ' + cuando + ' -label:' + LABEL_APPLE.replace('/', '-');
  while (true) {
    if (Date.now() - inicio > tiempo) { st.quedan = true; break; }
    const threads = GmailApp.search(q, 0, 30);
    if (!threads.length) break;
    threads.forEach((thread) => {
      let ok = true;
      thread.getMessages().forEach((msg) => {
        if (!/apple\.com/i.test(msg.getFrom())) return;
        st.leidos++;
        const r = parseAppleReceipt_(msg);
        if (!r) { st.ilegibles++; return; }
        try {
          const res = rpc_('ingest_apple_receipt', {
            p_token: tok, p_order_id: r.order, p_received_at: r.at, p_app: r.app, p_plan: r.plan,
            p_amount: r.amount, p_currency: r.currency, p_last4: r.last4,
          });
          if (res === 'matched') st.emparejados++;
          else if (res === 'pending') st.pendientes++;
        } catch (e) {
          ok = false;
          st.errores++;
          Logger.log('Error con el recibo ' + r.order + ': ' + e);
        }
      });
      // con error no se etiqueta, así se reintenta la próxima vez
      if (ok) thread.addLabel(label);
    });
  }
  return st;
}

/** Saca de un recibo de Apple: app, plan, monto, moneda, fecha, número de pedido y tarjeta. */
function parseAppleReceipt_(msg) {
  const html = msg.getBody() || '';
  const text = msg.getPlainBody() || html.replace(/<[^>]+>/g, '\n');
  const order = (text.match(/(?:Order ID|ID de pedido|N\.?º de pedido|Número de pedido)\s*:?\s*([A-Z0-9]{6,})/i) || [])[1] || msg.getId();
  const last4 = (text.match(/(?:[•·*]{2,}|\.{3,})\s*(\d{4})/) || [])[1] || null;
  const items = [];
  (html.match(/<tr[^>]*class="[^"]*lockup[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || []).forEach((row) => {
    const content = (row.match(/<td[^>]*class="[^"]*lockup__content[^"]*"[^>]*>([\s\S]*?)<\/td>/i) || [])[1];
    const cell = (row.match(/<td[^>]*class="[^"]*bottom-text[^"]*"[^>]*>([\s\S]*?)<\/td>/i) || [])[1];
    if (!content || !cell) return;
    const lines = (content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []).map(clean_)
      .filter((l) => l && !/^(renews|renewal|se renueva|renueva|expires|vence|caduca)/i.test(l));
    const price = money_(clean_(cell));
    if (lines.length && price) items.push({ app: lines[0], plan: lines.slice(1).join(' · '), amount: price.amount, currency: price.currency });
  });
  if (!items.length) {
    // formato viejo ("Your invoice from Apple."): título, plan y precio en celdas; solo la versión de escritorio
    const desk = html.split('aapl-mobile-div')[0];
    const re = /<td[^>]*class="item-cell[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="price-cell[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = re.exec(desk))) {
      const title = clean_((m[1].match(/class="title"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
      const plan = clean_((m[1].match(/class="addon-duration"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
      const price = money_(clean_(m[2]));
      if (title && price) items.push({ app: title, plan: plan, amount: price.amount, currency: price.currency });
    }
  }
  if (!items.length) {
    // formato de texto: "| | YouTube YouTube Premium (Monthly) Renews 6 November 2026 | US$9,49 |"
    const m = text.match(/\|\s*\|\s*(.+?)\s*\|\s*((?:US)?\$\s*[\d.,]+|₡\s*[\d.,]+)\s*\|/);
    const price = m && money_(m[2]);
    if (price) items.push({ app: m[1].replace(/\s+(Renews|Se renueva|Renueva)\b.*$/i, '').trim(), plan: '', amount: price.amount, currency: price.currency });
  }
  if (!items.length || items.some((i) => i.currency !== items[0].currency)) return null;
  const amount = Math.round(items.reduce((a, i) => a + i.amount, 0) * 100) / 100;
  const app = items.every((i) => i.app === items[0].app) ? items[0].app : 'App Store';
  const plan = items.map((i) => i.plan || i.app).join(' + ');
  return { order: order, last4: last4, app: app, plan: plan, amount: amount, currency: items[0].currency, at: msg.getDate().toISOString() };
}

function clean_(h) {
  return String(h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

/** "US$9,49" → 9.49 USD; "US$1,234.56" → 1234.56; "₡4.500" → 4500 CRC. */
function money_(s) {
  const m = String(s).match(/(US\$|USD|\$|₡|CRC)\s*([\d.,]+)/i);
  if (!m) return null;
  const crc = /₡|CRC/i.test(m[1]);
  let n = m[2].replace(/[.,]$/, '');
  const c = n.lastIndexOf(','), d = n.lastIndexOf('.');
  if (c > d) n = n.replace(/\./g, '').replace(',', '.');
  else if (crc && c < 0 && /\.\d{3}$/.test(n)) n = n.replace(/\./g, '');
  else n = n.replace(/,/g, '');
  const v = parseFloat(n);
  return isFinite(v) ? { amount: v, currency: crc ? 'CRC' : 'USD' } : null;
}

/** Tipo de cambio oficial de venta (Ministerio de Hacienda / BCCR). */
function actualizarTipoDeCambio() {
  try {
    const res = UrlFetchApp.fetch('https://api.hacienda.go.cr/indicadores/tc/dolar', { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const valor = data && data.venta && Number(data.venta.valor);
    const fecha = (data && data.venta && data.venta.fecha) || Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
    if (valor) {
      rpc_('set_fx_rate', { p_token: token_(), p_date: fecha.slice(0, 10), p_rate: valor });
      Logger.log('Tipo de cambio ' + fecha + ': ' + valor);
    }
  } catch (e) {
    Logger.log('No se pudo actualizar el tipo de cambio: ' + e);
  }
}

/** Genera recurrentes del mes y mantiene activo el proyecto de Supabase. */
function pulso() {
  Logger.log(JSON.stringify(rpc_('heartbeat', { p_token: token_() })));
}

/** Importa una vez el historial del Sheet "Tracking Tarjeta Simbiotica" (todas las pestañas). */
function importarHistorialSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tok = token_();
  let total = 0, inserted = 0;
  ss.getSheets().forEach((sh) => {
    const range = sh.getDataRange();
    const values = range.getValues();
    // Dates are read as displayed text (dd/mm/yyyy): a sheet with US locale turns "02/10" into Feb 10.
    const shown = range.getDisplayValues();
    const rows = [];
    values.forEach((r, i) => {
      const [, concepto, crc, usd, suma, categoria] = r;
      const fecha = shown[i][0];
      if (!fecha || !concepto) return;
      const m = String(fecha).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!m) return;
      const date = m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
      const nCrc = num_(crc), nUsd = num_(usd), nSum = num_(suma);
      let row;
      if (nCrc > 0) row = { amount: nCrc, currency: 'CRC' };
      else if (nUsd > 0) row = { amount: nUsd, currency: 'USD', fx: nSum > 0 ? Math.round((nSum / nUsd) * 100) / 100 : null };
      else return;
      const cat = String(categoria || '').trim();
      row.category = CATEGORY_MAP[cat.toLowerCase()] || cat;
      row.date = date;
      row.merchant = String(concepto).trim();
      row.seq = sh.getName() + ':' + i;
      rows.push(row);
    });
    for (let i = 0; i < rows.length; i += 100) {
      const r = rpc_('import_rows', { p_token: tok, p_last4: SHEET_CARD_LAST4, p_rows: rows.slice(i, i + 100), p_source_tag: 'sheet' });
      total += r.rows;
      inserted += r.inserted;
    }
  });
  Logger.log('Historial: ' + total + ' filas leídas, ' + inserted + ' importadas');
}

function num_(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/,/g, '').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Prueba el parser con el último voucher sin guardar nada. */
function probarParser() {
  const t = GmailApp.search(QUERY, 0, 1)[0];
  if (!t) return Logger.log('No hay vouchers recientes');
  Logger.log(JSON.stringify(parseVoucher_(t.getMessages()[0].getPlainBody())));
}
