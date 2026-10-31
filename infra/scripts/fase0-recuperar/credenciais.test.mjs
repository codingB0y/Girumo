import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PS1 = fileURLToPath(new URL("./credenciais.ps1", import.meta.url));

// Carrega só as funções do .ps1 (pela AST), sem rodar o script, que pediria as credenciais; uma linha de saída por chamada.
function rodarPs(chamadas) {
  const cmd = [
    `$ast = [System.Management.Automation.Language.Parser]::ParseFile('${PS1}', [ref]$null, [ref]$null)`,
    "foreach ($f in $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $f.Extent.Text }",
    ...chamadas.map((c) => `try { ${c} } catch { 'ERRO: ' + $_.Exception.Message }`),
  ].join("; ");
  return new Promise((ok) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], (_erro, stdout, stderr) => ok((stdout + stderr).trim().split(/\r?\n/))));
}

test("credenciais.ps1: marcadores e celulares validados sem ecoar o valor digitado", { skip: process.platform !== "win32" && "só no Windows" }, async () => {
  const [ok1, ruim1, ok2, ruim2, semB] = await rodarPs([
    "Validar-Marcadores 'dono@real.com,987654321'",
    "Validar-Marcadores 'dono@real.com,gmail.com'",
    "Validar-Celulares 'CHIP=5511999990001,B=5511999990002,C=5511999990003'",
    "Validar-Celulares 'CHIP=5511999990001,5511999990002'",
    "Validar-Celulares 'CHIP=5511999990001,C=5511999990003'",
  ]);
  assert.equal(ok1, "1 e-mail(s), 1 telefone(s)");
  assert.match(ruim1, /^ERRO: .*item 2/);
  assert.ok(!ruim1.includes("gmail"));
  assert.equal(ok2, "CHIP, B, C");
  assert.match(ruim2, /^ERRO: .*item 2/);
  assert.ok(!ruim2.includes("5511999990002"));
  assert.match(semB, /^ERRO: .*sem B/);
});
