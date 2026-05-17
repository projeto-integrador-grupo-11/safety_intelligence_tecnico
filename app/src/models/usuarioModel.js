var database = require("../database/config")

function autenticar(email, senha) {
    console.log("ACESSEI O USUARIO MODEL \n \n\t\t >> Se aqui der erro de 'Error: connect ECONNREFUSED',\n \t\t >> verifique suas credenciais de acesso ao banco\n \t\t >> e se o servidor de seu BD está rodando corretamente. \n\n function entrar(): ", email, senha)
    var instrucaoSql = `
        SELECT idUsuario, senha, email FROM usuario WHERE email = '${email}' AND senha = '${senha}';
    `;
    console.log("Executando a instrução SQL: \n" + instrucaoSql);
    return database.executar(instrucaoSql);
}

// Coloque os mesmos parâmetros aqui. Vá para a var instrucaoSql
function cadastrar(email, senha) {
    console.log("ACESSEI O USUARIO MODEL \n \n\t\t >> Se aqui der erro de 'Error: connect ECONNREFUSED',\n \t\t >> verifique suas credenciais de acesso ao banco\n \t\t >> e se o servidor de seu BD está rodando corretamente. \n\n function cadastrar():",email, senha);
    
    // Insira exatamente a query do banco aqui, lembrando da nomenclatura exata nos valores
    //  e na ordem de inserção dos dados.
    var instrucaoSql = `INSERT INTO usuario (email, senha)
        VALUES ('${email}', '${senha}');
    `;
    console.log("Executando a instrução SQL: \n" + instrucaoSql);
    return database.executar(instrucaoSql);
}

function trocarSenha(novaSenha, email, senhaAtual){

    var instrucaoSql0 = `SELECT senha FROM usuario WHERE email = '${email}'`;

    return database.executar(instrucaoSql0)
        .then(function(senhaBanco){

            if (senhaBanco[0].senha == senhaAtual){

                var instrucaoSql = `
                    UPDATE usuario
                    SET senha = '${novaSenha}'
                    WHERE email = '${email}'
                `;

                console.log("Executando a instrução SQL: \n" + instrucaoSql);
                return database.executar(instrucaoSql);
            }

            return false;
        });
}

module.exports = {
    autenticar,
    cadastrar,
    trocarSenha
};