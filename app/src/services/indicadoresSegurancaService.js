"use strict";

var fs = require("fs");
var path = require("path");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
var populacaoS3Service = require("./populacaoS3Service");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var OBJECT_KEY =
  process.env.S3_INDICADORES_SEGURANCA_KEY ||
  "indicadores_seguranca_publica.xlsx";
var REGION = process.env.AWS_REGION || "us-east-1";

var TIPO_ROUBO_VEICULO = "Roubo de veículo";
var TIPO_FURTO_VEICULO = "Furto de veículo";
var ABA_OCORRENCIAS = "Ocorrências";

var TIPOS_POR_SLUG = {
  rouboVeiculo: TIPO_ROUBO_VEICULO,
  furtoVeiculo: TIPO_FURTO_VEICULO,
};

var NOME_UF_PARA_SIGLA = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

var cacheTotais = null;
var carregando = null;

function normTexto(val) {
  return String(val == null ? "" : val)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function ufParaSigla(nomeUf) {
  return NOME_UF_PARA_SIGLA[normTexto(nomeUf)] || null;
}

function parseNumero(valor) {
  if (valor == null || valor === "") return 0;
  if (typeof valor === "number" && !isNaN(valor)) return valor;
  var n = Number(String(valor).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function resolverArquivoLocal() {
  var baseTecnico = path.join(__dirname, "..", "..", "..");
  var baseRaiz = path.join(baseTecnico, "..");
  var candidatos = [
    process.env.S3_INDICADORES_SEGURANCA_LOCAL_PATH,
    path.join(baseTecnico, "indicadores_seguranca_publica.xlsx"),
    path.join(baseRaiz, "safety_leitor_excel", "indicadores_seguranca_publica.xlsx"),
  ].filter(Boolean);

  for (var i = 0; i < candidatos.length; i++) {
    var arquivo = path.resolve(candidatos[i]);
    if (fs.existsSync(arquivo)) return arquivo;
  }
  return null;
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

function lerBufferPlanilha() {
  var local = resolverArquivoLocal();
  if (local) {
    return Promise.resolve(fs.readFileSync(local));
  }

  var client = new S3Client({ region: REGION });
  return client
    .send(new GetObjectCommand({ Bucket: BUCKET, Key: OBJECT_KEY }))
    .then(function (resp) {
      return streamToBuffer(resp.Body);
    });
}

function criarMapaVazio() {
  return { rouboVeiculo: {}, furtoVeiculo: {} };
}

function agregarLinhas(linhas) {
  var totais = criarMapaVazio();

  for (var i = 1; i < linhas.length; i++) {
    var row = linhas[i];
    if (!row) continue;

    var sigla = ufParaSigla(row[0]);
    if (!sigla) continue;

    var tipo = String(row[1] || "").trim();
    var slug = null;
    if (tipo === TIPO_ROUBO_VEICULO) slug = "rouboVeiculo";
    else if (tipo === TIPO_FURTO_VEICULO) slug = "furtoVeiculo";
    else continue;

    var ano = parseInt(row[2], 10);
    if (!Number.isFinite(ano)) continue;

    var qtd = parseNumero(row[4]);
    if (qtd <= 0) continue;

    if (!totais[slug][sigla]) totais[slug][sigla] = {};
    if (!totais[slug][sigla][ano]) totais[slug][sigla][ano] = 0;
    totais[slug][sigla][ano] += qtd;
  }

  return totais;
}

function parseBuffer(buffer) {
  var workbook = XLSX.read(buffer, {
    type: "buffer",
    cellNF: false,
    cellStyles: false,
    bookVBA: false,
  });
  var nomeAba =
    workbook.SheetNames.indexOf(ABA_OCORRENCIAS) >= 0
      ? ABA_OCORRENCIAS
      : workbook.SheetNames[0];
  var sheet = workbook.Sheets[nomeAba];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  return agregarLinhas(linhas);
}

function carregarTotais() {
  if (cacheTotais) return Promise.resolve(cacheTotais);
  if (carregando) return carregando;

  carregando = lerBufferPlanilha()
    .then(function (buffer) {
      cacheTotais = parseBuffer(buffer);
      console.log(
        "\nIndicadores segurança pública: planilha carregada (roubo e furto de veículo por UF/ano)."
      );
      return cacheTotais;
    })
    .catch(function (erro) {
      carregando = null;
      throw erro;
    });

  return carregando;
}

function montarRespostaEstado(slug, ufNorm, anoNum, porUf, tipoLabel) {
  var anos = Object.keys(porUf)
    .map(function (a) {
      return parseInt(a, 10);
    })
    .filter(function (a) {
      return Number.isFinite(a);
    })
    .sort(function (a, b) {
      return a - b;
    });

  var anual = anos.map(function (a) {
    return { ano: a, valor: Math.round(porUf[a] || 0) };
  });

  var anoAnterior = anoNum - 1;
  return {
    uf: ufNorm,
    ano: anoNum,
    total: Math.round(porUf[anoNum] || 0),
    anoAnterior: anoAnterior,
    totalAnterior: Math.round(porUf[anoAnterior] || 0),
    anual: anual,
    tipo: tipoLabel,
      fonte: "Dados Nacionais de Segurança Pública do Governo Federal",
  };
}

function totalPorTipoEstado(slug, uf, ano) {
  var ufNorm = String(uf || "")
    .trim()
    .toUpperCase();
  var anoNum = parseInt(ano, 10);
  var tipoLabel = TIPOS_POR_SLUG[slug];

  if (!tipoLabel) {
    return Promise.reject(new Error("Tipo de indicador inválido."));
  }
  if (!populacaoS3Service.isUfValida(ufNorm)) {
    return Promise.reject(new Error("UF inválida."));
  }
  if (!Number.isFinite(anoNum)) {
    return Promise.reject(new Error("Ano inválido."));
  }

  return carregarTotais().then(function (totais) {
    var porUf = (totais[slug] && totais[slug][ufNorm]) || {};
    return montarRespostaEstado(slug, ufNorm, anoNum, porUf, tipoLabel);
  });
}

function totalRouboVeiculoEstado(uf, ano) {
  return totalPorTipoEstado("rouboVeiculo", uf, ano);
}

function totalFurtoVeiculoEstado(uf, ano) {
  return totalPorTipoEstado("furtoVeiculo", uf, ano);
}

module.exports = {
  totalRouboVeiculoEstado,
  totalFurtoVeiculoEstado,
  TIPO_ROUBO_VEICULO,
  TIPO_FURTO_VEICULO,
};
