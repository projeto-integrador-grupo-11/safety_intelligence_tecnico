var express = require("express");
var router = express.Router();
var municipioController = require("../controllers/municipioController");

router.get("/listar", function (req, res) {
  municipioController.listar(req, res);
});

router.get("/detalhe", function (req, res) {
  municipioController.detalhe(req, res);
});

module.exports = router;
