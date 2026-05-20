var jwt = require("jsonwebtoken");

var SEGREDO = process.env.JWT_SECRET;

function autenticarJwt(req, res, next) {
    var headerAuth = req.headers["authorization"] || req.headers["Authorization"];

    if (!headerAuth) {
        return res.status(401).json({ erro: "Token não informado" });
    }

    var partes = headerAuth.split(" ");
    var token = partes.length === 2 && /^Bearer$/i.test(partes[0]) ? partes[1] : partes[0];

    if (!token) {
        return res.status(401).json({ erro: "Token mal formatado" });
    }

    jwt.verify(token, SEGREDO, function (erro, payload) {
        if (erro) {
            return res.status(401).json({ erro: "Token inválido ou expirado" });
        }

        req.usuario = payload;
        next();
    });
}

function gerarToken(usuario) {
    var payload = {
        id: usuario.id_usuario,
        email: usuario.email,
        nome: usuario.nome_usuario,
        empresaId: usuario.empresaId,
        privilegio: usuario.privilegio
    };

    var expiresIn = process.env.JWT_EXPIRES_IN || "2h";

    return jwt.sign(payload, SEGREDO, { expiresIn: expiresIn });
}

module.exports = {
    autenticarJwt: autenticarJwt,
    gerarToken: gerarToken
};
