/* Motor de precios y códigos · Punto Brasil */
const PB = (function () {
  const DEFAULT_CONFIG = {
    version: 1,
    tc: 179,
    iva: 19,
    rounding: "990",
    qrUrl: "https://puntobrasil.cl/search?q={CODIGO}",
    stockMin: 2,
    canales: ["Web (Shopify)", "Instagram", "WhatsApp", "Presencial", "Feria"],
    codeFormat: "{TIPO}-{MAT}-{NUM}",
    numDigits: 3,
    profiles: [
      { key: "ouro", nombre: "Oro", camada: 3, cotizacion: 661.02, mo: 3.5, moFija: 650, verniz: 225 },
      { key: "ouro_acc", nombre: "Oro / accesorios", camada: 3, cotizacion: 661.02, mo: 4.5, moFija: 650, verniz: 225 },
      { key: "prata", nombre: "Plata", camada: 50, cotizacion: 13.5, mo: 110, moFija: 11, verniz: 350 },
      { key: "prata_acc", nombre: "Plata / accesorios", camada: 50, cotizacion: 13.5, mo: 125, moFija: 11, verniz: 350 }
    ],
    lineOrder: ["oro_br", "plata_br", "plata_cl", "ropa_br", "acero_cn"],
    lines: {
      oro_br: { nombre: "Enchapado oro Brasil", corto: "Oro Brasil", costo: "banho", moneda: "BRL", perfiles: ["ouro", "ouro_acc"], mat: "ENO", grupo: "joya", aduana: 6, margenes: [45, 45], viaje: 25, pasarela: 3, shopify: 2, hoja: "ENCHAPADAS ORO BRASIL", productType: "Enchapado en Oro 18K" },
      plata_br: { nombre: "Enchapado plata Brasil", corto: "Plata Brasil", costo: "banho", moneda: "BRL", perfiles: ["prata", "prata_acc"], mat: "ENP", grupo: "joya", aduana: 6, margenes: [45, 45], viaje: 25, pasarela: 3, shopify: 2, hoja: "ENCHAPADAS PLATA BRASIL", productType: "Enchapado en Plata" },
      plata_cl: { nombre: "Plata (compra en Santiago)", corto: "Plata Chile", costo: "clp", moneda: "CLP", perfiles: [], mat: "PLT", grupo: "joya", aduana: 0, margenes: [50], viaje: 25, pasarela: 3, shopify: 2, hoja: "PLATA CHILE", productType: "Plata 950" },
      ropa_br: { nombre: "Vestuario Brasil", corto: "Vestuario", costo: "brl", moneda: "BRL", perfiles: [], mat: "ROP", grupo: "ropa", aduana: 6, margenes: [50], viaje: 25, pasarela: 3, shopify: 2, hoja: "VESTUARIO", productType: "Vestuario" },
      acero_cn: { nombre: "Acero baño oro China", corto: "Acero China", costo: "clp", moneda: "CLP", perfiles: [], mat: "ACO", grupo: "joya", aduana: 6, margenes: [45, 45], viaje: 25, pasarela: 3, shopify: 2, hoja: "ACERO ORO CHINA", productType: "Acero Baño en Oro" }
    },
    types: [
      { code: "AR", nombre: "Aros", grupo: "joya", hoja: "AROS", alias: "aro, aros, arete, brinco, argolla, pendiente" },
      { code: "AN", nombre: "Anillo", grupo: "joya", hoja: "ANILLO", alias: "anel, anillo" },
      { code: "CO", nombre: "Collar", grupo: "joya", hoja: "COLLAR", alias: "colar, collar" },
      { code: "PU", nombre: "Pulsera", grupo: "joya", hoja: "PULSERA", alias: "pulseira, bracelete, pulsera" },
      { code: "DI", nombre: "Dije / colgante", grupo: "joya", hoja: "COLGANTE", alias: "pingente, dije, colgante" },
      { code: "CA", nombre: "Cadena", grupo: "joya", hoja: "CADENA", alias: "corrente, cadena" },
      { code: "GA", nombre: "Gargantilla", grupo: "joya", hoja: "GARGANTILLA", alias: "gargantilha" },
      { code: "CH", nombre: "Choker", grupo: "joya", hoja: "CHOKER", alias: "choker" },
      { code: "CJ", nombre: "Conjunto", grupo: "joya", hoja: "CONJUNTO", alias: "conjunto, kit, set" },
      { code: "VE", nombre: "Vestido", grupo: "ropa", hoja: "VESTIDO", alias: "vestido" },
      { code: "BL", nombre: "Blusa / polera", grupo: "ropa", hoja: "BLUSA", alias: "blusa, top, cropped, camiseta" },
      { code: "FA", nombre: "Falda", grupo: "ropa", hoja: "FALDA", alias: "saia, falda" },
      { code: "PA", nombre: "Pantalón", grupo: "ropa", hoja: "PANTALON", alias: "calça, pantalón" },
      { code: "SH", nombre: "Short", grupo: "ropa", hoja: "SHORT", alias: "short, bermuda" },
      { code: "EN", nombre: "Enterito / mono", grupo: "ropa", hoja: "ENTERITO", alias: "macacão, macaquinho, enterito" }
    ],
    materials: [
      { code: "PLT", nombre: "Plata" },
      { code: "OR", nombre: "Oro" },
      { code: "ENO", nombre: "Enchapado en oro" },
      { code: "ENP", nombre: "Enchapado en plata" },
      { code: "ACO", nombre: "Acero baño en oro" },
      { code: "ACP", nombre: "Acero baño en plata" },
      { code: "ROP", nombre: "Vestuario" }
    ],
    providers: ["Adonai", "Delma de Almeida Gomes", "Re Casciano Brutos", "NIHAO"]
  };

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const s = String(v).trim().replace(/\s/g, "");
    let t = s;
    if (/,/.test(s) && /\./.test(s)) t = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (/,/.test(s)) t = s.replace(",", ".");
    const n = parseFloat(t);
    return isFinite(n) ? n : null;
  };

  function roundPrice(x, mode) {
    if (!isFinite(x)) return null;
    if (mode === "990") return Math.max(990, Math.ceil((x - 990) / 1000) * 1000 + 990);
    if (mode === "1000") return Math.ceil(x / 1000) * 1000;
    if (mode === "100") return Math.ceil(x / 100) * 100;
    return Math.round(x);
  }

  function valorKg(pf) {
    if (!pf) return null;
    return num(pf.camada) * num(pf.cotizacion) + num(pf.mo) * num(pf.moFija) + num(pf.verniz);
  }

  /* ---------- Fórmulas editables (estilo Excel) ---------- */
  const normKey = (x) => String(x == null ? "" : x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

  /** Valores que la fórmula puede usar sin crearlos: datos del producto, del perfil de baño y de la línea. */
  const FX_BUILTINS = [
    { key: "peso", nombre: "Peso de la pieza (g)", grupo: "producto", solo: "banho" },
    { key: "bruto", nombre: "Bruto / precio del proveedor", grupo: "producto" },
    { key: "camada", nombre: "Camada", grupo: "perfil", solo: "banho", campo: "camada" },
    { key: "cotizacion", nombre: "Cotización del día", grupo: "perfil", solo: "banho", campo: "cotizacion" },
    { key: "mo", nombre: "Mano de obra (M.O.)", grupo: "perfil", solo: "banho", campo: "mo" },
    { key: "mo_fija", nombre: "MO fija", grupo: "perfil", solo: "banho", campo: "moFija" },
    { key: "verniz", nombre: "Verniz", grupo: "perfil", solo: "banho", campo: "verniz" },
    { key: "tc", nombre: "Tipo de cambio (CLP por R$)", grupo: "general", campo: "tc", nosolo: "clp" },
    { key: "iva", nombre: "IVA %", grupo: "general", campo: "iva" },
    { key: "aduana", nombre: "Aduana %", grupo: "linea", campo: "aduana" },
    { key: "margen1", nombre: "Margen 1 %", grupo: "linea", campo: "margenes.0" },
    { key: "margen2", nombre: "Margen 2 %", grupo: "linea", campo: "margenes.1" },
    { key: "viaje", nombre: "Gastos de viaje %", grupo: "linea", campo: "viaje" },
    { key: "pasarela", nombre: "Redcompra / Mercado Pago %", grupo: "linea", campo: "pasarela" },
    { key: "shopify", nombre: "Comisión Shopify %", grupo: "linea", campo: "shopify" }
  ];
  const FX_RESERVED = new Set(FX_BUILTINS.map((b) => b.key));
  const FX_FUNCS = {
    min: (...a) => Math.min(...a), max: (...a) => Math.max(...a), abs: (x) => Math.abs(x),
    redondear: (x, n = 0) => { const f = Math.pow(10, n); return Math.round(x * f) / f; },
    redondear_mas: (x, n = 0) => { const f = Math.pow(10, n); return Math.ceil(x * f) / f; },
    redondear_menos: (x, n = 0) => { const f = Math.pow(10, n); return Math.floor(x * f) / f; },
    si: (c, a, b = 0) => (c ? a : b)
  };

  function fxTokens(src) {
    const t = []; let i = 0; const s = String(src || "").replace(/^\s*=/, "");
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
        let j = i; while (/[0-9]/.test(s[j] || "")) j++;
        if ((s[j] === "," || s[j] === ".") && /[0-9]/.test(s[j + 1] || "")) { j++; while (/[0-9]/.test(s[j] || "")) j++; }
        t.push({ t: "n", v: parseFloat(s.slice(i, j).replace(",", ".")) }); i = j; continue;
      }
      if (/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF_]/.test(c)) { let j = i; while (/[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9_]/.test(s[j] || "")) j++; t.push({ t: "id", v: normKey(s.slice(i, j)) }); i = j; continue; }
      const two = s.slice(i, i + 2);
      if (["<=", ">=", "<>"].includes(two)) { t.push({ t: "op", v: two }); i += 2; continue; }
      const map = { "×": "*", "÷": "/", "−": "-", "–": "-", "x": "*" };
      const ch = map[c] && c !== "x" ? map[c] : c;
      if ("+-*/^()<>=".includes(ch)) { t.push({ t: "op", v: ch }); i++; continue; }
      if (c === ";" || c === ",") { t.push({ t: "sep" }); i++; continue; }
      if (c === "%") { t.push({ t: "op", v: "%" }); i++; continue; }
      throw new Error(`No entiendo el símbolo "${c}"`);
    }
    return t;
  }
  const fxCache = new Map();
  /** Convierte el texto de una fórmula en un árbol. Devuelve { ast, refs } o lanza un error en español. */
  function fxParse(src) {
    const key = String(src || "");
    if (fxCache.has(key)) { const c = fxCache.get(key); if (c.error) throw new Error(c.error); return c; }
    try {
      const tk = fxTokens(key); let p = 0; const refs = new Set();
      if (!tk.length) throw new Error("La fórmula está vacía");
      const peek = () => tk[p]; const isOp = (v) => tk[p] && tk[p].t === "op" && tk[p].v === v;
      const cmp = () => { let a = add(); while (tk[p] && tk[p].t === "op" && ["<", ">", "<=", ">=", "=", "<>"].includes(tk[p].v)) { const o = tk[p++].v; a = { k: "b", o, a, b: add() }; } return a; };
      const add = () => { let a = mul(); while (isOp("+") || isOp("-")) { const o = tk[p++].v; a = { k: "b", o, a, b: mul() }; } return a; };
      const mul = () => { let a = una(); while (isOp("*") || isOp("/")) { const o = tk[p++].v; a = { k: "b", o, a, b: una() }; } return a; };
      const una = () => { if (isOp("-")) { p++; return { k: "neg", a: una() }; } if (isOp("+")) { p++; return una(); } return pow(); };
      const pow = () => { let a = post(); if (isOp("^")) { p++; return { k: "b", o: "^", a, b: una() }; } return a; };
      const post = () => { let a = prim(); while (isOp("%")) { p++; a = { k: "b", o: "/", a, b: { k: "n", v: 100 } }; } return a; };
      const prim = () => {
        const x = peek(); if (!x) throw new Error("La fórmula termina antes de tiempo");
        if (x.t === "n") { p++; return { k: "n", v: x.v }; }
        if (x.t === "id") {
          p++;
          if (isOp("(")) {
            if (!FX_FUNCS[x.v]) throw new Error(`No conozco la función "${x.v.toUpperCase()}"`);
            p++; const args = [];
            if (!isOp(")")) { args.push(cmp()); while (tk[p] && tk[p].t === "sep") { p++; args.push(cmp()); } }
            if (!isOp(")")) throw new Error("Falta cerrar un paréntesis"); p++;
            return { k: "f", f: x.v, args };
          }
          refs.add(x.v); return { k: "v", v: x.v };
        }
        if (x.t === "op" && x.v === "(") { p++; const a = cmp(); if (!isOp(")")) throw new Error("Falta cerrar un paréntesis"); p++; return a; }
        throw new Error(`Sobra o falta algo cerca de "${x.v || "separador"}"`);
      };
      const ast = cmp(); if (p < tk.length) throw new Error(`Sobra o falta algo cerca de "${tk[p].v || "separador"}"`);
      const out = { ast, refs: [...refs] }; fxCache.set(key, out); return out;
    } catch (e) { fxCache.set(key, { error: e.message }); throw e; }
  }
  function fxEval(n, env) {
    switch (n.k) {
      case "n": return n.v;
      case "v": { const v = env[n.v]; if (v === undefined) throw new Error(`"${n.v}" no existe o se calcula más abajo`); if (v === null || !isFinite(v)) throw new Error(`falta ${n.v}`); return v; }
      case "neg": return -fxEval(n.a, env);
      case "f": return FX_FUNCS[n.f](...n.args.map((a) => fxEval(a, env)));
      case "b": {
        const a = fxEval(n.a, env), b = fxEval(n.b, env);
        switch (n.o) { case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": if (b === 0) throw new Error("división por cero"); return a / b; case "^": return Math.pow(a, b);
          case "<": return a < b ? 1 : 0; case ">": return a > b ? 1 : 0; case "<=": return a <= b ? 1 : 0; case ">=": return a >= b ? 1 : 0; case "=": return a === b ? 1 : 0; case "<>": return a !== b ? 1 : 0; }
      }
    }
    throw new Error("Fórmula inválida");
  }

  /** Fórmula original de cada tipo de línea (la misma que usaba la planilla). */
  function defaultFormula(costo, nMarg) {
    const st = (key, nombre, expr, fmt) => ({ key, nombre, expr, fmt });
    const steps = [];
    if (costo === "banho") {
      steps.push(st("valor_kg", "Valor del baño por kg", "camada * cotizacion + mo * mo_fija + verniz", "brl"));
      steps.push(st("bano", "Baño de la pieza", "valor_kg / 1000 * peso", "brl"));
      steps.push(st("pieza_brl", "Valor pieza en Brasil", "bano + bruto", "brl"));
      steps.push(st("costo_base", "Costo en pesos", "pieza_brl * tc", "clp"));
    } else if (costo === "brl") {
      steps.push(st("pieza_brl", "Precio en Brasil", "bruto", "brl"));
      steps.push(st("costo_base", "Costo en pesos", "pieza_brl * tc", "clp"));
    } else steps.push(st("costo_base", "Costo de compra", "bruto", "clp"));
    steps.push(st("costo", "Costo pieza (con aduana)", "costo_base * (1 + aduana / 100)", "clp"));
    if (nMarg > 1) {
      steps.push(st("neto1", "Mayorista sin IVA (margen 1)", "costo / (1 - margen1 / 100)", "clp"));
      steps.push(st("mayorista", "Mayorista con IVA", "neto1 * (1 + iva / 100)", "clp"));
      steps.push(st("neto2", "Minorista sin IVA (margen 2)", "neto1 / (1 - margen2 / 100)", "clp"));
    } else steps.push(st("neto2", "Minorista sin IVA (margen)", "costo / (1 - margen1 / 100)", "clp"));
    steps.push(st("minorista", "Minorista con IVA", "neto2 * (1 + iva / 100)", "clp"));
    steps.push(st("gasto_viaje", "Gastos de viaje", "costo * viaje / 100", "clp"));
    steps.push(st("comision_mp", "Redcompra / Mercado Pago", "minorista * pasarela / 100", "clp"));
    steps.push(st("comision_shopify", "Comisión Shopify", "minorista * shopify / 100", "clp"));
    steps.push(st("precio", "Precio calculado (antes de redondear)", "minorista + gasto_viaje + comision_mp + comision_shopify", "clp"));
    return { steps, vars: [] };
  }
  const formulaOf = (p) => (p.formula && Array.isArray(p.formula.steps) && p.formula.steps.length ? p.formula : defaultFormula(p.costo, (p.margenes || []).length));

  /** Revisa una fórmula: nombres válidos, sin repetir, y que existan "costo" y "precio". */
  function fxCheck(F) {
    const errs = []; const seen = new Set();
    (F.vars || []).forEach((v, i) => {
      const k = normKey(v.key); if (!k) errs.push(`Valor ${i + 1}: falta el nombre`);
      else if (FX_RESERVED.has(k) || seen.has(k)) errs.push(`El nombre "${k}" está repetido`); else seen.add(k);
      if (num(v.valor) === null) errs.push(`Valor "${k || i + 1}": falta el número`);
    });
    (F.steps || []).forEach((s, i) => {
      const k = normKey(s.key); if (!k) errs.push(`Paso ${i + 1}: falta el nombre`);
      else if (FX_RESERVED.has(k) || seen.has(k)) errs.push(`El nombre "${k}" está repetido`); else seen.add(k);
      try { const r = fxParse(s.expr); r.refs.forEach((x) => { if (!FX_RESERVED.has(x) && !seen.has(x)) errs.push(`Paso "${s.nombre || k}": usa "${x}", que no existe o está más abajo`); }); }
      catch (e) { errs.push(`Paso "${s.nombre || k}": ${e.message}`); }
    });
    if (!seen.has("costo")) errs.push('Falta un paso llamado "costo"');
    if (!seen.has("precio")) errs.push('Falta un paso llamado "precio"');
    return errs;
  }

  /** Parámetros de una compra a partir de la configuración (copia congelada). */
  function paramsFor(cfg, lineKey) {
    const L = cfg.lines[lineKey];
    const perfiles = {};
    (L.perfiles || []).forEach((k) => {
      const pf = cfg.profiles.find((p) => p.key === k);
      if (pf) perfiles[k] = { ...pf };
    });
    return {
      costo: L.costo,
      moneda: L.moneda,
      mat: L.mat,
      tc: cfg.tc,
      iva: cfg.iva,
      rounding: cfg.rounding,
      aduana: L.aduana,
      margenes: [...L.margenes],
      viaje: L.viaje,
      pasarela: L.pasarela,
      shopify: L.shopify,
      perfiles,
      perfilDefault: (L.perfiles || [])[0] || null,
      formula: JSON.parse(JSON.stringify(L.formula && L.formula.steps && L.formula.steps.length ? L.formula : defaultFormula(L.costo, L.margenes.length)))
    };
  }

  /** Cálculo completo de una pieza siguiendo la fórmula. it: {peso, bruto, perfil, precioManual}; p: params de la compra. */
  function calc(it, p) {
    const r = { ok: false, falta: [], steps: [] };
    const F = formulaOf(p); const m = p.margenes || [];
    const env = { peso: num(it.peso), bruto: num(it.bruto), tc: num(p.tc), iva: num(p.iva) ?? 19, aduana: num(p.aduana) || 0, margen1: num(m[0]) || 0, margen2: num(m[1]) || 0, viaje: num(p.viaje) || 0, pasarela: num(p.pasarela) || 0, shopify: num(p.shopify) || 0 };
    const pf = p.costo === "banho" ? (p.perfiles || {})[it.perfil || p.perfilDefault] : null;
    FX_BUILTINS.filter((b) => b.grupo === "perfil").forEach((b) => (env[b.key] = pf ? num(pf[b.campo]) : null));
    (F.vars || []).forEach((v) => { const k = normKey(v.key); if (k) env[k] = num(v.valor); });
    const faltaDe = { peso: "peso", bruto: "bruto" }; FX_BUILTINS.filter((b) => b.grupo === "perfil").forEach((b) => (faltaDe[b.key] = "perfil de baño"));
    for (const s of F.steps || []) {
      const key = normKey(s.key); const row = { key, nombre: s.nombre || key, expr: s.expr, fmt: s.fmt || "clp", val: null, err: null };
      try {
        const { ast, refs } = fxParse(s.expr);
        refs.forEach((x) => { if (faltaDe[x] && (env[x] === null || env[x] === undefined) && !r.falta.includes(faltaDe[x])) r.falta.push(faltaDe[x]); });
        const v = fxEval(ast, env); if (!isFinite(v)) throw new Error("el resultado no es un número");
        row.val = v; if (key) env[key] = v;
      } catch (e) { row.err = e.message; if (key) env[key] = undefined; }
      r.steps.push(row);
    }
    const ok = (k) => typeof env[k] === "number" && isFinite(env[k]);
    if (!ok("costo") || !ok("precio")) { if (!r.falta.length) r.falta.push("revisar la fórmula en Ajustes"); return r; }
    r.env = env;
    r.valorKg = env.valor_kg; r.banoBRL = env.bano; r.piezaBRL = env.pieza_brl; r.costoBase = env.costo_base;
    r.costo = env.costo; r.aduana = ok("costo_base") ? env.costo - env.costo_base : 0;
    r.mayorista = ok("mayorista") ? env.mayorista : null; r.minorista = ok("minorista") ? env.minorista : null;
    r.viaje = ok("gasto_viaje") ? env.gasto_viaje : 0; r.pasarela = ok("comision_mp") ? env.comision_mp : 0; r.shopify = ok("comision_shopify") ? env.comision_shopify : 0;
    r.bruto = env.precio;
    r.sugerido = roundPrice(env.precio, p.rounding);
    const manual = num(it.precioManual);
    r.final = manual !== null && manual > 0 ? manual : r.sugerido;
    r.manual = manual !== null && manual > 0;
    // utilidad aprox. por unidad: precio sin IVA menos costo, viaje y comisiones
    const iva = env.iva / 100; const sinIva = r.final / (1 + iva);
    r.utilidad = sinIva - r.costo - r.viaje - r.final * (env.pasarela + env.shopify) / 100;
    r.margenReal = sinIva > 0 ? r.utilidad / sinIva : null;
    r.ok = true;
    return r;
  }

  function makeCode(cfg, tipo, mat, n) {
    return (cfg.codeFormat || "{TIPO}-{MAT}-{NUM}")
      .replace("{TIPO}", tipo)
      .replace("{MAT}", mat)
      .replace("{NUM}", String(n).padStart(num(cfg.numDigits) || 3, "0"));
  }
  const counterKey = (tipo, mat) => tipo + "-" + mat;

  /** Vista previa de códigos para los ítems sin código, sin consumir correlativos. */
  function previewCodes(cfg, counters, items, mat) {
    const next = { ...counters };
    const out = {};
    items.forEach((it) => {
      if (it.code || !it.tipo) return;
      const k = counterKey(it.tipo, it.mat || mat);
      next[k] = (num(next[k]) || 0) + 1;
      out[it.id] = makeCode(cfg, it.tipo, it.mat || mat, next[k]);
    });
    return { codes: out, counters: next };
  }

  return { DEFAULT_CONFIG, num, roundPrice, valorKg, paramsFor, calc, makeCode, counterKey, previewCodes, normKey, fxParse, fxCheck, defaultFormula, formulaOf, FX_BUILTINS, FX_FUNCS };
})();
if (typeof module !== "undefined") module.exports = PB;
