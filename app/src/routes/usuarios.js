var express = require("express");
var router = express.Router();

var usuarioController = require("../controllers/usuarioController");

//Recebendo os dados do html e direcionando para a função cadastrar de usuarioController.js
router.post("/cadastrar", function (req, res) {
    usuarioController.cadastrar(req, res);
})

router.post("/autenticar", function (req, res) {
    usuarioController.autenticar(req, res);
});

router.put("/trocarSenha", function (req, res) {
    usuarioController.trocarSenha(req, res);
})

router.delete("/excluir/:idUsuario", function (req, res) {
    usuarioController.excluir(req, res);
});


module.exports = router;