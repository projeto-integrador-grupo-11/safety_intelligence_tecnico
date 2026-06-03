var bcrypt = require("bcryptjs");
var crypto = require("crypto");

var usuarioModel = require("../models/usuarioModel");
var autenticacao = require("../middlewares/autenticarJwt");

var SALT_ROUNDS = 10;
var RESET_EXPIRA_MS = 60 * 60 * 1000; // 1 hora

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
                    nome: usuario.nome,
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
    var nome = req.body.nomeServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (senha == undefined) {
        return res.status(400).send("Sua senha está undefined!");
    }

    if (nome == undefined) {
        return res.status(400).send("Seu nome está undefined!");

    }
    bcrypt.hash(senha, SALT_ROUNDS)
        .then(function (senhaHash) {
            return usuarioModel.cadastrar(nome, email, senhaHash);
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

// Passo 1: usuário esqueceu a senha -> gera token, salva e pede para o serviço Java enviar o e-mail.
function esqueceuSenha(req, res) {
    var email = req.body.emailServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }

    usuarioModel.buscarPorEmail(email)
        .then(function (resultado) {
            // Resposta genérica mesmo se o e-mail não existir (evita enumeração de usuários)
            if (!resultado || resultado.length === 0) {
                return res.json({ enviado: true });
            }

            var usuario = resultado[0];
            var token = crypto.randomBytes(32).toString("hex");
            var tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            var expiraEm = new Date(Date.now() + RESET_EXPIRA_MS);

            return usuarioModel.salvarTokenReset(email, tokenHash, expiraEm)
                .then(function () {
                    var base = process.env.RESET_URL_BASE;
                    var link = base + (base.indexOf("?") >= 0 ? "&" : "?") + "token=" + token;

                    return fetch(process.env.EMAIL_SERVICE_URL + "/emails/recuperacao-senha", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-API-Key": process.env.EMAIL_SERVICE_API_KEY
                        },
                        body: JSON.stringify({
                            destinatario: email,
                            nome: usuario.nome,
                            link: link
                        })
                    });
                })
                .then(function (respostaEmail) {
                    if (!respostaEmail.ok) {
                        console.log("\nServiço de e-mail retornou status", respostaEmail.status);
                    }
                })
                .catch(function (erroEmail) {
                    // Falha no envio é registrada, mas a resposta ao cliente continua genérica
                    console.log("\nFalha ao acionar o serviço de e-mail:", erroEmail.message || erroEmail);
                })
                .then(function () {
                    res.json({ enviado: true });
                });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro no esqueceu senha!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Passo 2: usuário abre o link do e-mail e define a nova senha usando o token.
function redefinirSenha(req, res) {
    var token = req.body.tokenServer;
    var novaSenha = req.body.novaSenhaServer;

    if (token == undefined) {
        return res.status(400).send("Token está undefined!");
    }
    if (novaSenha == undefined) {
        return res.status(400).send("Sua nova senha está undefined!");
    }

    var tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    usuarioModel.buscarPorTokenReset(tokenHash)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(400).send("Token inválido ou expirado");
            }

            var usuario = resultado[0];

            return bcrypt.hash(novaSenha, SALT_ROUNDS)
                .then(function (novoHash) {
                    return usuarioModel.atualizarSenha(novoHash, usuario.email);
                })
                .then(function () {
                    return usuarioModel.limparTokenReset(usuario.id_usuario);
                })
                .then(function () {
                    res.json({ redefinida: true });
                });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao redefinir a senha!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

function excluir(req, res) {

    var idUsuario = req.params.idUsuario;

    usuarioModel.excluirConfiguracoes(idUsuario)

        .then(function () {
            return usuarioModel.excluirFavoritos(idUsuario);
        })

        .then(function () {
            return usuarioModel.excluirUsuario(idUsuario);
        })

        .then(function () {
            res.status(200).send("Usuário excluído");
        })

        .catch(function (erro) {
            console.log(erro);
            res.status(500).json(erro);
        });
}


function configSlack(req, res) {

    var idUsuario = req.body.idUsuario;
    var nome = req.body.nome;
    var slackId = req.body.slackId;
    var notificacao = req.body.notificacao;

    usuarioModel.configSlack(
        idUsuario,
        nome,
        slackId,
        notificacao
    )
        .then(function (resultado) {

            res.status(200).send("Configuração salva");

        })
        .catch(function (erro) {

            console.log(erro);

            res.status(500).json(erro);

        });

}

function desativarSlack(req, res) {

    var idUsuario = req.body.idUsuario;

    usuarioModel.desativarSlack(idUsuario)
        .then(function (resultado) {

            res.status(200).send("Notificações desativadas");

        })
        .catch(function (erro) {

            console.log(erro);

            res.status(500).json(erro);

        });

}

function buscarSlack(req, res) {

    var idUsuario = req.params.idUsuario;

    usuarioModel.buscarSlack(idUsuario)

        .then(function (resultado) {

            res.json(resultado);

        })

        .catch(function (erro) {

            console.log(erro);

            res.status(500).json(erro);

        });

}

function uploadFoto(req, res) {

    console.log(req.body);
    console.log(req.file);


    const caminhoFoto = "/uploads/" + req.file.filename;
    const idUsuario = req.body.idUsuario;

    usuarioModel.uploadFoto(
        idUsuario,
        caminhoFoto
    )

        .then(function () {

            res.sendStatus(200);

        })

        .catch(function (erro) {

            console.log(erro);

            res.status(500).json(erro);

        });

}

function buscarFoto(req, res) {

    const idUsuario = req.params.idUsuario;

    usuarioModel.buscarFoto(idUsuario)

        .then(function (resultado) {

            res.json(resultado);

        })

        .catch(function (erro) {

            console.log(erro);

            res.status(500).json(erro);

        });

}
// Envia uma notificacao ao Slack respeitando a preferencia do usuario.
// So aciona o servico Java se o usuario tiver notificacao ativada e idSlack salvo.
function notificarSlack(req, res) {

    var idUsuario = req.body.idUsuario;
    var mensagem = req.body.mensagem;

    usuarioModel.buscarSlack(idUsuario)
        .then(function (resultado) {

            if (!resultado || resultado.length === 0) {
                return res.json({ enviado: false, motivo: "slack desativado" });
            }

            var config = resultado[0];

            if (config.notificacao != 1 || !config.idSlack) {
                return res.json({ enviado: false, motivo: "slack desativado" });
            }

            return fetch(process.env.EMAIL_SERVICE_URL + "/slack/notificar", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": process.env.EMAIL_SERVICE_API_KEY
                },
                body: JSON.stringify({
                    slackId: config.idSlack,
                    mensagem: mensagem
                })
            })
                .then(function (respostaSlack) {
                    if (!respostaSlack.ok) {
                        console.log("\nServico de Slack retornou status", respostaSlack.status);
                        return res.json({ enviado: false, motivo: "falha no servico de slack" });
                    }
                    res.json({ enviado: true });
                });
        })
        .catch(function (erro) {
            console.log("\nFalha ao acionar o servico de Slack:", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });

}

module.exports = {
    autenticar,
    cadastrar,
    trocarSenha,
    esqueceuSenha,
    redefinirSenha,
    excluir,
    configSlack,
    desativarSlack,
    buscarSlack,
    notificarSlack,
    uploadFoto,
    buscarFoto

};
