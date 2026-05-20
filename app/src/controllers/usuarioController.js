var usuarioModel = require("../models/usuarioModel");
var autenticacao = require("../middlewares/autenticarJwt");

function autenticar(req, res) {
    var email = req.body.emailServer;
    var senha = req.body.senhaServer;

    if (email == undefined) {
        res.status(400).send("Seu email está undefined!");
    } else if (senha == undefined) {
        res.status(400).send("Sua senha está indefinida!");
    } else {

        usuarioModel.autenticar(email, senha)
            .then(function (resultadoAutenticar) {

                if (resultadoAutenticar.length === 1) {

                    const usuario = resultadoAutenticar[0];
                    const token = autenticacao.gerarToken(usuario);

                    res.json({
                        id: usuario.id_usuario,
                        email: usuario.email,
                        nome: usuario.nome_usuario,
                        empresaId: usuario.empresaId,
                        privilegio: usuario.privilegio,
                        token: token
                    });

                } else if (resultadoAutenticar.length === 0) {

                    res.status(403).send("Email e/ou senha inválido(s)");

                } else {
                    res.status(403).send("Mais de um usuário com o mesmo login e senha!");
                }

            })
            .catch(function (erro) {
                console.log("\nHouve um erro ao realizar o login!", erro.sqlMessage);
                res.status(500).json(erro.sqlMessage);
            });
    }
}
function cadastrar(req, res) {
    // Crie uma variável que vá recuperar os valores do arquivo cadastro.html
    var nome = req.body.nomeServer;
    var email = req.body.emailServer;
    var senha = req.body.senhaServer;
    //  var empresaId = req.body.empresaIdServer; 

    // Faça as validações dos valores
    if (email == undefined) {
        res.status(400).send("Seu email está undefined!");
    } else if (senha == undefined) {
        res.status(400).send("Sua senha está undefined!");
    } else {
        // Passe os valores como parâmetro e vá para o arquivo usuarioModel.js
        usuarioModel.cadastrar(email, senha)
            .then(
                function (resultado) {
                    res.json(resultado);
                }
            ).catch(
                function (erro) {
                    console.log(erro);
                    console.log(
                        "\nHouve um erro ao realizar o cadastro! Erro: ",
                        erro.sqlMessage
                    );
                    res.status(500).json(erro.sqlMessage);
                }
            );
    }
}

function trocarSenha(req, res){
    
    var senhaAtual = req.body.senhaServer;
    var novaSenha = req.body.novaSenhaServer;
    var email = req.body.emailServer;

    if (senhaAtual == undefined) {
        res.status(400).send("Sua senha atual está undefined!");

    } else if (novaSenha == undefined) {
        res.status(400).send("Sua nova senha está undefined!");

    } else if (email == undefined) {
        res.status(400).send("Seu email está undefined!");

    } else {

        usuarioModel.trocarSenha(novaSenha, email, senhaAtual)
            .then(
                function (resultado) {

                    if (resultado == false){
                        res.status(401).send("Senha atual incorreta");
                    } else {
                        res.json(resultado);
                    }
                }
            ).catch(
                function (erro) {
                    console.log(erro);
                    console.log("\nHouve um erro ao atualizar a senha! Erro: ",erro.sqlMessage);
                    res.status(500).json("Erro interno do servidor");
                }
            );
    }
}

module.exports = {
    autenticar,
    cadastrar,
    trocarSenha
}