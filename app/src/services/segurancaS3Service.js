var fs = require("fs");
var path = require("path");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
var populacaoS3Service = require("./populacaoS3Service");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var REGION = process.env.AWS_REGION || "us-east-1";
var EVENTO_LATROCINIO = "Roubo seguido de morte (latrocínio)";

var ANOS = [2021, 2022, 2023, 2024, 2025];

var MESES_2025 = [
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
];

var LABELS_MES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function chaveNome(nome) {
  return populacaoS3Service.chaveNome(nome);
}

function chavesBusca(nome) {
  var base = chaveNome(nome);
  if (!base) return [];
  var set = {};
  set[base] = 1;
  var semHifen = base.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (semHifen) set[semHifen] = 1;
  var semEspaco = base.replace(/[\s-]+/g, "");
  if (semEspaco) set[semEspaco] = 1;
  return Object.keys(set);
}

function buscarNoMapa(mapa, nome) {
  var chaves = chavesBusca(nome);
  for (var i = 0; i < chaves.length; i++) {
    if (mapa[chaves[i]]) return mapa[chaves[i]];
  }
  return null;
}

function mesReferencia(serial) {
  if (serial == null || serial === "") return null;
  var d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y || !d.m) return null;
  return d.y + "-" + String(d.m).padStart(2, "0");
}

function parseVitima(valor) {
  var n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

function criarVazio() {
  var labels = ANOS.map(String);
  var porMesPorAno = {};
  labels.forEach(function (ano) {
    porMesPorAno[ano] = mensalDoAno(null, ano);
  });
  return {
    evento: EVENTO_LATROCINIO,
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

function parsePlanilhaLatrocinio(linhas, ufFiltro, anoRef) {
  var mapa = {};
  var ufNorm = ufFiltro ? String(ufFiltro).trim().toUpperCase() : null;
  var prefixoAno = String(anoRef) + "-";

  for (var i = 1; i < linhas.length; i++) {
    var row = linhas[i];
    if (!row || row[2] !== EVENTO_LATROCINIO) continue;

    var uf = String(row[0] || "")
      .trim()
      .toUpperCase();
    if (ufNorm && uf !== ufNorm) continue;

    var nome = String(row[1] || "").trim();
    if (!nome) continue;

    var key = chaveNome(nome);
    if (!key) continue;

    var ref = mesReferencia(row[3]);
    var qtd = parseVitima(row[10]);
    if (qtd <= 0) qtd = parseVitima(row[11]);

    if (!mapa[key]) {
      mapa[key] = { total: 0, porMes: {} };
    }
    if (ref && ref.indexOf(prefixoAno) === 0) {
      mapa[key].porMes[ref] = (mapa[key].porMes[ref] || 0) + qtd;
      mapa[key].total += qtd;
    }
  }

  return mapa;
}

function mesclarMapasPorAno(partes) {
  var mapa = {};

  partes.forEach(function (parte) {
    var ano = String(parte.ano);
    var parcial = parte.mapa || {};

    Object.keys(parcial).forEach(function (key) {
      if (!mapa[key]) {
        mapa[key] = { porAno: {}, porMes: {} };
      }
      mapa[key].porAno[ano] = parcial[key].total || 0;
      var porMes = parcial[key].porMes || {};
      Object.keys(porMes).forEach(function (ref) {
        mapa[key].porMes[ref] = porMes[ref];
      });
    });
  });

  return mapa;
}

function mapaParaResposta(entrada) {
  if (!entrada) return criarVazio();

  var labels = ANOS.map(String);
  var porMesPorAno = {};
  var anual = labels.map(function (ano) {
    var mensal = mensalDoAno(entrada.porMes, ano);
    porMesPorAno[ano] = mensal;
    return {
      ano: ano,
      valor: (entrada.porAno && entrada.porAno[ano]) || 0,
      mensal: mensal,
    };
  });

  return {
    evento: EVENTO_LATROCINIO,
    anos: labels.slice(),
    labels: labels.slice(),
    anual: anual,
    total2025: (entrada.porAno && entrada.porAno["2025"]) || 0,
    porMesPorAno: porMesPorAno,
    mensal: porMesPorAno["2025"] || mensalDoAno(entrada.porMes, 2025),
  };
}

var READ_OPTS = {
  type: "buffer",
  cellNF: false,
  cellStyles: false,
  bookVBA: false,
};

function dirCache() {
  return path.join(__dirname, "..", "..", "cache");
}

function arquivoCacheUf(ufNorm) {
  return path.join(dirCache(), "latrocinio_" + ufNorm + ".json");
}

function resolverArquivoLocalAno(ano) {
  var nomeArq = nomeArquivoAno(ano);
  var baseTecnico = path.join(__dirname, "..", "..", "..");
  var baseRaiz = path.join(baseTecnico, "..");
  var candidatos = [
    process.env.S3_SEGURANCA_LOCAL_PATH
      ? path.join(path.dirname(process.env.S3_SEGURANCA_LOCAL_PATH), nomeArq)
      : null,
    path.join(baseRaiz, "safety_leitor_excel", nomeArq),
    path.join(baseTecnico, nomeArq),
  ].filter(Boolean);

  for (var i = 0; i < candidatos.length; i++) {
    var arquivo = path.resolve(candidatos[i]);
    if (fs.existsSync(arquivo)) return arquivo;
  }
  return null;
}

function cacheDiscoValido(ufNorm) {
  var cacheFile = arquivoCacheUf(ufNorm);
  if (!fs.existsSync(cacheFile)) return false;
  var cacheMtime = fs.statSync(cacheFile).mtimeMs;
  for (var i = 0; i < ANOS.length; i++) {
    var arq = resolverArquivoLocalAno(ANOS[i]);
    if (arq && fs.statSync(arq).mtimeMs > cacheMtime) return false;
  }
  return true;
}

function lerCacheDisco(ufNorm) {
  return JSON.parse(fs.readFileSync(arquivoCacheUf(ufNorm), "utf8"));
}

function gravarCacheDisco(ufNorm, mapa) {
  var dir = dirCache();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(arquivoCacheUf(ufNorm), JSON.stringify(mapa));
}

function parseBuffer(buffer, uf, ano) {
  var workbook = XLSX.read(buffer, READ_OPTS);
  var anoStr = String(ano);
  var nomeAba =
    workbook.SheetNames.indexOf(anoStr) >= 0
      ? anoStr
      : workbook.SheetNames[0];
  var sheet = workbook.Sheets[nomeAba];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parsePlanilhaLatrocinio(linhas, uf, ano);
}

function streamToBuffer(stream) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    stream.on("data", function (chunk) {
      chunks.push(chunk);
    });
    stream.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", reject);
  });
}

