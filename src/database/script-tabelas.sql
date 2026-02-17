 -- Integrantes do Grupo 05

-- Gustavo Henrique RA: 01252106      -- Gustavo Rucaglia  RA: 01252040
-- Giovanni Angel RA: 01252135        -- André Santos  RA: 01252023
-- Kauan Batista RA: 01252066         -- Vitória Ferreira RA: 01252130

CREATE DATABASE BD_WHISKEY;
USE BD_WHISKEY;
DROP DATABASE BD_WHISKEY;



-- Tabela contendo as informações de cadastro das empresas contratantes.
CREATE TABLE empresa(
id_empresa INT PRIMARY KEY AUTO_INCREMENT,
nome_empresa VARCHAR (50)NOT NULL,
cnpj CHAR (18) NOT NULL
);

-- Tabela contendo o endereço da Destilaria
CREATE TABLE endereco(
id_endereco INT PRIMARY KEY AUTO_INCREMENT,
rua VARCHAR(45));

-- Tabela contendo as destilarias da Empresa
CREATE TABLE destilaria (
id_destilaria INT PRIMARY KEY AUTO_INCREMENT,
qtdSensor int,
fk_endereco INT,
	CONSTRAINT EnderecoDestilaria
		FOREIGN KEY (fk_endereco) 
			REFERENCES endereco(id_endereco),
fk_empresa INT,
	CONSTRAINT EmpresaDestilaria
		FOREIGN KEY (fk_Empresa)
			REFERENCES empresa(id_empresa)
);



-- Tabela em relação a localidade do sensor
CREATE TABLE localidade_sensor(
id_localidadeSensor INT PRIMARY KEY AUTO_INCREMENT,
nome_localidade VARCHAR(45),
numero_local INT
);

-- Tabela contendo as informações de cadastro dos usuários de cada empresa.
CREATE TABLE usuario(
id_usuario INT AUTO_INCREMENT,
nome_usuario VARCHAR (50) NOT NULL,
email VARCHAR (100) NOT NULL UNIQUE,
senha VARCHAR (100) NOT NULL,
privilegio INT,
fk_idEmpresa INT NOT NULL,
CONSTRAINT UsuarioEmpresa 
	FOREIGN KEY (fk_idEmpresa) 
		REFERENCES empresa(id_empresa),
			PRIMARY KEY (id_usuario, fk_idEmpresa)
);

-- Tabela contendo as informações dos sensores.
CREATE TABLE sensor(
id_sensor INT AUTO_INCREMENT,
codigo_sensor CHAR(5),
fk_destilaria INT,
	CONSTRAINT DestilariaDoSensor
		FOREIGN KEY(fk_destilaria)
			REFERENCES destilaria(id_destilaria),
fk_idLocalidadeSensor INT,
	CONSTRAINT SensorLocalidade
		FOREIGN KEY (fk_idLocalidadeSensor)
			REFERENCES localidade_sensor(id_LocalidadeSensor),
situacao VARCHAR(45),
CONSTRAINT CHK_situacao CHECK (situacao IN ('Estável', 'Atenção', 'Grave')),
PRIMARY KEY (id_sensor, fk_idLocalidadeSensor)
);


-- Tabela contendo os dados coletados pelos sensores de temperatura e umidade. 
 CREATE TABLE registro(
id_registro INT AUTO_INCREMENT,
dt_coleta DATE DEFAULT (CURRENT_DATE),
hr_coleta TIME DEFAULT (CURRENT_TIME),
temperatura DECIMAL (4,2) NOT NULL,
umidade INT NOT NULL,
fk_sensor INT NOT NULL,
	CONSTRAINT SensorRegistro 
		FOREIGN KEY (fk_sensor) 
			REFERENCES sensor(id_sensor),
PRIMARY KEY (id_registro, fk_sensor)
);

-- Comando para descrever as configurações de cada tabela.
DESC empresa;
DESC endereco;
DESC destilaria;
DESC localidade_sensor;
DESC usuario;
DESC sensor;
DESC registro;




-- Inserção dos dados na tabela empresa.
INSERT INTO empresa (nome_empresa, cnpj) VALUES
	('Lamas Destilaria', '32.797.397/0001-80');
    
    
-- Endereco da destilaria    
INSERT INTO endereco (rua) VALUES
('Rua Miguel'), ('Rua General'), ('Rua Vitória');

-- Dados da destilaria
INSERT INTO destilaria (fk_endereco, fk_empresa) VALUES
	(1, 1),
    (2, 1),
    (3, 1);


-- Localidade Sensor
INSERT INTO localidade_sensor(nome_localidade, numero_local) VALUES
	('Armazém norte','1'),
	('Armazém sul','2'),
	('Armazém leste','3');

