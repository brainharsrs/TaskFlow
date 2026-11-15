// TaskFlow bot — baixa o modelo de voz (Whisper) UMA vez, com progresso e retomada.
//   npm run modelo        (dentro de bot/)
//
// Se a internet cair no meio, rode de novo: ele continua de onde parou (HTTP Range).
// Depois disso o bot carrega o modelo só do disco, sem precisar de internet.
import { mkdir, stat, rename, readdir, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { modelDir, modelFiles, DEFAULT_MODEL, isModelReady } from './transcribe.js';

const model = process.env.WHISPER_MODEL || DEFAULT_MODEL;
const base = `https://huggingface.co/${model}/resolve/main`;
const dir = modelDir(model);
const MB = 1024 * 1024;

async function sizeOf(path) {
  try { return (await stat(path)).size; } catch { return 0; }
}

/** Baixa um arquivo continuando um .part existente. Tenta de novo até 8 vezes. */
async function download(file) {
  const target = join(dir, file);
  const part = `${target}.part`;
  await mkdir(dirname(target), { recursive: true });
  if (await sizeOf(target) > 0) { console.log(`✓ ${file} (já baixado)`); return; }

  for (let attempt = 1; attempt <= 8; attempt++) {
    const have = await sizeOf(part);
    try {
      const response = await fetch(`${base}/${file}`, {
        headers: have ? { Range: `bytes=${have}-` } : {},
        signal: AbortSignal.timeout(10 * 60_000)
      });
      if (response.status === 416) break; // o .part já está completo
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const resumed = response.status === 206;
      const total = Number(response.headers.get('content-length') ?? 0) + (resumed ? have : 0);
      let done = resumed ? have : 0;
      let lastPrint = 0;
      const body = Readable.fromWeb(response.body);
      body.on('data', chunk => {
        done += chunk.length;
        if (total > MB && Date.now() - lastPrint > 1000) {
          lastPrint = Date.now();
          process.stdout.write(`\r↓ ${file}: ${(done / MB).toFixed(0)} de ${(total / MB).toFixed(0)} MB (${Math.floor((done / total) * 100)}%)   `);
        }
      });
      // Se ficar 60 s sem receber nada, desiste desta tentativa e retoma.
      let idle;
      const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => body.destroy(new Error('conexão parada há 60 s')), 60_000); };
      body.on('data', resetIdle);
      resetIdle();
      await pipeline(body, createWriteStream(part, { flags: resumed ? 'a' : 'w' })).finally(() => clearTimeout(idle));
      if (total > MB) process.stdout.write('\n');
      break;
    } catch (error) {
      process.stdout.write('\n');
      console.log(`! ${file}: ${error.message}. Tentativa ${attempt} de 8; retomando em 5 s…`);
      if (attempt === 8) throw new Error(`não foi possível baixar ${file}. Rode "npm run modelo" de novo para continuar.`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  await rename(part, target);
  console.log(`✓ ${file}`);
}

/** Apaga restos de downloads interrompidos pelo carregador antigo (arquivos *.tmp.*). */
async function cleanStale(path) {
  let entries = [];
  try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) await cleanStale(full);
    else if (/\.tmp\.\d+\./.test(entry.name)) await unlink(full).catch(() => {});
  }
}

console.log(`Modelo de voz: ${model}\nPasta: ${dir}\n`);
await cleanStale(dir);
for (const file of modelFiles()) await download(file);
console.log(await isModelReady(model) ? '\nPronto! Agora é só rodar "npm start".' : '\nAlgo ficou faltando; rode "npm run modelo" de novo.');
