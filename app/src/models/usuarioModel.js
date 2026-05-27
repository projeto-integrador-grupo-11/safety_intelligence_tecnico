var database = require("../database/config");

function buscarPorEmail(email) {
    var instrucaoSql = `
        SELECT idUsuario AS id_usuario,nome, email, senha
        FROM usuario
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [email]);
}

function cadastrar(nome,email,senhaHash) {
    var instrucaoSql = `
        INSERT INTO usuario (nome,email,senha)
        VALUES (?, ?, ?)
    `;
    return database.executar(instrucaoSql, [nome,email,senhaHash]);
}
    
function atualizarSenha(novaSenhaHash, email) {
    var instrucaoSql = `
        UPDATE usuario
        SET senha = ?
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [novaSenhaHash, email]);
}

function excluirFavoritos(idUsuario) {

    var instrucaoSql = `
        DELETE FROM lista_favoritos
        WHERE fkUsuarios_favoritos = ${idUsuario};
    `;

    return database.executar(instrucaoSql);
}

function excluirConfiguracoes(idUsuario) {

    var instrucaoSql = `
        DELETE FROM configuracoes_usuario
        WHERE fkUsuario = ${idUsuario};
    `;

    return database.executar(instrucaoSql);
}

function excluirUsuario(idUsuario) {

    var instrucaoSql = `
        DELETE FROM usuario
        WHERE idUsuario = ${idUsuario};
    `;

    return database.executar(instrucaoSql);
}

function configSlack(idUsuario, nome, slackId, notificacao) {

    var instrucaoSql = `

        INSERT INTO configuracoes_usuario
        (   
            fkUsuario,
            nomeCompleto,
            notificacao,
            idSlack
        )

        VALUES
        (
            ${idUsuario},
            '${nome}',
            ${notificacao},
            '${slackId}'
        )

        ON DUPLICATE KEY UPDATE

            nomeCompleto = '${nome}',
            notificacao = ${notificacao},
            idSlack = '${slackId}';

    `;

    return database.executar(instrucaoSql);

}

function desativarSlack(idUsuario) {

    var instrucaoSql = `

        UPDATE configuracoes_usuario
        SET notificacao = false
        WHERE fkUsuario = ${idUsuario};

    `;

    console.log(instrucaoSql);

    return database.executar(instrucaoSql);

}

function buscarSlack(idUsuario) {

    var instrucaoSql = `

        SELECT *
        FROM configuracoes_usuario
        WHERE fkUsuario = ${idUsuario};

    `;

    return database.executar(instrucaoSql);


}


function uploadFoto(idUsuario, foto) {

    const instrucaoSql = `

        INSERT INTO configuracoes_usuario (fkUsuario, fotoPerfil)
        VALUES (${idUsuario}, '${foto}')
        ON DUPLICATE KEY UPDATE
        fotoPerfil = '${foto}';

    `;

    return database.executar(instrucaoSql);
}

function buscarFoto(idUsuario) {

    const instrucaoSql = `

        SELECT fotoPerfil
        FROM configuracoes_usuario
        WHERE fkUsuario = ${idUsuario};

    `;

    return database.executar(instrucaoSql);

}


module.exports = {
    buscarPorEmail,
    cadastrar,
    atualizarSenha,
    excluirUsuario,
    excluirConfiguracoes,
    excluirFavoritos,
    configSlack,
    desativarSlack,
    buscarSlack,
    uploadFoto,
    buscarFoto
};