function nomeArquivoAno(ano) {
  return "banco_seguranca_" + ano + ".xlsx";
}

function carregarLocalBufferAno(ano) {
  var nomeArq = nomeArquivoAno(ano);
  var baseTecnico = path.join(__dirname, "..", "..", "..");
  var baseRaiz = path.join(baseTecnico, "..");
  var candidatos = [
    process.env.S3_SEGURANCA_LOCAL_PATH
      ? path.join(path.dirname(process.env.S3_SEGURANCA_LOCAL_PATH), nomeArq)
      : null,
    path.join(baseRaiz, "safety_leitor_excel", nomeArq),
    path.join(baseTecnico, nomeArq),
  ].filter(Boolean);

  for (var i = 0; i < candidatos.length; i++) {
    var arquivo = path.resolve(candidatos[i]);
    if (fs.existsSync(arquivo)) {
      return Promise.resolve(fs.readFileSync(arquivo));
    }
  }

  return Promise.reject(
    new Error("Planilha " + nomeArq + " não encontrada localmente")
  );
}

function carregarS3BufferAno(ano) {
  var key = process.env["S3_SEGURANCA_" + ano + "_KEY"] || nomeArquivoAno(ano);
  var client = new S3Client({ region: REGION });
  return client
    .send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    )
    .then(function (resposta) {
      return streamToBuffer(resposta.Body);
    });
}

function carregarBufferAno(ano) {
  return carregarLocalBufferAno(ano).catch(function () {
    return carregarS3BufferAno(ano);
  });
}

var cacheMapaPorUf = {};
var cacheEmPorUf = {};
var cacheCarregandoPorUf = {};
var progressoPorUf = {};
var CACHE_MS = 15 * 60 * 1000;

function aplicarMapaEmCache(ufNorm, mapa) {
  cacheMapaPorUf[ufNorm] = mapa;
  cacheEmPorUf[ufNorm] = Date.now();
  return mapa;
}

