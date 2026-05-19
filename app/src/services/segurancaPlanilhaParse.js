"use strict";

var XLSX = require("xlsx");

var EVENTO_LATROCINIO = "Roubo seguido de morte (latrocínio)";
var EVENTO_HOMICIDIO = "Homicídio doloso";

var READ_OPTS = {
  type: "buffer",
  cellNF: false,
  cellStyles: false,
  bookVBA: false,
};

function limparNome(nome) {
  return String(nome || "")
    .trim()
    .replace(/\s+/g, " ");
}

function chaveNome(nome) {
  return limparNome(nome)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function eventoParaSlug(eventoStr) {
  if (eventoStr === EVENTO_LATROCINIO) return "latrocinio";
  if (eventoStr === EVENTO_HOMICIDIO) return "homicidio";
  return null;
}

function mesReferencia(serial) {
  if (serial == null || serial === "") return null;
  var d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y || !d.m) return null;
  return d.y + "-" + String(d.m).padStart(2, "0");
}

function parseVitima(valor) {
  var n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function processarLinhaSeguranca(mapa, row, ufNorm, prefixoAno) {
  if (!row) return;

  var slug = eventoParaSlug(row[2]);
  if (!slug) return;

  var uf = String(row[0] || "")
    .trim()
    .toUpperCase();
  if (ufNorm && uf !== ufNorm) return;

  var nome = String(row[1] || "").trim();
  if (!nome) return;

  var key = chaveNome(nome);
  if (!key) return;

  var ref = mesReferencia(row[3]);
  var qtd = parseVitima(row[10]);
  if (qtd <= 0) qtd = parseVitima(row[11]);

  if (!mapa[key]) {
    mapa[key] = {};
  }
  if (!mapa[key][slug]) {
    mapa[key][slug] = { total: 0, porMes: {} };
  }
  if (ref && ref.indexOf(prefixoAno) === 0) {
    mapa[key][slug].porMes[ref] =
      (mapa[key][slug].porMes[ref] || 0) + qtd;
    mapa[key][slug].total += qtd;
  }
}

function parsePlanilhaSeguranca(linhas, ufFiltro, anoRef) {
  var mapa = {};
  var ufNorm = ufFiltro ? String(ufFiltro).trim().toUpperCase() : null;
  var prefixoAno = String(anoRef) + "-";

  for (var i = 1; i < linhas.length; i++) {
    processarLinhaSeguranca(mapa, linhas[i], ufNorm, prefixoAno);
  }

  return mapa;
}

function parseBufferToMapa(buffer, uf, ano) {
  var workbook = XLSX.read(buffer, READ_OPTS);
  var anoStr = String(ano);
  var nomeAba =
    workbook.SheetNames.indexOf(anoStr) >= 0
      ? anoStr
      : workbook.SheetNames[0];
  var sheet = workbook.Sheets[nomeAba];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parsePlanilhaSeguranca(linhas, uf, ano);
}

module.exports = {
  parseBufferToMapa,
};
