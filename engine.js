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
      perfilDefault: (L.perfiles || [])[0] || null
    };
  }

  /** Cálculo completo de una pieza. it: {peso, bruto, perfil, precioManual}; p: params de la compra. */
  function calc(it, p) {
    const r = { ok: false, falta: [] };
    const tc = num(p.tc), ad = num(p.aduana) || 0, iva = (num(p.iva) ?? 19) / 100;
    const bruto = num(it.bruto), peso = num(it.peso);
    let costoBase = null;
    if (p.costo === "banho") {
      const pf = p.perfiles[it.perfil || p.perfilDefault];
      r.valorKg = valorKg(pf);
      if (peso === null) r.falta.push("peso");
      if (bruto === null) r.falta.push("bruto");
      if (!pf) r.falta.push("perfil");
      if (r.falta.length) return r;
      r.banoBRL = (r.valorKg / 1000) * peso;
      r.piezaBRL = r.banoBRL + bruto;
      costoBase = r.piezaBRL * tc;
    } else if (p.costo === "brl") {
      if (bruto === null) { r.falta.push("precio R$"); return r; }
      r.piezaBRL = bruto;
      costoBase = bruto * tc;
    } else {
      if (bruto === null) { r.falta.push("costo"); return r; }
      costoBase = bruto;
    }
    r.costoBase = costoBase;
    r.aduana = costoBase * ad / 100;
    r.costo = costoBase + r.aduana;
    const m = (p.margenes || []).map((x) => num(x) / 100);
    let neto = r.costo;
    if (m.length >= 2) {
      r.neto1 = neto = neto / (1 - m[0]);
      r.mayorista = r.neto1 * (1 + iva);
      neto = neto / (1 - m[1]);
    } else if (m.length === 1) {
      neto = neto / (1 - m[0]);
    }
    r.neto = neto;
    r.minorista = neto * (1 + iva);
    r.viaje = r.costo * (num(p.viaje) || 0) / 100;
    r.pasarela = r.minorista * (num(p.pasarela) || 0) / 100;
    r.shopify = r.minorista * (num(p.shopify) || 0) / 100;
    r.bruto = r.minorista + r.viaje + r.pasarela + r.shopify;
    r.sugerido = roundPrice(r.bruto, p.rounding);
    const manual = num(it.precioManual);
    r.final = manual !== null && manual > 0 ? manual : r.sugerido;
    r.manual = manual !== null && manual > 0;
    // utilidad aprox. por unidad: precio sin IVA menos costo, viaje y comisiones
    const sinIva = r.final / (1 + iva);
    r.utilidad = sinIva - r.costo - r.viaje - r.final * ((num(p.pasarela) || 0) + (num(p.shopify) || 0)) / 100;
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

  return { DEFAULT_CONFIG, num, roundPrice, valorKg, paramsFor, calc, makeCode, counterKey, previewCodes };
})();
if (typeof module !== "undefined") module.exports = PB;
