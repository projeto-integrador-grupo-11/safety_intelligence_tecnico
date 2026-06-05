var database = require("../database/config");

function buscarPorEmail(email) {
    var instrucaoSql = `
        SELECT u.idUsuario AS id_usuario, u.nome, u.email, u.senha,
               COALESCE(c.autenticacao2FA, 0) AS autenticacao2FA
        FROM usuario u
        LEFT JOIN configuracoes_usuario c ON c.fkUsuario = u.idUsuario
        WHERE u.email = ?
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

function salvarTokenReset(email, tokenHash, expiraEm) {
    var instrucaoSql = `
        UPDATE usuario
        SET token_reset = ?, token_reset_expira_em = ?
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [tokenHash, expiraEm, email]);
}

function buscarPorTokenReset(tokenHash) {
    var instrucaoSql = `
        SELECT idUsuario AS id_usuario, nome, email
        FROM usuario
        WHERE token_reset = ? AND token_reset_expira_em > NOW()
    `;
    return database.executar(instrucaoSql, [tokenHash]);
}

function limparTokenReset(idUsuario) {
    var instrucaoSql = `
        UPDATE usuario
        SET token_reset = NULL, token_reset_expira_em = NULL
        WHERE idUsuario = ?
    `;
    return database.executar(instrucaoSql, [idUsuario]);
}

// Recuperacao de senha por CODIGO: o hash do codigo fica em token_reset.
// Exige o e-mail para que o codigo so valha para a conta que o solicitou.
function buscarPorCodigoRecuperacao(email, codigoHash) {
    var instrucaoSql = `
        SELECT idUsuario AS id_usuario, nome, email
        FROM usuario
        WHERE email = ? AND token_reset = ? AND token_reset_expira_em > NOW()
    `;
    return database.executar(instrucaoSql, [email, codigoHash]);
}

// ===== Autenticacao em dois fatores (2FA) =====

// Guarda o hash do codigo 2FA e sua validade para o e-mail informado.
function salvarCodigo2Fa(email, codigoHash, expiraEm) {
    var instrucaoSql = `
        UPDATE usuario
        SET codigo_2fa = ?, codigo_2fa_expira_em = ?
        WHERE email = ?
    `;
    return database.executar(instrucaoSql, [codigoHash, expiraEm, email]);
}

// Busca o usuario cujo codigo 2FA bate com o hash e ainda nao expirou.
function buscarPorCodigo2Fa(email, codigoHash) {
    var instrucaoSql = `
        SELECT idUsuario AS id_usuario, nome, email
        FROM usuario
        WHERE email = ? AND codigo_2fa = ? AND codigo_2fa_expira_em > NOW()
    `;
    return database.executar(instrucaoSql, [email, codigoHash]);
}

// Limpa o codigo 2FA depois de usado (ou ao reenviar).
function limparCodigo2Fa(idUsuario) {
    var instrucaoSql = `
        UPDATE usuario
        SET codigo_2fa = NULL, codigo_2fa_expira_em = NULL
        WHERE idUsuario = ?
    `;
    return database.executar(instrucaoSql, [idUsuario]);
}

// Le a preferencia de 2FA do usuario (0/1).
function buscar2FA(idUsuario) {
    var instrucaoSql = `
        SELECT COALESCE(autenticacao2FA, 0) AS autenticacao2FA
        FROM configuracoes_usuario
        WHERE fkUsuario = ?
    `;
    return database.executar(instrucaoSql, [idUsuario]);
}

// Ativa/desativa o 2FA, criando a linha de configuracao se ainda nao existir.
function configurar2FA(idUsuario, ativo) {
    var instrucaoSql = `
        INSERT INTO configuracoes_usuario (fkUsuario, autenticacao2FA)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE autenticacao2FA = ?
    `;
    return database.executar(instrucaoSql, [idUsuario, ativo, ativo]);
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
    salvarTokenReset,
    buscarPorTokenReset,
    limparTokenReset,
    buscarPorCodigoRecuperacao,
    salvarCodigo2Fa,
    buscarPorCodigo2Fa,
    limparCodigo2Fa,
    buscar2FA,
    configurar2FA,
    excluirUsuario,
    excluirConfiguracoes,
    excluirFavoritos,
    configSlack,
    desativarSlack,
    buscarSlack,
    uploadFoto,
    buscarFoto
};
