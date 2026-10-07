import assert from "node:assert/strict";
import { test } from "node:test";
import { lerEvento } from "./events";

// Recortes dos eventos reais da prova de 02/10 na @vireimoda (campos extras de propósito).
const comentario = {
  id: "ada1a966-631d-49e2-8bd6-e72cba676476",
  event: "comment.received",
  comment: { id: "17946648792299352", postId: null, platformPostId: "17950540902266561", platform: "instagram", text: "Quero sem seguir", author: { id: "1808886413685415", username: "igortoled0", isOwnAccount: false, instagramProfile: { isFollower: true } }, createdAt: "2026-10-02T16:38:42.760Z", isReply: false, parentCommentId: null },
  post: { id: null, platformPostId: "17950540902266561", content: "texto do post", imageUrl: "https://x", permalink: "https://www.instagram.com/p/x/" },
  account: { id: "6abfccbe4b107da7a1e5f1e4", accountId: "6abfccbe4b107da7a1e5f1e4", platform: "instagram", username: "vireimoda" },
  timestamp: "2026-10-02T16:38:43.000Z",
};
const mensagem = {
  id: "a244c193-1d39-4bf5-815b-c766250da841",
  event: "message.received",
  message: { id: "6abfde54a6ee6cba2e762b79", conversationId: "6abfcccc4ed84fcf2a07792f", platform: "instagram", platformMessageId: "aWdfZAG1f", direction: "incoming", text: "Quero", attachments: [], sender: { id: "1808886413685415", name: "Igor Toledo", username: "igortoled0" }, sentAt: "2026-10-02T16:39:47.118Z", isRead: false, sentVia: null },
  conversation: { id: "6abfcccc4ed84fcf2a07792f", platformConversationId: "1808886413685415", participantId: "1808886413685415", participantUsername: "igortoled0", status: "active" },
  account: { id: "6abfccbe4b107da7a1e5f1e4", platform: "instagram", username: "vireimoda", profileId: "6abfcc339f096a6fa70a61f1", accountId: "6abfccbe4b107da7a1e5f1e4" },
  metadata: { storyReply: { storyId: "18310828933304552", storyUrl: "https://lookaside" } },
  timestamp: "2026-10-02T16:39:47.500Z",
};

test("comentário e direct entram com só o que o motor usa", () => {
  const c = lerEvento(comentario);
  assert.equal(c?.event, "comment.received");
  if (c?.event !== "comment.received") return;
  assert.deepEqual(c.comment.author, { id: "1808886413685415", username: "igortoled0", isOwnAccount: false });
  assert.equal(c.account.accountId, "6abfccbe4b107da7a1e5f1e4");
  assert.equal("post" in c, false, "o post inteiro (texto, foto) não passa");

  const m = lerEvento(mensagem);
  assert.equal(m?.event, "message.received");
  if (m?.event !== "message.received") return;
  assert.equal(m.message.text, "Quero");
  assert.equal(m.conversation.id, "6abfcccc4ed84fcf2a07792f");
  assert.equal(m.metadata?.storyReply?.storyId, "18310828933304552");
});

test("eventos de conta entram; outro tipo, corpo torto ou campo obrigatório faltando viram null", () => {
  assert.equal(lerEvento({ id: "1", event: "account.connected", account: { accountId: "z1", profileId: "p", platform: "instagram", username: "u" }, timestamp: "t" })?.event, "account.connected");
  const d = lerEvento({ id: "1", event: "account.disconnected", account: { accountId: "z1", profileId: "p", platform: "instagram", username: "u", disconnectionType: "unintentional", reason: "token" }, timestamp: "t" });
  assert.equal(d?.event === "account.disconnected" ? d.account.reason : null, "token");
  assert.equal(lerEvento({ ...mensagem, event: "message.sent" }), null);
  assert.equal(lerEvento("texto"), null);
  assert.equal(lerEvento(null), null);
  assert.equal(lerEvento({ ...comentario, comment: { ...comentario.comment, id: "" } }), null);
  assert.equal(lerEvento({ ...mensagem, account: {} }), null);
});
