var database = require("../database/config");

function listar() {
  var instrucaoSql = `
    SELECT id, uf, nome, idhm_geral, renda, educacao, longevidade
    FROM municipio
    ORDER BY idhm_geral DESC, nome ASC
  `;

  return database.executar(instrucaoSql);
}

function listarPorUf(uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  var instrucaoSql = `
    SELECT id, uf, nome, idhm_geral, renda, educacao, longevidade
    FROM municipio
    WHERE uf = ?
    ORDER BY idhm_geral DESC, nome ASC
  `;

  return database.executar(instrucaoSql, [ufNorm]);
}

function escaparSql(str) {
  return String(str || "").replace(/'/g, "''");
}

function buscarPorId(id) {
  var n = parseInt(id, 10);
  if (isNaN(n) || n < 1) {
    return Promise.resolve([]);
  }
  var instrucaoSql =
    "SELECT id, uf, nome, idhm_geral, renda, educacao, longevidade FROM municipio WHERE id = " +
    n +
    " LIMIT 1";
  return database.executar(instrucaoSql);
}

function buscarPorNome(nome) {
  return buscarPorNomeUf(nome, "SP");
}

function topPorCampo(campo) {
  var camposValidos = {
    idhm_geral: 1,
    longevidade: 1,
    educacao: 1,
    renda: 1,
  };
  if (!camposValidos[campo]) {
    return Promise.resolve(null);
  }
  var sql =
    "SELECT id, uf, nome, " +
    campo +
    " AS valor FROM municipio WHERE " +
    campo +
    " IS NOT NULL ORDER BY " +
    campo +
    " DESC, nome ASC LIMIT 1";
  return database.executar(sql).then(function (rows) {
    return rows && rows.length ? rows[0] : null;
  });
}

function buscarReferenciasNacionais() {
  return Promise.all([
    topPorCampo("idhm_geral"),
    topPorCampo("longevidade"),
    topPorCampo("educacao"),
    topPorCampo("renda"),
  ]).then(function (resultados) {
    return {
      idhm_geral: resultados[0],
      longevidade: resultados[1],
      educacao: resultados[2],
      renda: resultados[3],
    };
  });
}

function buscarPorNomeUf(nome, uf) {
  var trimmed = String(nome || "").trim();
  var safe = escaparSql(trimmed);
  var ufNorm = String(uf || "SP").trim().toUpperCase();
  if (!safe) {
    return Promise.resolve([]);
  }
  var cond = "nome = '" + safe + "'";
  if (!/\([A-Z]{2}\)/i.test(trimmed)) {
    cond += " OR nome = '" + escaparSql(trimmed + " (" + ufNorm + ")") + "'";
  }
  var instrucaoSql =
    "SELECT id, uf, nome, idhm_geral, renda, educacao, longevidade FROM municipio WHERE uf = '" +
    escaparSql(ufNorm) +
    "' AND (" +
    cond +
    ") LIMIT 1";
  return database.executar(instrucaoSql);
}

module.exports = {
  listar,
  listarPorUf,
  buscarPorId,
  buscarPorNome,
  buscarPorNomeUf,
  buscarReferenciasNacionais,
};
