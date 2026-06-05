var bcrypt = require("bcryptjs");
var crypto = require("crypto");

var usuarioModel = require("../models/usuarioModel");
var autenticacao = require("../middlewares/autenticarJwt");

var SALT_ROUNDS = 10;
var RESET_EXPIRA_MS = 60 * 60 * 1000; // 1 hora
var CODIGO_2FA_EXPIRA_MS = 10 * 60 * 1000; // 10 minutos

function isBcryptHash(valor) {
    return typeof valor === "string" && /^\$2[aby]\$/.test(valor);
}

// Monta a resposta de login bem-sucedido com o token JWT.
function responderComToken(res, usuario) {
    var token = autenticacao.gerarToken(usuario);
    res.json({
        id: usuario.id_usuario,
        email: usuario.email,
        nome: usuario.nome,
        empresaId: usuario.empresaId,
        privilegio: usuario.privilegio,
        token: token
    });
}

// Pede ao servico Java uma chave aleatoria, guarda o hash com validade
// e dispara o e-mail. Retorna uma Promise que resolve quando o codigo foi salvo.
function dispararCodigo2Fa(usuario) {
    return fetch(process.env.EMAIL_SERVICE_URL + "/emails/codigo-2fa", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": process.env.EMAIL_SERVICE_API_KEY
        },
        body: JSON.stringify({
            destinatario: usuario.email,
            nome: usuario.nome
        })
    })
        .then(function (resposta) {
            if (!resposta.ok) {
                throw new Error("Servico de e-mail retornou status " + resposta.status);
            }
            return resposta.json();
        })
        .then(function (json) {
            var codigoHash = crypto.createHash("sha256").update(String(json.codigo)).digest("hex");
            var expiraEm = new Date(Date.now() + CODIGO_2FA_EXPIRA_MS);
            return usuarioModel.salvarCodigo2Fa(usuario.email, codigoHash, expiraEm);
        });
}

// Aciona o servico Java para postar uma mensagem no canal do Slack.
// slackId (opcional) faz o servico mencionar o usuario: <@U123>.
// Retorna a Promise do fetch (quem chama decide se trata o erro).
function enviarNotificacaoSlack(slackId, mensagem) {
    return fetch(process.env.EMAIL_SERVICE_URL + "/slack/notificar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": process.env.EMAIL_SERVICE_API_KEY
        },
        body: JSON.stringify({
            slackId: slackId || null,
            mensagem: mensagem
        })
    });
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

                // 2FA desativado: login direto com token.
                if (usuario.autenticacao2FA != 1) {
                    return responderComToken(res, usuario);
                }

                // 2FA ativado: gera/envia o codigo e exige a verificacao antes do token.
                dispararCodigo2Fa(usuario)
                    .then(function () {
                        res.json({ requer2FA: true, email: usuario.email });
                    })
                    .catch(function (erroCodigo) {
                        console.log("\nFalha ao enviar codigo 2FA:", erroCodigo.message || erroCodigo);
                        res.status(500).json("Não foi possível enviar o código de verificação");
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

            // Notifica o canal do time sobre o novo cadastro (best-effort: nao bloqueia o cadastro).
            enviarNotificacaoSlack(null, "🆕 Novo usuário cadastrado: " + nome + " (" + email + ")")
                .then(function (respostaSlack) {
                    if (!respostaSlack.ok) {
                        console.log("\nSlack (novo cadastro) retornou status", respostaSlack.status);
                    }
                })
                .catch(function (erroSlack) {
                    console.log("\nFalha ao notificar Slack sobre novo cadastro:", erroSlack.message || erroSlack);
                });
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

// Pede ao servico Java uma chave aleatoria de recuperacao, guarda o hash
// (nas colunas token_reset) com validade e dispara o e-mail.
function dispararCodigoRecuperacao(usuario) {
    return fetch(process.env.EMAIL_SERVICE_URL + "/emails/codigo-2fa", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": process.env.EMAIL_SERVICE_API_KEY
        },
        body: JSON.stringify({
            destinatario: usuario.email,
            nome: usuario.nome
        })
    })
        .then(function (resposta) {
            if (!resposta.ok) {
                throw new Error("Servico de e-mail retornou status " + resposta.status);
            }
            return resposta.json();
        })
        .then(function (json) {
            var codigoHash = crypto.createHash("sha256").update(String(json.codigo)).digest("hex");
            var expiraEm = new Date(Date.now() + RESET_EXPIRA_MS);
            return usuarioModel.salvarTokenReset(usuario.email, codigoHash, expiraEm);
        });
}

// Passo 1: usuário esqueceu a senha -> gera um código, salva o hash e envia por e-mail.
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

            return dispararCodigoRecuperacao(resultado[0])
                .then(function () {
                    res.json({ enviado: true });
                })
                .catch(function (erroEmail) {
                    // Falha no envio é registrada, mas a resposta ao cliente continua genérica
                    console.log("\nFalha ao acionar o serviço de e-mail:", erroEmail.message || erroEmail);
                    res.json({ enviado: true });
                });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro no esqueceu senha!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Passo 2: valida o código de recuperação digitado (sem ainda trocar a senha).
