var fs = require("fs");
var path = require("path");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var OBJECT_KEY = process.env.S3_IDHM_KEY || "data_idhm.xlsx";
var REGION = process.env.AWS_REGION || "us-east-1";

function limparNome(nome) {
  if (!nome) return "";
  return String(nome).replace(/\s*\(SP\)\s*$/i, "").trim();
}

function parseNumero(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number" && !isNaN(valor)) return valor;
  var texto = String(valor).trim().replace(",", ".");
  var n = parseFloat(texto);
  return isNaN(n) ? null : n;
}

function parsePlanilha(buffer) {
  var workbook = XLSX.read(buffer, { type: "buffer" });
  var sheet = workbook.Sheets[workbook.SheetNames[0]];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  var municipios = [];

  for (var i = 1; i < linhas.length; i++) {
    var row = linhas[i];
    if (!row || !row[0]) continue;

    var nome = limparNome(row[0]);
    if (!nome) continue;

    var idhmGeral = parseNumero(row[2]);

    municipios.push({
      nome: nome,
      idhm_geral: idhmGeral,
      idhm: idhmGeral,
      renda: parseNumero(row[4]),
      educacao: parseNumero(row[6]),
      longevidade: parseNumero(row[8]),
      pop: null,
    });
  }

  return municipios;
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

function carregarLocal() {
  var candidatos = [
    process.env.S3_IDHM_LOCAL_PATH,
    path.join(__dirname, "..", "..", "..", "data_idhm.xlsx"),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "safety_leitor_excel",
      "data_idhm.xlsx"
    ),
  ].filter(Boolean);

  for (var i = 0; i < candidatos.length; i++) {
    var arquivo = path.resolve(candidatos[i]);
    if (fs.existsSync(arquivo)) {
      return Promise.resolve(parsePlanilha(fs.readFileSync(arquivo)));
    }
  }

  return Promise.reject(new Error("Planilha local data_idhm.xlsx não encontrada"));
}

function carregarS3() {
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
    })
    .then(parsePlanilha);
}

function carregar() {
  return carregarS3().catch(function () {
    return carregarLocal();
  });
}

module.exports = { carregar, parsePlanilha, limparNome };
