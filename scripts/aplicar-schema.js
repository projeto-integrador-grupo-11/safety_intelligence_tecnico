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

    console.log("Verificando migração da coluna uf em municipio…");
    var [colsUf] = await conexao.query(
      "SHOW COLUMNS FROM municipio LIKE 'uf'"
    );
    if (!colsUf.length) {
      await conexao.query(
        "ALTER TABLE municipio ADD COLUMN uf CHAR(2) NULL AFTER id"
      );
      await conexao.query(
        "UPDATE municipio SET uf = 'SP' WHERE uf IS NULL OR uf = ''"
      );
      await conexao.query(
        "ALTER TABLE municipio MODIFY uf CHAR(2) NOT NULL"
      );
      try {
        await conexao.query(
          "CREATE INDEX idx_municipio_uf ON municipio (uf)"
        );
      } catch (e) {
        /* índice pode já existir */
      }
      try {
        await conexao.query(
          "CREATE INDEX idx_municipio_uf_nome ON municipio (uf, nome)"
        );
      } catch (e) {
        /* índice pode já existir */
      }
      console.log("Coluna uf adicionada em municipio (registros antigos marcados como SP).");
    } else {
      console.log("Coluna uf já existe em municipio.");
    }

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