-- Inserção dos dados na tabela usuario.
INSERT INTO usuario (fk_idEmpresa, nome_usuario, email, senha, privilegio) VALUES
	(1,'Kauan Batista','kauan.batista@whiskey.com', '1651656125',0),
	(1,'Gustavo Rucaglia','gustavo.rucaglia@whiskey.com', '165165561',1),
	(1,'Gustavo Henrique','gustavo.henrique@suporte.com', '4854616584',0),
	(1,'Giovanni Angel','giovanni.angel@whiskey.com', '9209394028',0),
	(1,'Vitória Ferreira','vitoria.ferreira@whiskey.com', 'ferreira@123',0),
	(1,'André Luis','andre.luis@whiskey.com', '4854616584',0);

    -- sensor
INSERT INTO sensor (codigo_sensor, fk_destilaria, fk_idLocalidadeSensor) VALUES
	('0001', 1, 1),
	('0002', 2, 2),
	('0003', 3, 3);




-- registro
INSERT INTO registro (fk_sensor, temperatura, umidade) VALUES
	(1, 2, 50),
	(2, 18, 60),
	(3, 10, 30);
    
    
    -- SELECT TABELAS
    SELECT * FROM empresa;
    SELECT * FROM destilaria;
    SELECT * FROM endereco;
    SELECT * FROM sensor;
    SELECT * FROM localidade_sensor;
    SELECT * FROM usuario;
    SELECT * FROM registro;

    
    
-- JOIN COM AS TABELAS

-- JOIN Geral
SELECT registro.id_registro AS ID,	
	   localidade_sensor.nome_localidade AS Espaço,
	   registro.temperatura AS Temperatura,
       registro.umidade AS Umidade
       FROM registro
JOIN sensor ON registro.fk_sensor = sensor.id_sensor
JOIN localidade_sensor ON sensor.fk_idLocalidadeSensor = localidade_sensor.id_LocalidadeSensor
ORDER BY ID;


-- Empresa + Usuário
SELECT empresa.nome_empresa AS Empresa,
       usuario.nome_usuario AS Usuario
FROM empresa
JOIN usuario ON empresa.id_empresa = usuario.fk_idEmpresa;

-- Usuário
SELECT usuario.nome_usuario AS Nome,
       usuario.email AS Email,
       usuario.senha AS Senha,
       usuario.privilegio AS Privilegio
FROM usuario;

-- Sensor + Registro
SELECT registro.id_registro AS ID, 
	   registro.temperatura AS Temperatura,
       registro.umidade AS Umidade
       FROM registro
JOIN sensor ON registro.fk_sensor = sensor.id_sensor
ORDER BY ID;




-- CRIANDO VIEWS

-- NEW VERSION VIEW AND SELECT Destilaria
CREATE OR REPLACE VIEW destilaria_registro_base AS
SELECT 
    d.id_destilaria,
    e.rua,
    s.id_sensor,
    r.temperatura,
    r.umidade,
    r.dt_coleta,
    r.hr_coleta
FROM destilaria d
LEFT JOIN endereco e ON e.id_endereco = d.fk_endereco
JOIN sensor s ON s.fk_destilaria = d.id_destilaria
JOIN registro r ON r.fk_sensor = s.id_sensor;

-- NEW VERSION Sensor
CREATE OR REPLACE VIEW vw_dados_sensor_completo AS
SELECT 
    d.id_destilaria,
    s.id_sensor,
    e.rua,
    l.nome_localidade,
    r.temperatura,
    r.umidade,
    r.dt_coleta,
    r.hr_coleta,
    s.fk_destilaria
FROM destilaria d
JOIN endereco e ON e.id_endereco = d.fk_endereco
JOIN sensor s ON s.fk_destilaria = d.id_destilaria
JOIN registro r ON r.fk_sensor = s.id_sensor
LEFT JOIN localidade_sensor l ON s.fk_idLocalidadeSensor = l.id_localidadeSensor;


-- OLD VERSION Sensor
 CREATE VIEW relatorio_sensor_atual AS SELECT 
 endereco.rua as rua, 
 localidade_sensor.nome_localidade, 
 MAX(registro.temperatura) as max_temp,
 MIN(registro.temperatura) as min_temp,  
 MAX(registro.umidade) as max_umid, 
 MIN(registro.umidade) as min_umid, 
 (SELECT temperatura 
     FROM registro 
     WHERE fk_sensor = sensor.id_sensor 
     ORDER BY dt_coleta DESC 
     LIMIT 1) as temperatura_atual,
    (SELECT umidade 
     FROM registro 
     WHERE fk_sensor = sensor.id_sensor 
     ORDER BY dt_coleta DESC 
     LIMIT 1) as umidade_atual
 FROM destilaria  
 join endereco on endereco.id_endereco = destilaria.fk_endereco
 join sensor on sensor.fk_destilaria = destilaria.id_destilaria 
 join registro on registro.fk_sensor = sensor.id_sensor 
 left join localidade_sensor on sensor.fk_idLocalidadeSensor = localidade_sensor.id_localidadeSensor
 WHERE
    registro.hr_coleta >= DATE_SUB(NOW(), INTERVAL 12 HOUR)  
    and fk_destilaria  = 1
