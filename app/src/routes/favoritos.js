var express = require("express");
var router = express.Router();
var favoritoController = require("../controllers/favoritoController");
var autenticacao = require("../middlewares/autenticarJwt");

router.use(autenticacao.autenticarJwt);

router.get("/listar", function (req, res) {
  favoritoController.listar(req, res);
});

router.post("/adicionar", function (req, res) {
  favoritoController.adicionar(req, res);
});

router.delete("/remover", function (req, res) {
  favoritoController.remover(req, res);
});

module.exports = router;
