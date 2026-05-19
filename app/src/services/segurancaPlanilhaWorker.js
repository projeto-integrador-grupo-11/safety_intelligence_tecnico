"use strict";

var { parentPort, workerData } = require("worker_threads");
var { parseBufferToMapa } = require("./segurancaPlanilhaParse");

try {
  parentPort.postMessage(
    parseBufferToMapa(workerData.buffer, workerData.uf, workerData.ano)
  );
} catch (erro) {
  parentPort.postMessage({ __erro: erro.message || String(erro) });
}
