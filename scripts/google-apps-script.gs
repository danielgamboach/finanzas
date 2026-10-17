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
 *  3. Ejecutar `instalar` y aceptar los permisos de Gmail.
 *  4. (Opcional) Ejecutar `importarHistorialSheet` una vez para traer el historial del Sheet.
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
  procesarVouchers();
  Logger.log('Listo: vouchers cada 10 min, tipo de cambio y recurrentes cada día.');
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
  const card = text.match(/(?:AMEX|VISA|MASTER\s?CARD|MC|TARJETA)[^:\n]*:\s*\|?\s*[*xX\s]*(\d{4})\b/i);
  const auth = field('Autorizaci[oó]n');

  const amt = monto.match(/(CRC|USD|\$|₡)\s*([\d.,]+)/i);
  if (!amt || !card) return null;
  const currency = /USD|\$/i.test(amt[1]) ? 'USD' : 'CRC';
  const amount = parseFloat(amt[2].replace(/,/g, ''));
  if (!(amount > 0)) return null;

  // "Oct 16, 2026, 21:54"
  const d = fecha.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}):(\d{2})/);
  let occurredAt = new Date().toISOString();
  if (d) {
    const mm = MONTHS[d[1].toLowerCase()] || 1;
    occurredAt = d[3] + '-' + pad_(mm) + '-' + pad_(d[2]) + 'T' + pad_(d[4]) + ':' + d[5] + ':00-06:00';
  }
  return { merchant: merchant, currency: currency, amount: amount, last4: card[1], tipo: tipo, auth: auth || null, occurredAt: occurredAt };
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
    const values = sh.getDataRange().getValues();
    const rows = [];
    values.forEach((r, i) => {
      const [fecha, concepto, crc, usd, suma, categoria] = r;
      if (!fecha || !concepto) return;
      let date;
      if (fecha instanceof Date) date = Utilities.formatDate(fecha, 'America/Costa_Rica', 'yyyy-MM-dd');
      else {
        const m = String(fecha).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return;
        date = m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
      }
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
