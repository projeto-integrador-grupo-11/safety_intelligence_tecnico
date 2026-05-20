(function () {
    var CHAVE_TOKEN = "TOKEN_JWT";

    function getToken() {
        return sessionStorage.getItem(CHAVE_TOKEN);
    }

    function setToken(token) {
        if (token) {
            sessionStorage.setItem(CHAVE_TOKEN, token);
        }
    }

    function limparSessao() {
        sessionStorage.removeItem(CHAVE_TOKEN);
        sessionStorage.removeItem("EMAIL_USUARIO");
        sessionStorage.removeItem("NOME_USUARIO");
        sessionStorage.removeItem("ID_USUARIO");
    }

    function logout() {
        limparSessao();
        window.location.href = "/login.html";
    }

    function protegerPagina() {
        if (!getToken()) {
            window.location.href = "/login.html";
        }
    }

    function nomeUsuario() {
        return sessionStorage.getItem("NOME_USUARIO") || sessionStorage.getItem("EMAIL_USUARIO") || "Usuário";
    }

    function emailUsuario() {
        return sessionStorage.getItem("EMAIL_USUARIO") || "";
    }

    function iniciais(nome) {
        if (!nome) return "U";
        var partes = nome.trim().split(/\s+/);
        var letras = partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "");
        return letras.toUpperCase();
    }

    function injetarEstilos() {
        if (document.getElementById("auth-user-style")) return;
        var st = document.createElement("style");
        st.id = "auth-user-style";
        st.textContent = [
            ".auth-user{position:relative;display:flex;align-items:center;gap:10px;background:var(--card,#fff);border:1px solid var(--border2,#e5e7eb);border-radius:999px;padding:4px 12px 4px 4px;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;color:var(--t1,#111);transition:all .2s;user-select:none}",
            ".auth-user:hover{border-color:var(--border3,#cbd5e1)}",
            ".auth-user .auth-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;letter-spacing:.5px}",
            ".auth-user .auth-nome{max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
            ".auth-user .auth-caret{font-size:9px;opacity:.6;margin-left:2px}",
            ".auth-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:220px;background:var(--card,#fff);border:1px solid var(--border2,#e5e7eb);border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.12);padding:8px;z-index:9999;display:none}",
            ".auth-menu.open{display:block}",
            ".auth-menu-header{padding:8px 10px 10px;border-bottom:1px solid var(--border2,#e5e7eb);margin-bottom:6px}",
            ".auth-menu-nome{font-weight:600;font-size:13px;color:var(--t1,#111);font-family:'Montserrat',sans-serif}",
            ".auth-menu-email{font-size:11px;color:var(--t3,#6b7280);margin-top:2px;font-family:'DM Mono',monospace;word-break:break-all}",
            ".auth-menu-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:6px;font-size:12px;font-family:'DM Mono',monospace;color:var(--t2,#374151);cursor:pointer;background:none;border:0;width:100%;text-align:left;text-decoration:none}",
            ".auth-menu-item:hover{background:rgba(0,0,0,.04);color:var(--t1,#111)}",
            ".auth-menu-item.danger{color:#dc2626}",
            ".auth-menu-item.danger:hover{background:rgba(220,38,38,.08);color:#b91c1c}",
            ".auth-menu-item svg{width:14px;height:14px;flex-shrink:0}"
        ].join("\n");
        document.head.appendChild(st);
    }

    function montarUserMenu() {
        var alvo = document.querySelector(".tb-r");
        if (!alvo || alvo.querySelector(".auth-user")) return;

        injetarEstilos();

        var nome = nomeUsuario();
        var email = emailUsuario();

        var wrap = document.createElement("div");
        wrap.className = "auth-user";
        wrap.setAttribute("role", "button");
        wrap.setAttribute("aria-haspopup", "true");
        wrap.setAttribute("aria-expanded", "false");
        wrap.innerHTML =
            '<div class="auth-avatar">' + iniciais(nome) + '</div>' +
            '<span class="auth-nome">' + nome + '</span>' +
            '<span class="auth-caret">▼</span>' +
            '<div class="auth-menu" role="menu">' +
                '<div class="auth-menu-header">' +
                    '<div class="auth-menu-nome">' + nome + '</div>' +
                    (email ? '<div class="auth-menu-email">' + email + '</div>' : '') +
                '</div>' +
                '<a href="/config_user.html" class="auth-menu-item">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
                    'Configurações' +
                '</a>' +
                '<button type="button" class="auth-menu-item danger" data-auth-logout>' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                    'Sair' +
                '</button>' +
            '</div>';

        alvo.insertBefore(wrap, alvo.firstChild);

        var menu = wrap.querySelector(".auth-menu");

        wrap.addEventListener("click", function (e) {
            if (e.target.closest(".auth-menu")) return;
            var aberto = menu.classList.toggle("open");
            wrap.setAttribute("aria-expanded", aberto ? "true" : "false");
        });

        wrap.querySelector("[data-auth-logout]").addEventListener("click", function (e) {
            e.stopPropagation();
            logout();
        });

        document.addEventListener("click", function (e) {
            if (!wrap.contains(e.target)) {
                menu.classList.remove("open");
                wrap.setAttribute("aria-expanded", "false");
            }
        });
    }

    var fetchOriginal = window.fetch.bind(window);

    window.fetch = function (url, opcoes) {
        opcoes = opcoes || {};
        var token = getToken();

        var precisaToken = typeof url === "string" && /^\/?(municipios|usuarios\/trocarSenha)/.test(url);

        if (token && precisaToken) {
            opcoes.headers = Object.assign({}, opcoes.headers || {}, {
                Authorization: "Bearer " + token
            });
        }

        return fetchOriginal(url, opcoes).then(function (resposta) {
            if (resposta.status === 401 && precisaToken) {
                limparSessao();
                window.location.href = "/login.html";
            }
            return resposta;
        });
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", montarUserMenu);
    } else {
        montarUserMenu();
    }

    window.Auth = {
        getToken: getToken,
        setToken: setToken,
        logout: logout,
        protegerPagina: protegerPagina,
        limparSessao: limparSessao,
        montarUserMenu: montarUserMenu
    };
})();
