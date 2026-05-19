var fs = require("fs");
var path = require("path");
var { Worker } = require("worker_threads");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
var populacaoS3Service = require("./populacaoS3Service");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var REGION = process.env.AWS_REGION || "us-east-1";
var EVENTO_LATROCINIO = "Roubo seguido de morte (latrocínio)";
var EVENTO_HOMICIDIO = "Homicídio doloso";

var SLUGS_EVENTO = ["latrocinio", "homicidio"];

function eventoParaSlug(eventoStr) {
  if (eventoStr === EVENTO_LATROCINIO) return "latrocinio";
  if (eventoStr === EVENTO_HOMICIDIO) return "homicidio";
  return null;
}

function criarEntradaPorEvento() {
  var entrada = {};
  SLUGS_EVENTO.forEach(function (slug) {
    entrada[slug] = { porAno: {}, porMes: {} };
  });
  return entrada;
}

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

function buscarNoMapa(mapa, nome, slug) {
  var chaves = chavesBusca(nome);
  for (var i = 0; i < chaves.length; i++) {
    var item = mapa[chaves[i]];
    if (item && item[slug]) return item[slug];
  }
  return null;
}

function agregarMapaEstado(mapa, slug) {
  var entrada = { porAno: {}, porMes: {} };
  Object.keys(mapa || {}).forEach(function (key) {
    var item = mapa[key] && mapa[key][slug];
    if (!item) return;
    Object.keys(item.porAno || {}).forEach(function (ano) {
      entrada.porAno[ano] = (entrada.porAno[ano] || 0) + (item.porAno[ano] || 0);
    });
    Object.keys(item.porMes || {}).forEach(function (ref) {
      entrada.porMes[ref] = (entrada.porMes[ref] || 0) + (item.porMes[ref] || 0);
    });
  });
  return entrada;
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

var CHUNK_LINHAS_SEGURANCA = 6000;

function processarLinhaSeguranca(mapa, row, ufNorm, prefixoAno) {
  if (!row) return;

  var slug = eventoParaSlug(row[2]);
  if (!slug) return;

  var uf = String(row[0] || "")
    .trim()
    .toUpperCase();
  if (ufNorm && uf !== ufNorm) return;

  var nome = String(row[1] || "").trim();
  if (!nome) return;

  var key = chaveNome(nome);
  if (!key) return;

  var ref = mesReferencia(row[3]);
  var qtd = parseVitima(row[10]);
  if (qtd <= 0) qtd = parseVitima(row[11]);

  if (!mapa[key]) {
    mapa[key] = {};
  }
  if (!mapa[key][slug]) {
    mapa[key][slug] = { total: 0, porMes: {} };
  }
  if (ref && ref.indexOf(prefixoAno) === 0) {
    mapa[key][slug].porMes[ref] =
      (mapa[key][slug].porMes[ref] || 0) + qtd;
    mapa[key][slug].total += qtd;
  }
}

function parsePlanilhaSeguranca(linhas, ufFiltro, anoRef) {
  var mapa = {};
  var ufNorm = ufFiltro ? String(ufFiltro).trim().toUpperCase() : null;
  var prefixoAno = String(anoRef) + "-";

  for (var i = 1; i < linhas.length; i++) {
    processarLinhaSeguranca(mapa, linhas[i], ufNorm, prefixoAno);
  }

  return mapa;
}

function parsePlanilhaSegurancaChunked(linhas, ufFiltro, anoRef) {
  var mapa = {};
  var ufNorm = ufFiltro ? String(ufFiltro).trim().toUpperCase() : null;
  var prefixoAno = String(anoRef) + "-";
  var i = 1;

  return new Promise(function (resolve) {
    function step() {
      var fim = Math.min(i + CHUNK_LINHAS_SEGURANCA, linhas.length);
      for (; i < fim; i++) {
        processarLinhaSeguranca(mapa, linhas[i], ufNorm, prefixoAno);
      }
      if (i < linhas.length) {
        setImmediate(step);
      } else {
        resolve(mapa);
      }
    }
    setImmediate(step);
  });
}

function mesclarMapasPorAno(partes) {
  var mapa = {};

  partes.forEach(function (parte) {
    var ano = String(parte.ano);
    var parcial = parte.mapa || {};

    Object.keys(parcial).forEach(function (key) {
      if (!mapa[key]) {
        mapa[key] = criarEntradaPorEvento();
      }
      SLUGS_EVENTO.forEach(function (slug) {
        var src = parcial[key] && parcial[key][slug];
        if (!src) return;
        mapa[key][slug].porAno[ano] = src.total || 0;
        var porMes = src.porMes || {};
        Object.keys(porMes).forEach(function (ref) {
          mapa[key][slug].porMes[ref] = porMes[ref];
        });
      });
    });
  });

  return mapa;
}

function mapaParaResposta(entrada, eventoLabel) {
  if (!entrada) return criarVazio(eventoLabel);

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
    evento: eventoLabel || EVENTO_LATROCINIO,
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
  return path.join(dirCache(), "seguranca_" + ufNorm + ".json");
}

function arquivoCacheLegadoUf(ufNorm) {
  return path.join(dirCache(), "latrocinio_" + ufNorm + ".json");
}

function mapaEhFormatoLegado(amostra) {
  return !!(amostra && amostra.porAno && !amostra.latrocinio);
}

function normalizarMapaCache(mapa) {
  if (!mapa || typeof mapa !== "object") return mapa;
  var keys = Object.keys(mapa);
  if (!keys.length) return mapa;
  if (!mapaEhFormatoLegado(mapa[keys[0]])) return mapa;

  var out = {};
  keys.forEach(function (key) {
    var leg = mapa[key];
    out[key] = criarEntradaPorEvento();
    out[key].latrocinio = {
      porAno: Object.assign({}, leg.porAno || {}),
      porMes: Object.assign({}, leg.porMes || {}),
    };
  });
  return out;
}

function cacheTemDadosHomicidio(mapa) {
  var keys = Object.keys(mapa || {});
  var limite = Math.min(keys.length, 100);
  for (var i = 0; i < limite; i++) {
    var h = mapa[keys[i]] && mapa[keys[i]].homicidio;
    if (!h || !h.porAno) continue;
    var anos = Object.keys(h.porAno);
    for (var j = 0; j < anos.length; j++) {
      if ((h.porAno[anos[j]] || 0) > 0) return true;
    }
  }
  return false;
}

function resolverArquivoCacheDisco(ufNorm) {
  var atual = arquivoCacheUf(ufNorm);
  if (fs.existsSync(atual)) return atual;
  var legado = arquivoCacheLegadoUf(ufNorm);
  if (fs.existsSync(legado)) return legado;
  return null;
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
  var cacheFile = resolverArquivoCacheDisco(ufNorm);
  if (!cacheFile) return false;
  var cacheMtime = fs.statSync(cacheFile).mtimeMs;
  for (var i = 0; i < ANOS.length; i++) {
    var arq = resolverArquivoLocalAno(ANOS[i]);
    if (arq && fs.statSync(arq).mtimeMs > cacheMtime) return false;
  }
  return true;
}

function lerCacheDisco(ufNorm) {
  var cacheFile = resolverArquivoCacheDisco(ufNorm);
  if (!cacheFile) return null;
  var mapa = normalizarMapaCache(
    JSON.parse(fs.readFileSync(cacheFile, "utf8"))
  );
  if (cacheFile !== arquivoCacheUf(ufNorm)) {
    try {
      gravarCacheDisco(ufNorm, mapa);
      console.log(
        "\nSegurança: cache legado (latrocínio) migrado para " + ufNorm + "."
      );
    } catch (erro) {
      console.log(
        "\nSegurança: falha ao migrar cache legado:",
        erro.message || erro
      );
    }
  }
  return mapa;
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
  return parsePlanilhaSeguranca(linhas, uf, ano);
}

function parseBufferAsync(buffer, uf, ano) {
  return new Promise(function (resolve, reject) {
    var worker = new Worker(
      path.join(__dirname, "segurancaPlanilhaWorker.js"),
      { workerData: { buffer: buffer, uf: uf, ano: ano } }
    );

    worker.on("message", function (mapa) {
      if (mapa && mapa.__erro) {
        reject(new Error(mapa.__erro));
        return;
      }
      resolve(mapa);
    });
    worker.on("error", reject);
    worker.on("exit", function (code) {
      if (code !== 0) {
        reject(
          new Error("Worker de planilha encerrou com código " + code)
        );
      }
    });
  });
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
var reindexAgendadoPorUf = {};
var progressoPorUf = {};
var anosIndexadosPorUf = {};
var CACHE_MS = 15 * 60 * 1000;
var CONCORRENCIA_ANOS = 2;

function aplicarMapaEmCache(ufNorm, mapa) {
  var norm = normalizarMapaCache(mapa);
  cacheMapaPorUf[ufNorm] = norm;
  cacheEmPorUf[ufNorm] = Date.now();
  return norm;
}

function executarComLimite(itens, limite, fn) {
  return new Promise(function (resolve, reject) {
    if (!itens.length) {
      resolve([]);
      return;
    }

    var resultados = new Array(itens.length);
    var proximoIndice = 0;
    var emExecucao = 0;
    var falhou = false;

    function iniciarProximo() {
      while (!falhou && emExecucao < limite && proximoIndice < itens.length) {
        var indiceAtual = proximoIndice++;
        emExecucao++;
        fn(itens[indiceAtual], indiceAtual)
          .then(function (valor) {
            resultados[indiceAtual] = valor;
            emExecucao--;
            finalizarOuContinuar();
          })
          .catch(function (erro) {
            falhou = true;
            reject(erro);
          });
      }
    }

    function finalizarOuContinuar() {
      if (falhou) return;
      if (proximoIndice >= itens.length && emExecucao === 0) {
        resolve(resultados);
        return;
      }
      iniciarProximo();
    }

    iniciarProximo();
  });
}

function aplicarPartesParciais(ufNorm, partes) {
  var ordenadas = partes.slice().sort(function (a, b) {
    return ANOS.indexOf(a.ano) - ANOS.indexOf(b.ano);
  });
  var mapaParcial = mesclarMapasPorAno(ordenadas);
  if (!Object.keys(mapaParcial).length) return mapaParcial;

  aplicarMapaEmCache(ufNorm, mapaParcial);
  anosIndexadosPorUf[ufNorm] = ordenadas.length;
  progressoPorUf[ufNorm] = {
    carregando: true,
    ano: ordenadas[ordenadas.length - 1].ano,
    indice: ordenadas.length,
    total: ANOS.length,
  };

  try {
    gravarCacheDisco(ufNorm, mapaParcial);
  } catch (erro) {
    console.log(
      "\nSegurança: falha ao gravar cache parcial:",
      erro.message || erro
    );
  }

  return mapaParcial;
}

function agendarReindexacaoCompleta(ufNorm) {
  if (cacheCarregandoPorUf[ufNorm] || reindexAgendadoPorUf[ufNorm]) {
    return;
  }
  reindexAgendadoPorUf[ufNorm] = true;
  console.log(
    "\nSegurança: reindexação em segundo plano (" +
      ufNorm +
      ", homicídio + atualização)…"
  );
  cacheCarregandoPorUf[ufNorm] = carregarMapaUfFromExcel(ufNorm).finally(
    function () {
      delete cacheCarregandoPorUf[ufNorm];
      delete reindexAgendadoPorUf[ufNorm];
      delete anosIndexadosPorUf[ufNorm];
    }
  );
}

function iniciarCarregamentoSeguranca(ufNorm) {
  if (cacheCarregandoPorUf[ufNorm] || reindexAgendadoPorUf[ufNorm]) {
    return;
  }
  if (mapaEmMemoriaValido(ufNorm)) return;
  if (tentarCarregarDoDisco(ufNorm)) return;

  console.log("\nSegurança: indexação (" + ufNorm + ")…");
  cacheCarregandoPorUf[ufNorm] = carregarMapaUfFromExcel(ufNorm).finally(
    function () {
      delete cacheCarregandoPorUf[ufNorm];
      delete anosIndexadosPorUf[ufNorm];
    }
  );
}

function carregarMapaUfFromExcel(ufNorm) {
  var partesAcumuladas = [];

  progressoPorUf[ufNorm] = {
    carregando: true,
    ano: null,
    indice: 0,
    total: ANOS.length,
  };

  function processarAno(ano) {
    return carregarBufferAno(ano)
      .then(function (buffer) {
        console.log(
          "\nSegurança: processando planilha " + ano + " (" + ufNorm + ")…"
        );
        return parseBufferAsync(buffer, ufNorm, ano);
      })
      .then(function (mapaAno) {
        var parte = { ano: ano, mapa: mapaAno };
        partesAcumuladas.push(parte);
        aplicarPartesParciais(ufNorm, partesAcumuladas);
        return parte;
      })
      .catch(function (erro) {
        console.log("\nSegurança (" + ano + "):", erro.message || erro);
        var parte = { ano: ano, mapa: {} };
        partesAcumuladas.push(parte);
        aplicarPartesParciais(ufNorm, partesAcumuladas);
        return parte;
      });
  }

  return executarComLimite(ANOS, CONCORRENCIA_ANOS, processarAno)
    .then(function (partes) {
      var mapa = mesclarMapasPorAno(
        partes.filter(function (p) {
          return p && p.ano;
        })
      );
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
        "\nSegurança (" +
          ufNorm +
          ", " +
          ANOS[0] +
          "–" +
          ANOS[ANOS.length - 1] +
          "): " +
          Object.keys(mapa).length +
          " municípios indexados (latrocínio + homicídio)."
      );
      return aplicarMapaEmCache(ufNorm, mapa);
    });
}

function mapaEmMemoriaValido(ufNorm) {
  var agora = Date.now();
  var cacheMapa = cacheMapaPorUf[ufNorm];
  var cacheEm = cacheEmPorUf[ufNorm] || 0;
  return (
    cacheMapa &&
    Object.keys(cacheMapa).length > 0 &&
    agora - cacheEm < CACHE_MS
  );
}

function tentarCarregarDoDisco(ufNorm) {
  if (!cacheDiscoValido(ufNorm)) return null;
  try {
    var doDisco = lerCacheDisco(ufNorm);
    if (doDisco && Object.keys(doDisco).length > 0) {
      console.log(
        "\nSegurança: " +
          ufNorm +
          " carregado do cache em disco (" +
          Object.keys(doDisco).length +
          " municípios)."
      );
      var mapaDisco = aplicarMapaEmCache(ufNorm, doDisco);
      if (!cacheTemDadosHomicidio(mapaDisco)) {
        agendarReindexacaoCompleta(ufNorm);
      }
      return mapaDisco;
    }
  } catch (erro) {
    console.log("\nSegurança: cache em disco inválido:", erro.message || erro);
  }
  return null;
}

function iniciarCarregamentoEmSegundoPlano(ufNorm) {
  iniciarCarregamentoSeguranca(ufNorm);
}

function resolverMapaParaConsulta(ufNorm) {
  if (mapaEmMemoriaValido(ufNorm)) {
    return Promise.resolve(cacheMapaPorUf[ufNorm]);
  }

  var doDisco = tentarCarregarDoDisco(ufNorm);
  if (doDisco) {
    return Promise.resolve(doDisco);
  }

  iniciarCarregamentoEmSegundoPlano(ufNorm);
  return Promise.resolve(null);
}

function carregarMapaUf(uf) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida"));
  }

  if (mapaEmMemoriaValido(ufNorm)) {
    return Promise.resolve(cacheMapaPorUf[ufNorm]);
  }

  var doDisco = tentarCarregarDoDisco(ufNorm);
  if (doDisco) {
    return Promise.resolve(doDisco);
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
  var mapa = cacheMapaPorUf[ufNorm];
  var pronto = mapa && Object.keys(mapa).length > 0;
  var homicidioPronto = pronto && cacheTemDadosHomicidio(mapa);
  return {
    uf: ufNorm,
    pronto: !!pronto,
    homicidioPronto: !!homicidioPronto,
    carregando: !!cacheCarregandoPorUf[ufNorm] || !!(prog && prog.carregando),
    cacheDisco: cacheDiscoValido(ufNorm),
    anosIndexados: anosIndexadosPorUf[ufNorm] || (pronto ? ANOS.length : 0),
    progresso: prog || null,
  };
}

