import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const failures = [];
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await scan(path);
    else if (/\.(?:tsx?|jsx?|json|css|html|svg|md|txt|sql)$/.test(item.name)) {
      const contents = await readFile(path, 'utf8');
      contents.split('\n').forEach((line, index) => {
        if (/[\u2014]|&mdash;|&#(?:8212|x2014);/i.test(line)) failures.push(`${path}:${index + 1}`);
      });
    }
  }
}
for (const directory of ['src', 'public', 'supabase']) await scan(directory);
if (failures.length) {
  console.error('Forbidden punctuation found:\n' + failures.join('\n'));
  process.exitCode = 1;
} else console.log('Punctuation check passed.');
