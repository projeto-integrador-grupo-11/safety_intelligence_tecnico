CREATE DATABASE if not exists safety_intelligence;
 -- drop database if exists safety_intelligence;
USE safety_intelligence;

-- =====================
-- TABELA ESTADO
-- =====================
CREATE TABLE unidade_federativa (
    idEstado INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(45),
    sigla CHAR(2)
);

-- =====================
-- TABELA USUARIO
-- =====================
CREATE TABLE usuario (
    idUsuario INT PRIMARY KEY AUTO_INCREMENT,
    nome varchar(50),
    email VARCHAR(100),
    senha VARCHAR(255)
);

-- =====================
-- TABELA FAVORITOS
-- =====================
CREATE TABLE lista_favoritos (
    idFavoritos INT PRIMARY KEY AUTO_INCREMENT,
    fkUsuarios_favoritos INT NOT NULL,
    fkMunicipio BIGINT NULL,
    nomeMunicipio VARCHAR(150) NOT NULL,
    uf CHAR(2) NOT NULL,
    nomeEstado VARCHAR(45),
    idhm_geral DECIMAL(5,3),
    FOREIGN KEY (fkUsuarios_favoritos) REFERENCES usuario(idUsuario),
    UNIQUE KEY uk_favorito_usuario_cidade (fkUsuarios_favoritos, uf, nomeMunicipio)
);

-- =====================
-- TABELA MUNICIPIO
-- =====================
CREATE TABLE municipio (
  idMunicipio bigint NOT NULL AUTO_INCREMENT,
  nome varchar(150) NOT NULL,
  Npopulacional INT,
  idhm_geral decimal(5,3) NOT NULL,
  PRIMARY KEY (idMunicipio)
);

-- CRIMINALIDADE 
CREATE TABLE criminalidade (
    idIbge INT PRIMARY KEY AUTO_INCREMENT,
    totalLatrocinio INT,
    totalRouboVeiculo INT,
    totalFurto INT,
    fkMunicipio BIGINT,
    ano INT,
    FOREIGN KEY (fkMunicipio) REFERENCES municipio(idMunicipio)
);

-- IDHM 
CREATE TABLE idhm (
    idIdhm INT PRIMARY KEY AUTO_INCREMENT,
    fkMunicipio BIGINT,
    longevidade decimal(5,1) NOT NULL,
    renda decimal(5,1) NOT NULL,
    educacao decimal(5,1) NOT NULL,
    ano INT,
    FOREIGN KEY (fkMunicipio) REFERENCES municipio(idMunicipio)
);

-- =====================
-- TABELA HISTORICO
-- =====================
CREATE TABLE logs_java (
    idHistorico INT PRIMARY KEY AUTO_INCREMENT,
    titulo VARCHAR(45),
    descricao TEXT,
    tipo VARCHAR(45),
    fkUsuario INT,
    dataHora DATETIME(3)
);

-- =====================
-- TABELA CONFIGURACOES_USUARIO
-- =====================
	CREATE TABLE configuracoes_usuario (
		idConfig INT PRIMARY KEY AUTO_INCREMENT,
		fkUsuario INT unique,
		-- INFORMAÇÕES PESSOAIS
        fotoPerfil varchar(300),
		nomeCompleto VARCHAR(100),
		telefone VARCHAR(20),
		cargo VARCHAR(50),
		industria VARCHAR(50),
		notificacao boolean,
		idSlack VARCHAR(16),
		-- SEGURANÇA
		autenticacao2FA BOOLEAN DEFAULT FALSE,
		FOREIGN KEY (fkUsuario) REFERENCES usuario(idUsuario)
	);

-- Migração (banco já existente com lista_favoritos antiga):
-- ALTER TABLE lista_favoritos
--   ADD COLUMN fkMunicipio BIGINT NULL AFTER fkUsuarios_favoritos,
--   ADD COLUMN uf CHAR(2) NOT NULL DEFAULT 'SP' AFTER nomeMunicipio,
--   ADD COLUMN nomeEstado VARCHAR(45) NULL AFTER uf,
--   MODIFY COLUMN nomeMunicipio VARCHAR(150) NOT NULL,
--   MODIFY COLUMN idhm_geral DECIMAL(5,3) NULL,
--   ADD UNIQUE KEY uk_favorito_usuario_cidade (fkUsuarios_favoritos, uf, nomeMunicipio);
