var database = require("../database/config");

function listar() {
  var instrucaoSql = `
    SELECT id, nome, idhm_geral, renda, educacao, longevidade
    FROM municipio
    ORDER BY idhm_geral DESC, nome ASC
  `;

  return database.executar(instrucaoSql);
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
    "SELECT id, nome, idhm_geral, renda, educacao, longevidade FROM municipio WHERE id = " +
    n +
    " LIMIT 1";
  return database.executar(instrucaoSql);
}

function buscarPorNome(nome) {
  var trimmed = String(nome || "").trim();
  var safe = escaparSql(trimmed);
  if (!safe) {
    return Promise.resolve([]);
  }
  var cond = "nome = '" + safe + "'";
  if (!/\(SP\)/i.test(trimmed)) {
    cond += " OR nome = '" + escaparSql(trimmed + " (SP)") + "'";
  }
  var instrucaoSql =
    "SELECT id, nome, idhm_geral, renda, educacao, longevidade FROM municipio WHERE " +
    cond +
    " LIMIT 1";
  return database.executar(instrucaoSql);
}

module.exports = { listar, buscarPorId, buscarPorNome };
