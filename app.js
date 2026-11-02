/* Punto Brasil · Precios — app independiente (GitHub Pages + Supabase) */
const LIBS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  exceljs: "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
  qr: "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"
};
const CONF = window.PB_CONFIG || {};
const N = PB.num;
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clp = (x) => (x === null || x === undefined || !isFinite(x) ? "—" : "$" + Math.round(x).toLocaleString("es-CL"));
const brl = (x) => (x === null || x === undefined || !isFinite(x) ? "—" : "R$ " + Number(x).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const money = (x, cur) => (cur === "BRL" ? brl(x) : clp(x));
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fdate = (s) => { if (!s) return ""; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}.${m}.${y}`; };

const S = {
  sb: null, user: null, member: false, ready: false,
  cfg: clone(PB.DEFAULT_CONFIG), counters: {}, compras: {}, productos: {}, movs: [],
  view: "productos", compraId: null, open: {}, filter: "",
  pf: { q: "", linea: "", tipo: "", prov: "", stock: "", estado: "", orden: "nombre", limit: 120 },
  vf: { mes: today().slice(0, 7) },
  calc: { linea: "oro_br", perfil: "", peso: "2,5", bruto: "6", tc: "" },
  fx: { linea: "oro_br", peso: "1,55", bruto: "9,57", perfil: "", focus: null }, draft: null, draftCounters: null, dirtyP: new Set(), dirtyC: new Set(), timers: {}, pendingRender: false, shopStatus: null
};

/* ---------- utilidades de interfaz ---------- */
function toast(msg, ms = 3400) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function setStatus(msg, err) { const el = $("#status"); if (el) { el.textContent = msg; el.className = "status" + (err ? " err" : ""); } }
const loaded = {};
function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("No se pudo cargar una librería. Revisa la conexión.")); }; document.head.appendChild(s); });
  return loaded[src];
}
function modal(html, onMount) {
  const back = document.createElement("div"); back.className = "modal-back";
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener("click", (e) => { if (e.target === back && !back.dataset.busy) close(); });
  onMount && onMount(back.firstElementChild, close, back); return close;
}
function confirmBox(title, text, ok = "Aceptar", danger) {
  return new Promise((res) => modal(`<h2>${esc(title)}</h2><p class="muted">${text}</p><div class="row end"><button class="btn" id="mNo">Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" id="mOk">${esc(ok)}</button></div>`,
    (m, close) => { $("#mNo", m).onclick = () => { close(); res(false); }; $("#mOk", m).onclick = () => { close(); res(true); }; }));
}
function download(filename, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* ---------- modelo ---------- */
const lineCfg = (k) => S.cfg.lines[k] || S.cfg.lines.oro_br;
const typesFor = (grupo) => S.cfg.types.filter((t) => !grupo || t.grupo === grupo);
const typeName = (code) => (S.cfg.types.find((t) => t.code === code) || {}).nombre || code || "";
const defParams = {};
function paramsOf(p) {
  const c = p.compra_id && S.compras[p.compra_id];
  if (c && c.params) return c.params;
  return (defParams[p.linea] ||= PB.paramsFor(S.cfg, p.linea in S.cfg.lines ? p.linea : "oro_br"));
}
const calcP = (p) => PB.calc({ peso: p.peso, bruto: p.bruto, perfil: p.perfil, precioManual: p.precio_manual }, paramsOf(p));
function stockOf(p) {
  const s = S.stockMap[p.id] || { mov: 0, vendidos: 0 };
  return { disp: (N(p.qty) || 0) + s.mov, vendidos: s.vendidos, ultima: s.ultima };
}
function stockState(p) {
  const d = stockOf(p).disp; const min = N(p.stock_min) ?? N(S.cfg.stockMin) ?? 2;
  return d <= 0 ? "sin" : d <= min ? "critico" : "ok";
}
function rebuildStock() {
  const m = {};
  S.movs.forEach((x) => { const o = (m[x.producto_id] ||= { mov: 0, vendidos: 0, ultima: null }); o.mov += N(x.cantidad) || 0; if (x.tipo === "venta") { o.vendidos += -(N(x.cantidad) || 0); if (!o.ultima || x.fecha > o.ultima) o.ultima = x.fecha; } });
  S.stockMap = m;
}
S.stockMap = {};
const allCodes = () => new Set(Object.values(S.productos).map((p) => p.code).filter(Boolean));
const itemsOf = (cid) => Object.values(S.productos).filter((p) => p.compra_id === cid).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.creado || "").localeCompare(String(b.creado || "")));

/* ---------- datos (Supabase) ---------- */
const NUMERIC = ["qty", "peso", "bruto", "precio_manual", "shopify_precio", "shopify_stock", "stock_min", "total_doc"];
const P_COLS = ["id", "code", "nombre", "linea", "tipo", "mat", "proveedor", "compra_id", "ref", "desc_original", "variante", "qty", "peso", "bruto", "perfil", "precio_manual", "img_url", "nota", "descripcion", "shopify_id", "shopify_variant", "shopify_precio", "shopify_stock", "shopify_estado", "shopify_url", "shopify_sync", "origen", "activo", "stock_min", "pagina", "creado"];
function pRow(p) { const o = {}; P_COLS.forEach((k) => { if (p[k] !== undefined) o[k] = NUMERIC.includes(k) ? (p[k] === "" ? null : N(p[k])) : p[k] === "" && k === "code" ? null : p[k]; }); o.actualizado = new Date().toISOString(); return o; }
function cRow(c) { return { id: c.id, linea: c.linea, proveedor: c.proveedor || null, fecha: c.fecha || null, documento: c.documento || null, params: c.params, total_doc: N(c.total_doc), moneda_doc: c.moneda_doc || null, nota: c.nota || null, actualizada: new Date().toISOString() }; }
function err(e) { return (e && (e.message || e.error_description)) || String(e); }

async function loadAll() {
  setStatus("Cargando…");
  const sb = S.sb;
  const [cfg, comp, prods, movs] = await Promise.all([
    sb.from("config").select("*"),
    sb.from("compras").select("*"),
    fetchAll("productos"),
    fetchAll("movimientos")
  ]);
  if (cfg.error || comp.error) throw cfg.error || comp.error;
  const main = (cfg.data || []).find((r) => r.id === "main"); const ctr = (cfg.data || []).find((r) => r.id === "counters");
  S.cfg = mergeCfg(main && main.data); S.counters = (ctr && ctr.data) || {};
  for (const k in defParams) delete defParams[k];
  S.compras = {}; (comp.data || []).forEach((c) => (S.compras[c.id] = c));
  S.productos = {}; prods.forEach((p) => (S.productos[p.id] = p));
  S.movs = movs; rebuildStock();
  S.ready = true; setStatus("");
}
async function fetchAll(table) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await S.sb.from(table).select("*").range(from, from + size - 1);
    if (error) throw error; out.push(...data); if (data.length < size) break;
  }
  return out;
}
function mergeCfg(saved) {
  const d = clone(PB.DEFAULT_CONFIG); if (!saved) return d;
  const out = { ...d, ...clone(saved) }; out.lines = { ...d.lines };
  Object.keys(saved.lines || {}).forEach((k) => (out.lines[k] = { ...(d.lines[k] || {}), ...clone(saved.lines[k]) }));
  out.lineOrder = d.lineOrder.filter((k) => out.lines[k]);
  return out;
}
function saveP(p, ms = 700) {
  S.dirtyP.add(p.id); clearTimeout(S.timers["p" + p.id]);
  S.timers["p" + p.id] = setTimeout(() => flushP(p.id), ms);
}
const inflight = {};
async function flushP(id) {
  const p = S.productos[id]; clearTimeout(S.timers["p" + id]); if (!p) return;
  if (inflight["p" + id]) { inflight["again" + id] = true; return; }
  inflight["p" + id] = true; setStatus("Guardando…");
  const { error } = await S.sb.from("productos").upsert(pRow(p));
  inflight["p" + id] = false;
  if (error) { setStatus(/duplicate key.*code/.test(error.message) ? "Ese código ya existe" : "No se pudo guardar: " + error.message, true); }
  else setStatus("Guardado");
  if (inflight["again" + id]) { inflight["again" + id] = false; return flushP(id); }
  S.dirtyP.delete(id);
}
async function saveC(c, ms = 500) {
  S.dirtyC.add(c.id); clearTimeout(S.timers["c" + c.id]);
  S.timers["c" + c.id] = setTimeout(async () => {
    const { error } = await S.sb.from("compras").upsert(cRow(c));
    S.dirtyC.delete(c.id); if (error) setStatus("No se pudo guardar la compra: " + error.message, true); else setStatus("Guardado");
  }, ms);
}
async function flushAll() { await Promise.all([...S.dirtyP].map((id) => flushP(id))); }
async function saveConfig(cfg) { const { error } = await S.sb.from("config").upsert({ id: "main", data: cfg, actualizado: new Date().toISOString() }); if (error) throw error; S.cfg = cfg; for (const k in defParams) delete defParams[k]; }
async function saveCounters(next) { const { error } = await S.sb.from("config").upsert({ id: "counters", data: next, actualizado: new Date().toISOString() }); if (error) throw error; S.counters = next; }

