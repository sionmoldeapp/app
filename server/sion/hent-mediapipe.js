// Henter MediaPipe (uskarp bakgrunn i video) til lib/mediapipe: node server/sion/hent-mediapipe.js
// Den store wasm-filen ligger ikke i git. Kjør dette på nye servere. Pakken er Apache-2.0.
const fs=require('fs'),path=require('path'),{execSync}=require('child_process'),os=require('os');
const ut=path.resolve(__dirname,'../../lib/mediapipe'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mp-'));
execSync('npm pack @mediapipe/tasks-vision@1.2.0',{cwd:tmp,stdio:'inherit'});
const tgz=fs.readdirSync(tmp).find(f=>f.endsWith('.tgz'));execSync('tar -xzf '+tgz,{cwd:tmp});
fs.mkdirSync(path.join(ut,'wasm'),{recursive:true});
fs.copyFileSync(path.join(tmp,'package/vision_bundle.mjs'),path.join(ut,'vision_bundle.mjs'));
for(const f of ['vision_wasm_internal.js','vision_wasm_internal.wasm'])fs.copyFileSync(path.join(tmp,'package/wasm',f),path.join(ut,'wasm',f));
console.log('Lagt i',ut,'– modellen selfie_segmenter.tflite ligger allerede i git.');
