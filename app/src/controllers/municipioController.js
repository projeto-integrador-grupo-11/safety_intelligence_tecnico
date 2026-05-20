var municipioModel = require("../models/municipioModel");
var municipioS3Service = require("../services/municipioS3Service");
var populacaoS3Service = require("../services/populacaoS3Service");
var segurancaS3Service = require("../services/segurancaS3Service");
var indicadoresSegurancaService = require("../services/indicadoresSegurancaService");

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

function obterUfQuery(req) {
  return String(req.query.uf || "SP")
    .trim()
    .toUpperCase();
}

function enviarLista(res, municipios, uf) {
  populacaoS3Service.mesclarPopulacao(municipios, uf).then(function (lista) {
    res.status(200).json(lista);
  });
}

function listarPorIdhmSp(res) {
  municipioModel
    .listar()
    .then(function (resultado) {
      if (resultado && resultado.length > 0) {
        enviarLista(res, mapFromDb(resultado), "SP");
        return;
      }
      return municipioS3Service.carregar().then(function (dados) {
        enviarLista(res, dados, "SP");
      });
    })
    .catch(function () {
      municipioS3Service
        .carregar()
        .then(function (dados) {
          enviarLista(res, dados, "SP");
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

function listar(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  if (uf !== "SP") {
    populacaoS3Service
      .listarMunicipiosPorUf(uf)
      .then(function (lista) {
        res.status(200).json(lista);
      })
      .catch(function (erro) {
        console.log("\nErro ao listar municípios (" + uf + "):", erro.message || erro);
        res.status(500).json({
          mensagem:
            "Não foi possível carregar os municípios de " +
            uf +
            ". Verifique a planilha populacao_municipios_2025.xls.",
        });
      });
    return;
  }

  listarPorIdhmSp(res);
}

function enviarUm(res, row, uf) {
  var lista = mapFromDb([row]);
  populacaoS3Service.mesclarPopulacao(lista, uf || "SP").then(function (merged) {
    res.status(200).json(merged[0]);
  });
}

function detalhe(req, res) {
  var id = req.query.id;
  var nome = req.query.nome;
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  if ((id == null || id === "") && (nome == null || nome === "")) {
    res.status(400).json({ mensagem: "Informe o parâmetro id ou nome do município." });
    return;
  }

  if (uf !== "SP") {
    function tryPopulacaoNomeNonSp() {
      if (nome == null || nome === "") return Promise.resolve(null);
      return populacaoS3Service.buscarPorNomeUf(nome, uf).then(function (m) {
        if (!m) return null;
        return {
          id: m.id,
          nome: m.nome,
          idhm_geral: m.idhm_geral,
          renda: m.renda,
          educacao: m.educacao,
          longevidade: m.longevidade,
          pop: m.pop,
        };
      });
    }

    tryPopulacaoNomeNonSp()
      .catch(function () {
        return null;
      })
      .then(function (row) {
        if (!row || !row.nome) {
          res.status(404).json({ mensagem: "Município não encontrado." });
          return;
        }
        if (row.pop != null) {
          res.status(200).json(row);
          return;
        }
        enviarUm(res, row, uf);
      })
      .catch(function (erro) {
        console.log("\nErro em /municipios/detalhe:", erro.message || erro);
        res.status(500).json({ mensagem: "Erro ao buscar município." });
      });
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

  function tryPopulacaoNome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return populacaoS3Service.buscarPorNomeUf(nome, uf).then(function (m) {
      if (!m) return null;
      return {
        id: m.id,
        nome: m.nome,
        idhm_geral: m.idhm_geral,
        renda: m.renda,
        educacao: m.educacao,
        longevidade: m.longevidade,
        pop: m.pop,
      };
    });
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
      if (row) return row;
      return tryPopulacaoNome().catch(function () {
        return null;
      });
    })
    .then(function (row) {
      if (!row || !row.nome) {
        res.status(404).json({ mensagem: "Município não encontrado." });
        return;
      }
      enviarUm(res, row, uf);
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/detalhe:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao buscar município." });
    });
}

function mapaPopulacao(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  populacaoS3Service
    .carregarMapa(uf)
    .then(function (mapa) {
      res.status(200).json(mapa);
    })
    .catch(function (erro) {
      console.log("\nErro mapa população:", erro.message || erro);
      res.status(500).json({
        mensagem:
          "Não foi possível carregar populacao_municipios_2025.xls (S3 ou pasta safety_leitor_excel).",
      });
    });
}

function resolverNomeLatrocinio(req) {
  var nome = req.query.nome;
  if (nome != null && String(nome).trim() !== "") {
    return Promise.resolve(String(nome).trim());
  }

  var id = req.query.id;
  var uf = obterUfQuery(req);
  if (id == null || id === "") {
    return Promise.resolve(null);
  }

  if (uf !== "SP") {
    return Promise.resolve(null);
  }

  return municipioModel
    .buscarPorId(id)
    .then(function (rows) {
      if (rows && rows.length && rows[0].nome) {
        return limparNome(rows[0].nome);
      }
      return null;
    })
    .catch(function () {
      return null;
    });
}

function latrocinio(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  resolverNomeLatrocinio(req)
    .then(function (nomeFinal) {
      if (!nomeFinal) {
        res.status(400).json({
          mensagem: "Informe o parâmetro nome ou id do município.",
        });
        return;
      }
      return segurancaS3Service.buscarLatrocinio(uf, nomeFinal).then(function (dados) {
        res.status(200).json(dados);
      });
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/seguranca/latrocinio:", erro.message || erro);
      res.status(500).json({
        mensagem:
          "Não foi possível carregar dados de latrocínio (banco_seguranca_2025.xlsx).",
      });
    });
}

function homicidio(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  resolverNomeLatrocinio(req)
    .then(function (nomeFinal) {
      if (!nomeFinal) {
        res.status(400).json({
          mensagem: "Informe o parâmetro nome ou id do município.",
        });
        return;
      }
      return segurancaS3Service.buscarHomicidio(uf, nomeFinal).then(function (dados) {
        res.status(200).json(dados);
      });
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/seguranca/homicidio:", erro.message || erro);
      res.status(500).json({
        mensagem:
          "Não foi possível carregar dados de homicídio doloso (banco_seguranca_2025.xlsx).",
      });
    });
}

function statusLatrocinio(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }
  res.status(200).json(segurancaS3Service.obterStatusUf(uf));
}

function latrocinioEstado(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }
  segurancaS3Service
    .buscarLatrocinioEstado(uf)
    .then(function (dados) {
      res.status(200).json(dados);
    })
    .catch(function (erro) {
      console.log(
        "\nErro em /municipios/seguranca/latrocinio-estado:",
        erro.message || erro
      );
      res.status(500).json({
        mensagem:
          "Não foi possível carregar totais de latrocínio do estado (banco_seguranca_2025.xlsx).",
      });
    });
}

function rouboVeiculoEstado(req, res) {
  var uf = obterUfQuery(req);
  var ano = parseInt(req.query.ano || "2022", 10);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }
  if (!Number.isFinite(ano)) {
    res.status(400).json({ mensagem: "Ano inválido." });
    return;
  }
  indicadoresSegurancaService
    .totalRouboVeiculoEstado(uf, ano)
    .then(function (dados) {
      res.status(200).json(dados);
    })
    .catch(function (erro) {
      console.log(
        "\nErro em /municipios/seguranca/roubo-veiculo-estado:",
        erro.message || erro
      );
      res.status(500).json({
        mensagem:
          "Não foi possível carregar roubo de veículo (indicadores_seguranca_publica.xlsx).",
      });
    });
}

function furtoVeiculoEstado(req, res) {
  var uf = obterUfQuery(req);
  var ano = parseInt(req.query.ano || "2022", 10);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }
  if (!Number.isFinite(ano)) {
    res.status(400).json({ mensagem: "Ano inválido." });
    return;
  }
  indicadoresSegurancaService
    .totalFurtoVeiculoEstado(uf, ano)
    .then(function (dados) {
      res.status(200).json(dados);
    })
    .catch(function (erro) {
      console.log(
        "\nErro em /municipios/seguranca/furto-veiculo-estado:",
        erro.message || erro
      );
      res.status(500).json({
        mensagem:
          "Não foi possível carregar furto de veículo (indicadores_seguranca_publica.xlsx).",
      });
    });
}

module.exports = {
  listar,
  detalhe,
  mapaPopulacao,
  latrocinio,
  homicidio,
  latrocinioEstado,
  rouboVeiculoEstado,
  furtoVeiculoEstado,
  statusLatrocinio,
};
