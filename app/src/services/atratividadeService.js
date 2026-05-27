var database = require("../database/config");
var populacaoS3Service = require("./populacaoS3Service");
var segurancaS3Service = require("./segurancaS3Service");

var PESOS = {
  idh: 0.25,
  renda: 0.25,
  seguranca: 0.25,
  densidade: 0.25,
};

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

function chaveMunicipio(uf, nome) {
  return (
    String(uf || "")
      .trim()
      .toUpperCase() +
    "|" +
    populacaoS3Service.chaveNome(nome)
  );
}

function parseNumero(valor) {
  if (valor == null || valor === "") return null;
  var n = Number(valor);
  return isNaN(n) ? null : n;
}

function normalizarMinMax(valor, min, max) {
  if (valor == null || min == null || max == null) return null;
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (valor - min) / (max - min)));
}

function limitesDe(arr) {
  var nums = arr.filter(function (v) {
    return v != null && !isNaN(v);
  });
  if (!nums.length) return { min: null, max: null };
  return {
    min: Math.min.apply(null, nums),
    max: Math.max.apply(null, nums),
  };
}

function calcularScoreMunicipio(pilares, limitesPilar) {
  var somaPeso = 0;
  var soma = 0;

  if (pilares.idh != null) {
    soma += pilares.idh * PESOS.idh;
    somaPeso += PESOS.idh;
  }

  if (pilares.renda != null) {
    soma += pilares.renda * PESOS.renda;
    somaPeso += PESOS.renda;
  }

  if (pilares.crimeRate != null) {
    var normSeg =
      1 -
      normalizarMinMax(
        pilares.crimeRate,
        limitesPilar.crimeRate.min,
        limitesPilar.crimeRate.max
      );
    if (normSeg != null) {
      soma += normSeg * PESOS.seguranca;
      somaPeso += PESOS.seguranca;
    }
  }

  if (pilares.logPop != null) {
    var normDen = normalizarMinMax(
      pilares.logPop,
      limitesPilar.logPop.min,
      limitesPilar.logPop.max
    );
    if (normDen != null) {
      soma += normDen * PESOS.densidade;
      somaPeso += PESOS.densidade;
    }
  }

  if (somaPeso === 0) return null;
  return soma / somaPeso;
}

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

function montarMapaPopulacao(rows) {
  var mapa = {};
  (rows || []).forEach(function (row) {
    var uf = String(row.uf || "")
      .trim()
      .toUpperCase();
    var pop = parseNumero(row.populacao);
    if (!uf || pop == null || pop <= 0) return;
    mapa[chaveMunicipio(uf, row.nome_municipio)] = pop;
  });
  return mapa;
}

function montarMapaCrimes(rows) {
  var mapa = {};
  var ufsComDados = {};
  (rows || []).forEach(function (row) {
    var uf = String(row.uf || "")
      .trim()
      .toUpperCase();
    if (!uf) return;
    ufsComDados[uf] = true;
    var total = parseNumero(row.total) || 0;
    mapa[chaveMunicipio(uf, row.nome_municipio)] = total;
  });
  return { mapa: mapa, ufsComDados: ufsComDados };
}

function calcularAtratividadeEstados() {
  var sqlMunicipios =
    "SELECT uf, nome, idhm_geral, renda FROM municipio WHERE idhm_geral IS NOT NULL";
  var sqlPopulacao =
    "SELECT uf, nome_municipio, populacao FROM populacao_municipio";
  var sqlCrimes =
    "SELECT uf, nome_municipio, SUM(qtd_vitimas) AS total " +
    "FROM ocorrencia_seguranca " +
    "WHERE evento IN (?, ?) " +
    "GROUP BY uf, nome_municipio";

  return Promise.all([
    database.executar(sqlMunicipios),
    database.executar(sqlPopulacao),
    database.executar(sqlCrimes, [
      segurancaS3Service.EVENTO_LATROCINIO,
      segurancaS3Service.EVENTO_HOMICIDIO,
    ]),
  ]).then(function (resultados) {
    var municipios = resultados[0] || [];
    var mapaPop = montarMapaPopulacao(resultados[1]);
    var dadosCrimes = montarMapaCrimes(resultados[2]);
    var mapaCrimes = dadosCrimes.mapa;
    var ufsComSeguranca = dadosCrimes.ufsComDados;

    var brutos = municipios.map(function (row) {
      var uf = String(row.uf || "")
        .trim()
        .toUpperCase();
      var chave = chaveMunicipio(uf, row.nome);
      var pop = mapaPop[chave] || null;
      var crimeRate = null;

      if (ufsComSeguranca[uf] && pop != null && pop > 0) {
        var totalCrimes = mapaCrimes[chave] || 0;
        crimeRate = (totalCrimes / pop) * 100000;
      }

      var logPop = pop != null && pop > 0 ? Math.log10(pop) : null;

      return {
        uf: uf,
        idh: parseNumero(row.idhm_geral),
        renda: parseNumero(row.renda),
        crimeRate: crimeRate,
        logPop: logPop,
        pop: pop,
      };
    });

    var limitesPilar = {
      crimeRate: limitesDe(
        brutos.map(function (b) {
          return b.crimeRate;
        })
      ),
      logPop: limitesDe(
        brutos.map(function (b) {
          return b.logPop;
        })
      ),
    };

    var agregadoPorUf = {};
    var somaNacional = 0;
    var pesoNacional = 0;

    brutos.forEach(function (item) {
      var score = calcularScoreMunicipio(item, limitesPilar);
      if (score == null) return;

      var peso = item.pop != null && item.pop > 0 ? item.pop : 1;
      if (!agregadoPorUf[item.uf]) {
        agregadoPorUf[item.uf] = {
          somaPonderada: 0,
          pesoTotal: 0,
          municipios: 0,
        };
      }

      agregadoPorUf[item.uf].somaPonderada += score * peso;
      agregadoPorUf[item.uf].pesoTotal += peso;
      agregadoPorUf[item.uf].municipios += 1;

      somaNacional += score * peso;
      pesoNacional += peso;
    });

    var estados = Object.keys(NOMES_ESTADOS).map(function (sig) {
      var dados = agregadoPorUf[sig];
      var idh = null;
      if (dados && dados.pesoTotal > 0) {
        idh = dados.somaPonderada / dados.pesoTotal;
      }
      return {
        sig: sig,
        name: NOMES_ESTADOS[sig],
        idh: idh,
        municipios: dados ? dados.municipios : 0,
        rank: null,
      };
    });

    atribuirRanksEstados(estados);

    return {
      media_nacional: pesoNacional > 0 ? somaNacional / pesoNacional : null,
      estados: estados,
      formula: {
        pesos: PESOS,
        pilares: [
          "IDH municipal (idhm_geral)",
          "Renda per capita (dimensão PNUD)",
          "Segurança (inverso da taxa de latrocínio + homicídio por 100 mil hab.)",
          "Densidade (população municipal normalizada)",
        ],
        agregacao: "média ponderada pela população municipal",
      },
    };
  });
}

module.exports = {
  calcularAtratividadeEstados,
  PESOS,
};
