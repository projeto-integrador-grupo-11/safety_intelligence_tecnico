const estados = [
  { uf: "AC", nome: "Acre" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" },
  { uf: "BA", nome: "Bahia" },
  { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PA", nome: "Pará" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

// Preparado para a "segunda dashboard" de São Paulo (não criada ainda)
const rota_dashboard_sp = "/dashboard-sp.html";

function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function abrirDropdown(input, dropdown, abrir) {
  dropdown.hidden = !abrir;
  input.setAttribute("aria-expanded", abrir ? "true" : "false");
}

function removerSelecaoMapa(mapa) {
  const selecionados = mapa.querySelectorAll(".state.selecionado");
  selecionados.forEach((el) => el.classList.remove("selecionado"));
}

function selecionarEstado(uf, input, dropdown, valorSelecionado, mapa) {
  const estado = estados.find((e) => e.uf === uf);
  if (!estado) return;

  valorSelecionado.textContent = `${estado.nome} (${estado.uf})`;
  input.value = estado.nome;
  abrirDropdown(input, dropdown, false);

  if (estado.uf === "SP") {
    window.location.href = rota_dashboard_sp;
    return;
  }

  if (mapa) {
    removerSelecaoMapa(mapa);
    const alvo = mapa.querySelector(`#${uf}.state`);
    if (alvo) alvo.classList.add("selecionado");
  }
}

function renderizarLista(filtro, lista, input, dropdown, valorSelecionado, mapa) {
  const f = normalizar(filtro);
  const itens = f
    ? estados.filter((e) => normalizar(e.nome).includes(f) || normalizar(e.uf).includes(f))
    : estados;

  lista.innerHTML = "";
  itens.forEach((e) => {
    const li = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "busca_item";
    botao.innerHTML = `<strong>${e.nome}</strong><span>${e.uf}</span>`;
    botao.addEventListener("click", () => selecionarEstado(e.uf, input, dropdown, valorSelecionado, mapa));
    li.appendChild(botao);
    lista.appendChild(li);
  });

  abrirDropdown(input, dropdown, true);
}

async function carregarMapa(container) {
  const resposta = await fetch("/public/img/mapa-brasil.html");
  const svgTexto = await resposta.text();
  container.innerHTML = svgTexto;

  // Remove estilos embutidos do SVG para usar o CSS do projeto
  const svg = container.querySelector("svg");
  if (!svg) return;
  const estilos = svg.querySelectorAll("style");
  estilos.forEach((s) => s.remove());
}

function montar() {
  const input = document.getElementById("input_estado");
  const dropdown = document.getElementById("dropdown_estado");
  const lista = document.getElementById("lista_estados");
  const valorSelecionado = document.getElementById("estado_selecionado");
  const mapaContainer = document.getElementById("mapa_brasil");

  if (!input || !dropdown || !lista || !valorSelecionado || !mapaContainer) return;

  carregarMapa(mapaContainer)
    .then(() => {
      // Clique nos estados do SVG (id = UF)
      const estadosSvg = mapaContainer.querySelectorAll(".state[id]");
      estadosSvg.forEach((el) => {
        el.addEventListener("click", () => {
          const uf = el.getAttribute("id");
          if (uf) selecionarEstado(uf, input, dropdown, valorSelecionado, mapaContainer);
        });
      });
    })
    .catch(() => {
      // Se falhar carregar o mapa, a busca continua funcionando
    });

  input.addEventListener("input", () =>
    renderizarLista(input.value, lista, input, dropdown, valorSelecionado, mapaContainer)
  );
  input.addEventListener("focus", () =>
    renderizarLista(input.value, lista, input, dropdown, valorSelecionado, mapaContainer)
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") abrirDropdown(input, dropdown, false);
  });

  document.addEventListener("click", (e) => {
    const alvo = e.target;
    if (!(alvo instanceof Node)) return;
    if (alvo === input || dropdown.contains(alvo)) return;
    abrirDropdown(input, dropdown, false);
  });
}

document.addEventListener("DOMContentLoaded", montar);

