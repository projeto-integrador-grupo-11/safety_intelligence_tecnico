var database = require("../database/config");

function buscarPorEmail(email) {
    var instrucaoSql = `
        SELECT idUsuario AS id_usuario, email, senha
        FROM usuario
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [email]);
}

function cadastrar(email, senhaHash) {
    var instrucaoSql = `
        INSERT INTO usuario (email, senha)
        VALUES (?, ?)
    `;
    return database.executar(instrucaoSql, [email, senhaHash]);
}

function atualizarSenha(novaSenhaHash, email) {
    var instrucaoSql = `
        UPDATE usuario
        SET senha = ?
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [novaSenhaHash, email]);
}

function excluir(idUsuario) {

    var instrucaoSql = `
        DELETE FROM usuario
        WHERE idUsuario = ${idUsuario};
    `;

    return database.executar(instrucaoSql);
}

module.exports = {
    buscarPorEmail,
    cadastrar,
    atualizarSenha,
    excluir
};