function carregarMapaUfFromExcel(ufNorm) {
  var partes = [];
  var indice = 0;

  function proximoAno() {
    if (indice >= ANOS.length) {
      var mapa = mesclarMapasPorAno(partes);
      try {
        gravarCacheDisco(ufNorm, mapa);
        console.log(
          "\nSegurança: cache em disco salvo (" + ufNorm + ")."
        );
      } catch (erro) {
        console.log(
          "\nSegurança: falha ao gravar cache:",
          erro.message || erro
        );
      }
      delete progressoPorUf[ufNorm];
      console.log(
        "\nSegurança (latrocínio " +
          ufNorm +
          ", " +
          ANOS[0] +
          "–" +
          ANOS[ANOS.length - 1] +
          "): " +
          Object.keys(mapa).length +
          " municípios indexados."
      );
      return aplicarMapaEmCache(ufNorm, mapa);
    }

    var ano = ANOS[indice];
    progressoPorUf[ufNorm] = {
      carregando: true,
      ano: ano,
      indice: indice + 1,
      total: ANOS.length,
    };
    indice++;

    return carregarBufferAno(ano)
      .then(function (buffer) {
        console.log(
          "\nSegurança: processando planilha " + ano + " (" + ufNorm + ")…"
        );
        partes.push({
          ano: ano,
          mapa: parseBuffer(buffer, ufNorm, ano),
        });
        return proximoAno();
      })
      .catch(function (erro) {
        console.log("\nSegurança (" + ano + "):", erro.message || erro);
        partes.push({ ano: ano, mapa: {} });
        return proximoAno();
      });
  }

  progressoPorUf[ufNorm] = {
    carregando: true,
    ano: null,
    indice: 0,
    total: ANOS.length,
  };
  return proximoAno();
}

function carregarMapaUf(uf) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida"));
  }

  var agora = Date.now();
  var cacheMapa = cacheMapaPorUf[ufNorm];
  var cacheEm = cacheEmPorUf[ufNorm] || 0;

  if (cacheMapa && Object.keys(cacheMapa).length > 0 && agora - cacheEm < CACHE_MS) {
    return Promise.resolve(cacheMapa);
  }

  if (cacheDiscoValido(ufNorm)) {
    try {
      var doDisco = lerCacheDisco(ufNorm);
      console.log(
        "\nSegurança: latrocínio " +
          ufNorm +
          " carregado do cache em disco (" +
          Object.keys(doDisco).length +
          " municípios)."
      );
      return Promise.resolve(aplicarMapaEmCache(ufNorm, doDisco));
    } catch (erro) {
      console.log("\nSegurança: cache em disco inválido:", erro.message || erro);
    }
  }

  if (cacheCarregandoPorUf[ufNorm]) {
    return cacheCarregandoPorUf[ufNorm];
  }

  cacheCarregandoPorUf[ufNorm] = carregarMapaUfFromExcel(ufNorm).finally(function () {
    delete cacheCarregandoPorUf[ufNorm];
  });

  return cacheCarregandoPorUf[ufNorm];
}

function obterStatusUf(uf) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  var prog = progressoPorUf[ufNorm];
  var pronto =
    cacheMapaPorUf[ufNorm] && Object.keys(cacheMapaPorUf[ufNorm]).length > 0;
  return {
    uf: ufNorm,
    pronto: !!pronto,
    carregando: !!cacheCarregandoPorUf[ufNorm] || !!(prog && prog.carregando),
    cacheDisco: cacheDiscoValido(ufNorm),
    progresso: prog || null,
  };
}

function precarregar(uf) {
  return carregarMapaUf(uf || "SP");
}

function buscarLatrocinio(uf, nome) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!chavesBusca(nome).length) {
    return Promise.resolve(criarVazio());
  }

  return carregarMapaUf(ufNorm)
    .then(function (mapa) {
      return mapaParaResposta(buscarNoMapa(mapa, nome));
    })
    .catch(function (erro) {
      console.log("\nSegurança (latrocínio):", erro.message || erro);
      return criarVazio();
    });
}

module.exports = {
  buscarLatrocinio,
  carregarMapaUf,
  obterStatusUf,
  precarregar,
  EVENTO_LATROCINIO,
  criarVazio,
  ANOS,
};
