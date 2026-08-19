import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';

const IMG6_URL = 'https://res.cloudinary.com/lftlvmu7/image/upload/smartpark/parking_sources/img6.jpg';
const EXCLUDED_TEST_MAPS = new Set(['twospaces']);
const IMG6_SPOTS = [
  { id: '0', occupied: true, points: '1412,621 1567,425 1826,410 1880,652' },
  { id: '1', occupied: true, points: '1373,576 1542,400 1274,385 1005,565' },
  { id: '2', occupied: true, points: '934,572 1222,383 1038,352 692,534' },
  { id: '3', occupied: false, points: '477,845 804,675 1185,779 963,973' }
];

interface DisplaySpot {
  id: string;
  occupied: boolean;
  points: string;
}

interface StoredSpot {
  points: Array<{ x: number; y: number }> | number[][];
}

interface ParkingMapRecord {
  name: string;
  image_url: string;
  natural_width: number;
  natural_height: number;
  spots: Record<string, StoredSpot | number[][]>;
  updated_at?: { seconds?: number };
}

interface SpotResult {
  image: string;
  cars_detected: number;
  spots: number;
  free: number;
  occupied: number;
  spot_statuses: Record<string, boolean>;
  parking_classification?: 'NORMAL_PARKING' | 'DOUBLE_PARK' | 'NO_RELEVANT_VEHICLE';
  intersected_spot_ids?: string[];
  spot_overlap_percentages?: Record<string, number>;
  double_park_threshold_percent?: number;
  car_outlines?: number[][][];
  double_parking_count?: number;
  double_parking_violations?: Array<{
    car_plate: string;
    nearest_spot_id?: string;
    notification_sent: boolean;
  }>;
}

interface DetectionResult {
  images_processed: number;
  total_spots: number;
  total_free: number;
  total_occupied: number;
  total_double_parking?: number;
  total_notifications?: number;
  images: SpotResult[];
}

