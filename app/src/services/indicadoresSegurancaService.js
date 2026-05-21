"use strict";

var database = require("../database/config");
var populacaoS3Service = require("./populacaoS3Service");

var TIPO_ROUBO_VEICULO = "Roubo de veículo";
var TIPO_FURTO_VEICULO = "Furto de veículo";
var FONTE = "Dados Nacionais de Segurança Pública do Governo Federal";

var TIPOS_POR_SLUG = {
  rouboVeiculo: TIPO_ROUBO_VEICULO,
  furtoVeiculo: TIPO_FURTO_VEICULO,
};

function montarResposta(ufNorm, anoNum, porAno, tipoLabel) {
  var anos = Object.keys(porAno)
    .map(function (a) {
      return parseInt(a, 10);
    })
    .filter(function (a) {
      return Number.isFinite(a);
    })
    .sort(function (a, b) {
      return a - b;
    });

  var anual = anos.map(function (a) {
    return { ano: a, valor: Math.round(porAno[a] || 0) };
  });

  var anoAnterior = anoNum - 1;
  return {
    uf: ufNorm,
    ano: anoNum,
    total: Math.round(porAno[anoNum] || 0),
    anoAnterior: anoAnterior,
    totalAnterior: Math.round(porAno[anoAnterior] || 0),
    anual: anual,
    tipo: tipoLabel,
    fonte: FONTE,
  };
}

function totalPorTipoEstado(slug, uf, ano) {
  var ufNorm = String(uf || "")
    .trim()
    .toUpperCase();
  var anoNum = parseInt(ano, 10);
  var tipoLabel = TIPOS_POR_SLUG[slug];

  if (!tipoLabel) {
    return Promise.reject(new Error("Tipo de indicador inválido."));
  }
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida."));
  }
  if (!Number.isFinite(anoNum)) {
    return Promise.reject(new Error("Ano inválido."));
  }

  var sql =
    "SELECT ano, SUM(quantidade) AS total " +
    "FROM indicador_seguranca " +
    "WHERE uf = ? AND tipo = ? " +
    "GROUP BY ano " +
    "ORDER BY ano ASC";

  return database
    .executar(sql, [ufNorm, tipoLabel])
    .then(function (rows) {
      var porAno = {};
      (rows || []).forEach(function (row) {
        porAno[row.ano] = Number(row.total) || 0;
      });
      return montarResposta(ufNorm, anoNum, porAno, tipoLabel);
    });
}

function totalRouboVeiculoEstado(uf, ano) {
  return totalPorTipoEstado("rouboVeiculo", uf, ano);
}

function totalFurtoVeiculoEstado(uf, ano) {
  return totalPorTipoEstado("furtoVeiculo", uf, ano);
}

module.exports = {
  totalRouboVeiculoEstado,
  totalFurtoVeiculoEstado,
  TIPO_ROUBO_VEICULO,
  TIPO_FURTO_VEICULO,
};
