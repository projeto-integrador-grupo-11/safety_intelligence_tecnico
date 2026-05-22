var express = require("express");
var router = express.Router();
const fs = require("fs");

const dir = "public/uploads";
const multer = require("multer");

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


router.post("/configSlack", function (req, res) {
    usuarioController.configSlack(req, res);
});

router.put("/desativarSlack", function (req, res) {
    usuarioController.desativarSlack(req, res);
});

router.get("/buscarSlack/:idUsuario", function (req, res) {
    usuarioController.buscarSlack(req, res);
});



if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, "public/uploads");
    },

    filename: function(req, file, cb) {

    cb(
        null,
        Date.now() + "-" + file.originalname
    );

}

});

const upload = multer({ storage });

router.post("/uploadFoto",
    upload.single("foto"),
    function (req, res) {
        usuarioController.uploadFoto(req, res);
    }
);

router.get(
    "/buscarFoto/:idUsuario",
    function (req, res) {

        usuarioController.buscarFoto(req, res);

    }
);

module.exports = router;