interface OkuDetectionResult {
  success: boolean;
  plate_detected: boolean;
  plate_number?: string;
  registered_user_found?: boolean;
  is_oku?: boolean;
  violation: boolean;
  notification_sent: boolean;
  message: string;
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
    MatTooltipModule,
    MatSnackBarModule
  ],
  template: `
    <!-- Header -->
    <div class="dialog-header">
      <div class="header-left">
        <mat-icon class="header-icon">biotech</mat-icon>
        <div>
          <h2 class="dialog-title">Test Parking Detection</h2>
          <p class="dialog-subtitle">Tests occupancy, double parking, and uploaded OKU-bay plate eligibility</p>
        </div>
      </div>
      <button mat-icon-button (click)="close()" matTooltip="Close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-divider></mat-divider>

    <!-- Image Status bar -->
    <div class="status-bar">
      <span class="status-dot" [class.dot-ok]="imageReady" [class.dot-unknown]="!imageReady"></span>
      <span class="status-text">
        {{ isLoadingMarkings ? 'Loading parking maps from Firestore…' : imageReady ? 'Image and latest markings ready for Python detection' : 'Loading selected Cloudinary image…' }}
      </span>
      <span class="spacer"></span>
      <span class="selected-map" *ngIf="selectedMap">Selected: {{ selectedMap.name }}</span>
    </div>

    <div class="oku-result" *ngIf="okuResult" [class.oku-violation]="okuResult.violation" [class.oku-authorised]="!okuResult.violation">
      <mat-icon>{{ okuResult.violation ? 'report' : 'verified_user' }}</mat-icon>
      <div>
        <strong>{{ okuResult.plate_detected ? (okuResult.plate_number || 'Plate detected') : 'No plate detected' }}</strong>
        <span>{{ okuResult.message }}</span>
      </div>
    </div>

    <mat-divider></mat-divider>

    <!-- Body: terminal + results -->
    <div class="dialog-body">

      <!-- Left panel: same image-picker layout used by Add Parking Spots -->
      <div class="side-panel">
        <div class="panel-title">Images</div>
        <div class="image-list">
          <div *ngFor="let map of maps"
               class="image-thumb-row"
               [class.active-thumb]="map.name === selectedMapName"
               (click)="selectMap(map.name)">
            <img [src]="map.image_url" class="thumb-img" [alt]="map.name">
            <div class="thumb-info">
              <div class="thumb-name">{{ map.name }}</div>
              <div class="thumb-spots">{{ spotCount(map) }} spot{{ spotCount(map) !== 1 ? 's' : '' }}</div>
            </div>
            <button type="button" class="thumb-test-btn"
                    (click)="testMap(map, $event)"
                    [disabled]="isRunning"
                    [matTooltip]="'Test ' + map.name">
              <mat-icon>play_arrow</mat-icon>
              <span>Test</span>
            </button>
          </div>
          <div *ngIf="!isLoadingMarkings && maps.length === 0" class="empty-list">No test images found</div>
        </div>

        <button type="button" class="oku-upload-btn" [disabled]="isOkuRunning || !selectedMap" (click)="runOkuDetection()">
          <mat-icon>{{ isOkuRunning ? 'hourglass_top' : 'accessible' }}</mat-icon>
          {{ isOkuRunning ? 'Checking Plate...' : 'Test OKU Bay Image' }}
        </button>
        <div class="oku-upload-hint">Checks the selected saved image. No second upload or image storage.</div>
      </div>

      <div class="detection-workspace">

      <!-- Cloudinary image with saved polygon overlay -->
      <div class="image-preview">
        <div class="preview-stage">
          <img [src]="imageUrl" alt="Parking detector source img6" (load)="onImageReady()">
          <svg [attr.viewBox]="viewBox" preserveAspectRatio="xMidYMid meet" aria-label="Marked parking spots">
            <g *ngFor="let spot of spots">
              <polygon [attr.points]="spot.points" [class.occupied-polygon]="spot.occupied" [class.free-polygon]="!spot.occupied"></polygon>
              <text [attr.x]="spotLabel(spot).x" [attr.y]="spotLabel(spot).y">S{{ +spot.id + 1 }}</text>
            </g>
            <polygon *ngFor="let outline of carOutlinePoints" class="car-outline" [attr.points]="outline"></polygon>
          </svg>
        </div>
        <div class="preview-caption">Cloudinary source: {{ imageUrl }}</div>
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
          <div class="grand-card card-violations">
            <mat-icon>report</mat-icon>
            <div class="grand-val">{{ result.total_double_parking || 0 }}</div>
            <div class="grand-lbl">Double Park</div>
          </div>
          <div class="grand-card card-notifications">
            <mat-icon>notifications_active</mat-icon>
            <div class="grand-val">{{ result.total_notifications || 0 }}</div>
            <div class="grand-lbl">Notifications</div>
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
              <span class="spot-pill violation-pill">⚠ {{ img.double_parking_count || 0 }} double park</span>
            </div>
            <div class="classification-banner"
                 [class.classification-normal]="img.parking_classification === 'NORMAL_PARKING'"
                 [class.classification-double]="img.parking_classification === 'DOUBLE_PARK'">
              <mat-icon>{{ img.parking_classification === 'DOUBLE_PARK' ? 'report' : img.parking_classification === 'NORMAL_PARKING' ? 'check_circle' : 'info' }}</mat-icon>
              <span>{{ classificationLabel(img) }}</span>
            </div>
            <div class="violation-list" *ngIf="(img.double_parking_violations?.length || 0) > 0">
              <div *ngFor="let v of img.double_parking_violations" class="violation-item">
                <mat-icon>report</mat-icon>
                <span>{{ v.car_plate || 'UNKNOWN' }}</span>
                <small>{{ v.notification_sent ? 'sent to Live Violations' : 'notification not sent' }}</small>
              </div>
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

    </div>

    <mat-divider></mat-divider>

    <!-- Footer -->
    <div class="dialog-footer">
      <span class="run-hint" [class.hint-error]="!!errorMessage">{{ errorMessage || 'Python API runs YOLO against this selected map.' }}</span>
      <span class="spacer"></span>
      <button mat-stroked-button (click)="close()">Close</button>
      <button mat-raised-button class="run-btn" (click)="runDetection()"
              [disabled]="!imageReady || isLoadingMarkings || isRunning || !selectedMap">
        <mat-icon>play_arrow</mat-icon>
        {{ isRunning ? 'Running YOLO…' : 'Run Detection' }}
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
    .selected-map { font-size: 12px; font-weight: 700; color: #555; }
    .spacer { flex: 1; }
    .oku-result { display: flex; align-items: center; gap: 10px; padding: 9px 20px; border-left: 4px solid #2e7d32; background: #e8f5e9; }
    .oku-result.oku-violation { border-left-color: #c62828; background: #ffebee; }
    .oku-result mat-icon { color: #2e7d32; }
    .oku-result.oku-violation mat-icon { color: #c62828; }
    .oku-result div { display: flex; flex-direction: column; gap: 2px; }
    .oku-result span { color: #555; font-size: 12px; }

    /* Body */
    .dialog-body {
      flex: 1; display: flex; gap: 0; overflow: hidden; min-height: 0;
    }
    .side-panel { width: 210px; min-width: 210px; border-right: 1px solid rgba(0,0,0,.08); display: flex; flex-direction: column; padding: 12px; overflow: hidden; background: white; }
    .panel-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: #888; margin-bottom: 8px; }
    .image-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .image-thumb-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: background .15s; }
    .image-thumb-row:hover { background: #f5f5f5; }
    .active-thumb { background: rgba(106,27,154,.08) !important; border-color: rgba(106,27,154,.3) !important; }
    .thumb-img { width: 46px; height: 34px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
    .thumb-info { flex: 1; min-width: 0; }
    .thumb-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thumb-spots { font-size: 10px; color: #888; }
    .thumb-test-btn { display: flex; align-items: center; gap: 1px; flex-shrink: 0; color: #fff; background: #6a1b9a; border: 0; border-radius: 6px; padding: 5px 7px 5px 4px; font-size: 10px; font-weight: 700; cursor: pointer; }
    .thumb-test-btn:hover { background: #4a148c; }
    .thumb-test-btn:disabled { opacity: .45; cursor: default; }
    .thumb-test-btn mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .empty-list { text-align: center; color: #aaa; font-size: 12px; padding: 18px 4px; }
    .oku-upload-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 10px; padding: 9px 7px; border: 0; border-radius: 7px; background: #5e35b1; color: white; cursor: pointer; font-size: 11px; font-weight: 700; }
    .oku-upload-btn:hover { background: #4527a0; }
    .oku-upload-btn:disabled { opacity: .55; cursor: default; }
    .oku-upload-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .oku-upload-hint { margin-top: 5px; color: #888; font-size: 9px; line-height: 1.25; text-align: center; }
    .detection-workspace { flex: 1; min-width: 0; display: flex; overflow: hidden; }
    .image-preview { width: 58%; min-width: 0; padding: 14px; background: #0d1117; display: flex; flex-direction: column; justify-content: center; }
    .preview-stage { position: relative; width: 100%; line-height: 0; }
    .preview-stage img { display: block; width: 100%; height: auto; border-radius: 8px; }
    .preview-stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .preview-stage polygon { stroke-width: 7; vector-effect: non-scaling-stroke; }
    .occupied-polygon { fill: rgba(244,67,54,.34); stroke: #f44336; }
    .free-polygon { fill: rgba(76,175,80,.32); stroke: #4caf50; }
    .car-outline { fill: rgba(33,150,243,.12); stroke: #2196f3; stroke-width: 5; vector-effect: non-scaling-stroke; }
    .preview-stage text { fill: white; font: bold 42px sans-serif; text-anchor: middle; paint-order: stroke; stroke: #111; stroke-width: 8px; }
    .preview-caption { margin-top: 10px; color: #9ca3af; font: 11px monospace; line-height: 1.4; overflow-wrap: anywhere; }

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
    .card-violations { background: linear-gradient(135deg, #b71c1c, #ef5350); }
    .card-notifications { background: linear-gradient(135deg, #ef6c00, #ff9800); }

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
    .violation-pill { background: #fff3e0; color: #ef6c00; }
    .classification-banner { display: flex; align-items: center; gap: 7px; margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: #eef2f7; color: #52606d; font-size: 12px; font-weight: 700; }
    .classification-banner mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .classification-normal { background: #e8f5e9; color: #2e7d32; }
    .classification-double { background: #ffebee; color: #c62828; }
    .violation-list { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
    .violation-item {
      display: grid; grid-template-columns: 18px 1fr auto; align-items: center;
      gap: 6px; border-radius: 8px; background: #fff7ed; color: #9a3412;
      border: 1px solid #fed7aa; padding: 6px 8px; font-size: 12px;
    }
    .violation-item mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .violation-item small { color: #9a3412; opacity: .85; }
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
    .hint-error { color: #c62828; }
    .run-hint code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; }
    .run-btn { background: #6a1b9a !important; color: white !important; }

    @media (max-width: 800px) {
      .dialog-header,
      .status-bar,
      .dialog-footer {
        padding-left: 14px;
        padding-right: 14px;
      }

      .header-left {
        min-width: 0;
      }

      .dialog-title {
        font-size: 18px;
      }

      .dialog-subtitle,
      .status-text {
        overflow-wrap: anywhere;
      }

      .dialog-body {
        flex-direction: column;
        overflow-y: auto;
      }

      .side-panel { width: auto; min-width: 0; max-height: 150px; border-right: 0; border-bottom: 1px solid rgba(0,0,0,.08); }
      .image-list { flex-direction: row; overflow-x: auto; }
      .image-thumb-row { min-width: 180px; }
      .detection-workspace { flex-direction: column; overflow: visible; }

      .terminal {
        width: 100%;
        min-height: 260px;
        border-right: 0;
        border-bottom: 1px solid #222;
      }
      .image-preview { width: auto; min-height: 280px; }

      .result-panel {
        overflow: visible;
      }

      .grand-cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 520px) {
      .grand-cards {
        grid-template-columns: 1fr;
      }

      .img-card-header,
      .spot-row {
        align-items: flex-start;
        flex-direction: column;
      }

      .dialog-footer button {
        flex: 1 1 100%;
      }
    }
  `]
})
export class TestDetectionDialogComponent {
  result: DetectionResult | null = null;
  okuResult: OkuDetectionResult | null = null;
  isOkuRunning = false;
  imageReady = false;
  isLoadingMarkings = true;
  isRunning = false;
  errorMessage = '';
  imageUrl = IMG6_URL;
  spots: DisplaySpot[] = [...IMG6_SPOTS];
  maps: ParkingMapRecord[] = [];
  selectedMapName = '';
  selectedMap: ParkingMapRecord | null = null;
  viewBox = '0 0 1920 1080';
  carOutlinePoints: string[] = [];
  private pendingTestMapName = '';

