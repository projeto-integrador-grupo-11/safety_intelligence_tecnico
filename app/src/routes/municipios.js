var express = require("express");
var router = express.Router();
var municipioController = require("../controllers/municipioController");
var autenticacao = require("../middlewares/autenticarJwt");

router.use(autenticacao.autenticarJwt);

router.get("/listar", function (req, res) {
  municipioController.listar(req, res);
});

router.get("/detalhe", function (req, res) {
  municipioController.detalhe(req, res);
});

router.get("/populacao", function (req, res) {
  municipioController.mapaPopulacao(req, res);
});

router.get("/seguranca/latrocinio", function (req, res) {
  municipioController.latrocinio(req, res);
});

router.get("/seguranca/homicidio", function (req, res) {
  municipioController.homicidio(req, res);
});

router.get("/seguranca/latrocinio-estado", function (req, res) {
  municipioController.latrocinioEstado(req, res);
});

router.get("/seguranca/roubo-veiculo-estado", function (req, res) {
  municipioController.rouboVeiculoEstado(req, res);
});

router.get("/seguranca/furto-veiculo-estado", function (req, res) {
  municipioController.furtoVeiculoEstado(req, res);
});

router.get("/seguranca/status", function (req, res) {
  municipioController.statusLatrocinio(req, res);
});

module.exports = router;
