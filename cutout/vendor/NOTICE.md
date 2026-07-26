# cutout/vendor — 서드파티 동봉물 (자기완결 서빙용 · CDN 무의존)

| 파일 | 출처 | 버전 | 라이선스 |
|---|---|---|---|
| `ort.wasm.min.js`(wasm 전용 번들) · `ort-wasm-simd-threaded.mjs` · `ort-wasm-simd-threaded.wasm` | [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) (Microsoft) | 1.27.0 | MIT |
| `../u2netp.onnx` | [U²-Net(p)](https://github.com/xuebinqin/U-2-Net) — [rembg](https://github.com/danielgatis/rembg) 배포본(release v0.0.0) | md5 `8e83ca70e441ab06c318d82300c84806` | Apache-2.0 |

갱신법: `npm pack onnxruntime-web@<버전>` → `package/dist/`에서 위 3파일 교체(파일명 동수 유지 — `index.html`의 `wasmPaths='vendor/'` 계약).
