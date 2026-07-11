// Thin wrapper around the Stockfish 17.1 "lite-single" WASM build running as a
// Web Worker. No SharedArrayBuffer / COOP-COEP requirement, so it deploys on
// Vercel's free tier with zero special headers. All analysis happens in the
// visitor's browser -- no server compute, no per-report cost.
export interface EvalResult {
  cp: number; // centipawns from White's perspective (mate scores are clamped to +-1000)
  mate?: number;
}

export class ChessEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        const worker = new Worker("/engine/stockfish.js");
        this.worker = worker;
        const onMessage = (e: MessageEvent) => {
          const line = String(e.data);
          if (line === "uciok") {
            worker.postMessage("setoption name Threads value 1");
            worker.postMessage("isready");
          } else if (line === "readyok") {
            worker.removeEventListener("message", onMessage);
            resolve();
          }
        };
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", (e) => reject(e));
        worker.postMessage("uci");
      } catch (err) {
        reject(err);
      }
    });
    return this.ready;
  }

  // Returns eval normalized to White's perspective (positive = good for White),
  // regardless of whose turn it is in the given FEN -- UCI reports "score cp"
  // relative to the side to move, so we flip the sign for Black-to-move FENs.
  async evaluateFen(fen: string, depth = 10): Promise<EvalResult> {
    if (!this.worker) throw new Error("Engine not initialized");
    const worker = this.worker;
    const sideToMove = fen.split(" ")[1] === "b" ? "b" : "w";
    return new Promise((resolve) => {
      let lastCp = 0;
      let lastMate: number | undefined;
      const onMessage = (e: MessageEvent) => {
        const line = String(e.data);
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        if (scoreMatch) {
          if (scoreMatch[1] === "cp") {
            lastCp = parseInt(scoreMatch[2], 10);
            lastMate = undefined;
          } else {
            lastMate = parseInt(scoreMatch[2], 10);
            lastCp = lastMate > 0 ? 1000 : -1000;
          }
        }
        if (line.startsWith("bestmove")) {
          worker.removeEventListener("message", onMessage);
          const sign = sideToMove === "b" ? -1 : 1;
          resolve({
            cp: lastCp * sign,
            mate: lastMate !== undefined ? lastMate * sign : undefined,
          });
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }

  terminate() {
    this.worker?.postMessage("quit");
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
