/**
 * Aplica o schema das tabelas usadas pelo JAR safety_leitor_excel.
 *
 * Uso: node scripts/aplicar-schema.js
 *
 * Lê o arquivo ../safety_leitor_excel/src/main/resources/schema.sql e executa
 * cada statement no banco configurado em .env.dev (ou .env em produção).
 */

var fs = require("fs");
var path = require("path");
var mysql = require("mysql2/promise");

var ambiente = process.env.AMBIENTE_PROCESSO || "desenvolvimento";
var caminhoEnv = ambiente === "producao" ? ".env" : ".env.dev";
require("dotenv").config({
  path: path.join(__dirname, "..", caminhoEnv),
});

var caminhoSchema = path.resolve(
  __dirname,
  "..",
  "..",
  "safety_leitor_excel",
  "src",
  "main",
  "resources",
  "schema.sql"
);

if (!fs.existsSync(caminhoSchema)) {
  console.error("Arquivo de schema não encontrado em:", caminhoSchema);
  process.exit(1);
}

var sql = fs.readFileSync(caminhoSchema, "utf8");

async function main() {
  var config = {
    host: (process.env.DB_HOST || "").trim(),
    user: (process.env.DB_USER || "").trim(),
    password: (process.env.DB_PASSWORD || "").trim(),
    database: (process.env.DB_DATABASE || "").trim(),
    port: parseInt(process.env.DB_PORT || "3306", 10),
    multipleStatements: true,
  };

  console.log("Conectando em " + config.host + ":" + config.port + " (db=" + config.database + ")…");
  var conexao = await mysql.createConnection(config);

  try {
    console.log("Aplicando schema…");
    await conexao.query(sql);
    console.log("Schema aplicado com sucesso.");

    var [tabelas] = await conexao.query(
      "SHOW TABLES IN `" + config.database + "`"
    );
    console.log("\nTabelas no banco:");
    tabelas.forEach(function (row) {
      console.log(" -", Object.values(row)[0]);
    });

    var alvos = [
      "municipio",
      "populacao_municipio",
      "indicador_seguranca",
      "ocorrencia_seguranca",
      "log_sistema",
    ];
    console.log("\nContagens (esperado 0 antes de rodar o JAR):");
    for (var i = 0; i < alvos.length; i++) {
      var tabela = alvos[i];
      try {
        var [rows] = await conexao.query(
          "SELECT COUNT(*) AS total FROM " + tabela
        );
        console.log(" -", tabela.padEnd(22), rows[0].total);
      } catch (e) {
        console.log(" -", tabela.padEnd(22), "ERRO:", e.message);
      }
    }
  } finally {
    await conexao.end();
  }
}

main().catch(function (erro) {
  console.error("Falha ao aplicar schema:", erro.sqlMessage || erro.message || erro);
  process.exit(1);
});
