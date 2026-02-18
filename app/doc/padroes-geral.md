#  Visão Geral da Aplicação

A Safety Inteligency visa fornecer uma aplicação baseado em ETL, fornecendo dados que auxilie na tomada de decisões.

## Começando com o projeto

Para instalar a aplicação em sua maquina, execute os seguintes comandos:

```bash

git clone https://github.com/projeto-integrador-grupo-11/safety_intelligence_tecnico

cd safety_intelligence_tecnico

npm install 

npm start

```

### Sumário dos comandos para git

Aqui estão todos os comandos de CLI que você pode executar neste projeto para subir alteraçoes:

Puxa todas alterações para evitar merge.

#### `git pull`

Salva todas alterações para serem commitadas

#### `git add .`

Cria commits para subir posteriormente, adione no texto alterações feitas seja completo. 

*Sempre utilize o pre-fixo para analise:
 após ser analisada pelo responsável do github será atualizada para aprovoção*.

#### `git commit -m "para analise: tudo que foi feito"`

Enviar alteração para o github.

#### `git push`

Lista todas as branches locais. A branch em que você está atualmente será marcada com um asterisco (*).

#### `git branch`

Cria uma nova branch e já muda para ela automaticamente. 

#### `git checkout -b nome-da-branch`

Alterna entre branches já existentes.

#### `git checkout nome-da-branch`


#  🧱 Padrões de Nomenclatura

O projeto segue os seguintes padrões de nomenclatura:

- `kebab-case`: Para nome de arquivos;
- `camelCase`: Para nome de variáveis, funções e *custom hooks*;


- `SCREAMING_SNAKE_CASE`: Para constantes e dados estáticos.
