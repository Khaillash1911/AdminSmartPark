import {
  Component, ElementRef, ViewChild, AfterViewInit,
  ChangeDetectorRef, OnDestroy, Inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// ── Types ──────────────────────────────────────────────────────────────────
export type Point = [number, number];
export type SpotPolygon = Point[]; // always 4 points when complete

interface ImageEntry {
  name: string;
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  spots: SpotPolygon[];        // completed 4-point spots
  currentPoints: Point[];      // points being placed for the active spot
}

// ── Component ───────────────────────────────────────────────────────────────
@Component({
  selector: 'app-parking-marker-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  template: `
    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="dialog-header">
      <div class="header-left">
        <mat-icon class="header-icon">add_location_alt</mat-icon>
        <div>
          <h2 class="dialog-title">Add Parking Spots</h2>
          <p class="dialog-subtitle">Click 4 corners on each parking bay to define its boundary</p>
        </div>
      </div>
      <button mat-icon-button (click)="close()" matTooltip="Close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-divider></mat-divider>

    <!-- ── Body ────────────────────────────────────────────────────────── -->
    <div class="dialog-body">

      <!-- Left panel: image list + upload -->
      <div class="side-panel">
        <div class="panel-title">Images</div>

        <div class="image-list">
          <div
            *ngFor="let img of images; let i = index"
            class="image-thumb-row"
            [class.active-thumb]="i === activeIdx"
            (click)="switchImage(i)"
          >
            <img [src]="img.dataUrl" class="thumb-img" />
            <div class="thumb-info">
              <div class="thumb-name">{{ img.name }}</div>
              <div class="thumb-spots">{{ img.spots.length }} spot{{ img.spots.length !== 1 ? 's' : '' }}</div>
            </div>
            <button mat-icon-button class="remove-btn" (click)="removeImage(i, $event)" matTooltip="Remove image">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div *ngIf="images.length === 0" class="empty-list">No images loaded</div>
        </div>

        <label class="upload-btn">
          <mat-icon>upload_file</mat-icon> Upload Images
          <input type="file" accept="image/*" multiple (change)="onFilesPicked($event)" hidden />
        </label>

        <mat-divider style="margin: 12px 0"></mat-divider>

        <!-- Legend -->
        <div class="legend">
          <div class="legend-item"><span class="dot dot-red"></span> Click point</div>
          <div class="legend-item"><span class="line-blue"></span> Completed spot</div>
          <div class="legend-item"><span class="line-yellow"></span> In-progress</div>
        </div>
      </div>

      <!-- Canvas area -->
      <div class="canvas-area">
        <div *ngIf="images.length === 0" class="canvas-placeholder">
          <mat-icon>image</mat-icon>
          <p>Upload parking lot images to begin marking spots</p>
          <label class="upload-btn-lg">
            <mat-icon>add_photo_alternate</mat-icon> Choose Images
            <input type="file" accept="image/*" multiple (change)="onFilesPicked($event)" hidden />
          </label>
        </div>

        <ng-container *ngIf="images.length > 0">
          <div class="canvas-toolbar">
            <span class="image-name-badge">{{ activeImage?.name }}</span>
            <span class="spacer"></span>
            <span class="spot-counter">{{ activeImage?.spots?.length ?? 0 }} spot(s) marked</span>
            <span class="point-hint" *ngIf="activeImage && activeImage.currentPoints.length > 0">
              {{ 4 - activeImage.currentPoints.length }} more click(s) to close spot
            </span>
            <button mat-icon-button (click)="undoLastPoint()" matTooltip="Undo last point"
                    [disabled]="!activeImage || activeImage.currentPoints.length === 0">
              <mat-icon>undo</mat-icon>
            </button>
            <button mat-icon-button (click)="clearCurrentSpot()" matTooltip="Cancel current spot"
                    [disabled]="!activeImage || activeImage.currentPoints.length === 0">
              <mat-icon>cancel</mat-icon>
            </button>
            <button mat-icon-button color="warn" (click)="clearAllSpots()" matTooltip="Clear all spots on this image"
                    [disabled]="!activeImage || activeImage.spots.length === 0">
              <mat-icon>layers_clear</mat-icon>
            </button>
            <button mat-icon-button (click)="prevImage()" matTooltip="Previous image" [disabled]="activeIdx <= 0">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <button mat-icon-button (click)="nextImage()" matTooltip="Next image" [disabled]="activeIdx >= images.length - 1">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>

          <div class="canvas-wrapper" #canvasWrapper>
            <canvas #canvas
              (click)="onCanvasClick($event)"
              (mousemove)="onMouseMove($event)"
              style="cursor: crosshair; display: block; border-radius: 6px;">
            </canvas>
          </div>
        </ng-container>
      </div>
    </div>

    <mat-divider></mat-divider>

    <!-- ── Footer ───────────────────────────────────────────────────────── -->
    <div class="dialog-footer">
      <div class="footer-left">
        <div class="total-spots">
          Total: {{ totalSpots }} spot(s) across {{ images.length }} image(s)
        </div>
        <div class="save-path-hint" *ngIf="totalSpots > 0">
          <mat-icon class="hint-icon">info</mat-icon>
          Save as <code>parking_points.json</code> — navigate to
          <code>bounding_box/</code> in the save dialog
        </div>
      </div>
      <div class="footer-actions">
        <button mat-raised-button class="btn-save" (click)="saveMarkings()" [disabled]="totalSpots === 0 || isSaving">
          <mat-icon>{{ isSaving ? 'hourglass_top' : 'save_as' }}</mat-icon>
          {{ isSaving ? 'Saving…' : 'Save Markings' }}
        </button>
        <button mat-button (click)="close()">Cancel</button>
      </div>
    </div>
  `,
  styles: [`
    /* ── Layout ────────────────────────────────────────────────────────── */
    :host { display: flex; flex-direction: column; height: 100%; }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 28px; width: 28px; height: 28px; color: var(--accent-blue, #1976d2); }
    .dialog-title { margin: 0; font-size: 20px; font-weight: 600; }
    .dialog-subtitle { margin: 2px 0 0; font-size: 13px; color: #666; }

    .dialog-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    /* ── Side panel ─────────────────────────────────────────────────────── */
    .side-panel {
      width: 210px;
      min-width: 210px;
      border-right: 1px solid rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      padding: 12px;
      overflow: hidden;
    }
    .panel-title { font-size: 11px; font-weight: 700; text-transform: uppercase;
                   letter-spacing: 0.8px; color: #888; margin-bottom: 8px; }

    .image-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .image-thumb-row {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; cursor: pointer;
      transition: background 0.15s;
      border: 1px solid transparent;
    }
    .image-thumb-row:hover  { background: #f5f5f5; }
    .active-thumb { background: rgba(25,118,210,0.08) !important; border-color: rgba(25,118,210,0.3) !important; }
    .thumb-img { width: 40px; height: 30px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
    .thumb-info { flex: 1; min-width: 0; }
    .thumb-name { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thumb-spots { font-size: 10px; color: #888; }
    .remove-btn { width: 24px; height: 24px; line-height: 24px; flex-shrink: 0; }
    .remove-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .empty-list { text-align: center; color: #bbb; font-size: 12px; font-style: italic; padding: 16px 0; }

    .upload-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      background: linear-gradient(135deg, #1a237e, #1976d2);
      color: white; border-radius: 8px; padding: 10px;
      cursor: pointer; font-size: 13px; font-weight: 500;
      margin-top: 10px; transition: opacity 0.2s;
    }
    .upload-btn:hover { opacity: 0.9; }
    .upload-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }

    /* Legend */
    .legend { display: flex; flex-direction: column; gap: 6px; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #555; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .dot-red { background: #f44336; }
    .line-blue { width: 20px; height: 3px; background: #1565c0; border-radius: 2px; flex-shrink: 0; }
    .line-yellow { width: 20px; height: 3px; background: #ffd600; border-radius: 2px; flex-shrink: 0; }

    /* ── Canvas area ─────────────────────────────────────────────────────── */
    .canvas-area {
      flex: 1; display: flex; flex-direction: column;
      overflow: hidden; background: #1a1a2e;
    }
    .canvas-placeholder {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; color: #888; gap: 12px;
    }
    .canvas-placeholder mat-icon { font-size: 64px; width: 64px; height: 64px; opacity: 0.3; }
    .canvas-placeholder p { font-size: 14px; }
    .upload-btn-lg {
      display: flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.1); color: white; border-radius: 8px;
      padding: 12px 20px; cursor: pointer; font-size: 14px; border: 1px dashed rgba(255,255,255,0.3);
    }
    .upload-btn-lg:hover { background: rgba(255,255,255,0.18); }

    .canvas-toolbar {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; background: rgba(255,255,255,0.06);
      border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;
      flex-wrap: wrap;
    }
    .image-name-badge {
      background: rgba(255,255,255,0.15); color: white;
      padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
    }
    .spacer { flex: 1; }
    .spot-counter { color: #aaa; font-size: 12px; }
    .point-hint {
      background: rgba(255,214,0,0.2); color: #ffd600;
      border: 1px solid rgba(255,214,0,0.4);
      padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
    }
    .canvas-toolbar button mat-icon { color: rgba(255,255,255,0.7); }
    .canvas-toolbar button[disabled] mat-icon { opacity: 0.3; }

    .canvas-wrapper {
      flex: 1; overflow: auto; display: flex;
      align-items: flex-start; justify-content: flex-start;
      padding: 12px;
    }

    /* ── Footer ─────────────────────────────────────────────────────────── */
    .dialog-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 20px; gap: 12px; flex-wrap: wrap;
    }
    .footer-left { display: flex; flex-direction: column; gap: 4px; }
    .total-spots { font-size: 13px; color: #666; }
    .save-path-hint {
      display: flex; align-items: center; gap: 4px;
      font-size: 12px; color: #555;
      background: #fff8e1; border: 1px solid #ffe082;
      border-radius: 6px; padding: 4px 10px;
    }
    .save-path-hint code { background: rgba(0,0,0,0.07); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
    .hint-icon { font-size: 14px; width: 14px; height: 14px; color: #f57c00; }
    .footer-actions { display: flex; gap: 10px; align-items: center; }
    .btn-save { background: linear-gradient(135deg, #1a237e, #1976d2) !important; color: white !important; }
  `]
})
export class ParkingMarkerDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  images: ImageEntry[] = [];
  activeIdx = 0;
  isSaving = false;

  private ctx!: CanvasRenderingContext2D;
  private mousePos: Point | null = null;

  constructor(
    private dialogRef: MatDialogRef<ParkingMarkerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private snack: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit() {
    if (this.canvasRef) {
      const ctx = this.canvasRef.nativeElement.getContext('2d');
      if (ctx) this.ctx = ctx;
    }
  }

  ngOnDestroy() {}

  // ── Getters ────────────────────────────────────────────────────────────
  get activeImage(): ImageEntry | null {
    return this.images[this.activeIdx] ?? null;
  }

  get totalSpots(): number {
    return this.images.reduce((sum, img) => sum + img.spots.length, 0);
  }

  // ── File handling ───────────────────────────────────────────────────────
  onFilesPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const files = Array.from(input.files);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target!.result as string;
        const img = new Image();
        img.onload = () => {
          this.images.push({
            name: file.name.replace(/\.[^.]+$/, ''),
            dataUrl,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            spots: [],
            currentPoints: []
          });
          this.cdr.detectChanges();
          if (this.images.length === 1) {
            this.activeIdx = 0;
            this.renderCanvas();
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

    input.value = '';
  }

  // ── Navigation ──────────────────────────────────────────────────────────
  switchImage(idx: number) {
    this.activeIdx = idx;
    setTimeout(() => this.renderCanvas());
  }

  prevImage() {
    if (this.activeIdx > 0) { this.activeIdx--; setTimeout(() => this.renderCanvas()); }
  }

  nextImage() {
    if (this.activeIdx < this.images.length - 1) { this.activeIdx++; setTimeout(() => this.renderCanvas()); }
  }

  removeImage(idx: number, event: MouseEvent) {
    event.stopPropagation();
    this.images.splice(idx, 1);
    if (this.activeIdx >= this.images.length) this.activeIdx = Math.max(0, this.images.length - 1);
    setTimeout(() => this.renderCanvas());
  }

  // ── Spot editing ─────────────────────────────────────────────────────────
  undoLastPoint() {
    const img = this.activeImage;
    if (!img || img.currentPoints.length === 0) return;
    img.currentPoints.pop();
    this.renderCanvas();
  }

  clearCurrentSpot() {
    const img = this.activeImage;
    if (!img) return;
    img.currentPoints = [];
    this.renderCanvas();
  }

  clearAllSpots() {
    const img = this.activeImage;
    if (!img) return;
    img.spots = [];
    img.currentPoints = [];
    this.renderCanvas();
  }

  // ── Canvas events ─────────────────────────────────────────────────────────
  onCanvasClick(event: MouseEvent) {
    const img = this.activeImage;
    if (!img) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    // Scale from display size back to natural image coords
    const scaleX = img.naturalW / canvas.offsetWidth;
    const scaleY = img.naturalH / canvas.offsetHeight;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);

    img.currentPoints.push([x, y]);

    if (img.currentPoints.length === 4) {
      img.spots.push([...img.currentPoints] as SpotPolygon);
      img.currentPoints = [];
      this.cdr.detectChanges();
    }

    this.renderCanvas();
  }

  onMouseMove(event: MouseEvent) {
    const img = this.activeImage;
    if (!img || img.currentPoints.length === 0) { this.mousePos = null; return; }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = img.naturalW / canvas.offsetWidth;
    const scaleY = img.naturalH / canvas.offsetHeight;
    this.mousePos = [
      Math.round((event.clientX - rect.left) * scaleX),
      Math.round((event.clientY - rect.top) * scaleY)
    ];
    this.renderCanvas();
  }

  // ── Canvas rendering ─────────────────────────────────────────────────────
  private renderCanvas() {
    const img = this.activeImage;
    const canvasEl = this.canvasRef?.nativeElement;
    if (!img || !canvasEl) return;

    const wrapper = this.wrapperRef?.nativeElement;
    if (!wrapper) return;

    // Fit canvas to wrapper while preserving aspect ratio
    const maxW = wrapper.clientWidth - 24;
    const maxH = wrapper.clientHeight - 24;
    const ratio = img.naturalW / img.naturalH;
    let displayW = maxW;
    let displayH = displayW / ratio;
    if (displayH > maxH) { displayH = maxH; displayW = displayH * ratio; }

    canvasEl.width  = img.naturalW;
    canvasEl.height = img.naturalH;
    canvasEl.style.width  = `${displayW}px`;
    canvasEl.style.height = `${displayH}px`;

    const ctx = canvasEl.getContext('2d')!;

    // Draw image
    const bgImg = new Image();
    bgImg.src = img.dataUrl;
    ctx.drawImage(bgImg, 0, 0, img.naturalW, img.naturalH);

    // Draw completed spots
    img.spots.forEach((spot, idx) => {
      this.drawPolygon(ctx, spot, 'rgba(21,101,192,0.35)', '#1565c0', 3, `${idx + 1}`);
    });

    // Draw current in-progress points
    if (img.currentPoints.length > 0) {
      img.currentPoints.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f44336';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw lines between current points
      if (img.currentPoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(img.currentPoints[0][0], img.currentPoints[0][1]);
        for (let i = 1; i < img.currentPoints.length; i++) {
          ctx.lineTo(img.currentPoints[i][0], img.currentPoints[i][1]);
        }
        ctx.strokeStyle = '#ffd600';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Preview line from last point to mouse
      if (this.mousePos && img.currentPoints.length > 0) {
        const last = img.currentPoints[img.currentPoints.length - 1];
        ctx.beginPath();
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(this.mousePos[0], this.mousePos[1]);
        ctx.strokeStyle = 'rgba(255,214,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawPolygon(
    ctx: CanvasRenderingContext2D,
    points: SpotPolygon,
    fill: string,
    stroke: string,
    lineWidth: number,
    label: string
  ) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Corner dots
    points.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f44336';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Label at centroid
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    ctx.font = `bold ${Math.max(16, Math.min(24, ctx.canvas.width / 30))}px sans-serif`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.fillText(`S${label}`, cx, cy);
    ctx.shadowBlur = 0;
  }

  // ── Output ────────────────────────────────────────────────────────────────
  private buildJson(): Record<string, Record<string, Point[]>> {
    const result: Record<string, Record<string, Point[]>> = {};
    this.images.forEach(img => {
      result[img.name] = {};
      img.spots.forEach((spot, i) => {
        result[img.name][String(i)] = spot;
      });
    });
    return result;
  }

  /**
   * Save Markings
   * ─────────────
   * Uses the File System Access API (Chrome/Edge) so the user can navigate to
   * bounding_box/ and save directly as parking_points.json.
   * Falls back to a plain browser download on Firefox/Safari.
   */
  async saveMarkings() {
    this.isSaving = true;
    const json = this.buildJson();
    const content = JSON.stringify(json, null, 2);

    try {
      // ── File System Access API (Chrome 86+, Edge 86+) ──────────────────
      if ('showSaveFilePicker' in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: 'parking_points.json',
          types: [{
            description: 'JSON file',
            accept: { 'application/json': ['.json'] }
          }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        this.snack.open(
          '✅ parking_points.json saved! Move it to bounding_box/ if needed.',
          'OK',
          { duration: 5000, panelClass: 'snack-success' }
        );
        this.dialogRef.close({ saved: true, data: json });

      } else {
        // ── Fallback: plain download ────────────────────────────────────────
        this.fallbackDownload(content);
        this.snack.open(
          '📥 parking_points.json downloaded — move it to bounding_box/',
          'OK',
          { duration: 6000 }
        );
        this.dialogRef.close({ saved: true, data: json });
      }
    } catch (err: any) {
      // User cancelled the save dialog — not an error
      if (err?.name === 'AbortError') {
        this.snack.open('Save cancelled.', '', { duration: 2000 });
      } else {
        console.error('Save failed:', err);
        // Still offer the download as a last resort
        this.fallbackDownload(content);
        this.snack.open(
          '⚠️ Direct save failed. Downloaded instead — move to bounding_box/',
          'Dismiss',
          { duration: 6000 }
        );
      }
    } finally {
      this.isSaving = false;
    }
  }

  private fallbackDownload(content: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parking_points.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  close() {
    this.dialogRef.close();
  }
}
