var fs = require("fs");
var path = require("path");
var XLSX = require("xlsx");
var { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

var BUCKET = process.env.S3_BUCKET || "17042026-safety";
var OBJECT_KEY = process.env.S3_IDHM_KEY || "idhm_municipios.xlsx";
var REGION = process.env.AWS_REGION || "us-east-1";

function limparNome(nome) {
  if (!nome) return "";
  return String(nome).replace(/\s*\([A-Z]{2}\)\s*$/i, "").trim();
}

function normalizarHeader(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseNumero(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number" && !isNaN(valor)) return valor;
  var texto = String(valor).trim().replace(",", ".");
  var n = parseFloat(texto);
  return isNaN(n) ? null : n;
}

function extrairUfDoNome(nome) {
  var match = String(nome || "").match(/\(([A-Z]{2})\)\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

function detectarColunasIdhm(linhas) {
  var limite = Math.min(linhas.length, 11);
  var linhaCabecalho = 0;

  for (var h = 0; h < limite; h++) {
    var row = linhas[h];
    if (!row) continue;
    for (var c = 0; c <= 8; c++) {
      var texto = normalizarHeader(row[c]);
      if (texto === "uf" || texto.indexOf("municip") >= 0 || texto.indexOf("ranking") >= 0) {
        linhaCabecalho = h;
        break;
      }
    }
  }

  var header = linhas[linhaCabecalho] || [];
  var mapa = {};
  var temUf = false;
  var temRanking = false;

  for (var i = 0; i < header.length; i++) {
    var col = normalizarHeader(header[i]);
    if (!col) continue;
    if (col === "uf" || col.endsWith(" uf")) {
      mapa.uf = i;
      temUf = true;
    } else if (col.indexOf("ranking") >= 0) temRanking = true;
    else if (col.indexOf("municip") >= 0 || col === "nome") mapa.nome = i;
    else if (col.indexOf("longev") >= 0) mapa.longevidade = i;
    else if (col.indexOf("educ") >= 0) mapa.educacao = i;
    else if (col.indexOf("renda") >= 0) mapa.renda = i;
    else if (col.indexOf("idhm") >= 0 && mapa.idhm == null) mapa.idhm = i;
  }

  if (temUf) {
    if (mapa.nome == null) mapa.nome = mapa.uf + 1;
    if (mapa.idhm == null) mapa.idhm = mapa.nome + 1;
    if (mapa.renda == null) mapa.renda = mapa.idhm + 1;
    if (mapa.educacao == null) mapa.educacao = mapa.renda + 1;
    if (mapa.longevidade == null) mapa.longevidade = mapa.educacao + 1;
    return { linhaCabecalho: linhaCabecalho, layout: "uf", mapa: mapa };
  }

  if (temRanking || mapa.nome != null) {
    return {
      linhaCabecalho: linhaCabecalho,
      layout: "ranking",
      mapa: {
        nome: mapa.nome != null ? mapa.nome : 1,
        idhm: mapa.idhm != null ? mapa.idhm : 2,
        renda: mapa.renda != null ? mapa.renda : 3,
        longevidade: mapa.longevidade != null ? mapa.longevidade : 4,
        educacao: mapa.educacao != null ? mapa.educacao : 5,
      },
    };
  }

  return { linhaCabecalho: linhaCabecalho, layout: "legado", mapa: null };
}

function parsePlanilha(buffer) {
  var workbook = XLSX.read(buffer, { type: "buffer" });
  var sheet = workbook.Sheets[workbook.SheetNames[0]];
  var linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  var layout = detectarColunasIdhm(linhas);
  var municipios = [];

  for (var i = layout.linhaCabecalho + 1; i < linhas.length; i++) {
    var row = linhas[i];
    if (!row) continue;

    var uf;
    var nome;
    var idhmGeral;
    var renda;
    var educacao;
    var longevidade;

    if (layout.layout === "legado") {
      uf = "SP";
      nome = limparNome(row[0]);
      idhmGeral = parseNumero(row[2]);
      renda = parseNumero(row[4]);
      educacao = parseNumero(row[6]);
      longevidade = parseNumero(row[8]);
    } else if (layout.layout === "ranking") {
      var mapaRanking = layout.mapa;
      var nomeBruto = row[mapaRanking.nome];
      uf = extrairUfDoNome(nomeBruto);
      if (!uf) continue;
      nome = limparNome(nomeBruto);
      idhmGeral = parseNumero(row[mapaRanking.idhm]);
      renda = parseNumero(row[mapaRanking.renda]);
      longevidade = parseNumero(row[mapaRanking.longevidade]);
      educacao = parseNumero(row[mapaRanking.educacao]);
    } else {
      var mapa = layout.mapa;
      uf = String(row[mapa.uf] || "")
        .trim()
        .toUpperCase();
      if (uf.length !== 2) continue;
      nome = limparNome(row[mapa.nome]);
      idhmGeral = parseNumero(row[mapa.idhm]);
      renda = parseNumero(row[mapa.renda]);
      educacao = parseNumero(row[mapa.educacao]);
      longevidade = parseNumero(row[mapa.longevidade]);
    }

    if (!nome || idhmGeral == null) continue;

    municipios.push({
      uf: uf,
      nome: nome,
      idhm_geral: idhmGeral,
      idhm: idhmGeral,
      renda: renda,
      educacao: educacao,
      longevidade: longevidade,
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
    path.join(__dirname, "..", "..", "..", "idhm_municipios.xlsx"),
    path.join(__dirname, "..", "..", "..", "data_idhm.xlsx"),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "safety_leitor_excel",
      "idhm_municipios.xlsx"
    ),
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

  return Promise.reject(
    new Error("Planilha local idhm_municipios.xlsx não encontrada")
  );
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

function carregarPorUf(uf) {
  var ufNorm = String(uf || "").trim().toUpperCase();
  return carregar().then(function (lista) {
    return lista.filter(function (m) {
      return String(m.uf || "SP").toUpperCase() === ufNorm;
    });
  });
}

function buscarPorNome(nome, uf) {
  var alvo = limparNome(nome).toLowerCase();
  var ufNorm = String(uf || "SP")
    .trim()
    .toUpperCase();
  if (!alvo) {
    return Promise.resolve(null);
  }
  return carregarPorUf(ufNorm).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (limparNome(lista[i].nome).toLowerCase() === alvo) {
        return lista[i];
      }
    }
    return null;
  });
}

module.exports = {
  carregar,
  carregarPorUf,
  parsePlanilha,
  limparNome,
  buscarPorNome,
};