function precarregar(uf) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();

  if (mapaEmMemoriaValido(ufNorm)) {
    return Promise.resolve(cacheMapaPorUf[ufNorm]);
  }

  var doDisco = tentarCarregarDoDisco(ufNorm);
  if (doDisco) {
    return Promise.resolve(doDisco);
  }

  iniciarCarregamentoSeguranca(ufNorm);
  return Promise.resolve(null);
}

function buscarLatrocinio(uf, nome) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!chavesBusca(nome).length) {
    return Promise.resolve(criarVazio(EVENTO_LATROCINIO));
  }

  return resolverMapaParaConsulta(ufNorm)
    .then(function (mapa) {
      if (!mapa) return criarVazio(EVENTO_LATROCINIO);
      return mapaParaResposta(
        buscarNoMapa(mapa, nome, "latrocinio"),
        EVENTO_LATROCINIO
      );
    })
    .catch(function (erro) {
      console.log("\nSegurança (latrocínio):", erro.message || erro);
      return criarVazio(EVENTO_LATROCINIO);
    });
}

function buscarHomicidio(uf, nome) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!chavesBusca(nome).length) {
    return Promise.resolve(criarVazio(EVENTO_HOMICIDIO));
  }

  return resolverMapaParaConsulta(ufNorm)
    .then(function (mapa) {
      if (!mapa) return criarVazio(EVENTO_HOMICIDIO);
      return mapaParaResposta(
        buscarNoMapa(mapa, nome, "homicidio"),
        EVENTO_HOMICIDIO
      );
    })
    .catch(function (erro) {
      console.log("\nSegurança (homicídio):", erro.message || erro);
      return criarVazio(EVENTO_HOMICIDIO);
    });
}

function buscarLatrocinioEstado(uf) {
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  return resolverMapaParaConsulta(ufNorm)
    .then(function (mapa) {
      if (!mapa) return criarVazio(EVENTO_LATROCINIO);
      return mapaParaResposta(
        agregarMapaEstado(mapa, "latrocinio"),
        EVENTO_LATROCINIO
      );
    })
    .catch(function (erro) {
      console.log("\nSegurança (latrocínio estado):", erro.message || erro);
      return criarVazio(EVENTO_LATROCINIO);
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
