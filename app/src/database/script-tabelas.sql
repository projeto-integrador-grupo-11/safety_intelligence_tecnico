-- =====================================================================
-- Schema unificado — Safety Intelligence
-- Banco: safety_intelligence
--
-- Inclui:
--   • Tabelas da aplicação Node (usuário, favoritos, configurações)
--   • Tabelas alimentadas pelo JAR safety_leitor_excel / scripts S3
--
-- Instalação limpa: execute este script inteiro.
-- Banco legado (criminalidade, idhm, logs_java): veja seção MIGRAÇÃO no final.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS safety_intelligence;
USE safety_intelligence;

-- =====================
-- UNIDADE FEDERATIVA
-- =====================
CREATE TABLE IF NOT EXISTS unidade_federativa (
    idEstado INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(45) DEFAULT NULL,
    sigla CHAR(2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- USUÁRIO
-- =====================
<<<<<<< HEAD
CREATE TABLE usuario (
    idUsuario INT PRIMARY KEY AUTO_INCREMENT,
    nome varchar(50),
<<<<<<< HEAD
    email VARCHAR(100),
    senha VARCHAR(255),
    token_reset VARCHAR(255) NULL,
    token_reset_expira_em DATETIME NULL,
    codigo_2fa VARCHAR(255) NULL,
    codigo_2fa_expira_em DATETIME NULL

);
=======
CREATE TABLE IF NOT EXISTS usuario (
    idUsuario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
>>>>>>> 8823c8ae7622372e7988ffc3a9cd5f2888dfa672

-- =====================
-- FAVORITOS
-- =====================
CREATE TABLE IF NOT EXISTS lista_favoritos (
    idFavoritos INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fkUsuarios_favoritos INT NOT NULL,
    fkMunicipio BIGINT DEFAULT NULL,
    nomeMunicipio VARCHAR(150) NOT NULL,
    uf CHAR(2) NOT NULL,
    nomeEstado VARCHAR(45) DEFAULT NULL,
    idhm_geral DECIMAL(5,3) DEFAULT NULL,
    UNIQUE KEY uk_favorito_usuario_cidade (fkUsuarios_favoritos, uf, nomeMunicipio),
    CONSTRAINT lista_favoritos_ibfk_1
        FOREIGN KEY (fkUsuarios_favoritos) REFERENCES usuario (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- CONFIGURAÇÕES DO USUÁRIO
-- =====================
CREATE TABLE IF NOT EXISTS configuracoes_usuario (
    idConfig INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fkUsuario INT DEFAULT NULL UNIQUE,
    fotoPerfil VARCHAR(300) DEFAULT NULL,
    nomeCompleto VARCHAR(100) DEFAULT NULL,
    telefone VARCHAR(20) DEFAULT NULL,
    cargo VARCHAR(50) DEFAULT NULL,
    industria VARCHAR(50) DEFAULT NULL,
    notificacao TINYINT(1) DEFAULT NULL,
    idSlack VARCHAR(16) DEFAULT NULL,
    autenticacao2FA TINYINT(1) DEFAULT 0,
    CONSTRAINT configuracoes_usuario_ibfk_1
        FOREIGN KEY (fkUsuario) REFERENCES usuario (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- MUNICÍPIO (IDHM — planilha idhm_municipios.xlsx)
-- =====================
CREATE TABLE IF NOT EXISTS municipio (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uf CHAR(2) NOT NULL,
    nome VARCHAR(120) NOT NULL,
    idhm_geral DOUBLE DEFAULT NULL,
    renda DOUBLE DEFAULT NULL,
    educacao DOUBLE DEFAULT NULL,
    longevidade DOUBLE DEFAULT NULL,
    KEY idx_municipio_uf (uf),
    KEY idx_municipio_uf_nome (uf, nome),
    KEY idx_municipio_uf_idhm (uf, idhm_geral DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- POPULAÇÃO MUNICIPAL (planilha populacao_municipios_2025.xls)
-- =====================
CREATE TABLE IF NOT EXISTS populacao_municipio (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uf CHAR(2) NOT NULL,
    nome_municipio VARCHAR(120) NOT NULL,
    populacao INT NOT NULL,
    ano INT NOT NULL,
    KEY idx_pop_mun_uf (uf),
    KEY idx_pop_mun_uf_nome (uf, nome_municipio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

<<<<<<< HEAD
-- Migração (banco já existente, adicionar colunas de recuperação de senha):
-- ALTER TABLE usuario
--   ADD COLUMN token_reset VARCHAR(255) NULL,
--   ADD COLUMN token_reset_expira_em DATETIME NULL;

-- Migração (banco já existente, adicionar colunas do código 2FA):
-- ALTER TABLE usuario
--   ADD COLUMN codigo_2fa VARCHAR(255) NULL,
--   ADD COLUMN codigo_2fa_expira_em DATETIME NULL;
-- A preferência de 2FA usa configuracoes_usuario.autenticacao2FA (já no schema).

-- Migração (banco já existente com lista_favoritos antiga):
=======
-- =====================
-- INDICADORES DE SEGURANÇA POR UF (planilha indicadores_seguranca_publica.xlsx)
-- =====================
CREATE TABLE IF NOT EXISTS indicador_seguranca (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uf CHAR(2) NOT NULL,
    tipo VARCHAR(80) NOT NULL,
    ano INT NOT NULL,
    quantidade INT NOT NULL,
    KEY idx_ind_uf_tipo_ano (uf, tipo, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- OCORRÊNCIAS DE SEGURANÇA (planilhas banco_seguranca_2021..2025.xlsx)
-- =====================
CREATE TABLE IF NOT EXISTS ocorrencia_seguranca (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    uf CHAR(2) NOT NULL,
    nome_municipio VARCHAR(120) NOT NULL,
    evento VARCHAR(80) NOT NULL,
    ano_ref INT NOT NULL,
    mes_ref INT NOT NULL,
    qtd_vitimas INT NOT NULL,
    KEY idx_ocorr_uf_mun (uf, nome_municipio),
    KEY idx_ocorr_uf_evento (uf, evento, ano_ref),
    KEY idx_ocorr_ano (ano_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================
-- LOG DO JAR safety_leitor_excel
-- =====================
CREATE TABLE IF NOT EXISTS log_sistema (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nivel VARCHAR(20) NOT NULL,
    mensagem VARCHAR(500) NOT NULL,
    data_hora DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================================================================
-- MIGRAÇÃO (banco criado com versões antigas do script)
-- Descomente e adapte conforme necessário.
-- =====================================================================

-- lista_favoritos antiga (sem uf / fkMunicipio):
>>>>>>> 8823c8ae7622372e7988ffc3a9cd5f2888dfa672
-- ALTER TABLE lista_favoritos
--   ADD COLUMN fkMunicipio BIGINT NULL AFTER fkUsuarios_favoritos,
--   ADD COLUMN uf CHAR(2) NOT NULL DEFAULT 'SP' AFTER nomeMunicipio,
--   ADD COLUMN nomeEstado VARCHAR(45) NULL AFTER uf,
--   MODIFY COLUMN nomeMunicipio VARCHAR(150) NOT NULL,
--   MODIFY COLUMN idhm_geral DECIMAL(5,3) NULL,
--   ADD UNIQUE KEY uk_favorito_usuario_cidade (fkUsuarios_favoritos, uf, nomeMunicipio);

-- municipio legado (idMunicipio, Npopulacional) → modelo atual:
-- ALTER TABLE municipio ADD COLUMN uf CHAR(2) NULL AFTER id;
-- UPDATE municipio SET uf = 'SP' WHERE uf IS NULL OR uf = '';
-- ALTER TABLE municipio MODIFY uf CHAR(2) NOT NULL;
-- ALTER TABLE municipio
--   ADD COLUMN renda DOUBLE NULL,
--   ADD COLUMN educacao DOUBLE NULL,
--   ADD COLUMN longevidade DOUBLE NULL;

-- Tabelas removidas do modelo atual (podem ser dropadas após migrar dados):
--   criminalidade  → substituída por ocorrencia_seguranca
--   idhm           → campos incorporados em municipio
--   logs_java      → substituída por log_sistema
--   idhm_municipio → legado não utilizado pela aplicação
--
-- DROP TABLE IF EXISTS criminalidade;
-- DROP TABLE IF EXISTS idhm;
-- DROP TABLE IF EXISTS logs_java;
-- DROP TABLE IF EXISTS idhm_municipio;

-- =====================================================================
-- OBSERVAÇÕES (referência — não executar)
-- =====================================================================
--
-- ENGINE=InnoDB
--   Motor de armazenamento da tabela. Suporta chaves estrangeiras (FOREIGN KEY),
--   transações (COMMIT/ROLLBACK) e acesso concorrente. Necessário para tabelas
--   com FK, como lista_favoritos e configuracoes_usuario.
--
-- DEFAULT CHARSET=utf8mb4
--   Codificação UTF-8 completa (4 bytes por caractere). Garante acentos, ç e
--   emojis em textos, independente do padrão configurado no servidor MySQL.
--
-- COLLATE=utf8mb4_general_ci
--   Regras de comparação e ordenação do texto. O sufixo "ci" significa
--   case insensitive: maiúsculas e minúsculas são tratadas como iguais em
--   WHERE, ORDER BY e constraints UNIQUE.
--
-- KEY / INDEX
--   Índices que aceleram buscas (WHERE) e ordenação (ORDER BY). Não são
--   colunas da tabela — são estruturas internas de performance. KEY e INDEX
--   são equivalentes no MySQL. Em índices compostos (ex.: uf, nome), a ordem
--   das colunas importa: consultas que filtram pela primeira coluna também
--   se beneficiam do índice.
