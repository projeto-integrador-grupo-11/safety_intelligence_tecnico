var database = require("../database/config");

var UFS_VALIDAS = {
  AC: 1, AL: 1, AP: 1, AM: 1, BA: 1, CE: 1, DF: 1, ES: 1, GO: 1,
  MA: 1, MT: 1, MS: 1, MG: 1, PA: 1, PB: 1, PR: 1, PE: 1, PI: 1,
  RJ: 1, RN: 1, RS: 1, RO: 1, RR: 1, SC: 1, SP: 1, SE: 1, TO: 1,
};

function isUfValida(uf) {
  return UFS_VALIDAS[String(uf || "").trim().toUpperCase()] === 1;
}

function limparNome(nome) {
  if (!nome) return "";
  return String(nome)
    .replace(/\s*\([A-Z]{2}\)\s*$/i, "")
    .trim();
}

function chaveNome(nome) {
  return limparNome(nome)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

var cacheListaPorUf = {};
var cacheMapaPorUf = {};
var cacheEmPorUf = {};
var carregandoPorUf = {};
var CACHE_MS = 5 * 60 * 1000;

function carregarUfDoBanco(ufNorm) {
  var sql =
    "SELECT nome_municipio, populacao FROM populacao_municipio " +
    "WHERE uf = ? ORDER BY nome_municipio ASC";

  return database.executar(sql, [ufNorm]).then(function (rows) {
    var lista = (rows || []).map(function (row) {
      var nome = limparNome(row.nome_municipio);
      var pop = Number(row.populacao);
      return {
        id: null,
        nome: nome,
        uf: ufNorm,
        pop: Number.isFinite(pop) ? pop : null,
        idhm_geral: null,
        idhm: null,
        renda: null,
        educacao: null,
        longevidade: null,
      };
    });

    var mapa = {};
    lista.forEach(function (m) {
      if (m.pop != null) mapa[chaveNome(m.nome)] = m.pop;
    });

    var ts = Date.now();
    cacheListaPorUf[ufNorm] = lista;
    cacheMapaPorUf[ufNorm] = mapa;
    cacheEmPorUf[ufNorm] = ts;

    console.log(
      "\nPopulação (" + ufNorm + "): " + lista.length + " municípios do banco."
    );
    return { lista: lista, mapa: mapa };
  });
}

function garantirUf(ufNorm) {
  var agora = Date.now();
  var em = cacheEmPorUf[ufNorm] || 0;
  if (cacheListaPorUf[ufNorm] && agora - em < CACHE_MS) {
    return Promise.resolve({
      lista: cacheListaPorUf[ufNorm],
      mapa: cacheMapaPorUf[ufNorm],
    });
  }
  if (carregandoPorUf[ufNorm]) return carregandoPorUf[ufNorm];

  carregandoPorUf[ufNorm] = carregarUfDoBanco(ufNorm)
    .catch(function (erro) {
      console.log("\nPopulação (" + ufNorm + "):", erro.sqlMessage || erro.message || erro);
      return { lista: [], mapa: {} };
    })
    .finally(function () {
      delete carregandoPorUf[ufNorm];
    });

  return carregandoPorUf[ufNorm];
}

function carregarMapa(uf) {
  var ufNorm = isUfValida(uf) ? String(uf).trim().toUpperCase() : "SP";
  return garantirUf(ufNorm).then(function (dados) {
    if (!dados.mapa || Object.keys(dados.mapa).length === 0) {
      return Promise.reject(
        new Error("Mapa de população vazio para UF " + ufNorm)
      );
    }
    return dados.mapa;
  });
}

function listarMunicipiosPorUf(uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  if (!isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida"));
  }
  return garantirUf(ufNorm).then(function (dados) {
    if (!dados.lista || !dados.lista.length) {
      return Promise.reject(
        new Error("Nenhum município encontrado para UF " + ufNorm)
      );
    }
    return dados.lista;
  });
}

function buscarPorNomeUf(nome, uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  if (!isUfValida(ufNorm)) return Promise.resolve(null);
  var alvo = chaveNome(nome);
  if (!alvo) return Promise.resolve(null);

  return listarMunicipiosPorUf(ufNorm).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (chaveNome(lista[i].nome) === alvo) return lista[i];
    }
    return null;
  });
}

function mesclarPopulacao(municipios, uf) {
  var ufNorm = isUfValida(uf) ? String(uf).trim().toUpperCase() : "SP";
  return carregarMapa(ufNorm)
    .then(function (mapa) {
      var matched = 0;
      var lista = municipios.map(function (m) {
        var key = chaveNome(m.nome);
        var pop = mapa[key];
        if (pop == null) return m;
        matched++;
        return Object.assign({}, m, { pop: pop });
      });
      console.log(
        "\nPopulação: " + matched + "/" + municipios.length + " municípios com pop."
      );
      return lista;
    })
    .catch(function (erro) {
      console.log("\nPopulação (banco):", erro.message || erro);
      return municipios;
    });
}

module.exports = {
  carregarMapa,
  mesclarPopulacao,
  listarMunicipiosPorUf,
  buscarPorNomeUf,
  isUfValida,
  limparNome,
  chaveNome,
};
