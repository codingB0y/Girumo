import { registerHooks } from "node:module";

/**
 * `import "server-only"` é resolvido pelo Next por alias de build — o pacote não
 * existe em node_modules. Sob `tsx --test` isso vira MODULE_NOT_FOUND e derruba
 * qualquer teste que alcance uma store.
 *
 * O shim resolve o especificador para um módulo vazio, e só dentro do processo
 * de teste. Nada aqui entra no build: a barreira que impede a store de vazar
 * para o bundle do cliente continua valendo em produção.
 *
 * `.mjs` de propósito — é plumbing de runtime, não código de app, e o
 * `@types/node` desta versão ainda não declara `registerHooks`.
 */
const STUB = new URL("./server-only-stub.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: STUB, format: "commonjs", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
