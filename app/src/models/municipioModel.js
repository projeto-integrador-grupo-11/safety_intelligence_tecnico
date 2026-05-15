var database = require("../database/config");

function listar() {
  var instrucaoSql = `
    SELECT id, nome, idhm_geral, renda, educacao, longevidade
    FROM municipio
    ORDER BY idhm_geral DESC, nome ASC
  `;

  return database.executar(instrucaoSql);
}

module.exports = { listar };