  constructor(
    private dialogRef: MatDialogRef<TestDetectionDialogComponent>,
    private cdr: ChangeDetectorRef,
    private firestore: Firestore,
    private snackBar: MatSnackBar
  ) {
    this.loadParkingMaps();
  }

  onImageReady() {
    this.imageReady = true;
    this.cdr.detectChanges();
    if (this.pendingTestMapName && this.pendingTestMapName === this.selectedMapName) {
      this.pendingTestMapName = '';
      void this.runDetection();
    }
  }

  testMap(map: ParkingMapRecord, event: MouseEvent) {
    event.stopPropagation();
    this.applyMap(map);
    if (this.imageReady) {
      void this.runDetection();
    } else {
      this.pendingTestMapName = map.name;
    }
  }

  spotCount(map: ParkingMapRecord): number {
    return Object.keys(map.spots ?? {}).length;
  }

  async runDetection() {
    if (!this.imageReady || !this.selectedMap) return;
    this.isRunning = true;
    this.errorMessage = '';
    this.result = null;
    try {
      await this.loadParkingMaps(this.selectedMap.name);
      if (!this.selectedMap) throw new Error('Selected parking map no longer exists.');
      const response = await fetch('/detector-api/detect-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.selectedMap.name,
          image_url: this.selectedMap.image_url,
          spots: this.selectedMap.spots
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Python detection failed.');
      this.result = data as DetectionResult;
      const imageResult = this.result.images[0];
      const statuses = imageResult?.spot_statuses ?? {};
      this.carOutlinePoints = (imageResult?.car_outlines ?? []).map(outline =>
        outline.map(point => `${point[0]},${point[1]}`).join(' ')
      );
      this.spots = this.spots.map(spot => ({ ...spot, occupied: !!statuses[spot.id] }));
      const notificationCount = this.result.total_notifications ?? 0;
      if (notificationCount > 0) {
        this.snackBar.open(
          `${notificationCount} Double-Parking Offence${notificationCount === 1 ? '' : 's'} Detected `,
          'Dismiss',
          {
            duration: 8000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
            panelClass: ['double-parking-toast']
          }
        );
      }
    } catch (error: any) {
      this.errorMessage = error?.message || 'Could not connect to the Python detector API.';
    } finally {
      this.isRunning = false;
      this.cdr.detectChanges();
    }
  }

  async runOkuDetection() {
    if (!this.selectedMap) return;
    this.isOkuRunning = true;
    this.okuResult = null;
    this.errorMessage = '';
    try {
      const response = await fetch('/detector-api/detect-oku-violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: this.selectedMap.image_url, name: this.selectedMap.name })
      });
      const responseText = await response.text();
      let data: OkuDetectionResult;
      try {
        data = JSON.parse(responseText) as OkuDetectionResult;
      } catch {
        if (response.status === 404) {
          throw new Error('The running detector is an older version. Restart the detector API, then try again.');
        }
        throw new Error(`Detector returned an invalid response (HTTP ${response.status}).`);
      }
      if (!response.ok || !data.success) throw new Error(data.message || 'OKU plate validation failed.');
      this.okuResult = data;
      this.snackBar.open(data.message, 'Dismiss', {
        duration: 8000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
        panelClass: [data.violation ? 'double-parking-toast' : 'snack-success']
      });
    } catch (error: any) {
      this.errorMessage = error?.message || 'Could not process the OKU bay image.';
    } finally {
      this.isOkuRunning = false;
      this.cdr.detectChanges();
    }
  }