function verificarCodigoRecuperacao(req, res) {
    var email = req.body.emailServer;
    var codigo = req.body.codigoServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (codigo == undefined) {
        return res.status(400).send("O código está undefined!");
    }

    var codigoHash = crypto.createHash("sha256").update(String(codigo)).digest("hex");

    usuarioModel.buscarPorCodigoRecuperacao(email, codigoHash)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(401).send("Código inválido ou expirado");
            }
            res.json({ valido: true });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao verificar o código de recuperação!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Passo 3: revalida o código e define a nova senha. O código é checado de novo
// no servidor (nunca confia só na tela anterior) e limpo após o uso.
function redefinirSenha(req, res) {
    var email = req.body.emailServer;
    var codigo = req.body.codigoServer;
    var novaSenha = req.body.novaSenhaServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (codigo == undefined) {
        return res.status(400).send("O código está undefined!");
    }
    if (novaSenha == undefined) {
        return res.status(400).send("Sua nova senha está undefined!");
    }

    var codigoHash = crypto.createHash("sha256").update(String(codigo)).digest("hex");

    usuarioModel.buscarPorCodigoRecuperacao(email, codigoHash)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(401).send("Código inválido ou expirado");
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

    if (idUsuario == undefined) {
        return res.status(400).send("idUsuario é obrigatório");
    }

    // Normaliza o flag de notificacao para 0/1.
    var ativar = (notificacao === true || notificacao == 1) ? 1 : 0;

    // Para ativar a notificacao no Slack o ID do usuario é obrigatório
    // (é ele que permite mencionar a pessoa no canal).
    if (ativar === 1 && (!slackId || String(slackId).trim() === "")) {
        return res.status(400).send("Informe seu ID do Slack para ativar as notificações.");
    }

    usuarioModel.configSlack(
        idUsuario,
        nome,
        slackId ? String(slackId).trim() : "",
        ativar
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

            return enviarNotificacaoSlack(config.idSlack, mensagem)
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

// Passo 2 do login: valida o codigo 2FA digitado e, se correto, emite o token.
function verificar2FA(req, res) {
    var email = req.body.emailServer;
    var codigo = req.body.codigoServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }
    if (codigo == undefined) {
        return res.status(400).send("O código está undefined!");
    }

    var codigoHash = crypto.createHash("sha256").update(String(codigo)).digest("hex");

    usuarioModel.buscarPorCodigo2Fa(email, codigoHash)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0) {
                return res.status(401).send("Código inválido ou expirado");
            }

            var usuario = resultado[0];

            return usuarioModel.limparCodigo2Fa(usuario.id_usuario)
                .then(function () {
                    responderComToken(res, usuario);
                });
        })
        .catch(function (erro) {
            console.log("\nHouve um erro ao verificar o código 2FA!", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Reenvia o codigo 2FA. Resposta sempre generica para nao expor quais e-mails existem.
function reenviar2FA(req, res) {
    var email = req.body.emailServer;

    if (email == undefined) {
        return res.status(400).send("Seu email está undefined!");
    }

    usuarioModel.buscarPorEmail(email)
        .then(function (resultado) {
            if (!resultado || resultado.length === 0 || resultado[0].autenticacao2FA != 1) {
                return res.json({ enviado: true });
            }

            return dispararCodigo2Fa(resultado[0])
                .then(function () {
                    res.json({ enviado: true });
                });
        })
        .catch(function (erro) {
            console.log("\nFalha ao reenviar código 2FA:", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Le a preferencia de 2FA do usuario (para o toggle na tela de configuracoes).
function buscar2FA(req, res) {
    var idUsuario = req.params.idUsuario;

    usuarioModel.buscar2FA(idUsuario)
        .then(function (resultado) {
            var ativo = resultado && resultado.length > 0 ? resultado[0].autenticacao2FA : 0;
            res.json({ autenticacao2FA: ativo });
        })
        .catch(function (erro) {
            console.log("\nFalha ao buscar configuração de 2FA:", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

// Ativa ou desativa o 2FA do usuario.
function configurar2FA(req, res) {
    var idUsuario = req.body.idUsuario;
    var ativo = (req.body.ativo === true || req.body.ativo === 1 || req.body.ativo === "1") ? 1 : 0;

    if (idUsuario == undefined) {
        return res.status(400).send("idUsuario está undefined!");
    }

    usuarioModel.configurar2FA(idUsuario, ativo)
        .then(function () {
            res.json({ autenticacao2FA: ativo });
        })
        .catch(function (erro) {
            console.log("\nFalha ao configurar 2FA:", erro.sqlMessage || erro.message || erro);
            res.status(500).json("Erro interno do servidor");
        });
}

module.exports = {
    autenticar,
    verificar2FA,
    reenviar2FA,
    buscar2FA,
    configurar2FA,
    cadastrar,
    trocarSenha,
    esqueceuSenha,
    verificarCodigoRecuperacao,
    redefinirSenha,
    excluir,
    configSlack,
    desativarSlack,
    buscarSlack,
    notificarSlack,
    uploadFoto,
    buscarFoto

};
