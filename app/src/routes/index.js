var express = require("express");
var router = express.Router();
var path = require("path");


router.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "..", "index.html"));
});

router.get("/dashboard", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "..", "dashboard.html"));
});

module.exports = router;


