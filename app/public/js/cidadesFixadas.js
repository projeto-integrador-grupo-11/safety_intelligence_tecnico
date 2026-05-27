(function () {
  var CHAVE = "cidadesFixadas";
  var carregandoServidor = false;
  var servidorCarregado = false;

  function lerStorage() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (!bruto) return [];
      var lista = JSON.parse(bruto);
      return Array.isArray(lista) ? lista : [];
    } catch (err) {
      console.warn("[CidadesFixadas] Falha ao ler storage:", err);
      return [];
    }
  }

  function gravarStorage(lista) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista || []));
    } catch (err) {
      console.warn("[CidadesFixadas] Falha ao gravar storage:", err);
    }
  }

  function normalizarTexto(s) {
    return String(s == null ? "" : s)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function chaveDe(cidade) {
    if (!cidade) return "";
    var id = cidade.id;
    if (id != null && id !== "" && !isNaN(Number(id))) {
      return "id:" + Number(id);
    }
    var uf = String(cidade.uf || "").toUpperCase();
    return uf + "::" + normalizarTexto(cidade.nome);
  }

  function aoCidade(c) {
    if (!c) return null;
    var idNum =
      c.id != null && c.id !== "" && !isNaN(Number(c.id)) ? Number(c.id) : null;
    var idhmNum =
      c.idhm != null && c.idhm !== "" && !isNaN(Number(c.idhm))
        ? Number(c.idhm)
        : null;
    return {
      idFavorito:
        c.idFavorito != null && !isNaN(Number(c.idFavorito))
          ? Number(c.idFavorito)
          : null,
      id: idNum,
      nome: String(c.nome || "").trim(),
      uf: String(c.uf || "").toUpperCase(),
      estado: String(c.estado || "").trim(),
      idhm: idhmNum,
    };
  }

  function temToken() {
    return !!(window.Auth && typeof window.Auth.getToken === "function" && window.Auth.getToken());
  }

  function payloadDe(cidade) {
    var c = aoCidade(cidade);
    if (!c) return null;
    return {
      id: c.id,
      nome: c.nome,
      uf: c.uf,
      estado: c.estado,
      idhm: c.idhm,
    };
  }

  function sincronizarAdicionar(cidade) {
    if (!temToken()) return Promise.resolve();
    var body = payloadDe(cidade);
    if (!body || !body.nome || !body.uf) return Promise.resolve();
    return fetch("/favoritos/adicionar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 409) return;
      if (!res.ok) throw new Error("Falha ao fixar cidade no servidor.");
    });
  }

  function sincronizarRemover(cidade) {
    if (!temToken()) return Promise.resolve();
    var c = aoCidade(cidade);
    if (!c) return Promise.resolve();
    return fetch("/favoritos/remover", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idFavorito: c.idFavorito,
        id: c.id,
        nome: c.nome,
        uf: c.uf,
      }),
    }).then(function (res) {
      if (res.status === 404) return;
      if (!res.ok) throw new Error("Falha ao remover cidade fixada no servidor.");
    });
  }

  function carregarDoServidor() {
    if (!temToken() || carregandoServidor) {
      return Promise.resolve(lerStorage());
    }
    carregandoServidor = true;
    return fetch("/favoritos/listar")
      .then(function (res) {
        if (!res.ok) throw new Error("Falha ao carregar favoritos.");
        return res.json();
      })
      .then(function (lista) {
        var normalizada = (Array.isArray(lista) ? lista : [])
          .map(aoCidade)
          .filter(function (c) { return c && c.nome; });
        gravarStorage(normalizada);
        servidorCarregado = true;
        notificar();
        return normalizada;
      })
      .catch(function (err) {
        console.warn("[CidadesFixadas] Falha ao sincronizar com servidor:", err);
        return lerStorage();
      })
      .finally(function () {
        carregandoServidor = false;
      });
  }

  function listar() {
    return lerStorage();
  }

  function estaFixada(cidade) {
    var alvo = chaveDe(cidade);
    if (!alvo) return false;
    return lerStorage().some(function (c) {
      return chaveDe(c) === alvo;
    });
  }

  function adicionar(cidade) {
    var entrada = aoCidade(cidade);
    if (!entrada || !entrada.nome) return false;
    var lista = lerStorage();
    var alvo = chaveDe(entrada);
    if (lista.some(function (c) { return chaveDe(c) === alvo; })) return false;
    lista.push(entrada);
    gravarStorage(lista);
    notificar();
    sincronizarAdicionar(entrada).catch(function (err) {
      console.warn("[CidadesFixadas] Fixada localmente; falha ao sincronizar com servidor:", err);
    });
    return true;
  }

  function remover(cidade) {
    var alvo = chaveDe(cidade);
    if (!alvo) return false;
    var lista = lerStorage();
    var removida = lista.find(function (c) { return chaveDe(c) === alvo; });
    var nova = lista.filter(function (c) { return chaveDe(c) !== alvo; });
    if (nova.length === lista.length) return false;
    gravarStorage(nova);
    notificar();
    if (removida) {
      sincronizarRemover(removida).catch(function (err) {
        console.warn("[CidadesFixadas]", err);
        adicionar(removida);
      });
    }
    return true;
  }

  function alternar(cidade) {
    if (estaFixada(cidade)) {
      remover(cidade);
      return false;
    }
    return adicionar(cidade);
  }

  function url(cidade) {
    if (!cidade) return "/dados.html";
    var params = new URLSearchParams();
    if (cidade.uf) params.set("uf", cidade.uf);
    if (cidade.estado) params.set("estado", cidade.estado);
    if (cidade.id != null && !isNaN(Number(cidade.id))) {
      params.set("id", String(Number(cidade.id)));
    }
    if (cidade.nome) params.set("nome", cidade.nome);
    return "/dados.html?" + params.toString();
  }

  var ouvintes = [];
  function aoMudar(fn) {
    if (typeof fn === "function") ouvintes.push(fn);
    return function desinscrever() {
      ouvintes = ouvintes.filter(function (f) { return f !== fn; });
    };
  }
  function notificar() {
    var atual = lerStorage();
    ouvintes.forEach(function (fn) {
      try { fn(atual); } catch (err) { console.warn(err); }
    });
  }

  window.addEventListener("storage", function (e) {
    if (e.key === CHAVE) notificar();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", carregarDoServidor);
  } else {
    carregarDoServidor();
  }

  window.CidadesFixadas = {
    CHAVE: CHAVE,
    listar: listar,
    chaveDe: chaveDe,
    estaFixada: estaFixada,
    adicionar: adicionar,
    remover: remover,
    alternar: alternar,
    url: url,
    aoMudar: aoMudar,
    carregarDoServidor: carregarDoServidor,
    pronto: function () {
      return servidorCarregado || !temToken();
    },
  };
})();
