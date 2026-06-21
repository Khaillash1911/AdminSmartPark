import {
  Component, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

// Proxied through Angular dev-server → proxy.conf.json → http://localhost:5050
const API_BASE = '/detector-api';

interface LogLine {
  ts: string;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'occupied' | 'free' | 'summary';
}

interface SpotResult {
  image: string;
  cars_detected: number;
  spots: number;
  free: number;
  occupied: number;
  spot_statuses: Record<string, boolean>;
}

interface DetectionResult {
  images_processed: number;
  total_spots: number;
  total_free: number;
  total_occupied: number;
  images: SpotResult[];
}

@Component({
  selector: 'app-test-detection-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule
  ],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="header-left">
        <mat-icon class="header-icon">biotech</mat-icon>
        <div>
          <h2 class="dialog-title">Test Parking Detection</h2>
          <p class="dialog-subtitle">Runs YOLOv8 + parking_points.json via local Python API</p>
        </div>
      </div>
      <button mat-icon-button (click)="close()" matTooltip="Close" [disabled]="isRunning">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-divider></mat-divider>

    <!-- API Status bar -->
    <div class="status-bar">
      <span class="status-dot" [class.dot-ok]="apiOk === true" [class.dot-err]="apiOk === false" [class.dot-unknown]="apiOk === null"></span>
      <span class="status-text">
        {{ apiOk === null ? 'Checking API…' : apiOk ? 'API ready on localhost:5050' : 'API not reachable — run: python detector_api.py' }}
      </span>
      <span class="spacer"></span>
      <button mat-icon-button (click)="checkApi()" matTooltip="Recheck API" [disabled]="isRunning">
        <mat-icon>refresh</mat-icon>
      </button>
    </div>

    <mat-divider></mat-divider>

    <!-- Body: terminal + results -->
    <div class="dialog-body">

      <!-- Terminal log -->
      <div class="terminal" #terminal>
        <div class="terminal-header">
          <span class="term-dot r"></span><span class="term-dot y"></span><span class="term-dot g"></span>
          <span class="term-title">detector_api.py — live output</span>
          <span class="spacer"></span>
          <button mat-icon-button (click)="clearLogs()" matTooltip="Clear" class="clear-btn" [disabled]="isRunning">
            <mat-icon style="font-size:16px;color:#aaa">clear_all</mat-icon>
          </button>
        </div>
        <div class="log-area" #logArea>
          <div *ngIf="logs.length === 0" class="term-placeholder">
            Press "Run Detection" to start…
          </div>
          <div *ngFor="let l of logs" class="log-line" [class]="'lvl-' + l.level">
            <span class="log-ts">{{ l.ts | slice:11:19 }}</span>
            <span class="log-msg">{{ l.message }}</span>
          </div>
          <div *ngIf="isRunning" class="cursor-blink">▌</div>
        </div>
      </div>

      <!-- Result cards (shown after completion) -->
      <div class="result-panel" *ngIf="result">
        <!-- Grand totals -->
        <div class="grand-cards">
          <div class="grand-card card-free">
            <mat-icon>check_circle</mat-icon>
            <div class="grand-val">{{ result.total_free }}</div>
            <div class="grand-lbl">Free Spots</div>
          </div>
          <div class="grand-card card-occupied">
            <mat-icon>directions_car</mat-icon>
            <div class="grand-val">{{ result.total_occupied }}</div>
            <div class="grand-lbl">Occupied</div>
          </div>
          <div class="grand-card card-total">
            <mat-icon>local_parking</mat-icon>
            <div class="grand-val">{{ result.total_spots }}</div>
            <div class="grand-lbl">Total Spots</div>
          </div>
          <div class="grand-card card-images">
            <mat-icon>image</mat-icon>
            <div class="grand-val">{{ result.images_processed }}</div>
            <div class="grand-lbl">Images</div>
          </div>
        </div>

        <!-- Per-image breakdown -->
        <div class="breakdown-title">Per-image breakdown</div>
        <div class="img-results">
          <div *ngFor="let img of result.images" class="img-card">
            <div class="img-card-header">
              <mat-icon>image</mat-icon>
              <span class="img-name">{{ img.image }}</span>
              <span class="img-cars">{{ img.cars_detected }} car(s)</span>
            </div>
            <div class="spot-row">
              <span class="spot-pill free-pill">🟢 {{ img.free }} free</span>
              <span class="spot-pill occ-pill">🔴 {{ img.occupied }} occupied</span>
            </div>
            <div class="spot-grid">
              <span *ngFor="let s of objEntries(img.spot_statuses)"
                    class="spot-badge"
                    [class.occ-badge]="s[1]"
                    [class.free-badge]="!s[1]">
                S{{ +s[0] + 1 }} {{ s[1] ? '●' : '○' }}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>

    <mat-divider></mat-divider>

    <!-- Footer -->
    <div class="dialog-footer">
      <span class="run-hint" *ngIf="!apiOk">Start the API: <code>cd AdminSmartPark && python detector_api.py</code></span>
      <span class="spacer"></span>
      <button mat-stroked-button (click)="close()" [disabled]="isRunning">Close</button>
      <button mat-raised-button class="run-btn" (click)="runDetection()"
              [disabled]="!apiOk || isRunning">
        <mat-icon>{{ isRunning ? 'hourglass_top' : 'play_arrow' }}</mat-icon>
        {{ isRunning ? 'Running…' : 'Run Detection' }}
      </button>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

    /* Header */
    .dialog-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 28px; width: 28px; height: 28px; color: #7c4dff; }
    .dialog-title { margin: 0; font-size: 20px; font-weight: 600; }
    .dialog-subtitle { margin: 2px 0 0; font-size: 12px; color: #666; }

    /* Status bar */
    .status-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 20px; background: #f9f9f9; font-size: 13px;
    }
    .status-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      transition: background 0.3s;
    }
    .dot-ok      { background: #4caf50; box-shadow: 0 0 6px #4caf50; }
    .dot-err     { background: #f44336; box-shadow: 0 0 6px #f44336; }
    .dot-unknown { background: #bbb; }
    .status-text { font-size: 12px; color: #555; }
    .spacer { flex: 1; }

    /* Body */
    .dialog-body {
      flex: 1; display: flex; gap: 0; overflow: hidden; min-height: 0;
    }

    /* Terminal */
    .terminal {
      width: 52%; display: flex; flex-direction: column;
      background: #0d1117; border-right: 1px solid #222;
      overflow: hidden;
    }
    .terminal-header {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 12px; background: #161b22;
      border-bottom: 1px solid #30363d;
    }
    .term-dot { width: 12px; height: 12px; border-radius: 50%; }
    .term-dot.r { background: #ff5f57; }
    .term-dot.y { background: #febc2e; }
    .term-dot.g { background: #28c840; }
    .term-title { font-size: 11px; color: #888; margin-left: 6px; font-family: monospace; }
    .clear-btn { margin-left: auto; }

    .log-area {
      flex: 1; overflow-y: auto; padding: 10px 14px;
      font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.7;
    }
    .term-placeholder { color: #555; font-style: italic; padding: 20px 0; }
    .log-line { display: flex; gap: 10px; }
    .log-ts { color: #555; flex-shrink: 0; }
    .log-msg { color: #c9d1d9; white-space: pre-wrap; word-break: break-all; }
    .lvl-error   .log-msg { color: #ff7070; }
    .lvl-warn    .log-msg { color: #ffa94d; }
    .lvl-success .log-msg { color: #63e2a3; }
    .lvl-free    .log-msg { color: #69db7c; }
    .lvl-occupied .log-msg { color: #ff8787; }
    .lvl-summary .log-msg { color: #74c0fc; font-weight: bold; }
    .cursor-blink {
      color: #7c4dff; font-size: 16px;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    /* Result panel */
    .result-panel {
      flex: 1; display: flex; flex-direction: column;
      overflow-y: auto; padding: 16px;
      background: #fafbff;
    }

    /* Grand cards */
    .grand-cards {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 10px; margin-bottom: 16px;
    }
    .grand-card {
      border-radius: 12px; padding: 14px; display: flex;
      flex-direction: column; align-items: center; text-align: center;
      color: white;
    }
    .grand-card mat-icon { font-size: 26px; width: 26px; height: 26px; margin-bottom: 6px; }
    .grand-val { font-size: 28px; font-weight: 700; line-height: 1; }
    .grand-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; opacity: 0.9; }
    .card-free     { background: linear-gradient(135deg, #2e7d32, #4caf50); }
    .card-occupied { background: linear-gradient(135deg, #c62828, #ef5350); }
    .card-total    { background: linear-gradient(135deg, #4a148c, #7b1fa2); }
    .card-images   { background: linear-gradient(135deg, #1a237e, #1976d2); }

    /* Per-image breakdown */
    .breakdown-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; color: #888; margin-bottom: 8px;
    }
    .img-results { display: flex; flex-direction: column; gap: 8px; }
    .img-card {
      background: white; border-radius: 10px; padding: 12px;
      border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }
    .img-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .img-card-header mat-icon { font-size: 16px; width: 16px; height: 16px; color: #888; }
    .img-name { font-weight: 600; font-size: 13px; flex: 1; }
    .img-cars { font-size: 11px; color: #888; }
    .spot-row { display: flex; gap: 8px; margin-bottom: 6px; }
    .spot-pill { font-size: 11px; padding: 2px 10px; border-radius: 12px; font-weight: 600; }
    .free-pill { background: #e8f5e9; color: #2e7d32; }
    .occ-pill  { background: #ffebee; color: #c62828; }
    .spot-grid { display: flex; flex-wrap: wrap; gap: 4px; }
    .spot-badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; font-weight: 600; }
    .free-badge { background: #e8f5e9; color: #2e7d32; }
    .occ-badge  { background: #ffebee; color: #c62828; }

    /* Footer */
    .dialog-footer {
      display: flex; align-items: center; justify-content: flex-end;
      padding: 12px 20px; gap: 10px; flex-wrap: wrap;
    }
    .run-hint { font-size: 12px; color: #c62828; font-family: monospace; }
    .run-hint code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; }
    .run-btn { background: linear-gradient(135deg, #4a148c, #7b1fa2) !important; color: white !important; }
  `]
})
export class TestDetectionDialogComponent implements OnDestroy {
  @ViewChild('logArea') logAreaRef!: ElementRef<HTMLDivElement>;

  logs: LogLine[] = [];
  result: DetectionResult | null = null;
  isRunning = false;
  apiOk: boolean | null = null;

  private eventSource: EventSource | null = null;

  constructor(
    private dialogRef: MatDialogRef<TestDetectionDialogComponent>,
    private cdr: ChangeDetectorRef
  ) {
    this.checkApi();
  }

  ngOnDestroy() {
    this.eventSource?.close();
  }

  async checkApi() {
    this.apiOk = null;
    this.cdr.detectChanges();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
      this.apiOk = res.ok;
    } catch {
      this.apiOk = false;
    } finally {
      clearTimeout(timer);
    }
    this.cdr.detectChanges();
  }

  runDetection() {
    if (this.isRunning || !this.apiOk) return;
    this.logs = [];
    this.result = null;
    this.isRunning = true;
    this.cdr.detectChanges();

    this.eventSource?.close();
    this.eventSource = new EventSource(`${API_BASE}/run-detection`);

    this.eventSource.onmessage = (evt) => {
      const data = evt.data as string;

      if (data === '[DONE]') {
        this.isRunning = false;
        this.eventSource?.close();
        this.cdr.detectChanges();
        return;
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'log') {
          this.logs.push({
            ts: parsed.ts ?? new Date().toISOString(),
            message: parsed.message,
            level: parsed.level ?? 'info'
          });
          setTimeout(() => this.scrollToBottom());
        } else if (parsed.type === 'result') {
          this.result = parsed as DetectionResult;
        }
      } catch {
        this.logs.push({ ts: new Date().toISOString(), message: data, level: 'info' });
      }
      this.cdr.detectChanges();
    };

    this.eventSource.onerror = () => {
      this.isRunning = false;
      this.logs.push({
        ts: new Date().toISOString(),
        message: '[ERROR] Connection to API lost. Is detector_api.py running?',
        level: 'error'
      });
      this.eventSource?.close();
      this.cdr.detectChanges();
    };
  }

  clearLogs() {
    this.logs = [];
    this.result = null;
  }

  scrollToBottom() {
    const el = this.logAreaRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  objEntries(obj: Record<string, boolean>): [string, boolean][] {
    return Object.entries(obj);
  }

  close() {
    this.eventSource?.close();
    this.dialogRef.close();
  }
}