group by sensor.id_sensor, endereco.rua, localidade_sensor.nome_localidade;


-- SELECT USANDO VIEW

SELECT
    id_destilaria,
    rua,
    COUNT(id_sensor) AS qtdSensor,
    MAX(temperatura) AS max_temp,
    MIN(temperatura) AS min_temp,
    MAX(umidade) AS max_umid,
    MIN(umidade) AS min_umid 
FROM destilaria_registro_base 
WHERE 
    dt_coleta >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY id_destilaria, rua;


SELECT 
    rua,
    nome_localidade,
    MAX(temperatura) as max_temp,
    MIN(temperatura) as min_temp,
    MAX(umidade) as max_umid,
    MIN(umidade) as min_umid,
    (SELECT temperatura FROM registro WHERE fk_sensor = v.id_sensor ORDER BY dt_coleta DESC LIMIT 1) as temperatura_atual,
    (SELECT umidade FROM registro WHERE fk_sensor = v.id_sensor ORDER BY dt_coleta DESC LIMIT 1) as umidade_atual

FROM vw_dados_sensor_completo v

WHERE 
    v.fk_destilaria = 1 
    AND v.dt_coleta >= DATE_SUB(NOW(), INTERVAL 12 HOUR)

GROUP BY 
    v.id_sensor, v.rua, v.nome_localidade;






-- Maior intervalo Destilaria
SELECT r.dt_coleta, r.temperatura, r.umidade 
        FROM registro r
        JOIN sensor s ON r.fk_sensor = s.id_sensor
        WHERE s.fk_destilaria = 1
        AND r.hr_coleta >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY r.dt_coleta ASC;

-- Descobrir Destilaria com maior Intervalo
SELECT 
    e.rua,
    TIMESTAMPDIFF(HOUR, MAX(TIMESTAMP(r.dt_coleta, r.hr_coleta)), NOW()) as horas_consecutivas
FROM registro r
JOIN sensor s ON r.fk_sensor = s.id_sensor
JOIN destilaria d ON s.fk_destilaria = d.id_destilaria
JOIN endereco e ON d.fk_endereco = e.id_endereco
WHERE 
    r.temperatura BETWEEN 18 AND 25
     AND 
     TIMESTAMP(r.dt_coleta, r.hr_coleta) >= DATE_SUB(NOW(), INTERVAL 12
     HOUR)
GROUP BY d.id_destilaria, e.rua
ORDER BY horas_consecutivas DESC limit 1 ;


-- Descobrir Sensor com maior Intervalo
SELECT 
    l.nome_localidade,
    TIMESTAMPDIFF(HOUR, MAX(TIMESTAMP(r.dt_coleta, r.hr_coleta)), NOW()) as horas_consecutivas
FROM registro r
JOIN sensor s ON r.fk_sensor = s.id_sensor
LEFT JOIN localidade_sensor l ON s.fk_idLocalidadeSensor = l.id_localidadeSensor
JOIN destilaria d ON s.fk_destilaria = d.id_destilaria
WHERE 
    r.temperatura BETWEEN 18 AND 25
     AND 
     TIMESTAMP(r.dt_coleta, r.hr_coleta) >= DATE_SUB(NOW(), INTERVAL 120
     HOUR)
     and id_destilaria = 1
GROUP BY s.id_sensor, l.nome_localidade
ORDER BY horas_consecutivas DESC limit 1 ;

-- Descobrir Porcentagem de eficiencia 
SELECT 
	round(SUM(case when r.temperatura BETWEEN 18 AND 25 then 1 else 0 end) / count( r.temperatura) * 100 )as qtd_bom
FROM registro r
JOIN sensor s ON r.fk_sensor = s.id_sensor
LEFT JOIN localidade_sensor l ON s.fk_idLocalidadeSensor = l.id_localidadeSensor
JOIN destilaria d ON s.fk_destilaria = d.id_destilaria
WHERE 
     TIMESTAMP(r.dt_coleta, r.hr_coleta) >= DATE_SUB(NOW(), INTERVAL 120
     HOUR);
     

-- Descobrir Porcentagem de eficiencia por destilaria
SELECT 
	round(SUM(case when r.temperatura BETWEEN 18 AND 25 then 1 else 0 end) / count( r.temperatura) * 100 )as qtd_bom
FROM registro r
JOIN sensor s ON r.fk_sensor = s.id_sensor
LEFT JOIN localidade_sensor l ON s.fk_idLocalidadeSensor = l.id_localidadeSensor
JOIN destilaria d ON s.fk_destilaria = d.id_destilaria
WHERE 
     TIMESTAMP(r.dt_coleta, r.hr_coleta) >= DATE_SUB(NOW(), INTERVAL 120
     HOUR)
     and id_destilaria = 1;