  private async loadParkingMaps(preferredName?: string) {
    this.isLoadingMarkings = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'parking_maps'));
      this.maps = snapshot.docs
        .map(document => ({ name: document.id, ...document.data() } as ParkingMapRecord))
        .filter(map => !!map.image_url && !!map.spots)
        .filter(map => !EXCLUDED_TEST_MAPS.has(map.name.trim().toLowerCase()))
        .sort((a, b) => (b.updated_at?.seconds ?? 0) - (a.updated_at?.seconds ?? 0));
      const wanted = preferredName || this.selectedMapName;
      this.selectedMap = this.maps.find(map => map.name === wanted) || this.maps[0] || null;
      if (this.selectedMap) this.applyMap(this.selectedMap);
      else this.errorMessage = 'No saved Cloudinary parking maps were found.';
    } catch (error) {
      console.error('Could not load latest parking markings from Firestore', error);
      this.errorMessage = 'Could not load parking maps from Firestore.';
    } finally {
      this.isLoadingMarkings = false;
      this.cdr.detectChanges();
    }
  }

  selectMap(name: string) {
    this.pendingTestMapName = '';
    const map = this.maps.find(item => item.name === name);
    if (map) this.applyMap(map);
  }

  private applyMap(map: ParkingMapRecord) {
    const imageChanged = this.imageUrl !== map.image_url;
    this.selectedMap = map;
    this.selectedMapName = map.name;
    // The default img6 can finish loading before Firestore returns. When the
    // selected record uses that same URL, preserve the completed load event.
    this.imageReady = imageChanged ? false : this.imageReady;
    this.imageUrl = map.image_url;
    this.viewBox = `0 0 ${map.natural_width || 1920} ${map.natural_height || 1080}`;
    this.spots = Object.keys(map.spots)
      .sort((a, b) => Number(a) - Number(b))
      .map(id => {
        const stored = map.spots[id];
        const points = Array.isArray(stored) ? stored : stored.points;
        return {
          id,
          occupied: false,
          points: points.map(point => Array.isArray(point)
            ? `${point[0]},${point[1]}`
            : `${point.x},${point.y}`
          ).join(' ')
        };
      });
    this.result = null;
    this.carOutlinePoints = [];
    this.cdr.detectChanges();
  }

  spotLabel(spot: DisplaySpot): { x: number; y: number } {
    const points = spot.points.split(' ').map(pair => pair.split(',').map(Number));
    return {
      x: points.reduce((sum, point) => sum + point[0], 0) / points.length,
      y: points.reduce((sum, point) => sum + point[1], 0) / points.length
    };
  }

  objEntries(obj: Record<string, boolean>): [string, boolean][] {
    return Object.entries(obj);
  }

  classificationLabel(image: SpotResult): string {
    const spots = (image.intersected_spot_ids ?? []).map(id => `S${Number(id) + 1}`).join(' and ');
    const overlaps = Object.entries(image.spot_overlap_percentages ?? {})
      .filter(([, percentage]) => percentage > 0)
      .map(([id, percentage]) => `S${Number(id) + 1}: ${percentage.toFixed(1)}%`)
      .join(', ');
    if (image.parking_classification === 'DOUBLE_PARK') return `Double parked across ${spots} (${overlaps})`;
    if (image.parking_classification === 'NORMAL_PARKING') return `Normal parking within ${spots}; traced overlap: ${overlaps}`;
    return 'No vehicle meaningfully inside the marked parking spots';
  }

  close() {
    this.dialogRef.close();
  }
}
