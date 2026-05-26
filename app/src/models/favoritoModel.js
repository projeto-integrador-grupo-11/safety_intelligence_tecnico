var database = require("../database/config");

function listarPorUsuario(idUsuario) {
  var instrucaoSql = `
    SELECT
      idFavoritos AS id_favorito,
      fkMunicipio AS fk_municipio,
      nomeMunicipio AS nome_municipio,
      uf,
      nomeEstado AS nome_estado,
      idhm_geral
    FROM lista_favoritos
    WHERE fkUsuarios_favoritos = ?
    ORDER BY nomeMunicipio ASC
  `;
  return database.executar(instrucaoSql, [idUsuario]);
}

function adicionar(idUsuario, dados) {
  var instrucaoSql = `
    INSERT INTO lista_favoritos
      (fkUsuarios_favoritos, fkMunicipio, nomeMunicipio, uf, nomeEstado, idhm_geral)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  return database.executar(instrucaoSql, [
    idUsuario,
    dados.fkMunicipio,
    dados.nomeMunicipio,
    dados.uf,
    dados.nomeEstado,
    dados.idhmGeral,
  ]);
}

function removerPorId(idUsuario, idFavorito) {
  var instrucaoSql = `
    DELETE FROM lista_favoritos
    WHERE idFavoritos = ? AND fkUsuarios_favoritos = ?
  `;
  return database.executar(instrucaoSql, [idFavorito, idUsuario]);
}

function removerPorCidade(idUsuario, uf, nomeMunicipio) {
  var instrucaoSql = `
    DELETE FROM lista_favoritos
    WHERE fkUsuarios_favoritos = ?
      AND uf = ?
      AND nomeMunicipio = ?
  `;
  return database.executar(instrucaoSql, [idUsuario, uf, nomeMunicipio]);
}

function removerPorMunicipio(idUsuario, fkMunicipio) {
  var instrucaoSql = `
    DELETE FROM lista_favoritos
    WHERE fkUsuarios_favoritos = ?
      AND fkMunicipio = ?
  `;
  return database.executar(instrucaoSql, [idUsuario, fkMunicipio]);
}

module.exports = {
  listarPorUsuario,
  adicionar,
  removerPorId,
  removerPorCidade,
  removerPorMunicipio,
};
