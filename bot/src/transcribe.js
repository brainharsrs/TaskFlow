// TaskFlow bot — transcrição de áudio NO COMPUTADOR, com Whisper (código aberto).
// O áudio não sai da máquina: o Telegram entrega o arquivo, o ffmpeg converte e o modelo transcreve.
//
// Requisitos: ffmpeg no PATH (https://ffmpeg.org) e o modelo baixado UMA vez com "npm run modelo"
// (~250 MB no whisper-small), guardado em %LOCALAPPDATA%/taskflow-bot/models — fora do projeto e
// do OneDrive. O bot carrega o modelo só do disco: não depende da internet para ouvir áudios.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';

const SAMPLE_RATE = 16_000;
export const DEFAULT_MODEL = 'Xenova/whisper-small';

/** Pasta raiz dos modelos e pasta de um modelo. */
export const modelsRoot = () => join(process.env.LOCALAPPDATA ?? join(homedir(), '.cache'), 'taskflow-bot', 'models');
export const modelDir = model => join(modelsRoot(), ...model.split('/'));

/** Arquivos que o Whisper quantizado (q8) precisa. */
export const modelFiles = () => [
  'config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'
];

export async function isModelReady(model = DEFAULT_MODEL) {
  for (const file of modelFiles()) {
    try { if ((await stat(join(modelDir(model), file))).size === 0) return false; } catch { return false; }
  }
  return true;
}

/** Converte qualquer áudio (OGG/Opus do Telegram, MP3, M4A…) em PCM float 16 kHz mono, sem arquivos temporários. */
export function decodeAudio(buffer, { ffmpeg = 'ffmpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), 'pipe:1']);
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => reject(error.code === 'ENOENT' ? new Error('ffmpeg não encontrado no PATH.') : error));
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg falhou (${code}): ${stderr.trim().slice(0, 200)}`));
      const data = Buffer.concat(chunks);
      // Copia para um ArrayBuffer alinhado (Float32Array exige múltiplo de 4 bytes).
      const aligned = new Uint8Array(data.length - (data.length % 4));
      aligned.set(data.subarray(0, aligned.length));
      resolve(new Float32Array(aligned.buffer));
    });
    child.stdin.on('error', () => {}); // ffmpeg pode fechar a entrada antes do fim em arquivos inválidos
    child.stdin.end(buffer);
  });
}

/**
 * Cria o transcritor. O modelo só é carregado no primeiro uso (ou em `warmUp`) e os áudios são
 * transcritos um por vez, para não estourar a memória com vários ao mesmo tempo.
 */
export function createTranscriber({ model = DEFAULT_MODEL, log = () => {} } = {}) {
  let pipelinePromise = null;
  let queue = Promise.resolve();

  const load = () => {
    pipelinePromise ??= (async () => {
      if (!(await isModelReady(model))) {
        throw new Error('modelo de voz não encontrado. Pare o bot e rode "npm run modelo" (uma vez só)');
      }
      const { pipeline, env } = await import('@huggingface/transformers');
      env.localModelPath = modelsRoot();
      env.allowLocalModels = true;
      env.allowRemoteModels = false; // nada de download escondido: o modelo vem de "npm run modelo"
      log(`carregando o modelo de voz ${model}…`);
      const started = Date.now();
      const asr = await pipeline('automatic-speech-recognition', model, { dtype: 'q8' });
      log(`modelo de voz pronto em ${Math.round((Date.now() - started) / 1000)} s`);
      return asr;
    })();
    pipelinePromise.catch(() => { pipelinePromise = null; }); // falhou: tenta de novo no próximo áudio
    return pipelinePromise;
  };

  async function run(buffer) {
    const samples = await decodeAudio(buffer);
    if (samples.length < SAMPLE_RATE * 0.3) return ''; // menos de 0,3 s: nada a ouvir
    const asr = await load();
    const result = await asr(samples, { language: 'portuguese', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    return String(result?.text ?? '').trim();
  }

  return {
    warmUp: () => load().then(() => true),
    /** Devolve o texto transcrito (string vazia se não houver fala). */
    transcribe(buffer) {
      const job = queue.then(() => run(buffer));
      queue = job.catch(() => {});
      return job;
    }
  };
}