function subscribeLive() {
  S.sb.channel("cambios").on("postgres_changes", { event: "*", schema: "public" }, (ev) => {
    const row = ev.new && Object.keys(ev.new).length ? ev.new : null; const old = ev.old || {};
    if (ev.table === "productos") { if (S.dirtyP.has(old.id || (row && row.id))) return; if (ev.eventType === "DELETE") delete S.productos[old.id]; else S.productos[row.id] = row; }
    else if (ev.table === "compras") { if (S.dirtyC.has(old.id || (row && row.id))) return; if (ev.eventType === "DELETE") delete S.compras[old.id]; else S.compras[row.id] = row; for (const k in defParams) delete defParams[k]; }
    else if (ev.table === "movimientos") { if (ev.eventType === "DELETE") S.movs = S.movs.filter((m) => m.id !== old.id); else { S.movs = S.movs.filter((m) => m.id !== row.id); S.movs.push(row); } rebuildStock(); }
    else if (ev.table === "config") { if (row.id === "main") { S.cfg = mergeCfg(row.data); for (const k in defParams) delete defParams[k]; } if (row.id === "counters") S.counters = row.data || {}; }
    safeRender();
  }).subscribe();
}
function safeRender() {
  const a = document.activeElement;
  if (a && a.closest && a.closest("main, .modal") && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { S.pendingRender = true; return; }
  if (document.querySelector(".modal-back")) { S.pendingRender = true; return; }
  render();
}
document.addEventListener("focusout", () => setTimeout(() => { if (S.pendingRender && !document.querySelector(".modal-back")) { S.pendingRender = false; safeRender(); } }, 60));

/* ---------- fotos ---------- */
function canvasToBlob(cv, q = 0.85) { return new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", q)); }
function cropCanvas(src, box, maxSide = 700) {
  const s = Math.min(1, maxSide / Math.max(box.w, box.h));
  const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(box.w * s)); cv.height = Math.max(1, Math.round(box.h * s));
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, cv.width, cv.height); return cv;
}
async function srcToCanvas(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return cropCanvas(img, { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, 900);
}
async function uploadPhoto(id, src) {
  const cv = await srcToCanvas(src); const blob = await canvasToBlob(cv, 0.84);
  const path = `p/${id}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await S.sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return S.sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
}
async function imageDataUrl(p) {
  if (!p.img_url) return null;
  try { const r = await fetch(p.img_url, { mode: "cors" }); if (!r.ok) return null; const b = await r.blob(); const du = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    if (/^data:image\/(jpeg|jpg)/.test(du)) return du; const cv = await srcToCanvas(du); return cv.toDataURL("image/jpeg", 0.85); } catch (e) { return null; }
}
function imgSize(du) { return new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 1, h: 1 }); i.src = du; }); }
const thumb = (p, cls = "thumb") => `<span class="${cls}">${p.img_url ? `<img loading="lazy" src="${esc(p.img_url)}" alt="">` : "Sin foto"}</span>`;

/* ---------- autenticación ---------- */
function viewLogin(mode = "login", msg = "") {
  document.body.classList.add("auth");
  $("main").innerHTML = `<section class="panel login grid">
    <div><div class="eyebrow">Punto Brasil</div><h1>${mode === "signup" ? "Crear <em>cuenta</em>" : mode === "reset" ? "Recuperar <em>clave</em>" : mode === "newpass" ? "Nueva <em>clave</em>" : "Iniciar <em>sesión</em>"}</h1></div>
    ${msg ? `<div class="note">${msg}</div>` : ""}
    <form id="authForm" class="grid">
      ${mode !== "newpass" ? `<label class="f">Correo<input type="email" id="aEmail" autocomplete="email" required></label>` : ""}
      ${mode !== "reset" ? `<label class="f">Clave${mode === "signup" || mode === "newpass" ? " (mínimo 8 caracteres)" : ""}<input type="password" id="aPass" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "login" ? 1 : 8}" required></label>` : ""}
      <button class="btn primary" type="submit">${mode === "signup" ? "Crear cuenta" : mode === "reset" ? "Enviar correo" : mode === "newpass" ? "Guardar clave" : "Entrar"}</button>
    </form>
    <div class="row small">${mode !== "login" ? `<a href="#" data-auth="login">Ya tengo cuenta</a>` : `<a href="#" data-auth="signup">Crear mi cuenta</a><a href="#" data-auth="reset">Olvidé mi clave</a>`}</div>
    <p class="small muted">Solo pueden entrar los correos autorizados por Punto Brasil.</p></section>`;
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault(); const b = $("#authForm button"); b.disabled = true;
    const email = $("#aEmail") && $("#aEmail").value.trim(), pass = $("#aPass") && $("#aPass").value;
    let r;
    if (mode === "login") r = await S.sb.auth.signInWithPassword({ email, password: pass });
    else if (mode === "signup") r = await S.sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
    else if (mode === "reset") r = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    else r = await S.sb.auth.updateUser({ password: pass });
    b.disabled = false;
    if (r.error) return viewLogin(mode, esc(r.error.message === "Invalid login credentials" ? "Correo o clave incorrectos." : r.error.message));
    if (mode === "signup") return viewLogin("login", "Te enviamos un correo para confirmar la cuenta. Ábrelo y luego entra aquí.");
    if (mode === "reset") return viewLogin("login", "Revisa tu correo: te enviamos un enlace para crear una clave nueva.");
    if (mode === "newpass") { toast("Clave actualizada"); start(); }
  };
  document.querySelectorAll("[data-auth]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); viewLogin(a.dataset.auth); }));
}
async function start() {
  if (S.starting) return; S.starting = true;
  try { await startInner(); } finally { S.starting = false; }
}
async function startInner() {
  const { data } = await S.sb.auth.getSession();
  S.user = data.session && data.session.user;
  if (!S.user) return viewLogin();
  document.body.classList.remove("auth");
  const { data: ok, error } = await S.sb.rpc("es_miembro");
  if (error || !ok) { $("main").innerHTML = `<section class="panel login grid"><h1>Correo no <em>autorizado</em></h1><p class="muted">${esc(S.user.email)} todavía no está autorizado para usar la herramienta. Pide que lo agreguen y vuelve a entrar.</p><button class="btn" data-act="logout">Cerrar sesión</button></section>`; return; }
  $("#who").textContent = S.user.email;
  try { await loadAll(); } catch (e) { setStatus("No se pudieron cargar los datos: " + err(e), true); }
  if (!S.live) { subscribeLive(); S.live = true; }
  route();
}

/* ---------- navegación ---------- */
function route() {
  const h = (location.hash || "#productos").slice(1);
  if (h.startsWith("compra-")) { S.view = "compra"; S.compraId = h.slice(7); }
  else S.view = ["productos", "compras", "ventas", "calc", "ajustes"].includes(h) ? h : "productos";
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (S.ready) route(); });
const go = (h) => { if (location.hash === "#" + h) route(); else location.hash = h; };

function render() {
  if (!S.ready) return;
  const cur = S.view === "compra" ? "compras" : S.view;
  document.querySelectorAll("[data-nav]").forEach((b) => b.setAttribute("aria-current", b.dataset.nav === cur ? "page" : "false"));
  const m = $("main");
  if (S.view === "compra" && S.compras[S.compraId]) m.innerHTML = viewCompra(S.compras[S.compraId]);
  else if (S.view === "compras") m.innerHTML = viewCompras();
  else if (S.view === "ventas") m.innerHTML = viewVentas();
  else if (S.view === "calc") m.innerHTML = viewCalc();
  else if (S.view === "ajustes") m.innerHTML = viewAjustes();
  else m.innerHTML = viewProductos();
}

/* ---------- Productos ---------- */
function filteredProducts() {
  const f = S.pf; const q = f.q.trim().toLowerCase();
  let list = Object.values(S.productos).filter((p) => p.activo !== false);
  if (q) list = list.filter((p) => [p.nombre, p.code, p.ref, p.proveedor, p.desc_original, typeName(p.tipo)].join(" ").toLowerCase().includes(q));
  if (f.linea) list = list.filter((p) => p.linea === f.linea);
  if (f.tipo) list = list.filter((p) => p.tipo === f.tipo);
  if (f.prov) list = list.filter((p) => (p.proveedor || "") === f.prov);
  if (f.stock) list = list.filter((p) => stockState(p) === f.stock);
  if (f.estado === "sincodigo") list = list.filter((p) => !p.code);
  else if (f.estado === "sinprecio") list = list.filter((p) => !calcP(p).ok);
  else if (f.estado === "sinfoto") list = list.filter((p) => !p.img_url);
  else if (f.estado === "difshop") list = list.filter((p) => p.shopify_precio != null && calcP(p).ok && Math.round(calcP(p).final) !== Math.round(N(p.shopify_precio)));
  else if (f.estado === "noshop") list = list.filter((p) => !p.shopify_variant && p.code);
  else if (f.estado === "enshop") list = list.filter((p) => !!p.shopify_variant);
  const by = { nombre: (a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"), code: (a, b) => String(a.code || "~").localeCompare(String(b.code || "~")),
    precio: (a, b) => (calcP(b).final || 0) - (calcP(a).final || 0), stock: (a, b) => stockOf(a).disp - stockOf(b).disp,
    vendidos: (a, b) => stockOf(b).vendidos - stockOf(a).vendidos, nuevos: (a, b) => String(b.creado || "").localeCompare(String(a.creado || "")) };
  return list.sort(by[f.orden] || by.nombre);
}
function viewProductos() {
  const f = S.pf; const list = filteredProducts();
  let unid = 0, vCosto = 0, vVenta = 0; list.forEach((p) => { const d = Math.max(0, stockOf(p).disp); const r = calcP(p); unid += d; if (r.ok) { vCosto += d * r.costo; vVenta += d * r.final; } });
  const provs = [...new Set(Object.values(S.productos).map((p) => p.proveedor).filter(Boolean))].sort();
  const sel = (key, opts, label) => `<label class="f">${label}<select data-pf="${key}"><option value="">Todos</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${f[key] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const cards = list.slice(0, f.limit).map((p) => {
    const r = calcP(p); const st = stockOf(p); const ss = stockState(p);
    const dif = p.shopify_precio != null && r.ok && Math.round(r.final) !== Math.round(N(p.shopify_precio));
    return `<button class="pcard" data-act="openP" data-id="${esc(p.id)}">${thumb(p, "pimg")}
      <span class="pbody"><span class="pname">${esc(p.nombre || "Sin nombre")}</span>
      <span class="row tight">${p.code ? `<span class="chip code">${esc(p.code)}</span>` : `<span class="chip warn">Sin código</span>`}</span>
      <span class="row tight spread"><b class="pprice">${r.ok ? clp(r.final) : "—"}</b><span class="chip ${ss === "ok" ? "ok" : ss === "critico" ? "warn" : "bad"}">${st.disp} u.</span></span>
      ${dif ? `<span class="small warn-t">Shopify ${clp(N(p.shopify_precio))}</span>` : ""}</span></button>`;
  }).join("");
  return `<section class="row spread"><div><div class="eyebrow">Inventario</div><h1>Todos los <em>productos</em></h1></div>
    <div class="row"><button class="btn" data-act="shopSync">Sincronizar Shopify</button><button class="btn primary" data-act="newProduct">+ Producto</button></div></section>
  <section class="panel grid" style="gap:10px">
    <input class="inp" type="search" placeholder="Buscar por nombre, código, referencia o proveedor" data-pf="q" value="${esc(f.q)}">
    <details class="fdet" ${(S.open.filters ?? innerWidth > 640) ? "open" : ""} data-tg="filters"><summary class="small">Filtros y orden${["linea", "tipo", "prov", "stock", "estado"].filter((k) => f[k]).length ? ` · <b>${["linea", "tipo", "prov", "stock", "estado"].filter((k) => f[k]).length} activos</b>` : ""}</summary>
    <div class="filters">
      ${sel("linea", S.cfg.lineOrder.map((k) => [k, S.cfg.lines[k].corto]), "Línea")}
      ${sel("tipo", S.cfg.types.map((t) => [t.code, t.nombre]), "Tipo")}
      ${sel("prov", provs.map((x) => [x, x]), "Proveedor")}
      ${sel("stock", [["ok", "Disponible"], ["critico", "Stock crítico"], ["sin", "Sin stock"]], "Stock")}
      ${sel("estado", [["sincodigo", "Sin código"], ["sinprecio", "Sin precio (faltan datos)"], ["sinfoto", "Sin foto"], ["difshop", "Precio distinto en Shopify"], ["noshop", "No está en Shopify"], ["enshop", "Está en Shopify"]], "Revisar")}
      <label class="f">Ordenar<select data-pf="orden">${[["nombre", "Nombre"], ["code", "Código"], ["precio", "Precio (mayor a menor)"], ["stock", "Stock (menor a mayor)"], ["vendidos", "Más vendidos"], ["nuevos", "Más nuevos"]].map(([v, t]) => `<option value="${v}" ${f.orden === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div></details>
    <div class="row spread small"><span><b>${list.length}</b> productos · ${unid} unidades · stock a costo ${clp(vCosto)} · a venta ${clp(vVenta)}</span>
    <span class="row tight"><button class="btn ghost small" data-act="clearPf">Limpiar filtros</button><button class="btn small" data-act="outList">Imprimir / exportar esta lista</button></span></div>
  </section>
  <section class="pgrid">${cards || `<div class="panel empty"><h2>No hay productos con esos filtros</h2><p class="muted">Cambia la búsqueda o importa tus productos desde Ajustes.</p></div>`}</section>
  ${list.length > f.limit ? `<button class="btn" data-act="moreP" style="justify-self:center">Mostrar más (${list.length - f.limit})</button>` : ""}`;
}

function productModal(p) {
  modal(`<div id="pm"></div>`, (m, close) => {
    const draw = () => {
      const r = calcP(p); const st = stockOf(p); const params = paramsOf(p); const L = lineCfg(p.linea); const compra = p.compra_id && S.compras[p.compra_id];
      const movs = S.movs.filter((x) => x.producto_id === p.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado).localeCompare(String(a.creado))).slice(0, 12);
      $("#pm", m).innerHTML = `<div class="row spread"><div class="eyebrow">${esc(L.corto)}${compra ? " · compra " + fdate(compra.fecha) + " " + esc(compra.proveedor || "") : p.origen === "maestra" ? " · desde la maestra" : ""}</div><button class="btn ghost" data-x="close" aria-label="Cerrar">✕</button></div>
      <div class="pm-head"><label class="thumb big" title="Cambiar foto">${p.img_url ? `<img src="${esc(p.img_url)}" alt="">` : "Agregar foto"}<input type="file" accept="image/*" class="hidden" id="pmPhoto"></label>
      <div class="grid" style="gap:6px;min-width:0"><input class="name" data-pp="nombre" value="${esc(p.nombre)}" aria-label="Nombre">
      <div class="row tight">${p.code ? `<span class="chip code">${esc(p.code)}</span>` : `<span class="chip warn">Sin código</span>`}${p.ref ? `<span class="chip">Ref. ${esc(p.ref)}</span>` : ""}${p.shopify_url ? `<a class="chip ok" href="${esc(p.shopify_url)}" target="_blank" rel="noopener">Ver en la tienda</a>` : p.shopify_variant ? `<span class="chip ok">En Shopify</span>` : ""}</div>
      <div class="pm-price">${r.ok ? clp(r.final) : "Sin precio"}</div><div class="small muted">${r.ok ? (r.manual ? "precio fijado a mano · sugerido " + clp(r.sugerido) : "precio sugerido") + (r.mayorista ? " · mayorista " + clp(r.mayorista) : "") + " · costo " + clp(r.costo) : "Falta: " + esc(r.falta.join(", "))}${p.shopify_precio != null ? ` · en Shopify ${clp(N(p.shopify_precio))}` : ""}</div></div></div>
      <div class="kpis"><div class="kpi"><b>${st.disp}</b><span>disponibles</span></div><div class="kpi"><b>${st.vendidos}</b><span>vendidas${st.ultima ? " · última " + fdate(st.ultima) : ""}</span></div>${p.shopify_stock != null ? `<div class="kpi"><b>${p.shopify_stock}</b><span>stock en Shopify</span></div>` : ""}</div>
      <div class="row"><button class="btn gold" data-x="venta">Registrar venta</button><button class="btn" data-x="ajuste">Ajustar stock</button><button class="btn" data-x="reponer">Reponer</button></div>
      <div class="grid g3">
        <label class="f">Tipo<select data-pp="tipo" ${p.code ? "disabled" : ""}><option value="">—</option>${typesFor(L.grupo).map((t) => `<option value="${t.code}" ${p.tipo === t.code ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}</select></label>
        <label class="f">Línea<select data-pp="linea" ${p.compra_id ? "disabled" : ""}>${S.cfg.lineOrder.map((k) => `<option value="${k}" ${p.linea === k ? "selected" : ""}>${esc(S.cfg.lines[k].corto)}</option>`).join("")}</select></label>
        <label class="f">Proveedor<input data-pp="proveedor" value="${esc(p.proveedor)}"></label>
        <label class="f">Unidades compradas (base)<input inputmode="numeric" data-pp="qty" value="${esc(p.qty)}"></label>
        ${params.costo === "banho" ? `<label class="f">Peso g<input inputmode="decimal" data-pp="peso" value="${esc(p.peso)}"></label>` : ""}
        <label class="f">${params.costo === "banho" ? "Bruto R$" : params.costo === "brl" ? "Precio R$" : "Costo CLP"}<input inputmode="decimal" data-pp="bruto" value="${esc(p.bruto)}"></label>
        ${params.costo === "banho" && Object.keys(params.perfiles).length > 1 ? `<label class="f">Baño<select data-pp="perfil">${Object.entries(params.perfiles).map(([k, f]) => `<option value="${k}" ${(p.perfil || params.perfilDefault) === k ? "selected" : ""}>${esc(f.nombre)}</option>`).join("")}</select></label>` : ""}
        <label class="f">Precio de venta fijo (vacío = sugerido)<input inputmode="numeric" data-pp="precio_manual" value="${esc(p.precio_manual)}"></label>
        <label class="f">Stock mínimo (vacío = ${esc(S.cfg.stockMin)})<input inputmode="numeric" data-pp="stock_min" value="${esc(p.stock_min)}"></label>
        <label class="f">Talla / color / variante<input data-pp="variante" value="${esc(p.variante)}"></label>
        <label class="f">Referencia proveedor<input data-pp="ref" value="${esc(p.ref)}"></label>
      </div>
      <label class="f">Nota<input data-pp="nota" value="${esc(p.nota)}"></label>
      <details ${S.open.desc ? "open" : ""} id="pmDesc"><summary class="small" style="cursor:pointer">Descripción para Shopify e Instagram</summary>
        <div class="grid" style="margin-top:8px"><label class="f">Descripción del producto<textarea rows="4" data-pp="descripcion">${esc(p.descripcion || "")}</textarea></label>
        <div class="row"><button class="btn small" data-x="gendesc">Generar texto</button><button class="btn small" data-x="copydesc">Copiar descripción</button><button class="btn small" data-x="copyig">Copiar texto para Instagram</button></div></div></details>
      ${movs.length ? `<div><div class="eyebrow">Movimientos</div><table class="bd">${movs.map((x) => `<tr><td>${fdate(x.fecha)}</td><td>${esc({ venta: "Venta", ajuste: "Ajuste", reposicion: "Reposición", devolucion: "Devolución" }[x.tipo])}${x.canal ? " · " + esc(x.canal) : ""}${x.cliente ? " · " + esc(x.cliente) : ""}</td><td class="n">${x.cantidad > 0 ? "+" : ""}${x.cantidad}</td><td class="n">${x.precio ? clp(x.precio) : ""}</td><td><button class="btn ghost small danger" data-delmov="${esc(x.id)}" aria-label="Borrar movimiento">✕</button></td></tr>`).join("")}</table></div>` : ""}
      <div class="row spread">${p.code ? `<button class="btn ghost small" data-x="freecode">Quitar código</button>` : `<button class="btn small primary" data-x="code">Asignar código</button>`}
      <span class="row tight">${!p.shopify_variant && p.code && r.ok ? `<button class="btn small" data-x="shopcreate">Crear borrador en Shopify</button>` : ""}${p.shopify_variant && r.ok && Math.round(r.final) !== Math.round(N(p.shopify_precio)) ? `<button class="btn small" data-x="shopprice">Poner ${clp(r.final)} en Shopify</button>` : ""}
      <button class="btn ghost small danger" data-x="del">Eliminar</button></span></div>`;
    };
    draw();
    m.addEventListener("input", (e) => { const el = e.target; if (!el.dataset.pp) return; p[el.dataset.pp] = el.value; saveP(p); if (["qty", "peso", "bruto", "perfil", "precio_manual"].includes(el.dataset.pp)) { const r = calcP(p); $(".pm-price", m).textContent = r.ok ? clp(r.final) : "Sin precio"; } });
    m.addEventListener("change", (e) => { const el = e.target; if (el.dataset.pp && el.tagName === "SELECT") { p[el.dataset.pp] = el.value; saveP(p, 50); draw(); } if (el.id === "pmPhoto" && el.files[0]) { const fr = new FileReader(); fr.onload = async () => { try { p.img_url = await uploadPhoto(p.id, fr.result); saveP(p, 10); draw(); } catch (x) { toast("No se pudo subir la foto: " + err(x)); } }; fr.readAsDataURL(el.files[0]); } });
    m.addEventListener("toggle", (e) => { if (e.target.id === "pmDesc") S.open.desc = e.target.open; }, true);
    m.addEventListener("click", async (e) => {
      const dm = e.target.closest("[data-delmov]"); if (dm) { if (await confirmBox("Borrar movimiento", "El stock se recalcula sin este movimiento.", "Borrar", true)) { const { error } = await S.sb.from("movimientos").delete().eq("id", dm.dataset.delmov); if (error) toast(error.message); else { S.movs = S.movs.filter((x) => x.id !== dm.dataset.delmov); rebuildStock(); draw(); } } return; }
      const b = e.target.closest("[data-x]"); if (!b) return; const x = b.dataset.x;
      if (x === "close") { await flushP(p.id); close(); render(); }
      else if (x === "venta" || x === "ajuste" || x === "reponer") movModal(p, x, draw);
      else if (x === "gendesc") { p.descripcion = genDescripcion(p); saveP(p, 50); S.open.desc = true; draw(); }
      else if (x === "copydesc") copy(p.descripcion || genDescripcion(p));
      else if (x === "copyig") copy(genInstagram(p));
      else if (x === "code") { await assignCodes([p]); draw(); }
      else if (x === "freecode") { if (await confirmBox("Quitar código", `El producto queda sin código y podrás cambiar su tipo. El número ${esc(p.code)} no se reutiliza.`, "Quitar")) { p.code = null; saveP(p, 10); draw(); } }
      else if (x === "shopcreate") { b.disabled = true; await shopCreate([p]); draw(); }
      else if (x === "shopprice") { b.disabled = true; await shopPrice(p); draw(); }
      else if (x === "del") { if (await confirmBox("Eliminar producto", `Se borra <b>${esc(p.nombre)}</b> con sus movimientos de stock. No se puede deshacer.`, "Eliminar", true)) { const { error } = await S.sb.from("productos").delete().eq("id", p.id); if (error) return toast(error.message); delete S.productos[p.id]; S.movs = S.movs.filter((y) => y.producto_id !== p.id); rebuildStock(); close(); render(); } }
    });
  });
}
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Copiado"); } catch (e) { modal(`<h2>Copia el texto</h2><textarea class="inp" rows="8">${esc(t)}</textarea><div class="row end"><button class="btn" onclick="this.closest('.modal-back').remove()">Cerrar</button></div>`); } }

function movModal(p, tipo, after) {
  const r = calcP(p); const titles = { venta: "Registrar venta", ajuste: "Ajustar stock", reponer: "Reponer stock" };
  modal(`<h2>${titles[tipo]}</h2><div class="row">${thumb(p)}<div><b>${esc(p.nombre)}</b><div class="small muted">${esc(p.code || "")} · ${stockOf(p).disp} disponibles</div></div></div>
    <div class="grid g2">
      <label class="f">${tipo === "ajuste" ? "Cantidad (+ suma, − resta)" : "Cantidad"}<input type="number" id="mvQty" value="${tipo === "ajuste" ? "-1" : "1"}"></label>
      <label class="f">Fecha<input type="date" id="mvFecha" value="${today()}"></label>
      ${tipo === "venta" ? `<label class="f">Precio unitario<input inputmode="numeric" id="mvPrecio" value="${r.ok ? Math.round(r.final) : ""}"></label>
      <label class="f">Canal<select id="mvCanal">${(S.cfg.canales || []).map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label class="f">Cliente (opcional)<input id="mvCliente"></label>` : ""}
      <label class="f">Nota (opcional)<input id="mvNota"></label>
    </div>
    <div class="row end"><button class="btn" id="mvNo">Cancelar</button><button class="btn primary" id="mvOk">Guardar</button></div>`,
    (m, close) => {
      $("#mvNo", m).onclick = close;
      $("#mvOk", m).onclick = async () => {
        let q = N($("#mvQty", m).value); if (!q) return toast("Escribe una cantidad");
        if (tipo === "venta" || tipo === "reponer") q = Math.abs(q);
        const row = { producto_id: p.id, tipo: tipo === "reponer" ? "reposicion" : tipo, cantidad: tipo === "venta" ? -q : q, fecha: $("#mvFecha", m).value || today(),
          precio: tipo === "venta" ? N($("#mvPrecio", m).value) : null, costo: r.ok ? Math.round(r.costo) : null,
          canal: tipo === "venta" ? $("#mvCanal", m).value : null, cliente: tipo === "venta" ? $("#mvCliente", m).value.trim() || null : null, nota: $("#mvNota", m).value.trim() || null };
        const b = $("#mvOk", m); b.disabled = true;
        const { data, error } = await S.sb.from("movimientos").insert(row).select().single();
        if (error) { b.disabled = false; return toast("No se pudo guardar: " + error.message); }
        S.movs.push(data); rebuildStock(); close(); toast(tipo === "venta" ? "Venta registrada" : "Stock actualizado"); after && after(); if (!document.querySelector(".modal-back")) render();
      };
    });
}

function genDescripcion(p) {
  const L = lineCfg(p.linea); const t = typeName(p.tipo).toLowerCase();
  const mat = { ENO: "enchapado en oro 18K", ENP: "enchapado en plata", PLT: "de plata 950", ACO: "de acero con baño de oro", ACP: "de acero con baño de plata", ROP: "", OR: "de oro" }[p.mat || paramsOf(p).mat] || "";
  if (L.grupo === "ropa") return `${p.nombre}. Prenda traída directamente desde Brasil, de buena calidad y caída.${p.variante ? " Talla/color: " + p.variante + "." : ""}\n\nDespacho en 24 a 48 horas hábiles a todo Chile · 3 cuotas sin interés · envío gratis sobre $50.000.`;
  return `${p.nombre}, ${mat}. ${p.mat === "ACO" || p.mat === "ACP" ? "Resiste el agua y el uso diario sin perder su brillo." : "Joya fabricada en Brasil, con terminación de alta calidad y brillo duradero."}${p.variante ? " " + p.variante + "." : ""}\n\nIdeal para usar todos los días o regalar.\n\nDespacho en 24 a 48 horas hábiles a todo Chile · 3 cuotas sin interés · envío gratis sobre $50.000.`;
}
function genInstagram(p) {
  const r = calcP(p); const mat = { ENO: "Enchapado en oro 18K", ENP: "Enchapado en plata", PLT: "Plata 950", ACO: "Acero con baño de oro", ACP: "Acero con baño de plata" }[p.mat || paramsOf(p).mat] || "";
  const tags = lineCfg(p.linea).grupo === "ropa" ? "#modabrasil #vestidoschile #puntobrasil" : "#joyaschile #oro18k #joyasenchapadas #puntobrasil";
  return `${p.nombre} ✨${mat ? "\n" + mat + "." : ""}\n${r.ok ? clp(r.final) + " · " : ""}3 cuotas sin interés · envío gratis sobre $50.000\nCómprala en puntobrasil.cl 💛\n\n${tags}`;
}

/* ---------- Compras ---------- */
function totals(items, c) {
  let units = 0, costo = 0, venta = 0, util = 0, brlSum = 0, docSum = 0, inc = 0;
  items.forEach((p) => { const q = N(p.qty) || 0; const r = calcP(p); units += q; docSum += (N(p.bruto) || 0) * q; if (r.ok) { costo += r.costo * q; venta += r.final * q; util += r.utilidad * q; if (r.piezaBRL) brlSum += r.piezaBRL * q; } else inc++; });
  return { units, costo, venta, util, brlSum, docSum, inc, lines: items.length };
}
function viewCompras() {
  const list = Object.values(S.compras).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.creada || "").localeCompare(String(a.creada || "")));
  return `<section class="row spread"><div><div class="eyebrow">Órdenes de compra</div><h1>Tus <em>compras</em></h1></div>
  <div class="row"><button class="btn" data-act="importPkg">Importar OC leída por Claude</button><button class="btn primary" data-act="newCompra">+ Nueva compra</button></div></section>
  ${list.length ? `<div class="compras">${list.map((c) => { const it = itemsOf(c.id); const t = totals(it, c); const L = lineCfg(c.linea); const sinCod = it.filter((i) => !i.code).length;
    return `<button class="panel compra-card stripe ${esc(c.linea)}" data-act="openCompra" data-id="${esc(c.id)}"><div><div class="eyebrow">${esc(L.corto)} · ${fdate(c.fecha)}${c.documento ? " · Doc " + esc(c.documento) : ""}</div>
      <h3>${esc(c.proveedor || "Proveedor sin nombre")}</h3><div class="row small muted" style="margin-top:4px"><span>${t.lines} productos · ${t.units} unidades</span>
      ${t.lines ? (sinCod ? `<span class="chip warn">${sinCod} sin código</span>` : `<span class="chip ok">Códigos listos</span>`) : `<span class="chip">Sin productos</span>`}${t.inc ? `<span class="chip warn">${t.inc} incompletos</span>` : ""}</div></div>
      <div><div class="big">${clp(t.venta)}</div><div class="small muted" style="text-align:right">venta potencial</div></div></button>`; }).join("")}</div>`
  : `<div class="panel empty"><h2>Aún no hay compras</h2><p class="muted" style="max-width:56ch">Crea una compra y agrega los productos a mano, o envía el PDF de la orden a Claude en el proyecto: te devuelve un archivo que importas aquí con todos los productos, fotos y pesos.</p><div class="row"><button class="btn primary" data-act="newCompra">+ Nueva compra</button><button class="btn" data-act="importPkg">Importar OC leída por Claude</button></div></div>`}`;
}
function paramsEditor(c) {
  const p = c.params; const prof = Object.entries(p.perfiles || {});
  const marg = (p.margenes || []).map((m, i) => `<label class="f">Margen ${p.margenes.length > 1 ? i + 1 : ""} %<input type="number" step="0.5" data-cp="margenes.${i}" value="${esc(m)}"></label>`).join("");
  return `<details class="params panel" ${S.open.params ? "open" : ""} data-tg="params"><summary><div><div class="eyebrow">Parámetros de esta compra</div>
    <div class="small">${p.costo === "banho" ? prof.map(([k, f]) => `${esc(f.nombre)}: camada ${esc(f.camada)} · cotiz. ${esc(f.cotizacion)} · M.O. ${esc(f.mo)}`).join(" | ") + " · " : ""}${p.costo !== "clp" ? "TC " + esc(p.tc) + " · " : ""}aduana ${esc(p.aduana)}% · margen ${p.margenes.join(" + ")}%</div></div></summary>
    <div class="grid" style="margin-top:12px">
    ${p.costo === "banho" ? `<div class="scroll-x"><table class="ptable"><thead><tr><th>Perfil de baño</th><th>Camada</th><th>Cotización/día</th><th>M.O.</th><th>MO fija</th><th>Verniz</th><th class="n">Valor/g</th></tr></thead><tbody>
      ${prof.map(([k, f]) => `<tr><td>${esc(f.nombre)}</td>${["camada", "cotizacion", "mo", "moFija", "verniz"].map((x) => `<td><input type="number" step="any" data-cp="perfiles.${k}.${x}" value="${esc(f[x])}"></td>`).join("")}<td class="n">R$ ${(PB.valorKg(f) / 1000).toLocaleString("es-CL", { maximumFractionDigits: 2 })}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="grid g3">
      ${p.costo !== "clp" ? `<label class="f">Tipo de cambio CLP por R$<input type="number" step="0.1" data-cp="tc" value="${esc(p.tc)}"></label>` : ""}
      <label class="f">Aduana %<input type="number" step="0.5" data-cp="aduana" value="${esc(p.aduana)}"></label>${marg}
      <label class="f">Gastos de viaje % (sobre costo)<input type="number" step="0.5" data-cp="viaje" value="${esc(p.viaje)}"></label>
      <label class="f">Redcompra / Mercado Pago %<input type="number" step="0.1" data-cp="pasarela" value="${esc(p.pasarela)}"></label>
      <label class="f">Comisión Shopify %<input type="number" step="0.1" data-cp="shopify" value="${esc(p.shopify)}"></label>
      ${((p.formula && p.formula.vars) || []).map((v, i) => `<label class="f">${esc(v.nombre || v.key)} <span class="small muted">(${esc(v.key)})</span><input type="number" step="any" data-cp="formula.vars.${i}.valor" value="${esc(v.valor)}"></label>`).join("")}
      <label class="f">Redondeo<select data-cp="rounding">${[["990", "Subir a $X.990"], ["1000", "Subir a miles"], ["100", "Subir a centenas"], ["none", "Sin redondeo"]].map(([v, t]) => `<option value="${v}" ${p.rounding === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="f">Proveedor<input data-cf="proveedor" value="${esc(c.proveedor)}" list="provList"></label>
      <label class="f">Fecha de compra<input type="date" data-cf="fecha" value="${esc(c.fecha)}"></label>
      <label class="f">N° de documento<input data-cf="documento" value="${esc(c.documento)}"></label>
    </div><datalist id="provList">${S.cfg.providers.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
    <div class="row"><button class="btn" data-act="reloadParams">Usar los valores de Ajustes</button><span class="small muted">Cada compra guarda sus propios parámetros y su fórmula (${((p.formula && p.formula.steps) || PB.formulaOf(p).steps).length} pasos). La fórmula se edita en Ajustes.</span></div></div></details>`;
}
function itemCard(c, p, prev) {
  const params = c.params; const L = lineCfg(c.linea); const r = calcP(p); const open = S.open["it_" + p.id];
  const codeChip = p.code ? `<span class="chip code">${esc(p.code)}</span>` : prev[p.id] ? `<span class="chip prev" title="Se asigna al confirmar">${esc(prev[p.id])}</span>` : `<span class="chip warn">Elige el tipo</span>`;
  return `<article class="item ${r.ok ? "" : "incomplete"}" data-item="${esc(p.id)}">
    <label class="thumb" title="Cambiar foto">${p.img_url ? `<img loading="lazy" src="${esc(p.img_url)}" alt="">` : "Sin foto"}<input type="file" accept="image/*" class="hidden" data-photo="${esc(p.id)}"></label>
    <div style="min-width:0"><input class="name" data-if="nombre" value="${esc(p.nombre)}" placeholder="Nombre del producto" aria-label="Nombre">
      <div class="meta">${codeChip}${p.ref ? `<span class="chip">Ref. ${esc(p.ref)}</span>` : ""}${p.variante ? `<span class="chip">${esc(p.variante)}</span>` : ""}${p.shopify_variant ? `<span class="chip ok">En Shopify</span>` : ""}${p.nota ? `<span class="chip warn" title="${esc(p.nota)}">Revisar</span>` : ""}</div>
      <div class="fields">
        <label class="f">Tipo<select data-if="tipo" ${p.code ? "disabled" : ""}><option value="">—</option>${typesFor(L.grupo).map((t) => `<option value="${t.code}" ${p.tipo === t.code ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}</select></label>
        <label class="f">Cantidad<input type="number" inputmode="numeric" data-if="qty" value="${esc(p.qty)}"></label>
        ${params.costo === "banho" ? `<label class="f">Peso g<input inputmode="decimal" data-if="peso" value="${esc(p.peso)}"></label>` : ""}
        <label class="f">${params.costo === "banho" ? "Bruto R$" : params.costo === "brl" ? "Precio R$" : "Costo CLP"}<input inputmode="decimal" data-if="bruto" value="${esc(p.bruto)}"></label>
        ${params.costo === "banho" && Object.keys(params.perfiles).length > 1 ? `<label class="f">Baño<select data-if="perfil">${Object.entries(params.perfiles).map(([k, f]) => `<option value="${k}" ${(p.perfil || params.perfilDefault) === k ? "selected" : ""}>${esc(f.nombre)}</option>`).join("")}</select></label>` : ""}
      </div></div>
    <div class="pricebox" data-pricebox>${priceBox(r)}</div>
    <div class="detail ${open ? "" : "hidden"}">${open ? itemDetail(c, p, r) : ""}</div>
    <div style="grid-column:1/-1" class="row spread"><button class="btn ghost small" data-act="toggleItem" data-id="${esc(p.id)}">${open ? "Ocultar detalle ▴" : "Ver cálculo y más ▾"}</button></div></article>`;
}
function priceBox(r) {
  if (!r.ok) return `<span class="chip warn">Falta: ${esc(r.falta.join(", "))}</span>`;
  return `<span class="price">${clp(r.final)}</span><span class="sub">${r.manual ? "precio manual · sugerido " + clp(r.sugerido) : "precio de venta"}</span>${r.mayorista ? `<span class="sub">Mayorista ${clp(r.mayorista)}</span>` : ""}<span class="sub">Costo ${clp(r.costo)}</span>`;
}
function itemDetail(c, p, r) {
  const params = c.params; const rows = (r.steps || []).map((st) => [esc(st.nombre) + ` <span class="small muted">= ${esc(st.expr)}</span>`, st.err ? `<span class="warn-t">${esc(st.err)}</span>` : (st.key === "costo" ? "<b>" + fxFmt(st.val, st.fmt) + "</b>" : fxFmt(st.val, st.fmt))]);
  return `${rows.length ? `<table class="bd">${rows.map(([a, b]) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`).join("")}${r.ok ? `<tr class="tot"><td>Precio sugerido (redondeado)</td><td class="n">${clp(r.sugerido)}</td></tr><tr><td>Utilidad aprox. por unidad (sin IVA, después de viaje y comisiones)</td><td class="n">${clp(r.utilidad)} · ${r.margenReal !== null ? Math.round(r.margenReal * 100) + "%" : ""}</td></tr>` : ""}</table>` : ""}
    <div class="grid g3"><label class="f">Precio manual (vacío = sugerido)<input inputmode="numeric" data-if="precio_manual" value="${esc(p.precio_manual)}"></label>
      <label class="f">Referencia proveedor<input data-if="ref" value="${esc(p.ref)}"></label><label class="f">Talla / color / variante<input data-if="variante" value="${esc(p.variante)}"></label></div>
    ${p.desc_original ? `<div class="small muted">Descripción original: ${esc(p.desc_original)}</div>` : ""}
    <label class="f">Nota<input data-if="nota" value="${esc(p.nota)}" placeholder="Algo a revisar"></label>
    <div class="row"><button class="btn ghost small" data-act="openP" data-id="${esc(p.id)}">Abrir ficha completa</button><button class="btn ghost small" data-act="dupItem" data-id="${esc(p.id)}">Duplicar</button><button class="btn ghost danger small" data-act="delItem" data-id="${esc(p.id)}">Eliminar</button></div>`;
}
function viewCompra(c) {
  const L = lineCfg(c.linea); const items = itemsOf(c.id); const t = totals(items, c);
  const prev = PB.previewCodes(S.cfg, S.counters, items, c.params.mat).codes; const sinCod = items.filter((i) => !i.code && i.tipo).length;
  const q = S.filter.toLowerCase(); const shown = items.filter((i) => !q || [i.nombre, i.code, i.ref, i.desc_original].join(" ").toLowerCase().includes(q));
  return `<section class="grid" style="gap:6px"><button class="btn ghost" data-act="go" data-h="compras" style="justify-self:start;padding-left:0">← Compras</button>
    <div class="eyebrow">${esc(L.nombre)} · ${fdate(c.fecha)}${c.documento ? " · Doc " + esc(c.documento) : ""}</div><h1>${esc(c.proveedor || "Proveedor sin nombre")}</h1></section>
  <section class="kpis"><div class="kpi"><b>${t.lines}</b><span>productos · ${t.units} unidades</span></div><div class="kpi"><b>${clp(t.costo)}</b><span>costo total en Chile</span></div>
    <div class="kpi"><b>${clp(t.venta)}</b><span>venta potencial</span></div><div class="kpi"><b>${clp(t.util)}</b><span>utilidad aprox. (sin IVA)</span></div>
    ${c.params.costo !== "clp" ? `<div class="kpi"><b>${brl(t.brlSum)}</b><span>valor en reales</span></div>` : ""}
    ${c.total_doc ? `<div class="kpi"><b>${money(t.docSum, c.params.costo === "clp" ? "CLP" : "BRL")}</b><span>suma de líneas · documento ${money(N(c.total_doc), c.moneda_doc === "CLP" ? "CLP" : "BRL")}</span></div>` : ""}</section>
  ${paramsEditor(c)}
  <section class="panel grid" style="gap:10px"><div class="actions"><button class="btn" data-act="importPkg" data-into="${esc(c.id)}">Importar OC leída por Claude</button><button class="btn" data-act="addItem">+ Producto a mano</button><button class="btn primary" data-act="assignCodes" ${sinCod ? "" : "disabled"}>Asignar ${sinCod || ""} códigos</button></div>
    <div class="actions"><button class="btn" data-act="outCompra">Imprimible / etiquetas / Excel</button><button class="btn" data-act="shopCompra">Borradores en Shopify</button><button class="btn ghost danger" data-act="delCompra">Eliminar compra</button></div></section>
  ${items.length > 6 ? `<input class="inp" type="search" placeholder="Buscar en esta compra" data-cfilter value="${esc(S.filter)}">` : ""}
  <section class="items">${shown.map((p) => itemCard(c, p, prev)).join("") || `<div class="panel empty"><h2>Sin productos todavía</h2><p class="muted">Importa el archivo de la OC leída por Claude o agrega productos a mano.</p></div>`}</section>`;
}

async function assignCodes(list) {
  const pend = list.filter((p) => !p.code && p.tipo); if (!pend.length) { toast("Elige el tipo del producto antes de asignar código"); return; }
  const used = allCodes(); const next = clone(S.counters);
  for (const p of pend) {
    const mat = p.mat || paramsOf(p).mat; const k = PB.counterKey(p.tipo, mat); let code;
    do { next[k] = (N(next[k]) || 0) + 1; code = PB.makeCode(S.cfg, p.tipo, mat, next[k]); } while (used.has(code));
    p.code = code; p.mat = mat; used.add(code);
  }
  try { await saveCounters(next); for (const p of pend) { S.dirtyP.add(p.id); await flushP(p.id); } toast(pend.length + " códigos asignados"); }
  catch (e) { toast("No se pudieron guardar los códigos: " + err(e)); }
}

/* ---------- Ventas ---------- */
function viewVentas() {
  const mes = S.vf.mes; const vs = S.movs.filter((m) => m.tipo === "venta" && String(m.fecha).startsWith(mes)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado).localeCompare(String(a.creado)));
  let unid = 0, monto = 0, costo = 0; const porCanal = {};
  vs.forEach((m) => { const q = -N(m.cantidad); unid += q; monto += q * (N(m.precio) || 0); costo += q * (N(m.costo) || 0); porCanal[m.canal || "Sin canal"] = (porCanal[m.canal || "Sin canal"] || 0) + q * (N(m.precio) || 0); });
  const iva = 1 + (N(S.cfg.iva) ?? 19) / 100;
  const meses = [...new Set(S.movs.filter((m) => m.tipo === "venta").map((m) => String(m.fecha).slice(0, 7)).concat([today().slice(0, 7)]))].sort().reverse();
  const crit = Object.values(S.productos).filter((p) => p.activo !== false && p.code && stockState(p) !== "ok").length;
  return `<section class="row spread"><div><div class="eyebrow">Stock y ventas</div><h1>Tus <em>ventas</em></h1></div><button class="btn gold" data-act="quickSale">+ Registrar venta</button></section>
  <section class="panel row spread"><label class="f" style="max-width:200px">Mes<select data-vf="mes">${meses.map((x) => `<option value="${x}" ${x === mes ? "selected" : ""}>${x.slice(5)}/${x.slice(0, 4)}</option>`).join("")}</select></label>
    ${crit ? `<button class="btn" data-act="go" data-h="productos" data-crit="1">${crit} productos con stock crítico o agotado</button>` : ""}</section>
  <section class="kpis"><div class="kpi"><b>${clp(monto)}</b><span>vendido en el mes</span></div><div class="kpi"><b>${unid}</b><span>unidades</span></div>
    <div class="kpi"><b>${clp(monto / iva - costo)}</b><span>margen bruto aprox. (sin IVA, menos costo)</span></div>
    ${Object.entries(porCanal).map(([k, v]) => `<div class="kpi"><b>${clp(v)}</b><span>${esc(k)}</span></div>`).join("")}</section>
  <section class="panel">${vs.length ? `<div class="scroll-x"><table class="ptable"><thead><tr><th>Fecha</th><th>Producto</th><th>Canal</th><th>Cliente</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Total</th><th></th></tr></thead><tbody>
    ${vs.map((m) => { const p = S.productos[m.producto_id] || {}; const q = -N(m.cantidad); return `<tr><td>${fdate(m.fecha)}</td><td><a href="#" data-act="openP" data-id="${esc(m.producto_id)}">${esc(p.nombre || "(eliminado)")}</a><div class="small muted">${esc(p.code || "")}</div></td><td>${esc(m.canal || "")}</td><td>${esc(m.cliente || "")}</td><td class="n">${q}</td><td class="n">${clp(N(m.precio))}</td><td class="n">${clp(q * (N(m.precio) || 0))}</td><td><button class="btn ghost small danger" data-act="delSale" data-id="${esc(m.id)}" aria-label="Borrar venta">✕</button></td></tr>`; }).join("")}</tbody></table></div>`
    : `<p class="muted">No hay ventas registradas este mes. Usa <b>Registrar venta</b> para las ventas por Instagram, WhatsApp o en persona; las de la web se pueden registrar igual.</p>`}</section>`;
}
function quickSaleModal() {
  modal(`<h2>Registrar venta</h2><input class="inp" type="search" id="qsQ" placeholder="Busca por código o nombre" autofocus><div id="qsList" class="qs-list"></div>`, (m, close) => {
    const draw = () => { const q = $("#qsQ", m).value.trim().toLowerCase(); const list = Object.values(S.productos).filter((p) => p.activo !== false && (!q || [p.nombre, p.code].join(" ").toLowerCase().includes(q))).slice(0, 30);
      $("#qsList", m).innerHTML = list.map((p) => `<button class="qs-item" data-pid="${esc(p.id)}">${thumb(p)}<span><b>${esc(p.nombre)}</b><span class="small muted">${esc(p.code || "sin código")} · ${stockOf(p).disp} disp. · ${calcP(p).ok ? clp(calcP(p).final) : ""}</span></span></button>`).join("") || `<p class="muted">Sin resultados</p>`; };
    draw(); $("#qsQ", m).oninput = draw;
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-pid]"); if (b) { close(); movModal(S.productos[b.dataset.pid], "venta"); } });
  });
}

/* ---------- Calculadora ---------- */
function viewCalc() {
  const k = S.calc.linea; const L = S.cfg.lines[k]; const p = PB.paramsFor(S.cfg, k); if (S.calc.tc) p.tc = N(S.calc.tc);
  const r = PB.calc({ peso: S.calc.peso, bruto: S.calc.bruto, perfil: S.calc.perfil || p.perfilDefault }, p);
  return `<section><div class="eyebrow">Sin orden de compra</div><h1>Calcular una <em>pieza</em></h1></section>
  <section class="panel grid g2"><div class="grid">
    <label class="f">Línea<select data-calc="linea">${S.cfg.lineOrder.map((x) => `<option value="${x}" ${x === k ? "selected" : ""}>${esc(S.cfg.lines[x].nombre)}</option>`).join("")}</select></label>
    ${p.costo === "banho" ? `<label class="f">Perfil de baño<select data-calc="perfil">${Object.entries(p.perfiles).map(([pk, f]) => `<option value="${pk}" ${(S.calc.perfil || p.perfilDefault) === pk ? "selected" : ""}>${esc(f.nombre)} (R$ ${(PB.valorKg(f) / 1000).toLocaleString("es-CL", { maximumFractionDigits: 2 })}/g)</option>`).join("")}</select></label>
    <label class="f">Peso en gramos<input inputmode="decimal" data-calc="peso" value="${esc(S.calc.peso)}"></label>` : ""}
    <label class="f">${p.costo === "banho" ? "Bruto en R$" : p.costo === "brl" ? "Precio en R$" : "Costo en CLP"}<input inputmode="decimal" data-calc="bruto" value="${esc(S.calc.bruto)}"></label>
    ${p.costo !== "clp" ? `<label class="f">Tipo de cambio (vacío = ${esc(S.cfg.tc)})<input inputmode="decimal" data-calc="tc" value="${esc(S.calc.tc)}"></label>` : ""}
    <p class="small muted">Usa los márgenes de Ajustes para ${esc(L.nombre)}: margen ${L.margenes.join(" + ")}%, aduana ${L.aduana}%, viaje ${L.viaje}%.</p></div>
  <div class="grid" id="calcOut">${calcOut(r)}</div></section>`;
}
function calcOut(r) {
  if (!r.ok) return `<div class="note">Falta: ${esc(r.falta.join(", "))}</div>`;
  return `<div><div class="eyebrow">Precio de venta sugerido</div><div class="calc-out">${clp(r.sugerido)}</div></div><table class="bd">${r.piezaBRL ? `<tr><td>Valor pieza en Brasil</td><td class="n">${brl(r.piezaBRL)}</td></tr>` : ""}
  <tr><td>Costo pieza en Chile</td><td class="n">${clp(r.costo)}</td></tr>${r.mayorista ? `<tr><td>Valor mayorista con IVA</td><td class="n">${clp(r.mayorista)}</td></tr>` : ""}<tr><td>Minorista con IVA</td><td class="n">${clp(r.minorista)}</td></tr>
  <tr><td>+ viaje, Redcompra y Shopify</td><td class="n">${clp(r.viaje + r.pasarela + r.shopify)}</td></tr><tr class="tot"><td>Utilidad aprox. por unidad</td><td class="n">${clp(r.utilidad)} (${Math.round(r.margenReal * 100)}%)</td></tr></table>`;
}

/* ---------- Ajustes ---------- */
function getPath(o, path) { return path.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, path, v) { const ks = path.split("."); let a = o; ks.slice(0, -1).forEach((k) => { if (a[k] == null) a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
function viewAjustes() {
  if (!S.draft) { S.draft = clone(S.cfg); S.draftCounters = clone(S.counters); }
  const d = S.draft; const inp = (path, type = "text", step) => `<input ${type === "number" ? `type="number" step="${step || "any"}"` : ""} data-set="${path}" value="${esc(getPath(d, path))}">`;
  const lines = d.lineOrder.map((k) => { const L = d.lines[k]; return `<tr><td><b>${esc(L.nombre)}</b><div class="small muted">${L.costo === "banho" ? "Peso × baño + bruto en R$" : L.costo === "brl" ? "Precio en R$" : "Costo en CLP"}</div></td>
    <td><select data-set="lines.${k}.nmarg">${[1, 2].map((n) => `<option value="${n}" ${L.margenes.length === n ? "selected" : ""}>${n}</option>`).join("")}</select></td><td>${inp(`lines.${k}.margenes.0`, "number", "0.5")}</td><td>${L.margenes.length > 1 ? inp(`lines.${k}.margenes.1`, "number", "0.5") : "—"}</td>
    <td>${inp(`lines.${k}.aduana`, "number", "0.5")}</td><td>${inp(`lines.${k}.viaje`, "number", "0.5")}</td><td>${inp(`lines.${k}.pasarela`, "number", "0.1")}</td><td>${inp(`lines.${k}.shopify`, "number", "0.1")}</td>
    <td><select data-set="lines.${k}.mat">${d.materials.map((m) => `<option value="${esc(m.code)}" ${L.mat === m.code ? "selected" : ""}>${esc(m.code)}</option>`).join("")}</select></td></tr>`; }).join("");
  const profs = d.profiles.map((f, i) => { const vk = PB.valorKg(f); return `<tr><td>${inp(`profiles.${i}.nombre`)}</td>${["camada", "cotizacion", "mo", "moFija", "verniz"].map((x) => `<td>${inp(`profiles.${i}.${x}`, "number")}</td>`).join("")}<td class="n">${isFinite(vk) ? "R$ " + vk.toLocaleString("es-CL", { maximumFractionDigits: 2 }) : "—"}</td><td class="n">${isFinite(vk) ? "R$ " + (vk / 1000).toLocaleString("es-CL", { maximumFractionDigits: 2 }) : "—"}</td></tr>`; }).join("");
  const types = d.types.map((t, i) => `<tr><td>${inp(`types.${i}.code`)}</td><td>${inp(`types.${i}.nombre`)}</td><td><select data-set="types.${i}.grupo"><option value="joya" ${t.grupo === "joya" ? "selected" : ""}>Joya</option><option value="ropa" ${t.grupo === "ropa" ? "selected" : ""}>Ropa</option></select></td><td>${inp(`types.${i}.hoja`)}</td><td>${inp(`types.${i}.alias`)}</td><td><button class="btn ghost danger" data-act="delRow" data-list="types" data-i="${i}" aria-label="Quitar">✕</button></td></tr>`).join("");
  const mats = d.materials.map((m, i) => `<tr><td>${inp(`materials.${i}.code`)}</td><td>${inp(`materials.${i}.nombre`)}</td><td><button class="btn ghost danger" data-act="delRow" data-list="materials" data-i="${i}" aria-label="Quitar">✕</button></td></tr>`).join("");
  const ctr = Object.keys(S.draftCounters).sort().map((k) => `<tr><td><span class="chip code">${esc(k)}</span></td><td><input type="number" data-ctr="${esc(k)}" value="${esc(S.draftCounters[k])}"></td><td class="small muted">siguiente: ${esc(PB.makeCode(d, k.split("-")[0], k.split("-").slice(1).join("-"), (N(S.draftCounters[k]) || 0) + 1))}</td></tr>`).join("");
  return `<section class="row spread"><div><div class="eyebrow">Configuración</div><h1><em>Ajustes</em></h1></div><div class="row"><button class="btn" data-act="resetDraft">Descartar cambios</button><button class="btn primary" data-act="saveCfg">Guardar ajustes</button></div></section>
  <div class="settings grid" style="gap:18px">
  <section class="panel"><h2>General</h2><div class="grid g3">
    <label class="f">Tipo de cambio por defecto (CLP por R$)${inp("tc", "number", "0.1")}</label><label class="f">IVA %${inp("iva", "number", "1")}</label>
    <label class="f">Redondeo por defecto<select data-set="rounding">${[["990", "Subir a $X.990"], ["1000", "Subir a miles"], ["100", "Subir a centenas"], ["none", "Sin redondeo"]].map(([v, t]) => `<option value="${v}" ${d.rounding === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    <label class="f">Stock mínimo por defecto${inp("stockMin", "number", "1")}</label><label class="f">Enlace del QR ({CODIGO} se reemplaza)${inp("qrUrl")}</label>
    <label class="f">Canales de venta (separados por coma)<input data-set="canalesText" value="${esc((d.canales || []).join(", "))}"></label></div></section>
  ${fxSection(d)}
  <section class="panel"><h2>Perfiles de baño (tabla del proveedor)</h2><p class="note">Valor por kg = camada × cotización + M.O. × MO fija + verniz. Actualiza la cotización cuando llegue una tabla nueva.</p>
    <div class="scroll-x"><table class="ptable"><thead><tr><th>Nombre</th><th>Camada</th><th>Cotización/día</th><th>M.O.</th><th>MO fija</th><th>Verniz</th><th class="n">Valor/kg</th><th class="n">Valor/g</th></tr></thead><tbody>${profs}</tbody></table></div></section>
  <section class="panel"><h2>Codificación</h2><div class="grid g3"><label class="f">Formato ({TIPO}, {MAT}, {NUM})${inp("codeFormat")}</label><label class="f">Dígitos del correlativo${inp("numDigits", "number", "1")}</label><div class="note">Ejemplo: <b>${esc(PB.makeCode(d, "AR", "ENO", 87))}</b></div></div>
    <h3>Tipos de producto</h3><div class="scroll-x"><table class="ptable"><thead><tr><th>Código</th><th>Producto</th><th>Grupo</th><th>Nombre en la maestra</th><th>Palabras que lo identifican</th><th></th></tr></thead><tbody>${types}</tbody></table></div>
    <button class="btn" data-act="addRow" data-list="types" style="justify-self:start">+ Tipo</button>
    <h3>Materiales</h3><div class="scroll-x"><table class="ptable"><thead><tr><th>Código</th><th>Material</th><th></th></tr></thead><tbody>${mats}</tbody></table></div><button class="btn" data-act="addRow" data-list="materials" style="justify-self:start">+ Material</button>
    <h3>Correlativos (último número usado)</h3><div class="scroll-x"><table class="ptable"><thead><tr><th>Tipo-Material</th><th>Último n°</th><th></th></tr></thead><tbody>${ctr}</tbody></table></div>
    <div class="row"><input class="inp" id="newCtr" placeholder="Ej: VE-ROP" style="max-width:160px"><button class="btn" data-act="addCtr">+ Correlativo</button></div></section>
  <section class="panel"><h2>Proveedores</h2><label class="f">Uno por línea<textarea rows="5" data-set="providersText">${esc(d.providers.join("\n"))}</textarea></label></section>
  <section class="panel grid"><h2>Datos</h2><p class="small muted">Importa archivos preparados por Claude: la OC leída de un PDF o los productos de la planilla maestra.</p>
    <div class="row"><button class="btn" data-act="importPkg">Importar archivo de Claude</button><button class="btn" data-act="exportAll">Respaldo de todo (Excel)</button></div></section>
  <section class="panel grid"><h2>Cuenta</h2><p class="small">Sesión iniciada como <b>${esc(S.user && S.user.email)}</b>.</p><div class="row"><button class="btn" data-act="logout">Cerrar sesión</button></div>
    <p class="small muted">Para instalarla en el celular: en Chrome (Android) toca ⋮ → <b>Instalar aplicación</b>; en iPhone/iPad abre en Safari → Compartir → <b>Agregar a inicio</b>.</p></section></div>`;
}

/* ---------- Fórmula editable (Ajustes) ---------- */
const FX_FMT = [["clp", "$ pesos"], ["brl", "R$ reales"], ["num", "número"], ["pct", "%"]];
function fxFmt(v, fmt) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  if (fmt === "brl") return brl(v); if (fmt === "clp") return clp(v);
  if (fmt === "pct") return v.toLocaleString("es-CL", { maximumFractionDigits: 2 }) + "%";
  return v.toLocaleString("es-CL", { maximumFractionDigits: 4 });
}
function fxEnsure(d, k) { const L = d.lines[k]; if (!L.formula || !Array.isArray(L.formula.steps) || !L.formula.steps.length) L.formula = PB.defaultFormula(L.costo, L.margenes.length); if (!Array.isArray(L.formula.vars)) L.formula.vars = []; return L.formula; }
function fxProfileIdx(d, L) { const key = (L.perfiles || []).includes(S.fx.perfil) ? S.fx.perfil : (L.perfiles || [])[0]; return d.profiles.findIndex((p) => p.key === key); }
function fxPreview() {
  const d = S.draft; const k = S.fx.linea; const L = d.lines[k];
  const p = PB.paramsFor(d, k); const pi = fxProfileIdx(d, L);
  return PB.calc({ peso: S.fx.peso, bruto: S.fx.bruto, perfil: pi >= 0 ? d.profiles[pi].key : null }, p);
}
function fxSection(d) {
  const k = d.lines[S.fx.linea] ? S.fx.linea : (S.fx.linea = d.lineOrder[0]); const L = d.lines[k]; const F = fxEnsure(d, k); const base = `lines.${k}`;
  const banho = L.costo === "banho"; const pi = banho ? fxProfileIdx(d, L) : -1; const r = fxPreview();
  const inp = (path, type = "number", step = "any", extra = "") => `<input ${type === "number" ? `type="number" step="${step}"` : ""} data-set="${path}" value="${esc(getPath(d, path))}" ${extra}>`;
  const chip = (key) => `<button class="chip fxname" data-act="fxIns" data-name="${esc(key)}" title="Insertar en la fórmula">${esc(key)}</button>`;
  const bi = PB.FX_BUILTINS.filter((b) => (!b.solo || b.solo === L.costo) && b.nosolo !== L.costo && (b.key !== "margen2" || L.margenes.length > 1));
  const rowsProd = bi.filter((b) => b.grupo === "producto").map((b) => `<tr><td>${chip(b.key)}</td><td>${esc(b.key === "bruto" && L.costo === "clp" ? "Costo de compra en CLP" : b.key === "bruto" && L.costo === "brl" ? "Precio en R$" : b.nombre)}</td><td><input inputmode="decimal" data-fx="${b.key}" value="${esc(S.fx[b.key])}"></td><td class="small muted">Dato de cada producto · aquí solo para probar</td></tr>`).join("");
  const rowsPerfil = banho && pi >= 0 ? bi.filter((b) => b.grupo === "perfil").map((b) => `<tr><td>${chip(b.key)}</td><td>${esc(b.nombre)}</td><td>${inp(`profiles.${pi}.${b.campo}`)}</td><td class="small muted">Perfil de baño «${esc(d.profiles[pi].nombre)}»</td></tr>`).join("") : "";
  const rowsLinea = bi.filter((b) => b.grupo === "general" || b.grupo === "linea").map((b) => `<tr><td>${chip(b.key)}</td><td>${esc(b.nombre)}</td><td>${inp(b.grupo === "general" ? b.campo : `${base}.${b.campo}`, "number", "0.1")}</td><td class="small muted">${b.grupo === "general" ? "General (todas las líneas)" : "Solo " + esc(L.corto)}</td></tr>`).join("");
  const rowsVars = F.vars.map((v, i) => `<tr><td><input class="fxkey" data-set="${base}.formula.vars.${i}.key" value="${esc(v.key)}" placeholder="nombre_corto"></td><td><input data-set="${base}.formula.vars.${i}.nombre" value="${esc(v.nombre)}" placeholder="Para qué es"></td><td>${inp(`${base}.formula.vars.${i}.valor`)}</td><td><button class="btn ghost danger small" data-act="fxDelVar" data-i="${i}" aria-label="Quitar valor">✕</button></td></tr>`).join("");
  const steps = F.steps.map((st, i) => { const rs = r.steps[i] || {}; return `<tr class="${rs.err ? "fx-bad" : ""}"><td class="n small muted">${i + 1}</td>
    <td><input data-set="${base}.formula.steps.${i}.nombre" value="${esc(st.nombre)}" placeholder="Concepto"></td>
    <td><input class="fxkey" data-set="${base}.formula.steps.${i}.key" value="${esc(st.key)}" placeholder="nombre"></td>
    <td class="fx-eq">=</td><td class="fx-expr-td"><input class="fx-expr" data-fxi="${i}" data-set="${base}.formula.steps.${i}.expr" value="${esc(st.expr)}" spellcheck="false"><div class="fx-err small" data-fxe="${i}">${esc(rs.err || "")}</div></td>
    <td><select data-set="${base}.formula.steps.${i}.fmt">${FX_FMT.map(([v, t]) => `<option value="${v}" ${(st.fmt || "clp") === v ? "selected" : ""}>${t}</option>`).join("")}</select></td>
    <td class="n fx-val" data-fxv="${i}">${rs.err ? "—" : fxFmt(rs.val, st.fmt)}</td>
    <td class="fx-btns"><button class="btn ghost small" data-act="fxMove" data-i="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Subir">↑</button><button class="btn ghost small" data-act="fxMove" data-i="${i}" data-d="1" ${i < F.steps.length - 1 ? "" : "disabled"} aria-label="Bajar">↓</button><button class="btn ghost danger small" data-act="fxDelStep" data-i="${i}" aria-label="Quitar paso">✕</button></td></tr>`; }).join("");
  const names = [...bi.map((b) => b.key), ...F.vars.map((v) => PB.normKey(v.key)).filter(Boolean), ...F.steps.map((x) => PB.normKey(x.key)).filter(Boolean)];
  const errs = PB.fxCheck(F);
  return `<section class="panel fx"><div class="row spread"><div><h2>Fórmula de precio</h2><p class="small muted" style="margin:0">Cada paso se calcula como una celda de Excel, de arriba hacia abajo. Puedes cambiar los valores, reescribir las operaciones, mover pasos o agregar nuevos.</p></div>
    <label class="f" style="min-width:220px">Línea<select data-fxline>${d.lineOrder.map((x) => `<option value="${x}" ${x === k ? "selected" : ""}>${esc(d.lines[x].nombre)}</option>`).join("")}</select></label></div>
    <div class="grid g2 fx-top">
      <div><h3>Valores que usa la fórmula</h3>
        <div class="scroll-x"><table class="ptable fx-vals"><thead><tr><th>Nombre</th><th>Concepto</th><th>Valor</th><th></th></tr></thead><tbody>
        ${rowsProd}${rowsPerfil}${rowsLinea}${rowsVars}</tbody></table></div>
        <div class="row">${banho && (L.perfiles || []).length > 1 ? `<label class="f" style="max-width:240px">Perfil de baño para probar<select data-fx="perfil">${L.perfiles.map((pk) => { const f = d.profiles.find((x) => x.key === pk); return f ? `<option value="${pk}" ${d.profiles[pi] && d.profiles[pi].key === pk ? "selected" : ""}>${esc(f.nombre)}</option>` : ""; }).join("")}</select></label>` : ""}
        <label class="f" style="max-width:150px">N° de márgenes<select data-set="${base}.nmarg">${[1, 2].map((n) => `<option value="${n}" ${L.margenes.length === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="f" style="max-width:150px">Material (códigos)<select data-set="${base}.mat">${d.materials.map((m) => `<option value="${esc(m.code)}" ${L.mat === m.code ? "selected" : ""}>${esc(m.code)}</option>`).join("")}</select></label>
        <button class="btn" data-act="fxAddVar" style="align-self:end">+ Agregar valor</button></div></div>
      <div class="fx-help"><h3>Cómo escribir</h3><ul class="small">
        <li>Usa los <b>nombres</b> (las etiquetas grises). Toca uno para insertarlo en la fórmula que estás editando.</li>
        <li>Operaciones: <code>+</code> <code>-</code> <code>*</code> o <code>×</code> <code>/</code> o <code>÷</code> <code>^</code> y paréntesis. Ej.: <code>(camada + mo) * cotizacion</code>.</li>
        <li>Porcentajes: <code>costo * aduana / 100</code> o <code>costo * aduana%</code>.</li>
        <li>Funciones: <code>MIN(a; b)</code>, <code>MAX(a; b)</code>, <code>REDONDEAR(x; 0)</code>, <code>SI(peso > 2; a; b)</code>.</li>
        <li>Un paso solo puede usar valores y pasos que estén <b>más arriba</b>.</li>
        <li>Obligatorios: un paso <b>costo</b> y uno <b>precio</b> (el precio antes de redondear). Si existen, también se usan <b>mayorista</b>, <b>minorista</b>, <b>gasto_viaje</b>, <b>comision_mp</b> y <b>comision_shopify</b>.</li></ul>
        <div class="fx-names">${names.map(chip).join(" ")}</div></div></div>
    <h3>Pasos del cálculo <span class="small muted">· ejemplo con los valores de arriba</span></h3>
    <div class="scroll-x"><table class="ptable fx-steps"><thead><tr><th></th><th>Concepto</th><th>Nombre</th><th></th><th>Fórmula</th><th>Se muestra en</th><th class="n">Resultado</th><th></th></tr></thead><tbody>${steps}
      <tr class="tot"><td></td><td colspan="5">Precio sugerido (redondeo: ${esc({ 990: "subir a $X.990", 1000: "subir a miles", 100: "subir a centenas", none: "sin redondeo" }[d.rounding] || d.rounding)})</td><td class="n" data-fxv="final">${r.ok ? clp(r.sugerido) : "—"}</td><td></td></tr>
      <tr><td></td><td colspan="5" class="small">Utilidad aprox. por unidad (sin IVA, después de viaje y comisiones)</td><td class="n small" data-fxv="util">${r.ok ? clp(r.utilidad) + (r.margenReal !== null ? " · " + Math.round(r.margenReal * 100) + "%" : "") : "—"}</td><td></td></tr></tbody></table></div>
    <div class="fx-msgs" data-fxmsgs>${errs.length ? `<div class="note warn-t">${errs.map(esc).join("<br>")}</div>` : ""}</div>
    <div class="row"><button class="btn" data-act="fxAddStep">+ Agregar paso</button><button class="btn ghost" data-act="fxReset">Volver a la fórmula original</button>
      <span class="small muted">Los cambios se aplican al tocar <b>Guardar ajustes</b>. Las compras ya creadas guardan su propia fórmula: al guardar te pregunto si quieres actualizarlas.</span></div></section>`;
}
function fxRefresh() {
  if (S.view !== "ajustes" || !S.draft) return;
  const d = S.draft; const L = d.lines[S.fx.linea]; if (!L) return; const F = fxEnsure(d, S.fx.linea); const r = fxPreview();
  F.steps.forEach((st, i) => { const rs = r.steps[i] || {}; const v = $(`[data-fxv="${i}"]`), e = $(`[data-fxe="${i}"]`); if (v) v.textContent = rs.err ? "—" : fxFmt(rs.val, st.fmt); if (e) e.textContent = rs.err || ""; const tr = v && v.closest("tr"); if (tr) tr.classList.toggle("fx-bad", !!rs.err); });
  const f = $('[data-fxv="final"]'); if (f) f.textContent = r.ok ? clp(r.sugerido) : "—";
  const u = $('[data-fxv="util"]'); if (u) u.textContent = r.ok ? clp(r.utilidad) + (r.margenReal !== null ? " · " + Math.round(r.margenReal * 100) + "%" : "") : "—";
  const errs = PB.fxCheck(F); const m = $("[data-fxmsgs]"); if (m) m.innerHTML = errs.length ? `<div class="note warn-t">${errs.map(esc).join("<br>")}</div>` : "";
}
function fxAction(act, b) {
  const d = S.draft; const k = S.fx.linea; const F = fxEnsure(d, k); const i = +b.dataset.i;
  if (act === "fxAddStep") { let n = F.steps.length + 1; while (F.steps.some((x) => PB.normKey(x.key) === "paso" + n)) n++; const at = F.steps.findIndex((x) => PB.normKey(x.key) === "precio"); const st = { key: "paso" + n, nombre: "Nuevo paso", expr: "0", fmt: "clp" }; if (at >= 0) F.steps.splice(at, 0, st); else F.steps.push(st); }
  else if (act === "fxDelStep") F.steps.splice(i, 1);
  else if (act === "fxMove") { const j = i + Number(b.dataset.d); if (j >= 0 && j < F.steps.length) [F.steps[i], F.steps[j]] = [F.steps[j], F.steps[i]]; }
  else if (act === "fxAddVar") { let n = F.vars.length + 1; while (F.vars.some((x) => PB.normKey(x.key) === "valor" + n)) n++; F.vars.push({ key: "valor" + n, nombre: "", valor: 0 }); }
  else if (act === "fxDelVar") F.vars.splice(i, 1);
  else if (act === "fxReset") { d.lines[k].formula = PB.defaultFormula(d.lines[k].costo, d.lines[k].margenes.length); }
  else if (act === "fxIns") {
    const el = S.fx.focus != null && $(`.fx-expr[data-fxi="${S.fx.focus}"]`); if (!el) { toast("Primero toca la fórmula donde quieres insertarlo"); return; }
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a; const name = b.dataset.name; const pre = el.value.slice(0, a), post = el.value.slice(z);
    const ins = (pre && !/[\s(*/+\-^×÷;]$/.test(pre) ? " " : "") + name + (post && !/^[\s)*/+\-^×÷;]/.test(post) ? " " : "");
    el.value = pre + ins + post; el.focus(); const pos = a + ins.length; el.setSelectionRange(pos, pos); el.dispatchEvent(new Event("input", { bubbles: true })); return;
  }
  render();
}
async function saveAjustes() {
  const d = clone(S.draft); const codes = d.types.map((t) => t.code);
  if (codes.some((x) => !x) || new Set(codes).size !== codes.length) return toast("Cada tipo necesita un código único");
  if (!/\{NUM\}/.test(d.codeFormat)) return toast("El formato del código debe incluir {NUM}");
  for (const k of d.lineOrder) {
    const L = d.lines[k]; if (!L.formula) continue;
    L.formula.steps.forEach((st) => { st.key = PB.normKey(st.key); st.expr = String(st.expr || "").trim(); }); (L.formula.vars || []).forEach((v) => { v.key = PB.normKey(v.key); v.valor = N(v.valor); });
    const errs = PB.fxCheck(L.formula); if (errs.length) { S.fx.linea = k; render(); return toast(`Revisa la fórmula de ${L.nombre}: ${errs[0]}`, 7000); }
  }
  const fOf = (cfg, k) => { const L = cfg.lines[k]; return JSON.stringify(L.formula && L.formula.steps && L.formula.steps.length ? L.formula : PB.defaultFormula(L.costo, L.margenes.length)); };
  const changed = d.lineOrder.filter((k) => S.cfg.lines[k] && fOf(d, k) !== fOf(S.cfg, k));
  try { await saveConfig(d); await saveCounters(clone(S.draftCounters)); S.draft = null; toast("Ajustes guardados"); render(); } catch (e) { return toast("No se pudieron guardar: " + err(e)); }
  const cs = Object.values(S.compras).filter((c) => changed.includes(c.linea));
  if (cs.length && await confirmBox("Usar la fórmula nueva en las compras", `Cambiaste la fórmula de <b>${changed.map((k) => esc(d.lines[k].nombre)).join("</b> y <b>")}</b>. ¿La aplico también a ${cs.length === 1 ? "la compra ya creada" : "las " + cs.length + " compras ya creadas"} de esa línea? Cada compra mantiene sus propios valores de baño, tipo de cambio y márgenes; solo cambian los pasos y los valores que agregaste.`, "Aplicar a las compras")) {
    for (const c of cs) { c.params.formula = clone(d.lines[c.linea].formula); saveC(c, 10); }
    for (const k in defParams) delete defParams[k]; toast("Fórmula aplicada a " + cs.length + (cs.length === 1 ? " compra" : " compras")); render();
  }
}

/* ---------- nueva compra / productos ---------- */
function newCompraModal() {
  modal(`<h2>Nueva compra</h2><label class="f">Línea de producto<select id="nLinea">${S.cfg.lineOrder.map((k) => `<option value="${k}">${esc(S.cfg.lines[k].nombre)}</option>`).join("")}</select></label>
    <label class="f">Proveedor<input id="nProv" list="provList2"></label><datalist id="provList2">${S.cfg.providers.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
    <div class="grid g2"><label class="f">Fecha de compra<input type="date" id="nFecha" value="${today()}"></label><label class="f">N° de documento (opcional)<input id="nDoc"></label></div>
    <label class="f" id="nTcWrap">Tipo de cambio CLP por R$<input type="number" step="0.1" id="nTc" value="${esc(S.cfg.tc)}"></label>
    <div class="row end"><button class="btn" id="nNo">Cancelar</button><button class="btn primary" id="nOk">Crear compra</button></div>`, (m, close) => {
    const sync = () => $("#nTcWrap", m).classList.toggle("hidden", S.cfg.lines[$("#nLinea", m).value].costo === "clp"); $("#nLinea", m).onchange = sync; sync();
    $("#nNo", m).onclick = close;
    $("#nOk", m).onclick = async () => { const c = await createCompra({ linea: $("#nLinea", m).value, proveedor: $("#nProv", m).value.trim(), fecha: $("#nFecha", m).value || today(), documento: $("#nDoc", m).value.trim(), tc: N($("#nTc", m).value) }); if (c) { close(); go("compra-" + c.id); } };
  });
}
async function createCompra(o) {
  const params = PB.paramsFor(S.cfg, o.linea); if (o.tc) params.tc = o.tc;
  const c = { id: uid(), linea: o.linea, proveedor: o.proveedor || "", fecha: o.fecha || today(), documento: o.documento || "", params, total_doc: o.total_doc ?? null, moneda_doc: o.moneda_doc || null };
  const { error } = await S.sb.from("compras").insert(cRow(c)); if (error) { toast("No se pudo crear la compra: " + error.message); return null; }
  S.compras[c.id] = c;
  if (c.proveedor && !S.cfg.providers.includes(c.proveedor)) { const cfg = clone(S.cfg); cfg.providers.push(c.proveedor); saveConfig(cfg).catch(() => {}); }
  return c;
}
async function newProduct(compra) {
  const linea = compra ? compra.linea : S.pf.linea || "oro_br";
  const p = { id: uid(), nombre: "", linea, tipo: "", qty: compra ? 1 : 0, compra_id: compra ? compra.id : null, perfil: compra ? compra.params.perfilDefault : null, origen: compra ? "compra" : "manual", creado: new Date().toISOString(), activo: true, mat: (compra ? compra.params.mat : lineCfg(linea).mat) };
  const { error } = await S.sb.from("productos").insert(pRow(p)); if (error) { toast("No se pudo crear: " + error.message); return null; }
  S.productos[p.id] = p; return p;
}

/* ---------- importar archivos de Claude ---------- */
function importModal(intoId) {
  modal(`<h2>Importar archivo de Claude</h2><p class="small muted">Archivo <b>.json</b> que te entrega Claude: una OC leída desde el PDF (con fotos, pesos y precios) o los productos de la planilla maestra.</p>
    <label class="f">Archivo<input type="file" id="ipFile" accept=".json,application/json"></label><div id="ipInfo" class="small"></div>
    <div class="progress hidden" id="ipProg"><i id="ipBar"></i></div><div class="log" id="ipLog"></div>
    <div class="row end"><button class="btn" id="ipNo">Cerrar</button><button class="btn primary" id="ipGo" disabled>Importar</button></div>`, (m, close, back) => {
    let pkg = null; const log = (t) => { const d = document.createElement("div"); d.textContent = t; $("#ipLog", m).prepend(d); };
    $("#ipNo", m).onclick = () => { if (!back.dataset.busy) { close(); render(); } };
    $("#ipFile", m).onchange = async (e) => {
      try { pkg = JSON.parse(await e.target.files[0].text()); } catch (x) { $("#ipInfo", m).textContent = "El archivo no es válido."; return; }
      if (!pkg || !Array.isArray(pkg.items)) { $("#ipInfo", m).textContent = "Este archivo no es de la herramienta."; pkg = null; return; }
      const ex = allCodes(); const dup = pkg.items.filter((i) => i.code && ex.has(i.code)).length;
      $("#ipInfo", m).innerHTML = pkg.tipo === "punto-brasil-oc" ? `OC de <b>${esc(pkg.compra?.proveedor || "")}</b> del ${fdate(pkg.compra?.fecha)}: ${pkg.items.length} productos. ${intoId ? "Se agregan a esta compra." : "Se crea una compra nueva."}`
        : `${pkg.items.length} productos${pkg.origen ? " de " + esc(pkg.origen) : ""}.${dup ? ` ${dup} ya existen (mismo código) y se actualizan sin tocar su stock ni sus ventas.` : ""}`;
      $("#ipGo", m).disabled = false;
    };
    $("#ipGo", m).onclick = async () => {
      $("#ipGo", m).disabled = true; back.dataset.busy = "1"; $("#ipProg", m).classList.remove("hidden");
      try {
        let compra = intoId ? S.compras[intoId] : null;
        if (pkg.tipo === "punto-brasil-oc" && !compra) { compra = await createCompra(pkg.compra || { linea: "oro_br" }); if (!compra) throw new Error("No se pudo crear la compra"); }
        const byCode = {}; Object.values(S.productos).forEach((p) => p.code && (byCode[p.code] = p));
        let n = 0, upd = 0;
        for (const [i, it] of pkg.items.entries()) {
          const ex = it.code && byCode[it.code];
          const p = ex ? { ...ex } : { id: uid(), creado: new Date().toISOString(), activo: true };
          const linea = compra ? compra.linea : it.linea || "oro_br";
          Object.assign(p, { nombre: it.nombre ?? p.nombre, linea, tipo: it.tipo || p.tipo || "", mat: it.mat || p.mat || (compra ? compra.params.mat : lineCfg(linea).mat), proveedor: it.proveedor ?? compra?.proveedor ?? p.proveedor ?? null,
            ref: it.ref ?? p.ref ?? null, desc_original: it.desc_original ?? p.desc_original ?? null, variante: it.variante ?? p.variante ?? null, peso: it.peso ?? p.peso ?? null, bruto: it.bruto ?? p.bruto ?? null,
            nota: it.nota ?? p.nota ?? null, pagina: it.pagina ?? null, origen: p.origen || (compra ? "compra" : it.origen || "importado") });
          if (it.code) p.code = it.code;
          if (it.precio_manual != null) p.precio_manual = it.precio_manual;
          if (!ex) { p.qty = it.qty ?? 0; if (compra) { p.compra_id = compra.id; p.perfil = compra.params.perfilDefault; } }
          if (it.img && /^data:image/.test(it.img) && (!p.img_url || !ex)) { try { p.img_url = await uploadPhoto(p.id, it.img); } catch (x) { log("Sin foto para " + (p.code || p.nombre) + ": " + err(x)); } }
          else if (it.img_url && !p.img_url) p.img_url = it.img_url;
          const { error } = await S.sb.from("productos").upsert(pRow(p));
          if (error) log(`✗ ${p.code || p.nombre}: ${error.message}`); else { S.productos[p.id] = p; ex ? upd++ : n++; }
          $("#ipBar", m).style.width = Math.round(((i + 1) / pkg.items.length) * 100) + "%";
        }
        if (pkg.counters) { const next = clone(S.counters); Object.entries(pkg.counters).forEach(([k, v]) => (next[k] = Math.max(N(next[k]) || 0, N(v) || 0))); await saveCounters(next); }
        log(`Listo: ${n} productos nuevos${upd ? ", " + upd + " actualizados" : ""}.`);
        if (compra && !intoId) setTimeout(() => { close(); go("compra-" + compra.id); }, 900);
      } catch (x) { log("Error: " + err(x)); }
      back.dataset.busy = ""; $("#ipNo", m).textContent = "Cerrar";
    };
  });
}

/* ---------- Shopify ---------- */
async function shopCall(body) {
  const { data, error } = await S.sb.functions.invoke("shopify", { body });
  if (error) { let msg = error.message; try { const j = await error.context.json(); msg = j.error || msg; } catch (x) {} throw new Error(msg); }
  if (data && data.error) throw new Error(data.error); return data;
}
async function shopSync(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Sincronizando…"; }
  try {
    const d = await shopCall({ action: "catalog" }); const bySku = {}; d.items.forEach((v) => { if (v.sku) bySku[String(v.sku).trim().toUpperCase()] = v; });
    let match = 0, img = 0; const now = new Date().toISOString(); const rows = [];
    Object.values(S.productos).forEach((p) => {
      if (!p.code) return; const v = bySku[p.code.toUpperCase()];
      if (!v) { if (p.shopify_variant) { p.shopify_variant = null; p.shopify_precio = null; p.shopify_stock = null; p.shopify_estado = null; rows.push(p); } return; }
      match++; Object.assign(p, { shopify_id: v.product_id, shopify_variant: v.variant_id, shopify_precio: v.price, shopify_stock: v.stock, shopify_estado: v.status, shopify_url: v.url || p.shopify_url, shopify_sync: now });
      if (!p.img_url && v.image) { p.img_url = v.image; img++; } rows.push(p);
    });
    for (let i = 0; i < rows.length; i += 200) { const { error } = await S.sb.from("productos").upsert(rows.slice(i, i + 200).map(pRow)); if (error) throw error; }
    const known = new Set(Object.values(S.productos).map((p) => (p.code || "").toUpperCase()));
    const extra = d.items.filter((v) => v.sku && !known.has(String(v.sku).toUpperCase())).length;
    toast(`Shopify (${d.source === "admin" ? "admin" : "tienda pública"}): ${match} productos coinciden por código${img ? ", " + img + " fotos nuevas" : ""}${extra ? ", " + extra + " SKU de la tienda no están aquí" : ""}.`, 6000);
    S.shopStatus = d.source;
  } catch (e) { toast("No se pudo sincronizar con Shopify: " + err(e), 6000); }
  if (btn) { btn.disabled = false; btn.textContent = "Sincronizar Shopify"; } render();
}
async function shopCreate(list, log = toast) {
  let ok = 0;
  for (const p of list) {
    const r = calcP(p); const L = lineCfg(p.linea);
    try {
      const d = await shopCall({ action: "create", product: { title: p.nombre, price: Math.round(r.final), sku: p.code, productType: L.productType, tags: [L.corto, typeName(p.tipo)].filter(Boolean), descriptionHtml: (p.descripcion || genDescripcion(p)).split("\n\n").map((x) => "<p>" + esc(x) + "</p>").join(""), image: p.img_url && /^https:/.test(p.img_url) ? p.img_url : null } });
      Object.assign(p, { shopify_id: d.product_id, shopify_variant: d.variant_id, shopify_precio: Math.round(r.final), shopify_estado: "DRAFT" }); S.dirtyP.add(p.id); await flushP(p.id); ok++; log(`✓ ${p.code} ${p.nombre}`);
    } catch (e) { log(`✗ ${p.code}: ${err(e)}`); if (/configurar|credenciales|autorizado/i.test(err(e))) break; }
  }
  return ok;
}
async function shopPrice(p) {
  const r = calcP(p);
  try { await shopCall({ action: "price", product_id: p.shopify_id, variant_id: p.shopify_variant, price: Math.round(r.final) }); p.shopify_precio = Math.round(r.final); S.dirtyP.add(p.id); await flushP(p.id); toast("Precio actualizado en Shopify"); }
  catch (e) { toast("No se pudo cambiar el precio: " + err(e), 6000); }
}
function shopModal(list) {
  const pend = list.filter((p) => p.code && !p.shopify_variant && calcP(p).ok);
  modal(`<h2>Borradores en Shopify</h2><p class="small muted">Se crean ${pend.length} productos como <b>borrador</b> (no se publican), con nombre, precio, SKU = código, descripción y foto.</p><div class="log" id="sLog"></div>
    <div class="row end"><button class="btn" id="sNo">Cerrar</button><button class="btn primary" id="sGo" ${pend.length ? "" : "disabled"}>Crear ${pend.length} borradores</button></div>`, (m, close, back) => {
    const log = (t) => { const d = document.createElement("div"); d.textContent = t; $("#sLog", m).prepend(d); };
    $("#sNo", m).onclick = () => { if (!back.dataset.busy) { close(); render(); } };
    $("#sGo", m).onclick = async () => { $("#sGo", m).disabled = true; back.dataset.busy = "1"; const ok = await shopCreate(pend, log); back.dataset.busy = ""; log(`Listo: ${ok} borradores.`); };
  });
}

/* ---------- salidas: PDF, etiquetas, Excel ---------- */
function outputsModal(list, title, compra) {
  const n = list.filter((p) => p.code).length;
  modal(`<h2>${esc(title)}</h2><p class="small muted">${list.length} productos (${n} con código).</p>
    <div class="grid g3"><button class="btn" data-o="cat">Imprimible con fotos (PDF)</button><button class="btn" data-o="lab">Etiquetas (PDF)</button><button class="btn" data-o="xls">Excel</button></div>
    <div id="oOpts"></div><div class="row end"><button class="btn" id="oNo">Cerrar</button></div>`, (m, close) => {
    $("#oNo", m).onclick = close;
    m.addEventListener("click", (e) => {
      if (e.target.id === "cGo") return run(e.target, () => makeCatalog(list, compra, { cost: $("#cCost", m).checked, qty: $("#cQty", m).checked, size: $("#cSize", m).value }));
      if (e.target.id === "lGo") return run(e.target, () => makeLabels(list, compra, { size: $("#lSize", m).value, copies: $("#lCopies", m).value, qr: $("#lQr", m).checked, name: $("#lName", m).checked, start: Math.max(1, N($("#lStart", m).value) || 1) }));
      const b = e.target.closest("[data-o]"); if (!b) return;
      if (b.dataset.o === "cat") $("#oOpts", m).innerHTML = `<div class="grid panel"><label class="row small"><input type="checkbox" id="cCost"> Incluir costo y mayorista (uso interno)</label><label class="row small"><input type="checkbox" id="cQty" checked> Mostrar stock / cantidad</label>
        <label class="f">Fichas por hoja<select id="cSize"><option value="3x4">12 (3 × 4)</option><option value="2x3">6 (2 × 3)</option><option value="4x5">20 (4 × 5)</option></select></label><button class="btn primary" id="cGo">Generar PDF</button></div>`;
      else if (b.dataset.o === "lab") $("#oOpts", m).innerHTML = `<div class="grid panel"><label class="f">Tamaño<select id="lSize">${Object.entries(LABELS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="f">Cantidad<select id="lCopies"><option value="qty">${compra ? "Una por unidad comprada" : "Una por unidad en stock"}</option><option value="one">Una por producto</option></select></label>
        <label class="row small"><input type="checkbox" id="lQr" checked> QR que abre el producto en puntobrasil.cl</label><label class="row small"><input type="checkbox" id="lName" checked> Incluir nombre</label>
        <label class="f">Empezar en la etiqueta n°<input type="number" id="lStart" value="1" min="1"></label><button class="btn primary" id="lGo">Generar PDF</button></div>`;
      else if (b.dataset.o === "xls") exportExcel(list, compra, b);
    });
  });
  async function run(b, fn) { b.disabled = true; const t = b.textContent; b.textContent = "Generando…"; try { await fn(); } catch (x) { toast(err(x)); } b.disabled = false; b.textContent = t; }
}
const fileBase = (compra) => compra ? `${(compra.proveedor || "compra").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_")}_${fdate(compra.fecha).replace(/\./g, "-")}` : `lista_${today()}`;
const unitsOf = (p, compra) => compra ? N(p.qty) || 0 : Math.max(0, stockOf(p).disp);
async function makeCatalog(list, compra, o) {
  await loadScript(LIBS.jspdf); const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" });
  const items = list.filter((p) => p.code); if (!items.length) throw new Error("Ningún producto tiene código");
  const [cols, rows] = o.size.split("x").map(Number); const M = 10, top = 22, gap = 4; const cw = (210 - 2 * M - (cols - 1) * gap) / cols, ch = (297 - top - M - (rows - 1) * gap) / rows; const per = cols * rows; const pagesN = Math.ceil(items.length / per);
  const sub = compra ? `${lineCfg(compra.linea).nombre.toUpperCase()} · ${compra.proveedor || ""} · COMPRA ${fdate(compra.fecha)}${compra.documento ? " · DOC " + compra.documento : ""}` : `CATÁLOGO · ${fdate(today())}`;
  for (let i = 0; i < items.length; i++) {
    if (i % per === 0) { if (i) doc.addPage(); doc.setFont("times", "bold"); doc.setFontSize(16); doc.setTextColor(43, 44, 45); doc.text("Punto Brasil", M, 13); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(121, 112, 104); doc.text(sub, M, 18); doc.text(`Hoja ${i / per + 1} de ${pagesN}`, 210 - M, 13, { align: "right" }); doc.setDrawColor(180, 136, 71); doc.setLineWidth(0.4); doc.line(M, 19.5, 210 - M, 19.5); }
    const p = items[i]; const k = i % per; const x = M + (k % cols) * (cw + gap), y = top + Math.floor(k / cols) * (ch + gap);
    doc.setDrawColor(226, 221, 215); doc.setLineWidth(0.2); doc.roundedRect(x, y, cw, ch, 2, 2);
    const textH = o.cost ? 22 : 18; const ih = ch - textH - 4, iw = cw - 4; const du = await imageDataUrl(p);
    if (du) { const s = await imgSize(du); const r = Math.min(iw / s.w, ih / s.h); doc.addImage(du, "JPEG", x + (cw - s.w * r) / 2, y + 2 + (ih - s.h * r) / 2, s.w * r, s.h * r); }
    else { doc.setFontSize(8); doc.setTextColor(194, 183, 172); doc.text("Sin foto", x + cw / 2, y + 2 + ih / 2, { align: "center" }); }
    const r = calcP(p); let ty = y + ch - textH + 1.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(cols >= 4 ? 7 : 8); doc.setTextColor(43, 44, 45); const nm = doc.splitTextToSize(p.nombre || "", cw - 4).slice(0, 2); doc.text(nm, x + 2, ty + 2.5); ty += nm.length * 3.2 + 1.5;
    doc.setFont("courier", "bold"); doc.setFontSize(cols >= 4 ? 7.5 : 8.5); doc.setTextColor(121, 112, 104); doc.text(p.code, x + 2, ty + 3);
    if (o.qty) { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`× ${unitsOf(p, compra)}`, x + cw - 2, ty + 3, { align: "right" }); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(cols >= 4 ? 11 : 13); doc.setTextColor(180, 136, 71); doc.text(r.ok ? clp(r.final) : "Sin precio", x + 2, y + ch - (o.cost ? 6 : 2.5));
    if (o.cost && r.ok) { doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(121, 112, 104); doc.text(`Costo ${clp(r.costo)}${r.mayorista ? " · May. " + clp(r.mayorista) : ""}`, x + 2, y + ch - 2); }
  }
  download(`Productos_${fileBase(compra)}.pdf`, doc.output("blob"));
}
const LABELS = { s: { w: 40, h: 25, name: "Chica 40 × 25 mm (44 por hoja)" }, m: { w: 50, h: 30, name: "Media 50 × 30 mm (36 por hoja)" }, l: { w: 63.5, h: 38.1, name: "Grande 63,5 × 38,1 mm (21, tipo Avery L7160)" } };
function drawQr(doc, text, x, y, size) { const q = window.qrcode(0, "M"); q.addData(text); q.make(); const n = q.getModuleCount(); const s = size / n; doc.setFillColor(43, 44, 45); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x + c * s, y + r * s, s + 0.02, s + 0.02, "F"); }
async function makeLabels(list, compra, o) {
  await loadScript(LIBS.jspdf); if (o.qr) await loadScript(LIBS.qr); const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" }); const Lb = LABELS[o.size];
  const cols = Math.floor((210 - 12) / Lb.w), rows = Math.floor((297 - 12) / Lb.h); const mx = (210 - cols * Lb.w) / 2, my = (297 - rows * Lb.h) / 2; const per = cols * rows;
  const items = []; list.filter((p) => p.code).forEach((p) => { const k = o.copies === "qty" ? Math.max(1, unitsOf(p, compra)) : 1; for (let i = 0; i < k; i++) items.push(p); });
  if (!items.length) throw new Error("Ningún producto tiene código");
  let slot = o.start - 1;
  for (const p of items) {
    if (slot && slot % per === 0) doc.addPage(); const k = slot % per; const x = mx + (k % cols) * Lb.w, y = my + Math.floor(k / cols) * Lb.h;
    doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.1); doc.rect(x, y, Lb.w, Lb.h); const r = calcP(p); const pad = 2; let tx = x + pad;
    if (o.qr) { const qs = Lb.h - 2 * pad - 1; drawQr(doc, (S.cfg.qrUrl || "").replace("{CODIGO}", encodeURIComponent(p.code)), x + pad, y + pad + 0.5, qs); tx = x + pad + qs + 2; }
    const tw = x + Lb.w - pad - tx; const f = Lb.h / 25;
    doc.setFont("helvetica", "normal"); doc.setFontSize(4.6 * f); doc.setTextColor(121, 112, 104); doc.text("PUNTO BRASIL", tx, y + pad + 2 * f, { charSpace: 0.12 }); let ty = y + pad + 5 * f;
    if (o.name) { doc.setFontSize(5.8 * f); doc.setTextColor(43, 44, 45); const nm = doc.splitTextToSize(p.nombre || "", tw).slice(0, 2); doc.text(nm, tx, ty); }
    doc.setFont("courier", "bold"); doc.setFontSize(6.8 * f); doc.setTextColor(43, 44, 45); doc.text(p.code, tx, y + Lb.h - pad - 5.6 * f);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11 * f); doc.setTextColor(180, 136, 71); doc.text(r.ok ? clp(r.final) : "", tx, y + Lb.h - pad - 0.6 * f); slot++;
  }
  download(`Etiquetas_${fileBase(compra)}.pdf`, doc.output("blob"));
}
async function exportExcel(list, compra, btn) {
  btn.disabled = true; const old = btn.textContent; btn.textContent = "Generando…";
  try {
    await loadScript(LIBS.exceljs); const wb = new window.ExcelJS.Workbook();
    const groups = {}; list.forEach((p) => (groups[p.linea] ||= []).push(p));
    for (const [linea, items] of Object.entries(groups)) {
      const L = lineCfg(linea); const ws = wb.addWorksheet(L.hoja.slice(0, 31)); const banho = L.costo === "banho";
      const head = banho ? ["FOTO", "NOMBRE", "PROVEEDOR", "TIPO DE JOYA", "ID", "STOCK", "$ X GRAMO (cotización)", "$ MANO OBRA", "$ BAÑO (verniz)", "CAMADA", "PESO PRODUCTO", "PRECIO BRUTO", "MO FIJA", "VALOR PIEZA R$", "COSTO PIEZA", "VALOR MAYORISTA", "VALOR MINORISTA + GASTOS", "PRECIO VENTA", "PRECIO SHOPIFY", "VENDIDAS", "REF. PROVEEDOR", "NOTA"]
        : ["FOTO", "NOMBRE", "PROVEEDOR", "TIPO", "ID", "STOCK", L.costo === "brl" ? "PRECIO R$" : "COSTO CLP", "VARIANTE / TALLA", "COSTO PIEZA", "VALOR MAYORISTA", "VALOR MINORISTA + GASTOS", "PRECIO VENTA", "PRECIO SHOPIFY", "VENDIDAS", "REF. PROVEEDOR", "NOTA"];
      ws.addRow(head); const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: "FFFFFFFF" } }; hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B2C2D" } }; hr.alignment = { wrapText: true, vertical: "middle" }; hr.height = 32;
      ws.columns.forEach((c, i) => (c.width = i === 0 ? 12 : i === 1 ? 38 : 15));
      for (let i = 0; i < items.length; i++) {
        const p = items[i]; const r = calcP(p); const params = paramsOf(p); const pf = banho ? params.perfiles[p.perfil || params.perfilDefault] || {} : {};
        const tipoH = (S.cfg.types.find((t) => t.code === p.tipo) || {}).hoja || p.tipo; const rd = (v) => (r.ok && isFinite(v) ? Math.round(v) : null); const st = stockOf(p);
        const stock = compra ? N(p.qty) : st.disp;
        const row = banho ? ["", p.nombre, p.proveedor, tipoH, p.code || "", stock, N(pf.cotizacion), N(pf.mo), N(pf.verniz), N(pf.camada), N(p.peso), N(p.bruto), N(pf.moFija), r.ok ? Math.round(r.piezaBRL * 100) / 100 : null, rd(r.costo), rd(r.mayorista), rd(r.bruto), r.ok ? r.final : null, N(p.shopify_precio), st.vendidos, p.ref || "", p.nota || ""]
          : ["", p.nombre, p.proveedor, tipoH, p.code || "", stock, N(p.bruto), p.variante || "", rd(r.costo), rd(r.mayorista), rd(r.bruto), r.ok ? r.final : null, N(p.shopify_precio), st.vendidos, p.ref || "", p.nota || ""];
        const xr = ws.addRow(row); xr.height = 62; xr.alignment = { vertical: "middle", wrapText: true };
        const du = await imageDataUrl(p); if (du) { const id = wb.addImage({ base64: du, extension: "jpeg" }); ws.addImage(id, { tl: { col: 0.1, row: i + 1.08 }, ext: { width: 76, height: 76 } }); }
      }
      (banho ? [15, 16, 17, 18, 19] : [9, 10, 11, 12, 13]).forEach((k) => (ws.getColumn(k).numFmt = '"$"#,##0')); ws.views = [{ state: "frozen", ySplit: 1 }];
    }
    download(`${compra ? "Maestra_" : "Productos_"}${fileBase(compra)}.xlsx`, new Blob([await wb.xlsx.writeBuffer()]));
  } catch (e) { toast(err(e)); }
  btn.disabled = false; btn.textContent = old;
}

/* ---------- eventos ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return; e.preventDefault();
  const act = b.dataset.act; const c = S.compras[S.compraId];
  if (act.startsWith("fx")) { fxAction(act, b); return; }
  if (act === "logout") { await S.sb.auth.signOut(); location.hash = ""; location.reload(); }
  else if (act === "go") { if (b.dataset.crit) { S.pf = { ...S.pf, stock: "critico", q: "" }; } go(b.dataset.h); }
  else if (act === "openCompra") go("compra-" + b.dataset.id);
  else if (act === "openP") { const p = S.productos[b.dataset.id]; if (p) productModal(p); }
  else if (act === "newCompra") newCompraModal();
  else if (act === "newProduct") { const p = await newProduct(null); if (p) productModal(p); }
  else if (act === "moreP") { S.pf.limit += 120; render(); }
  else if (act === "clearPf") { S.pf = { q: "", linea: "", tipo: "", prov: "", stock: "", estado: "", orden: "nombre", limit: 120 }; render(); }
  else if (act === "outList") outputsModal(filteredProducts(), "Imprimir o exportar la lista", null);
  else if (act === "outCompra") outputsModal(itemsOf(c.id), "Imprimible, etiquetas y Excel", c);
  else if (act === "shopSync") shopSync(b);
  else if (act === "shopCompra") shopModal(itemsOf(c.id));
  else if (act === "toggleItem") { S.open["it_" + b.dataset.id] = !S.open["it_" + b.dataset.id]; render(); }
  else if (act === "addItem") { const p = await newProduct(c); if (p) { S.open["it_" + p.id] = true; render(); } }
  else if (act === "dupItem") { const src = S.productos[b.dataset.id]; const p = { ...clone(src), id: uid(), code: null, shopify_id: null, shopify_variant: null, shopify_precio: null, creado: new Date().toISOString() }; const { error } = await S.sb.from("productos").insert(pRow(p)); if (error) toast(error.message); else { S.productos[p.id] = p; render(); } }
  else if (act === "delItem") { const p = S.productos[b.dataset.id]; if (await confirmBox("Eliminar producto", `Se borra <b>${esc(p.nombre || "este producto")}</b>.${p.code ? " Su código " + esc(p.code) + " no se reutiliza." : ""}`, "Eliminar", true)) { const { error } = await S.sb.from("productos").delete().eq("id", p.id); if (error) toast(error.message); else { delete S.productos[p.id]; render(); } } }
  else if (act === "reloadParams") { if (await confirmBox("Usar los valores de Ajustes", "Se reemplazan los parámetros de esta compra por los de Ajustes y los precios se recalculan.", "Reemplazar")) { c.params = PB.paramsFor(S.cfg, c.linea); saveC(c, 10); render(); } }
  else if (act === "assignCodes") { const pend = itemsOf(c.id).filter((p) => !p.code && p.tipo); const prev = PB.previewCodes(S.cfg, S.counters, pend, c.params.mat).codes; if (await confirmBox("Asignar códigos", `Se asignan ${pend.length} códigos (${esc(Object.values(prev)[0] || "")} …). Después no podrás cambiar el tipo sin quitar el código.`, "Asignar")) { await assignCodes(pend); render(); } }
  else if (act === "delCompra") { const its = itemsOf(c.id); if (await confirmBox("Eliminar compra", `Se borra la compra de <b>${esc(c.proveedor)}</b>. Sus ${its.length} productos ${its.length ? "quedan en Productos, sin compra asociada (usarán los parámetros de Ajustes)" : ""}.`, "Eliminar", true)) { const { error } = await S.sb.from("compras").delete().eq("id", c.id); if (error) toast(error.message); else { its.forEach((p) => (p.compra_id = null)); delete S.compras[c.id]; go("compras"); } } }
  else if (act === "importPkg") importModal(b.dataset.into || null);
  else if (act === "quickSale") quickSaleModal();
  else if (act === "delSale") { if (await confirmBox("Borrar venta", "Se borra el registro y el stock vuelve a sumar esas unidades.", "Borrar", true)) { const { error } = await S.sb.from("movimientos").delete().eq("id", b.dataset.id); if (error) toast(error.message); else { S.movs = S.movs.filter((m) => m.id !== b.dataset.id); rebuildStock(); render(); } } }
  else if (act === "saveCfg") saveAjustes();
  else if (act === "resetDraft") { S.draft = null; render(); }
  else if (act === "addRow") { const l = b.dataset.list; S.draft[l].push(l === "types" ? { code: "", nombre: "", grupo: "joya", hoja: "", alias: "" } : { code: "", nombre: "" }); render(); }
  else if (act === "delRow") { S.draft[b.dataset.list].splice(+b.dataset.i, 1); render(); }
  else if (act === "addCtr") { const k = ($("#newCtr").value || "").trim().toUpperCase(); if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(k)) { S.draftCounters[k] = S.draftCounters[k] || 0; render(); } else toast("Escribe tipo y material separados por guion, por ejemplo VE-ROP"); }
  else if (act === "exportAll") outputsModal(Object.values(S.productos), "Respaldo de todos los productos", null);
});
document.addEventListener("focusin", (e) => { const el = e.target; if (el.classList && el.classList.contains("fx-expr")) S.fx.focus = el.dataset.fxi; });
document.addEventListener("mousedown", (e) => { if (e.target.closest(".fxname")) e.preventDefault(); });
document.addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.tg) S.open[d.dataset.tg] = d.open; }, true);
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.pf) { S.pf[el.dataset.pf] = el.value; S.pf.limit = 120; if (el.dataset.pf === "q") { const pos = el.selectionStart; render(); const f = $('[data-pf="q"]'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } } else render(); }
  else if (el.dataset.vf) { S.vf[el.dataset.vf] = el.value; render(); }
  else if (el.dataset.if) {
    const card = el.closest("[data-item]"); const p = S.productos[card.dataset.item]; p[el.dataset.if] = el.value;
    if (["qty", "peso", "bruto", "perfil", "precio_manual"].includes(el.dataset.if)) { const r = calcP(p); $("[data-pricebox]", card).innerHTML = priceBox(r); card.classList.toggle("incomplete", !r.ok); }
    saveP(p);
  } else if (el.dataset.calc) {
    S.calc[el.dataset.calc] = el.value; if (el.dataset.calc === "linea") { S.calc.perfil = ""; render(); return; }
    const p = PB.paramsFor(S.cfg, S.calc.linea); if (S.calc.tc) p.tc = N(S.calc.tc); $("#calcOut").innerHTML = calcOut(PB.calc({ peso: S.calc.peso, bruto: S.calc.bruto, perfil: S.calc.perfil || p.perfilDefault }, p));
  } else if (el.dataset.set) {
    const path = el.dataset.set; let v = el.value;
    if (path === "providersText") { S.draft.providers = v.split("\n").map((x) => x.trim()).filter(Boolean); return; }
    if (path === "canalesText") { S.draft.canales = v.split(",").map((x) => x.trim()).filter(Boolean); return; }
    if (path.endsWith(".nmarg")) { const L = S.draft.lines[path.split(".")[1]]; L.margenes = +v === 2 ? [L.margenes[0], L.margenes[1] ?? 45] : [L.margenes[0]]; render(); return; }
    if (el.type === "number") v = v === "" ? "" : Number(v); if (/^(types|materials)\.\d+\.code$/.test(path)) v = String(v).toUpperCase(); setPath(S.draft, path, v);
    fxRefresh();
  } else if (el.dataset.fx !== undefined && el.dataset.fx) { S.fx[el.dataset.fx] = el.value; if (el.dataset.fx === "perfil") render(); else fxRefresh();
  } else if (el.dataset.ctr) S.draftCounters[el.dataset.ctr] = Number(el.value) || 0;
  else if (el.hasAttribute("data-cfilter")) { S.filter = el.value; const pos = el.selectionStart; render(); const f = $("[data-cfilter]"); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }
});
document.addEventListener("change", (e) => {
  const el = e.target; const c = S.compras[S.compraId];
  if (el.dataset.cp && c) { let v = el.value; if (el.type === "number") v = N(v); setPath(c.params, el.dataset.cp, v); saveC(c, 100); render(); }
  else if (el.dataset.cf && c) { c[el.dataset.cf] = el.value; saveC(c, 100); }
  else if (el.dataset.if === "tipo") render();
  else if (el.hasAttribute("data-fxline")) { S.fx.linea = el.value; S.fx.perfil = ""; S.fx.focus = null; render(); }
  else if (el.dataset.set && S.view === "ajustes" && el.tagName !== "TEXTAREA") {
    if (/\.key$/.test(el.dataset.set)) { const k = PB.normKey(el.value); el.value = k; setPath(S.draft, el.dataset.set, k); }
    if (el.closest(".fx") && el.tagName !== "SELECT") { fxRefresh(); return; }
    render();
  }
  else if (el.dataset.photo) { const p = S.productos[el.dataset.photo]; const fr = new FileReader(); fr.onload = async () => { try { p.img_url = await uploadPhoto(p.id, fr.result); saveP(p, 10); render(); } catch (x) { toast("No se pudo subir la foto: " + err(x)); } }; fr.readAsDataURL(el.files[0]); }
});
window.addEventListener("beforeunload", (e) => { if (S.dirtyP.size || S.dirtyC.size) { flushAll(); e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });

/* ---------- inicio ---------- */
(function boot() {
  if (!CONF.url || !CONF.anonKey || !window.supabase) { $("main").innerHTML = `<section class="panel login grid"><h1>Falta <em>configurar</em></h1><p class="muted">La herramienta todavía no está conectada a su base de datos.</p></section>`; return; }
  S.sb = window.supabase.createClient(CONF.url, CONF.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  S.sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") viewLogin("newpass"); else if (ev === "SIGNED_IN" && !S.ready) start(); else if (ev === "SIGNED_OUT") { S.ready = false; viewLogin(); } });
  start();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
