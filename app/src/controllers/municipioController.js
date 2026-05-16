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

function enviarUm(res, row) {
  var lista = mapFromDb([row]);
  res.status(200).json(lista[0]);
}

function detalhe(req, res) {
  var id = req.query.id;
  var nome = req.query.nome;

  if ((id == null || id === "") && (nome == null || nome === "")) {
    res.status(400).json({ mensagem: "Informe o parâmetro id ou nome do município." });
    return;
  }

  function tryDbId() {
    if (id == null || id === "") return Promise.resolve(null);
    return municipioModel.buscarPorId(id).then(function (rows) {
      return rows && rows.length ? rows[0] : null;
    });
  }

  function tryDbNome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return municipioModel.buscarPorNome(nome).then(function (rows) {
      return rows && rows.length ? rows[0] : null;
    });
  }

  function tryS3Nome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return municipioS3Service.buscarPorNome(nome);
  }

  tryDbId()
    .catch(function () {
      return null;
    })
    .then(function (row) {
      if (row) return row;
      return tryDbNome().catch(function () {
        return null;
      });
    })
    .then(function (row) {
      if (row) return row;
      return tryS3Nome().catch(function () {
        return null;
      });
    })
    .then(function (row) {
      if (!row || !row.nome) {
        res.status(404).json({ mensagem: "Município não encontrado." });
        return;
      }
      enviarUm(res, row);
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/detalhe:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao buscar município." });
    });
}

module.exports = { listar, detalhe };
