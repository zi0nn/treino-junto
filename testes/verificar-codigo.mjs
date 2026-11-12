// Confere o código do app (sem precisar abrir o navegador):
// nomes usados sem import, variáveis esquecidas, erros de sintaxe.
// Para rodar: na pasta "testes", digite  npm run verificar
import { ESLint } from 'eslint';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({
  cwd: raiz,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  }, {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  }],
});

const resultados = await eslint.lintFiles(['app.js', 'store.js', 'sw.js', 'firebase-config.js', 'js/*.js']);
let erros = 0, avisos = 0;
for (const r of resultados) {
  for (const m of r.messages) {
    const nivel = m.severity === 2 ? 'ERRO ' : 'aviso';
    if (m.severity === 2) erros++; else avisos++;
    console.log(`${nivel} ${r.filePath.replace(raiz, '').replace(/^[\\/]/, '')}:${m.line}  ${m.message}`);
  }
}
console.log(`\n${resultados.length} arquivos · ${erros} erro(s) · ${avisos} aviso(s)`);
process.exit(erros ? 1 : 0);
