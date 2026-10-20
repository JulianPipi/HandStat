import { HandballDatabase } from '../data/db';

export interface ClockSnapshot {
  periodId: string;
  running: boolean;
  accumulatedMs: number;
  currentDisplayMs: number;
  uncertain: boolean;
  uncertainReason?: string;
}

export class MatchClockService {
  private running = false;
  private accumulatedMs = 0;
  private anchorPerformanceNow: number | null = null;
  private anchorWallTimestamp: number | null = null;
  private uncertain = false;
  private uncertainReason?: string;

  constructor(
    private db: HandballDatabase,
    private matchId: string,
    private periodId: string
  ) {}

  /**
   * Inicializa o restaura el estado del reloj desde IndexedDB al abrir la app o montar el componente.
   */
  async load(): Promise<ClockSnapshot> {
    const anchor = await this.db.clockAnchors.get([this.matchId, this.periodId] as any);

    if (anchor) {
      this.accumulatedMs = anchor.accumulated_ms;
      this.uncertain = anchor.uncertain;
      this.uncertainReason = anchor.uncertain_reason;

      if (anchor.running && anchor.anchor_wall_timestamp) {
        const wallDelta = Date.now() - anchor.anchor_wall_timestamp;

        // Si el reloj del sistema saltó hacia atrás (wallDelta < 0) o avanzó más de 60 segundos
        // mientras el reloj estaba corriendo fuera de la vista del usuario:
        if (wallDelta < 0 || wallDelta > 60000) {
          this.running = false;
          this.uncertain = true;
          this.uncertainReason = wallDelta < 0
            ? 'Se detectó cambio retrospectivo en el reloj del sistema. Verifique y ajuste el tiempo de juego.'
            : `Se detectó interrupción o suspensión de ${Math.round(wallDelta / 1000)}s con reloj en marcha. Verifique el tiempo de juego.`;
          await this.saveAnchor();
        } else {
          // Si el lapso fue breve y monótono (ej. recarga rápida de 1-2 segundos) sumamos el delta y reanudamos
          this.accumulatedMs += wallDelta;
          this.running = true;
          this.anchorPerformanceNow = performance.now();
          this.anchorWallTimestamp = Date.now();
          await this.saveAnchor();
        }
      } else {
        this.running = false;
      }
    } else {
      // Estado inicial en cero
      this.accumulatedMs = 0;
      this.running = false;
      this.uncertain = false;
      await this.saveAnchor();
    }

    return this.getSnapshot();
  }

  /**
   * Inicia o reanuda el reloj.
   */
  async start(): Promise<ClockSnapshot> {
    if (this.running) return this.getSnapshot();

    this.running = true;
    this.anchorPerformanceNow = performance.now();
    this.anchorWallTimestamp = Date.now();
    await this.saveAnchor();
    return this.getSnapshot();
  }

  /**
   * Pausa el reloj de juego.
   */
  async pause(): Promise<ClockSnapshot> {
    if (!this.running) return this.getSnapshot();

    if (this.anchorPerformanceNow !== null) {
      const elapsed = Math.round(performance.now() - this.anchorPerformanceNow);
      this.accumulatedMs += elapsed;
    }

    this.running = false;
    this.anchorPerformanceNow = null;
    this.anchorWallTimestamp = null;
    await this.saveAnchor();
    return this.getSnapshot();
  }

  /**
   * Ajuste manual del tiempo transcurrido (para corregir discrepancias o resolver incertidumbre).
   */
  async setTime(newTimeMs: number): Promise<ClockSnapshot> {
    this.accumulatedMs = Math.max(0, newTimeMs);
    if (this.running) {
      this.anchorPerformanceNow = performance.now();
      this.anchorWallTimestamp = Date.now();
    }
    this.uncertain = false;
    this.uncertainReason = undefined;
    await this.saveAnchor();
    return this.getSnapshot();
  }

  /**
   * Resuelve y limpia la incertidumbre explícita.
   */
  async clearUncertainty(): Promise<ClockSnapshot> {
    this.uncertain = false;
    this.uncertainReason = undefined;
    await this.saveAnchor();
    return this.getSnapshot();
  }

  /**
   * Devuelve el estado actual con el tiempo dinámico en milisegundos.
   */
  getSnapshot(): ClockSnapshot {
    let currentDisplayMs = this.accumulatedMs;
    if (this.running && this.anchorPerformanceNow !== null) {
      currentDisplayMs += Math.round(performance.now() - this.anchorPerformanceNow);
    }

    return {
      periodId: this.periodId,
      running: this.running,
      accumulatedMs: this.accumulatedMs,
      currentDisplayMs,
      uncertain: this.uncertain,
      uncertainReason: this.uncertainReason,
    };
  }

  private async saveAnchor(): Promise<void> {
    await this.db.clockAnchors.put({
      match_id: this.matchId,
      period_id: this.periodId,
      running: this.running,
      accumulated_ms: this.accumulatedMs,
      anchor_wall_timestamp: this.anchorWallTimestamp,
      uncertain: this.uncertain,
      uncertain_reason: this.uncertainReason,
      updated_at: new Date().toISOString(),
    });
  }
}
