var municipioModel = require("../models/municipioModel");
var municipioS3Service = require("../services/municipioS3Service");
var populacaoS3Service = require("../services/populacaoS3Service");
var segurancaS3Service = require("../services/segurancaS3Service");
var indicadoresSegurancaService = require("../services/indicadoresSegurancaService");

function limparNome(nome) {
  return municipioS3Service.limparNome(nome);
}

function chaveNome(nome) {
  return populacaoS3Service.chaveNome(nome);
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
      uf: row.uf || null,
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

function mapFromS3(lista) {
  return lista.map(function (row) {
    return {
      id: row.id || null,
      uf: row.uf || null,
      nome: limparNome(row.nome),
      idhm_geral: parseNumero(row.idhm_geral),
      idhm: parseNumero(row.idhm),
      renda: parseNumero(row.renda),
      educacao: parseNumero(row.educacao),
      longevidade: parseNumero(row.longevidade),
      pop: row.pop != null ? row.pop : null,
    };
  });
}

function obterUfQuery(req) {
  return String(req.query.uf || "SP")
    .trim()
    .toUpperCase();
}

function aplicarIdhmNaLista(lista, idhmLista) {
  var mapa = {};
  idhmLista.forEach(function (item) {
    mapa[chaveNome(item.nome)] = item;
  });

  var matched = 0;
  var merged = lista.map(function (m) {
    var idhm = mapa[chaveNome(m.nome)];
    if (!idhm) return m;
    matched++;
    return Object.assign({}, m, {
      id: m.id != null ? m.id : idhm.id,
      idhm_geral: idhm.idhm_geral,
      idhm: idhm.idhm != null ? idhm.idhm : idhm.idhm_geral,
      renda: idhm.renda,
      educacao: idhm.educacao,
      longevidade: idhm.longevidade,
    });
  });

  console.log(
    "\nIDHM: " + matched + "/" + lista.length + " municípios com indicadores."
  );
  return merged;
}

function carregarIdhmPorUf(uf) {
  return municipioModel
    .listarPorUf(uf)
    .then(function (rows) {
      if (rows && rows.length) {
        return mapFromDb(rows);
      }
      return municipioS3Service.carregarPorUf(uf).then(mapFromS3);
    })
    .catch(function () {
      return municipioS3Service
        .carregarPorUf(uf)
        .then(mapFromS3)
        .catch(function () {
          return [];
        });
    });
}

function enviarLista(res, municipios, uf) {
  populacaoS3Service.mesclarPopulacao(municipios, uf).then(function (lista) {
    res.status(200).json(lista);
  });
}

function listarPorUf(res, uf) {
  populacaoS3Service
    .listarMunicipiosPorUf(uf)
    .then(function (listaPop) {
      return carregarIdhmPorUf(uf).then(function (idhmLista) {
        return aplicarIdhmNaLista(listaPop, idhmLista);
      });
    })
    .then(function (lista) {
      res.status(200).json(lista);
    })
    .catch(function (erro) {
      console.log("\nErro ao listar municípios (" + uf + "):", erro.message || erro);
      res.status(500).json({
        mensagem:
          "Não foi possível carregar os municípios de " +
          uf +
          ". Verifique o banco, o JAR (idhm_municipios.xlsx) ou populacao_municipios_2025.xls.",
      });
    });
}

function listar(req, res) {
  var uf = obterUfQuery(req);
  if (!populacaoS3Service.isUfValida(uf)) {
    res.status(400).json({ mensagem: "UF inválida." });
    return;
  }

  listarPorUf(res, uf);
}

function enviarUm(res, row, uf) {
  var lista = [row];
  carregarIdhmPorUf(uf)
    .then(function (idhmLista) {
      return aplicarIdhmNaLista(lista, idhmLista);
    })
    .then(function (merged) {
      return populacaoS3Service.mesclarPopulacao(merged, uf || "SP");
    })
    .then(function (finalLista) {
      res.status(200).json(finalLista[0]);
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

  function tryDbId() {
    if (id == null || id === "") return Promise.resolve(null);
    return municipioModel.buscarPorId(id).then(function (rows) {
      return rows && rows.length ? mapFromDb([rows[0]])[0] : null;
    });
  }

  function tryDbNome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return municipioModel.buscarPorNomeUf(nome, uf).then(function (rows) {
      return rows && rows.length ? mapFromDb([rows[0]])[0] : null;
    });
  }

  function tryS3Nome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return municipioS3Service.buscarPorNome(nome, uf);
  }

  function tryPopulacaoNome() {
    if (nome == null || nome === "") return Promise.resolve(null);
    return populacaoS3Service.buscarPorNomeUf(nome, uf).then(function (m) {
      if (!m) return null;
      return {
        id: m.id,
        uf: uf,
        nome: m.nome,
        idhm_geral: m.idhm_geral,
        idhm: m.idhm,
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
  segurancaS3Service
    .obterStatusUf(uf)
    .then(function (status) {
      res.status(200).json(status);
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/seguranca/status:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao consultar status." });
    });
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

var NOMES_ESTADOS = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function atribuirRanksEstados(estados) {
  var sorted = estados.slice().sort(function (a, b) {
    var av = a.idh == null ? -1 : a.idh;
    var bv = b.idh == null ? -1 : b.idh;
    return bv - av;
  });
  var pos = 0;
  var ultimoIdh = null;
  sorted.forEach(function (s, i) {
    if (s.idh !== ultimoIdh) {
      pos = i + 1;
      ultimoIdh = s.idh;
    }
    s.rank = s.idh == null ? null : pos;
  });
  return estados;
}

function atratividadeEstados(req, res) {
  Promise.all([
    municipioModel.listarMediaIdhmPorUf(),
    municipioModel.mediaIdhmNacional(),
  ])
    .then(function (resultados) {
      var rows = resultados[0] || [];
      var mediaNacional = resultados[1];
      var porUf = {};
      rows.forEach(function (row) {
        var uf = String(row.uf || "").trim().toUpperCase();
        if (!uf) return;
        porUf[uf] = {
          idh: parseNumero(row.idh),
          municipios: parseInt(row.municipios, 10) || 0,
        };
      });

      var estados = Object.keys(NOMES_ESTADOS).map(function (sig) {
        var dados = porUf[sig];
        return {
          sig: sig,
          name: NOMES_ESTADOS[sig],
          idh: dados ? dados.idh : null,
          municipios: dados ? dados.municipios : 0,
          rank: null,
        };
      });

      atribuirRanksEstados(estados);

      res.status(200).json({
        media_nacional: mediaNacional,
        estados: estados,
      });
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/atratividade-estados:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao buscar atratividade por estado." });
    });
}

function referenciasNacionais(req, res) {
  municipioModel
    .buscarReferenciasNacionais()
    .then(function (dados) {
      res.status(200).json(dados);
    })
    .catch(function (erro) {
      console.log("\nErro em /municipios/referencias-nacionais:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao buscar referências nacionais." });
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
  referenciasNacionais,
  atratividadeEstados,
};
