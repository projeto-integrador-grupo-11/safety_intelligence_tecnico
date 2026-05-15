var municipioModel = require("../models/municipioModel");
var municipioS3Service = require("../services/municipioS3Service");

function limparNome(nome) {
  return municipioS3Service.limparNome(nome);
}

function parseNumero(valor) {
  if (valor == null || valor === "") return null;
  var n = Number(valor);
  return isNaN(n) ? null : n;
}

function mapFromDb(rows) {
  return rows.map(function (row) {
    var idhmGeral = parseNumero(row.idhm_geral);

    return {
      id: row.id,
      nome: limparNome(row.nome),
      idhm_geral: idhmGeral,
      idhm: idhmGeral,
      renda: parseNumero(row.renda),
      educacao: parseNumero(row.educacao),
      longevidade: parseNumero(row.longevidade),
      pop: null,
    };
  });
}

function listar(req, res) {
  municipioModel
    .listar()
    .then(function (resultado) {
      if (resultado && resultado.length > 0) {
        return res.status(200).json(mapFromDb(resultado));
      }
      return municipioS3Service.carregar().then(function (dados) {
        res.status(200).json(dados);
      });
    })
    .catch(function () {
      municipioS3Service
        .carregar()
        .then(function (dados) {
          res.status(200).json(dados);
        })
        .catch(function (erro) {
          console.log("\nErro ao carregar municípios:", erro.message || erro);
          res.status(500).json({
            mensagem:
              "Não foi possível carregar os municípios. Verifique o banco, as credenciais AWS ou coloque data_idhm.xlsx na raiz do projeto.",
          });
        });
    });
}

module.exports = { listar };
