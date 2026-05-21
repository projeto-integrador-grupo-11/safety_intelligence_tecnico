var database = require("../database/config");
var populacaoS3Service = require("./populacaoS3Service");

var EVENTO_LATROCINIO = "Roubo seguido de morte (latrocínio)";
var EVENTO_HOMICIDIO = "Homicídio doloso";

var ANOS = [2021, 2022, 2023, 2024, 2025];

var LABELS_MES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function chaveNome(nome) {
  return populacaoS3Service.chaveNome(nome);
}

function mensalDoAno(porMes, ano) {
  var anoStr = String(ano);
  return LABELS_MES.map(function (label, i) {
    var ref = anoStr + "-" + String(i + 1).padStart(2, "0");
    return {
      mes: label,
      ref: ref,
      valor: (porMes && porMes[ref]) || 0,
    };
  });
}

function criarVazio(eventoLabel) {
  var labels = ANOS.map(String);
  var porMesPorAno = {};
  labels.forEach(function (ano) {
    porMesPorAno[ano] = mensalDoAno(null, ano);
  });
  return {
    evento: eventoLabel || EVENTO_LATROCINIO,
    anos: labels.slice(),
    labels: labels.slice(),
    anual: labels.map(function (ano) {
      return { ano: ano, valor: 0, mensal: porMesPorAno[ano] };
    }),
    total2025: 0,
    porMesPorAno: porMesPorAno,
    mensal: porMesPorAno["2025"] || mensalDoAno(null, 2025),
  };
}

function montarResposta(rows, eventoLabel) {
  var porAno = {};
  var porMes = {};

  (rows || []).forEach(function (row) {
    var ano = String(row.ano_ref);
    var mes = String(row.mes_ref).padStart(2, "0");
    var ref = ano + "-" + mes;
    var qtd = Number(row.qtd) || 0;
    porAno[ano] = (porAno[ano] || 0) + qtd;
    porMes[ref] = (porMes[ref] || 0) + qtd;
  });

  var labels = ANOS.map(String);
  var porMesPorAno = {};
  var anual = labels.map(function (ano) {
    var mensal = mensalDoAno(porMes, ano);
    porMesPorAno[ano] = mensal;
    return {
      ano: ano,
      valor: porAno[ano] || 0,
      mensal: mensal,
    };
  });

  return {
    evento: eventoLabel || EVENTO_LATROCINIO,
    anos: labels.slice(),
    labels: labels.slice(),
    anual: anual,
    total2025: porAno["2025"] || 0,
    porMesPorAno: porMesPorAno,
    mensal: porMesPorAno["2025"] || mensalDoAno(porMes, 2025),
  };
}

function consultarMunicipio(ufNorm, evento, nome) {
  var sql =
    "SELECT ano_ref, mes_ref, SUM(qtd_vitimas) AS qtd " +
    "FROM ocorrencia_seguranca " +
    "WHERE uf = ? AND evento = ? AND nome_municipio = ? " +
    "GROUP BY ano_ref, mes_ref " +
    "ORDER BY ano_ref, mes_ref";

  return database.executar(sql, [ufNorm, evento, nome]);
}

function consultarEstado(ufNorm, evento) {
  var sql =
    "SELECT ano_ref, mes_ref, SUM(qtd_vitimas) AS qtd " +
    "FROM ocorrencia_seguranca " +
    "WHERE uf = ? AND evento = ? " +
    "GROUP BY ano_ref, mes_ref " +
    "ORDER BY ano_ref, mes_ref";

  return database.executar(sql, [ufNorm, evento]);
}

function resolverNomeNoBanco(ufNorm, nome) {
  var alvo = chaveNome(nome);
  if (!alvo) return Promise.resolve(null);

  var sql =
    "SELECT DISTINCT nome_municipio FROM ocorrencia_seguranca WHERE uf = ?";
  return database.executar(sql, [ufNorm]).then(function (rows) {
    for (var i = 0; i < (rows || []).length; i++) {
      if (chaveNome(rows[i].nome_municipio) === alvo) {
        return rows[i].nome_municipio;
      }
    }
    return null;
  });
}

