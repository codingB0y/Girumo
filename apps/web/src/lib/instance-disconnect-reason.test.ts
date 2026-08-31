import assert from "node:assert/strict";
import { LOGGED_OUT_REASON, precisaParearDeNovo } from "./instance-disconnect-reason";

// Sem motivo registrado não há o que avisar (instância nova, ou nunca caiu).
assert.equal(precisaParearDeNovo(null), false);
assert.equal(precisaParearDeNovo(undefined), false);
assert.equal(precisaParearDeNovo({}), false);

// Quedas que voltam sozinhas não pedem ação nenhuma.
assert.equal(precisaParearDeNovo({ lastDisconnectReason: 428 }), false);
assert.equal(precisaParearDeNovo({ lastDisconnectReason: 440 }), false);
assert.equal(precisaParearDeNovo({ lastDisconnectReason: 408 }), false);

// Sessão removida no celular: só volta pareando de novo.
assert.equal(precisaParearDeNovo({ lastDisconnectReason: LOGGED_OUT_REASON }), true);

// A Evolution já mandou `statusReason` como string; o aviso não pode sumir por isso.
assert.equal(precisaParearDeNovo({ lastDisconnectReason: "401" }), true);

// Reconectar grava null e o aviso precisa sair da tela.
assert.equal(precisaParearDeNovo({ lastDisconnectReason: null }), false);

// Valores vazios/absurdos não podem virar 0 e passar por engano.
assert.equal(precisaParearDeNovo({ lastDisconnectReason: "" }), false);
assert.equal(precisaParearDeNovo({ lastDisconnectReason: "sei la" }), false);
