var express = require("express");
var router = express.Router();
var municipioController = require("../controllers/municipioController");

router.get("/listar", function (req, res) {
  municipioController.listar(req, res);
});

module.exports = router;