function buscarPorEvento(uf, nome, evento) {
  var ufNorm = String(uf || "SP").trim().toUpperCase();
  if (!chaveNome(nome)) return Promise.resolve(criarVazio(evento));

  return consultarMunicipio(ufNorm, evento, nome)
    .then(function (rows) {
      if (rows && rows.length) return montarResposta(rows, evento);
      return resolverNomeNoBanco(ufNorm, nome).then(function (nomeReal) {
        if (!nomeReal) return criarVazio(evento);
        return consultarMunicipio(ufNorm, evento, nomeReal).then(function (rows2) {
          return montarResposta(rows2, evento);
        });
      });
    })
    .catch(function (erro) {
      console.log("\nSegurança (" + evento + "):", erro.sqlMessage || erro.message || erro);
      return criarVazio(evento);
    });
}

function buscarLatrocinio(uf, nome) {
  return buscarPorEvento(uf, nome, EVENTO_LATROCINIO);
}

function buscarHomicidio(uf, nome) {
  return buscarPorEvento(uf, nome, EVENTO_HOMICIDIO);
}

function buscarLatrocinioEstado(uf) {
  var ufNorm = String(uf || "SP").trim().toUpperCase();
  return consultarEstado(ufNorm, EVENTO_LATROCINIO)
    .then(function (rows) {
      return montarResposta(rows, EVENTO_LATROCINIO);
    })
    .catch(function (erro) {
      console.log("\nSegurança (latrocínio estado):", erro.sqlMessage || erro.message || erro);
      return criarVazio(EVENTO_LATROCINIO);
    });
}

function carregarMapaUf(uf) {
  var ufNorm = String(uf || "SP").trim().toUpperCase();
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida"));
  }
  return Promise.resolve({});
}

function obterStatusUf(uf) {
  var ufNorm = String(uf || "SP").trim().toUpperCase();

  var sql =
    "SELECT evento, COUNT(*) AS total " +
    "FROM ocorrencia_seguranca WHERE uf = ? GROUP BY evento";

  return database
    .executar(sql, [ufNorm])
    .then(function (rows) {
      var totalLat = 0;
      var totalHom = 0;
      (rows || []).forEach(function (row) {
        if (row.evento === EVENTO_LATROCINIO) totalLat = Number(row.total) || 0;
        if (row.evento === EVENTO_HOMICIDIO) totalHom = Number(row.total) || 0;
      });
      return {
        uf: ufNorm,
        pronto: totalLat > 0,
        homicidioPronto: totalHom > 0,
        carregando: false,
        cacheDisco: true,
        anosIndexados: totalLat > 0 ? ANOS.length : 0,
        progresso: null,
      };
    })
    .catch(function (erro) {
      console.log("\nSegurança (status " + ufNorm + "):", erro.sqlMessage || erro.message || erro);
      return {
        uf: ufNorm,
        pronto: false,
        homicidioPronto: false,
        carregando: false,
        cacheDisco: false,
        anosIndexados: 0,
        progresso: null,
        erro: erro.sqlMessage || erro.message || String(erro),
      };
    });
}

function precarregar(uf) {
  var ufNorm = String(uf || "SP").trim().toUpperCase();
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.resolve(null);
  }

  var sql =
    "SELECT COUNT(*) AS total FROM ocorrencia_seguranca WHERE uf = ? LIMIT 1";
  return database
    .executar(sql, [ufNorm])
    .then(function (rows) {
      var total = rows && rows[0] ? Number(rows[0].total) : 0;
      if (total > 0) {
        console.log(
          "\nSegurança (" + ufNorm + "): " + total + " ocorrências no banco."
        );
        return { uf: ufNorm, total: total };
      }
      console.log(
        "\nSegurança (" + ufNorm + "): nenhuma ocorrência no banco — rode o JAR safety_leitor_excel para popular."
      );
      return null;
    })
    .catch(function (erro) {
      console.log("\nSegurança (precarregar " + ufNorm + "):", erro.sqlMessage || erro.message || erro);
      return null;
    });
}

module.exports = {
  buscarLatrocinio,
  buscarHomicidio,
  buscarLatrocinioEstado,
  carregarMapaUf,
  obterStatusUf,
  precarregar,
  EVENTO_LATROCINIO,
  EVENTO_HOMICIDIO,
  criarVazio,
  ANOS,
};
