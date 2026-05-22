/**
 * Baixa idhm_municipios.xlsx do S3 e recarrega a tabela municipio.
 * Equivalente à etapa 1 do JAR safety_leitor_excel.
 *
 * Uso: node scripts/carregar-idhm.js
 */

var fs = require("fs");
var path = require("path");
var mysql = require("mysql2/promise");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
var municipioS3Service = require("../app/src/services/municipioS3Service");

var ambiente = process.env.AMBIENTE_PROCESSO || "desenvolvimento";
var caminhoEnv = ambiente === "producao" ? ".env" : ".env.dev";
require("dotenv").config({
  path: path.join(__dirname, "..", caminhoEnv),
});

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var OBJECT_KEY = process.env.S3_IDHM_KEY || "idhm_municipios.xlsx";
var REGION = process.env.AWS_REGION || "us-east-1";

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

async function baixarPlanilha() {
  var localPath = path.join(__dirname, "..", "..", "safety_leitor_excel", OBJECT_KEY);
  if (fs.existsSync(localPath)) {
    console.log("Usando arquivo local:", localPath);
    return fs.readFileSync(localPath);
  }

  console.log("Baixando s3://" + BUCKET + "/" + OBJECT_KEY + " …");
  var client = new S3Client({ region: REGION });
  var resposta = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: OBJECT_KEY })
  );
  var buffer = await streamToBuffer(resposta.Body);
  fs.writeFileSync(localPath, buffer);
  console.log("Salvo em", localPath, "(" + buffer.length + " bytes)");
  return buffer;
}

async function main() {
  var buffer = await baixarPlanilha();
  var municipios = municipioS3Service.parsePlanilha(buffer);

  if (!municipios.length) {
    throw new Error("Nenhum município lido da planilha.");
  }

  console.log("Planilha parseada:", municipios.length, "municípios.");

  var config = {
    host: (process.env.DB_HOST || "").trim(),
    user: (process.env.DB_USER || "").trim(),
    password: (process.env.DB_PASSWORD || "").trim(),
    database: (process.env.DB_DATABASE || "").trim(),
    port: parseInt(process.env.DB_PORT || "3306", 10),
  };

  var conexao = await mysql.createConnection(config);

  try {
    console.log("Limpando tabela municipio…");
    await conexao.query("DELETE FROM municipio");

    var sql =
      "INSERT INTO municipio (uf, nome, idhm_geral, renda, educacao, longevidade) VALUES ?";
    var lote = [];
    var tamanhoLote = 500;

    for (var i = 0; i < municipios.length; i++) {
      var m = municipios[i];
      lote.push([
        m.uf,
        m.nome,
        m.idhm_geral,
        m.renda != null ? m.renda : 0,
        m.educacao != null ? m.educacao : 0,
        m.longevidade != null ? m.longevidade : 0,
      ]);

      if (lote.length >= tamanhoLote) {
        await conexao.query(sql, [lote]);
        lote = [];
      }
    }

    if (lote.length) {
      await conexao.query(sql, [lote]);
    }

    var inseridos = municipios.length;

    var [totais] = await conexao.query(
      "SELECT uf, COUNT(*) AS total FROM municipio GROUP BY uf ORDER BY uf"
    );
    console.log("\nCarga concluída:", inseridos, "municípios.");
    console.log("Por UF:");
    totais.forEach(function (row) {
      console.log(" -", row.uf, row.total);
    });
  } finally {
    await conexao.end();
  }
}

main().catch(function (erro) {
  console.error("Falha:", erro.message || erro);
  process.exit(1);
});
