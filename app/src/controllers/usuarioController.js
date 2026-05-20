var bcrypt = require("bcryptjs");

var usuarioModel = require("../models/usuarioModel");
var autenticacao = require("../middlewares/autenticarJwt");

var SALT_ROUNDS = 10;

function isBcryptHash(valor) {
    return typeof valor === "string" && /^\$2[aby]\$/.test(valor);
}

function autenticar(req, res) {
    var email = req.body.emailServer;
    var senha = req.body.senhaServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (senha == undefined) {
        return res.status(400).send("Sua senha está indefinida!");
    }

    usuarioModel.buscarPorEmail(email)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(403).send("Email e/ou senha inválido(s)");
            }
            if (resultado.length > 1) {
                return res.status(403).send("Mais de um usuário com o mesmo email!");
            }

            var usuario = resultado[0];
            var senhaArmazenada = usuario.senha;

            var verificacao = isBcryptHash(senhaArmazenada)
                ? bcrypt.compare(senha, senhaArmazenada)
                : Promise.resolve(senhaArmazenada === senha);

            verificacao.then(function (senhaCorreta) {
                if (!senhaCorreta) {
                    return res.status(403).send("Email e/ou senha inválido(s)");
                }

                var token = autenticacao.gerarToken(usuario);

                res.json({
                    id: usuario.id_usuario,
                    email: usuario.email,
                    nome: usuario.nome_usuario,
                    empresaId: usuario.empresaId,
                    privilegio: usuario.privilegio,
                    token: token
                });
            }).catch(function (erro) {
                console.log("\nHouve um erro ao verificar a senha!", erro.message || erro);
                res.status(500).json("Erro interno do servidor");
            });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao realizar o login!", erro.sqlMessage || erro.message || erro);
            res.status(500).json(erro.sqlMessage || erro.message || "Erro interno do servidor");
        });
}

function cadastrar(req, res) {
    var email = req.body.emailServer;
    var senha = req.body.senhaServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (senha == undefined) {
        return res.status(400).send("Sua senha está undefined!");
    }

    bcrypt.hash(senha, SALT_ROUNDS)
        .then(function (senhaHash) {
            return usuarioModel.cadastrar(email, senhaHash);
        })
        .then(function (resultado) {
            res.json({ id: resultado.insertId });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao realizar o cadastro!", erro.sqlMessage || erro.message || erro);
            res.status(500).json(erro.sqlMessage || erro.message || "Erro interno do servidor");
        });
}

function trocarSenha(req, res) {
    var senhaAtual = req.body.senhaServer;
    var novaSenha = req.body.novaSenhaServer;
    var email = req.body.emailServer;

    if (senhaAtual == undefined) {
        return res.status(400).send("Sua senha atual está undefined!");
    }
    if (novaSenha == undefined) {
        return res.status(400).send("Sua nova senha está undefined!");
    }
    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }

    usuarioModel.buscarPorEmail(email)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(404).send("Usuário não encontrado");
            }

            var senhaArmazenada = resultado[0].senha;
            var verificacao = isBcryptHash(senhaArmazenada)
                ? bcrypt.compare(senhaAtual, senhaArmazenada)
                : Promise.resolve(senhaArmazenada === senhaAtual);

            return verificacao.then(function (senhaCorreta) {
                if (!senhaCorreta) {
                    return res.status(401).send("Senha atual incorreta");
                }
                return bcrypt.hash(novaSenha, SALT_ROUNDS).then(function (novoHash) {
                    return usuarioModel.atualizarSenha(novoHash, email).then(function () {
                        res.json({ atualizada: true });
                    });
                });
            });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao atualizar a senha!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

module.exports = {
    autenticar,
    cadastrar,
    trocarSenha
};
