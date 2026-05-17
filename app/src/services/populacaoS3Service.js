var fs = require("fs");
var path = require("path");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var OBJECT_KEY =
  process.env.S3_POPULACAO_KEY || "populacao_municipios_2025.xls";
var REGION = process.env.AWS_REGION || "us-east-1";

var UFS_VALIDAS = {
  AC: 1,
  AL: 1,
  AP: 1,
  AM: 1,
  BA: 1,
  CE: 1,
  DF: 1,
  ES: 1,
  GO: 1,
  MA: 1,
  MT: 1,
  MS: 1,
  MG: 1,
  PA: 1,
  PB: 1,
  PR: 1,
  PE: 1,
  PI: 1,
  RJ: 1,
  RN: 1,
  RS: 1,
  RO: 1,
  RR: 1,
  SC: 1,
  SP: 1,
  SE: 1,
  TO: 1,
};

function isUfValida(uf) {
  return UFS_VALIDAS[String(uf || "").trim().toUpperCase()] === 1;
}

function normalizarUfCelula(val) {
  var s = String(val == null ? "" : val)
    .trim()
    .toUpperCase();
  return isUfValida(s) ? s : null;
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

function parsePopulacao(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number" && !isNaN(valor)) return Math.round(valor);
  var texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  var n = parseFloat(texto);
  return isNaN(n) ? null : Math.round(n);
}

function normHeader(cell) {
  return String(cell == null ? "" : cell)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectarColunas(headerRow) {
  if (!headerRow || !headerRow.length) return null;

  var h = headerRow.map(normHeader);
  var nome = -1;
  var pop = -1;
  var uf = -1;

  for (var i = 0; i < h.length; i++) {
    var s = h[i];
    if (!s) continue;

    if (s === "uf" || s === "sigla uf") uf = i;

    if (
      pop < 0 &&
      (s.includes("populacao") ||
        s.includes("pop estimada") ||
        s === "pop" ||
        s.includes("habitante"))
    )
      pop = i;

    if (
      s.includes("nome do municipio") ||
      s.includes("nome municipio") ||
      s.includes("municipio")
    )
      nome = i;
    else if (nome < 0 && s.includes("nome") && !s.includes("cod")) nome = i;
  }

  if (nome >= 0 && pop >= 0) {
    return { nome: nome, pop: pop, uf: uf };
  }
  return null;
}

function colunasPadrao() {
  return {
    nome: parseInt(process.env.POP_COL_NOME || "3", 10),
    pop: parseInt(process.env.POP_COL_POPULACAO || "4", 10),
    uf: parseInt(process.env.POP_COL_UF || "0", 10),
  };
}

function parsePlanilha(linhas, opts) {
  opts = opts || {};
  var ufFiltro = opts.uf ? String(opts.uf).trim().toUpperCase() : null;
  var retornarLista = !!opts.lista;
  var mapa = {};
  var lista = [];

  if (!linhas.length) return retornarLista ? lista : mapa;

  var cols = detectarColunas(linhas[0]);
  var inicio = 1;
  if (!cols) {
    cols = colunasPadrao();
    var h0 = linhas[0];
    var pareceDado =
      h0 &&
      parsePopulacao(h0[cols.pop]) != null &&
      h0[cols.nome] &&
      String(h0[cols.nome]).length > 1;
    if (pareceDado) inicio = 0;
  }

  if (cols.uf < 0 && colunasPadrao().uf >= 0) {
    cols.uf = colunasPadrao().uf;
  }

  for (var r = inicio; r < linhas.length; r++) {
    var row = linhas[r];
    if (!row) continue;

    var ufRow = cols.uf >= 0 ? normalizarUfCelula(row[cols.uf]) : null;
    if (ufFiltro) {
      if (!ufRow || ufRow !== ufFiltro) continue;
    }

    var nome = limparNome(row[cols.nome]);
    if (!nome) continue;

    var pop = parsePopulacao(row[cols.pop]);
    if (pop == null) continue;

    if (retornarLista) {
      lista.push({
        id: null,
        nome: nome,
        uf: ufRow || ufFiltro,
        pop: pop,
        idhm_geral: null,
        idhm: null,
        renda: null,
        educacao: null,
        longevidade: null,
      });
    } else {
      mapa[chaveNome(nome)] = pop;
    }
  }

  if (retornarLista) {
    lista.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), "pt-BR", {
        sensitivity: "base",
      });
    });
    return lista;
  }

  return mapa;
}

