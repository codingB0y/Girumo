function createQueuedTextSender(queue, {
  resolveMentions = async (mentions) => typeof mentions === "function" ? mentions() : mentions,
} = {}) {
  return function sendText(sock, jid, text, {
    priority = false,
    mentions,
    session,
    assertActive,
  } = {}) {
    return queue.enqueue(
      async () => {
        const resolvedMentions = await resolveMentions(mentions);
        assertActive?.();
        session?.assertActive();
        return sock.sendMessage(jid, {
          text,
          ...(resolvedMentions ? { mentions: resolvedMentions } : {}),
        });
      },
      { priority },
    );
  };
}

module.exports = { createQueuedTextSender };
