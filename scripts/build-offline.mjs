import fs from 'node:fs/promises';
import ts from 'typescript';
const files = { 'src/offline/client.ts': 'client', 'src/lib/offline-store.ts': 'offline-store', 'src/lib/training.ts': 'training', 'src/lib/exercise-logging.ts': 'exercise-logging', 'src/lib/workout-performance.ts': 'workout-performance', 'src/lib/workout-sections.ts': 'workout-sections' };
await fs.mkdir('public/offline', { recursive: true });
for (const [source, target] of Object.entries(files)) {
  const input = await fs.readFile(source, 'utf8');
  let output = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
  output = output.replace(/from ['"](?:\.\.\/lib\/|\.\/)([^'"]+)['"]/g, (_, name) => `from './${name}.js'`);
  if (/from ['"]@\//.test(output)) throw new Error(`Offline runtime contains an unresolved alias: ${source}`);
  await fs.writeFile(`public/offline/${target}.js`, output);
}
console.log('Lightweight offline shell generated.');
