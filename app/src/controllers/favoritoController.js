var favoritoModel = require("../models/favoritoModel");

function parseNumero(valor) {
  if (valor == null || valor === "") return null;
  var n = Number(valor);
  return isNaN(n) ? null : n;
}

function mapFromDb(rows) {
  return (rows || []).map(function (row) {
    return {
      idFavorito: row.id_favorito,
      id: row.fk_municipio != null ? Number(row.fk_municipio) : null,
      nome: row.nome_municipio,
      uf: row.uf,
      estado: row.nome_estado || "",
      idhm: parseNumero(row.idhm_geral),
    };
  });
}

function normalizarUf(uf) {
  return String(uf || "")
    .trim()
    .toUpperCase();
}

function normalizarNome(nome) {
  return String(nome || "").trim();
}

function obterIdUsuario(req) {
  return req.usuario && req.usuario.id != null ? Number(req.usuario.id) : null;
}

function listar(req, res) {
  var idUsuario = obterIdUsuario(req);
  if (!idUsuario) {
    res.status(401).json({ mensagem: "Usuário não autenticado." });
    return;
  }

  favoritoModel
    .listarPorUsuario(idUsuario)
    .then(function (rows) {
      res.status(200).json(mapFromDb(rows));
    })
    .catch(function (erro) {
      console.log("\nErro ao listar favoritos:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao listar cidades fixadas." });
    });
}

function adicionar(req, res) {
  var idUsuario = obterIdUsuario(req);
  if (!idUsuario) {
    res.status(401).json({ mensagem: "Usuário não autenticado." });
    return;
  }

  var nome = normalizarNome(req.body.nome);
  var uf = normalizarUf(req.body.uf);
  var estado = normalizarNome(req.body.estado);
  var idhm = parseNumero(req.body.idhm);
  var idMunicipio = parseNumero(req.body.id);

  if (!nome || !uf) {
    res.status(400).json({ mensagem: "Informe nome e UF da cidade." });
    return;
  }

  favoritoModel
    .adicionar(idUsuario, {
      fkMunicipio: idMunicipio,
      nomeMunicipio: nome,
      uf: uf,
      nomeEstado: estado || null,
      idhmGeral: idhm,
    })
    .then(function () {
      res.status(201).json({ mensagem: "Cidade fixada com sucesso." });
    })
    .catch(function (erro) {
      if (erro && erro.code === "ER_DUP_ENTRY") {
        res.status(409).json({ mensagem: "Cidade já está fixada." });
        return;
      }
      console.log("\nErro ao adicionar favorito:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao fixar cidade." });
    });
}

function remover(req, res) {
  var idUsuario = obterIdUsuario(req);
  if (!idUsuario) {
    res.status(401).json({ mensagem: "Usuário não autenticado." });
    return;
  }

  var idFavorito = parseNumero(req.body.idFavorito);
  var idMunicipio = parseNumero(req.body.id);
  var nome = normalizarNome(req.body.nome);
  var uf = normalizarUf(req.body.uf);

  var promessa;
  if (idFavorito != null) {
    promessa = favoritoModel.removerPorId(idUsuario, idFavorito);
  } else if (idMunicipio != null) {
    promessa = favoritoModel.removerPorMunicipio(idUsuario, idMunicipio);
  } else if (nome && uf) {
    promessa = favoritoModel.removerPorCidade(idUsuario, uf, nome);
  } else {
    res.status(400).json({
      mensagem: "Informe idFavorito, id do município ou nome e UF da cidade.",
    });
    return;
  }

  promessa
    .then(function (resultado) {
      if (resultado && resultado.affectedRows === 0) {
        res.status(404).json({ mensagem: "Cidade fixada não encontrada." });
        return;
      }
      res.status(200).json({ mensagem: "Cidade removida das fixadas." });
    })
    .catch(function (erro) {
      console.log("\nErro ao remover favorito:", erro.message || erro);
      res.status(500).json({ mensagem: "Erro ao remover cidade fixada." });
    });
}

module.exports = {
  listar,
  adicionar,
  remover,
};