function parseBuffer(buffer, ufFiltro) {
  var workbook = XLSX.read(buffer, { type: "buffer" });
  var sheet = workbook.Sheets[workbook.SheetNames[0]];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parsePlanilha(linhas, { uf: ufFiltro });
}

function parseListaPorUf(buffer, uf) {
  var workbook = XLSX.read(buffer, { type: "buffer" });
  var sheet = workbook.Sheets[workbook.SheetNames[0]];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return parsePlanilha(linhas, { uf: uf, lista: true });
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

function carregarBuffer() {
  return carregarLocalBuffer().catch(function () {
    return carregarS3Buffer();
  });
}

function carregarLocalBuffer() {
  var nomeArq =
    OBJECT_KEY.split("/").pop() || "populacao_municipios_2025.xls";
  var baseTecnico = path.join(__dirname, "..", "..", "..");
  var baseRaiz = path.join(baseTecnico, "..");
  var candidatos = [
    process.env.S3_POPULACAO_LOCAL_PATH,
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

function carregarS3Buffer() {
  var client = new S3Client({ region: REGION });
  return client
    .send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: OBJECT_KEY,
      })
    )
    .then(function (resposta) {
      return streamToBuffer(resposta.Body);
    });
}

var cacheMapaPorUf = {};
var cacheListaPorUf = {};
var cacheEmPorUf = {};
var CACHE_MS = 5 * 60 * 1000;

function carregarMapa(uf) {
  var ufNorm = isUfValida(uf) ? String(uf).trim().toUpperCase() : "SP";
  var agora = Date.now();
  var cacheMapa = cacheMapaPorUf[ufNorm];
  var cacheEm = cacheEmPorUf[ufNorm] || 0;

  if (cacheMapa && Object.keys(cacheMapa).length > 0 && agora - cacheEm < CACHE_MS) {
    return Promise.resolve(cacheMapa);
  }

  return carregarBuffer()
    .then(function (buffer) {
      return parseBuffer(buffer, ufNorm);
    })
    .then(function (mapa) {
      if (!mapa || Object.keys(mapa).length === 0) {
        return Promise.reject(
          new Error("Mapa de população vazio para UF " + ufNorm)
        );
      }
      cacheMapaPorUf[ufNorm] = mapa;
      cacheEmPorUf[ufNorm] = agora;
      return mapa;
    });
}

function listarMunicipiosPorUf(uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  if (!isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida"));
  }

  var agora = Date.now();
  var cacheLista = cacheListaPorUf[ufNorm];
  var cacheEm = cacheEmPorUf[ufNorm] || 0;

  if (cacheLista && cacheLista.length > 0 && agora - cacheEm < CACHE_MS) {
    return Promise.resolve(cacheLista);
  }

  return carregarBuffer()
    .then(function (buffer) {
      return parseListaPorUf(buffer, ufNorm);
    })
    .then(function (lista) {
      if (!lista || !lista.length) {
        return Promise.reject(
          new Error("Nenhum município encontrado para UF " + ufNorm)
        );
      }
      cacheListaPorUf[ufNorm] = lista;
      cacheEmPorUf[ufNorm] = agora;
      console.log(
        "\nMunicípios (" +
          ufNorm +
          "): " +
          lista.length +
          " carregados da planilha de população."
      );
      return lista;
    });
}

function buscarPorNomeUf(nome, uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  if (!isUfValida(ufNorm)) {
    return Promise.resolve(null);
  }
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
      console.log("\nPopulação (planilha):", erro.message || erro);
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
  parseBuffer,
};
