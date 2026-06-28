import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ParkingMarkerDialogComponent } from './parking-marker-dialog';
import { TestDetectionDialogComponent } from './test-detection-dialog';

type ParkingSection = 'A' | 'B' | 'C';
type RowOrientation = 'horizontal' | 'vertical';

interface ParkingRow {
  id: string;
  label: string;
  section: ParkingSection;
  total: number;
  occupied: number;
  orientation: RowOrientation;
  left: number;
  top: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-parking-spots',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatDialogModule
  ],
  template: `
    <div class="parking-page">
      <div class="page-header">
        <div class="title-block">
          <h1 class="page-title">Parking Layout</h1>
          <p class="page-subtitle">Live 3D-style view of Sections A, B and C, rows A to X</p>
        </div>

        <div class="action-buttons">
          <button mat-raised-button class="btn-add" (click)="addParking()">
            <mat-icon>add_circle</mat-icon> Add
          </button>
          <button mat-stroked-button class="btn-edit" (click)="editParking()">
            <mat-icon>edit</mat-icon> Edit
          </button>
          <button mat-stroked-button class="btn-delete" (click)="deleteParking()">
            <mat-icon>delete_outline</mat-icon> Delete
          </button>
          <button mat-raised-button class="btn-test" (click)="testDetection()">
            <mat-icon>biotech</mat-icon> Test
          </button>
          <button mat-raised-button color="primary" (click)="loadSpots()">
            <mat-icon>refresh</mat-icon> Refresh
          </button>
        </div>
      </div>

      <mat-progress-bar mode="indeterminate" *ngIf="isLoading"></mat-progress-bar>

      <div class="summary-strip">
        <mat-card class="mini-card total-card">
          <mat-card-content>
            <span>Total</span>
            <strong>{{ totalSpots }}</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card occupied-card">
          <mat-card-content>
            <span>Occupied</span>
            <strong>{{ occupiedCount }}</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card available-card">
          <mat-card-content>
            <span>Available</span>
            <strong>{{ availableCount }}</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card percent-card">
          <mat-card-content>
            <span>Overall</span>
            <strong>{{ overallOccupancy }}%</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card section-a-card">
          <mat-card-content>
            <span>Section A</span>
            <strong>{{ getSectionOccupancy('A') }}%</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card section-b-card">
          <mat-card-content>
            <span>Section B</span>
            <strong>{{ getSectionOccupancy('B') }}%</strong>
          </mat-card-content>
        </mat-card>
        <mat-card class="mini-card section-c-card">
          <mat-card-content>
            <span>Section C</span>
            <strong>{{ getSectionOccupancy('C') }}%</strong>
          </mat-card-content>
        </mat-card>
      </div>

      <div class="layout-stage">
        <div class="map-panel">
          <div class="map-toolbar">
            <div class="legend">
              <span><i class="dot a"></i> Section A</span>
              <span><i class="dot b"></i> Section B</span>
              <span><i class="dot c"></i> Section C</span>
            </div>
            <div class="status-legend">
              <span><i class="level low"></i> Low</span>
              <span><i class="level medium"></i> Medium</span>
              <span><i class="level high"></i> High</span>
            </div>
          </div>

          <div class="parking-map" [class.loading-map]="isLoading">
            <div class="map-bg"></div>

            <div class="section-zone section-c">
              <div class="section-name">SECTION C</div>
            </div>
            <div class="section-zone section-b">
              <div class="section-name">SECTION B</div>
            </div>
            <div class="section-zone section-a">
              <div class="section-name">SECTION A</div>
            </div>


            <div class="entry-exit-arrows">
              <div class="arrow-group in">
                <span>IN</span>
                <mat-icon>arrow_downward</mat-icon>
              </div>
              <div class="arrow-group out">
                <mat-icon>arrow_upward</mat-icon>
                <span>OUT</span>
              </div>
            </div>

            <button
              *ngFor="let row of rows"
              class="parking-row"
              [class.horizontal]="row.orientation === 'horizontal'"
              [class.vertical]="row.orientation === 'vertical'"
              [class.selected]="selectedRow?.id === row.id"
              [attr.data-section]="row.section"
              [ngStyle]="getRowStyle(row)"
              [matTooltip]="getTooltip(row)"
              (click)="selectRow(row)"
            >
              <span class="row-fill" [ngStyle]="getFillStyle(row)"></span>
              <span class="row-shine"></span>
              <span class="row-label">{{ row.id }}</span>
              <span class="row-count">{{ row.occupied }}/{{ row.total }}</span>
            </button>
          </div>
        </div>

        <mat-card class="detail-panel">
          <mat-card-content *ngIf="selectedRow; else noSelection">
            <div class="detail-header" [attr.data-section]="selectedRow.section">
              <span>Section {{ selectedRow.section }}</span>
              <strong>Row {{ selectedRow.id }}</strong>
            </div>

            <div class="occupancy-ring" [style.--percent.%]="getOccupancyPercentage(selectedRow)">
              <div>
                <strong>{{ getOccupancyPercentage(selectedRow) }}%</strong>
                <span>{{ getOccupancyStatus(selectedRow) }}</span>
              </div>
            </div>

            <div class="detail-grid">
              <div><span>Total</span><strong>{{ selectedRow.total }}</strong></div>
              <div><span>Occupied</span><strong>{{ selectedRow.occupied }}</strong></div>
              <div><span>Available</span><strong>{{ getAvailable(selectedRow) }}</strong></div>
              <div><span>Section</span><strong>{{ selectedRow.section }}</strong></div>
            </div>
          </mat-card-content>

          <ng-template #noSelection>
            <mat-card-content class="empty-detail">
              <mat-icon>touch_app</mat-icon>
              <strong>Select a row</strong>
              <span>Click any row block to view occupancy details.</span>
            </mat-card-content>
          </ng-template>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .parking-page {
      height: calc(100vh - 88px);
      min-height: 610px;
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 10px;
      overflow: hidden;
      padding: 0 2px 2px;
      box-sizing: border-box;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .page-title {
      margin: 0;
      font-size: clamp(20px, 2vw, 28px);
      color: var(--primary-dark-blue, #102a43);
      line-height: 1.05;
    }

    .page-subtitle {
      margin: 3px 0 0;
      color: var(--text-secondary, #667085);
      font-size: 12px;
    }

    .action-buttons {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }

    .action-buttons button {
      height: 34px;
      font-size: 12px;
      font-weight: 600;
    }

    .action-buttons mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .btn-add { background: linear-gradient(135deg, #1a6c2e, #2e9e4f); color: white; }
    .btn-add mat-icon { color: white; }
    .btn-edit { border-color: #1f6feb; color: #1f6feb; }
    .btn-delete { border-color: #c62828; color: #c62828; }
    .btn-test { background: linear-gradient(135deg, #4a148c, #7b1fa2) !important; color: white !important; }
    .btn-test mat-icon { color: white; }

    .summary-strip {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
    }

    .mini-card {
      border-radius: 12px;
      color: white;
      box-shadow: 0 8px 22px rgba(16, 24, 40, 0.10);
      overflow: hidden;
    }

    .mini-card mat-card-content {
      padding: 9px 12px !important;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 34px;
    }

    .mini-card span {
      font-size: 11px;
      font-weight: 700;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: .35px;
    }

    .mini-card strong {
      font-size: clamp(16px, 1.5vw, 22px);
      line-height: 1;
    }

    .total-card { background: linear-gradient(135deg, #344054, #667085); }
    .occupied-card { background: linear-gradient(135deg, #b42318, #f04438); }
    .available-card { background: linear-gradient(135deg, #027a48, #12b76a); }
    .percent-card { background: linear-gradient(135deg, #175cd3, #53b1fd); }
    .section-a-card { background: linear-gradient(135deg, #c21b12, #ff6b5f); }
    .section-b-card { background: linear-gradient(135deg, #2d6a2f, #67b26f); }
    .section-c-card { background: linear-gradient(135deg, #6a1b9a, #b264d9); }

    .layout-stage {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 250px;
      gap: 10px;
      overflow: hidden;
    }

    .map-panel, .detail-panel {
      min-height: 0;
      overflow: hidden;
      border-radius: 18px;
      background: #ffffff;
      box-shadow: 0 14px 34px rgba(16, 24, 40, 0.10);
      border: 1px solid rgba(16, 24, 40, 0.08);
    }

    .map-panel {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: 10px;
      box-sizing: border-box;
    }

    .map-toolbar {
      height: 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #475467;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .legend, .status-legend {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .dot, .level {
      display: inline-block;
      width: 11px;
      height: 11px;
      border-radius: 999px;
      margin-right: 5px;
      vertical-align: -1px;
    }

    .dot.a { background: #ea4335; }
    .dot.b { background: #2e7d32; }
    .dot.c { background: #8e24aa; }
    .level.low { background: #12b76a; }
    .level.medium { background: #f79009; }
    .level.high { background: #f04438; }

    .parking-map {
      position: relative;
      width: 100%;
      height: 100%;
      max-height: 100%;
      aspect-ratio: 16 / 9;
      margin: auto;
      overflow: hidden;
      border-radius: 16px;
      background:
        radial-gradient(circle at 20% 10%, rgba(255,255,255,.5), transparent 30%),
        linear-gradient(135deg, #dde3ea, #b8c0ca);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.5), inset 0 0 45px rgba(0,0,0,.10);
      transform-style: preserve-3d;
    }

    .map-bg {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.22) 1px, transparent 1px);
      background-size: 38px 38px;
      opacity: .24;
      pointer-events: none;
    }

    .section-zone {
      position: absolute;
      border: 2px solid;
      border-radius: 3px;
      background: rgba(255,255,255,.15);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.4), 0 16px 30px rgba(0,0,0,.08);
      pointer-events: none;
    }

    .section-c {
      left: 3.5%;
      top: 3.5%;
      width: 69.5%;
      height: 39.5%;
      border-color: rgba(142, 36, 170, .95);
      background: rgba(142, 36, 170, .055);
    }

    .section-b {
      left: 4.5%;
      top: 45%;
      width: 68.5%;
      height: 50.5%;
      border-color: rgba(46, 125, 50, .95);
      background: rgba(46, 125, 50, .055);
    }

    .section-a {
      left: 74.7%;
      top: 38.5%;
      width: 20.8%;
      height: 56.8%;
      border-color: rgba(234, 67, 53, .92);
      background: rgba(234, 67, 53, .05);
    }

    .section-name {
      position: absolute;
      left: 8px;
      top: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.78);
      color: #344054;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .45px;
    }

    .road {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #537188;
      font-size: clamp(9px, .9vw, 12px);
      font-weight: 800;
      font-style: italic;
      border-radius: 999px;
      background: rgba(84, 103, 121, .08);
      border: 1px dashed rgba(84, 103, 121, .28);
      pointer-events: none;
    }

    .road-c-left { left: 4.8%; top: 17%; width: 8%; height: 4%; }
    .road-c-top { left: 22%; top: 14%; width: 11%; height: 4%; }
    .road-c-mid { left: 55%; top: 14%; width: 11%; height: 4%; }
    .road-c-right { left: 70%; top: 20%; width: 5%; height: 4%; }
    .road-b-1 { left: 13%; top: 52%; width: 4%; height: 8%; transform: rotate(90deg); }
    .road-b-2 { left: 31%; top: 52%; width: 4%; height: 8%; transform: rotate(90deg); }
    .road-b-3 { left: 47%; top: 52%; width: 4%; height: 8%; transform: rotate(90deg); }
    .road-b-4 { left: 63%; top: 52%; width: 4%; height: 8%; transform: rotate(90deg); }
    .road-a-1 { left: 80%; top: 50%; width: 4%; height: 8%; transform: rotate(90deg); }
    .road-a-2 { left: 89%; top: 50%; width: 4%; height: 8%; transform: rotate(90deg); }

    .entry-exit-arrows {
      position: absolute;
      z-index: 10;
      left: 72%;
      top: 30%;
      display: flex;
      gap: 16px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(16,24,40,0.15);
      border: 1px solid rgba(16,24,40,0.08);
      pointer-events: none;
    }

    .arrow-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .arrow-group span {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }

    .arrow-group.in { color: #12b76a; }
    .arrow-group.out { color: #f04438; }

    .arrow-group mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }



    .parking-row {
      position: absolute;
      z-index: 5;
      border: 0;
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      border-radius: 4px;
      background: linear-gradient(145deg, #f8fafc, #d0d5dd);
      box-shadow:
        0 1px 0 rgba(255,255,255,.9) inset,
        0 -4px 0 rgba(0,0,0,.08) inset,
        0 8px 16px rgba(16,24,40,.18);
      transition: transform .16s ease, box-shadow .16s ease, filter .16s ease;
    }

    .parking-row::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid rgba(255,255,255,.85);
      border-radius: inherit;
      pointer-events: none;
      z-index: 3;
    }

    .parking-row::after {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 2px;
      background-image: repeating-linear-gradient(90deg, rgba(52,64,84,.24) 0 1px, transparent 1px 12px);
      opacity: .34;
      z-index: 2;
      pointer-events: none;
    }

    .parking-row.vertical::after {
      background-image: repeating-linear-gradient(0deg, rgba(52,64,84,.24) 0 1px, transparent 1px 12px);
    }

    .parking-row:hover {
      filter: brightness(1.04);
      transform: translateY(-2px) scale(1.015);
      box-shadow: 0 12px 22px rgba(16,24,40,.24);
    }

    .parking-row.selected {
      outline: 3px solid #175cd3;
      outline-offset: 2px;
      z-index: 8;
    }

    .parking-row[data-section='A'] { border-left: 5px solid #ea4335; }
    .parking-row[data-section='B'] { border-left: 5px solid #2e7d32; }
    .parking-row[data-section='C'] { border-left: 5px solid #8e24aa; }

    .row-fill {
      position: absolute;
      left: 0;
      bottom: 0;
      z-index: 1;
      background: linear-gradient(135deg, var(--row-color), color-mix(in srgb, var(--row-color) 72%, #ffffff));
      opacity: .88;
      pointer-events: none;
    }

    .horizontal .row-fill {
      top: 0;
      height: 100%;
    }

    .vertical .row-fill {
      width: 100%;
    }

    .row-shine {
      position: absolute;
      inset: 0;
      z-index: 2;
      background: linear-gradient(120deg, rgba(255,255,255,.45), transparent 42%, rgba(0,0,0,.06));
      pointer-events: none;
    }

    .row-label, .row-count {
      position: absolute;
      z-index: 4;
      left: 50%;
      transform: translateX(-50%);
      color: #101828;
      text-shadow: 0 1px 0 rgba(255,255,255,.65);
      white-space: nowrap;
      pointer-events: none;
    }

    .row-label {
      top: 14%;
      font-size: clamp(11px, 1.05vw, 16px);
      font-weight: 950;
    }

    .row-count {
      bottom: 10%;
      font-size: clamp(8px, .72vw, 11px);
      font-weight: 850;
      background: rgba(255,255,255,.72);
      border-radius: 999px;
      padding: 1px 5px;
    }

    .vertical .row-label {
      top: 50%;
      transform: translate(-50%, -50%) rotate(90deg);
    }

    .vertical .row-count {
      left: 50%;
      bottom: 4%;
      transform: translateX(-50%);
    }

    .detail-panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .detail-panel mat-card-content {
      padding: 14px !important;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .detail-header {
      border-radius: 14px;
      padding: 12px;
      color: white;
      box-shadow: inset 0 -3px 0 rgba(0,0,0,.13);
    }

    .detail-header[data-section='A'] { background: linear-gradient(135deg, #c21b12, #ff6b5f); }
    .detail-header[data-section='B'] { background: linear-gradient(135deg, #2d6a2f, #67b26f); }
    .detail-header[data-section='C'] { background: linear-gradient(135deg, #6a1b9a, #b264d9); }

    .detail-header span {
      display: block;
      font-size: 11px;
      font-weight: 800;
      opacity: .9;
      text-transform: uppercase;
      letter-spacing: .4px;
    }

    .detail-header strong {
      display: block;
      margin-top: 3px;
      font-size: 24px;
    }

    .occupancy-ring {
      --percent: 0%;
      width: min(145px, 100%);
      aspect-ratio: 1 / 1;
      margin: 2px auto;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: conic-gradient(#175cd3 var(--percent), #eaecf0 0);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.05);
    }

    .occupancy-ring > div {
      width: 72%;
      aspect-ratio: 1 / 1;
      border-radius: 50%;
      background: #fff;
      display: grid;
      place-items: center;
      align-content: center;
      box-shadow: 0 6px 18px rgba(16,24,40,.12);
    }

    .occupancy-ring strong {
      font-size: 27px;
      color: #101828;
      line-height: 1;
    }

    .occupancy-ring span {
      font-size: 11px;
      color: #667085;
      font-weight: 800;
      margin-top: 4px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: auto;
    }

    .detail-grid div {
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid #eaecf0;
      padding: 10px;
    }

    .detail-grid span {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 800;
      color: #667085;
      margin-bottom: 4px;
    }

    .detail-grid strong {
      font-size: 18px;
      color: #101828;
    }

    .empty-detail {
      justify-content: center;
      align-items: center;
      text-align: center;
      color: #667085;
    }

    .empty-detail mat-icon {
      font-size: 46px;
      width: 46px;
      height: 46px;
      color: #98a2b3;
    }

    .empty-detail strong {
      color: #344054;
      font-size: 16px;
    }

    @media (max-width: 1100px) {
      .parking-page {
        height: calc(100vh - 72px);
        min-height: 560px;
      }

      .layout-stage {
        grid-template-columns: 1fr 210px;
      }

      .summary-strip {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .mini-card mat-card-content {
        padding: 7px 9px !important;
      }

      .map-toolbar {
        height: auto;
      }
    }

    @media (max-width: 820px) {
      .parking-page {
        height: calc(100vh - 64px);
        min-height: 520px;
      }

      .page-subtitle,
      .status-legend,
      .action-buttons .btn-edit,
      .action-buttons .btn-delete {
        display: none;
      }

      .layout-stage {
        grid-template-columns: 1fr;
      }

      .detail-panel {
        display: none;
      }

      .summary-strip {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
  `]
})
export class ParkingSpotsPage implements OnInit {
  rows: ParkingRow[] = [];
  selectedRow: ParkingRow | null = null;
  isLoading = true;

  private readonly baseRows: ParkingRow[] = [
    // Section A, right side red area in the hand-drawn layout
    { id: 'A', label: 'Row A', section: 'A', total: 40, occupied: 0, orientation: 'vertical', left: 91.5, top: 45.0, width: 2.5, height: 45.0 },
    { id: 'B', label: 'Row B', section: 'A', total: 42, occupied: 0, orientation: 'vertical', left: 88.5, top: 45.0, width: 2.5, height: 45.0 },
    { id: 'C', label: 'Row C', section: 'A', total: 42, occupied: 0, orientation: 'vertical', left: 85.5, top: 45.0, width: 2.5, height: 45.0 },
    { id: 'D', label: 'Row D', section: 'A', total: 44, occupied: 0, orientation: 'vertical', left: 82.5, top: 45.0, width: 2.5, height: 45.0 },
    { id: 'E', label: 'Row E', section: 'A', total: 44, occupied: 0, orientation: 'vertical', left: 79.5, top: 45.0, width: 2.5, height: 45.0 },
    { id: 'F', label: 'Row F', section: 'A', total: 45, occupied: 0, orientation: 'vertical', left: 76.5, top: 45.0, width: 2.5, height: 45.0 },

    // Section B, large green bottom/middle area
    { id: 'G', label: 'Row G', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 67.0, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'H', label: 'Row H', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 61.5, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'I', label: 'Row I', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 56.0, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'J', label: 'Row J', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 50.5, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'K', label: 'Row K', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 45.0, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'L', label: 'Row L', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 39.5, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'M', label: 'Row M', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 34.0, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'N', label: 'Row N', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 28.5, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'O', label: 'Row O', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 23.0, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'P', label: 'Row P', section: 'B', total: 48, occupied: 0, orientation: 'vertical', left: 17.5, top: 49.0, width: 3.0, height: 39.0 },
    { id: 'Q', label: 'Row Q', section: 'B', total: 50, occupied: 0, orientation: 'vertical', left: 12.0, top: 49.0, width: 3.0, height: 39.0 },

    // Section C, large purple top area
    { id: 'R', label: 'Row R', section: 'C', total: 45, occupied: 0, orientation: 'horizontal', left: 10.0, top: 37.0, width: 32.0, height: 4.0 },
    { id: 'S', label: 'Row S', section: 'C', total: 45, occupied: 0, orientation: 'horizontal', left: 10.0, top: 32.0, width: 32.0, height: 4.0 },
    { id: 'T', label: 'Row T', section: 'C', total: 48, occupied: 0, orientation: 'horizontal', left: 47.0, top: 37.0, width: 23.0, height: 4.0 },
    { id: 'U', label: 'Row U', section: 'C', total: 48, occupied: 0, orientation: 'horizontal', left: 47.0, top: 32.0, width: 23.0, height: 4.0 },
    { id: 'V', label: 'Row V', section: 'C', total: 48, occupied: 0, orientation: 'horizontal', left: 13.0, top: 23.0, width: 57.0, height: 4.0 },
    { id: 'W', label: 'Row W', section: 'C', total: 48, occupied: 0, orientation: 'horizontal', left: 13.0, top: 18.0, width: 57.0, height: 4.0 },
    { id: 'X', label: 'Row X', section: 'C', total: 50, occupied: 0, orientation: 'horizontal', left: 13.0, top: 8.0, width: 57.0, height: 4.0 }
  ];

  constructor(
    private analyticsService: AnalyticsService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.loadSpots();
  }

  addParking() {
    this.dialog.open(ParkingMarkerDialogComponent, {
      width: '92vw',
      maxWidth: '1200px',
      height: '88vh',
      panelClass: 'parking-marker-dialog',
      disableClose: false
    });
  }

  editParking() {
    alert('Edit Parking - coming soon');
  }

  deleteParking() {
    alert('Delete Parking - coming soon');
  }

  testDetection() {
    this.dialog.open(TestDetectionDialogComponent, {
      width: '85vw',
      maxWidth: '1100px',
      height: '82vh',
      panelClass: 'parking-marker-dialog',
      disableClose: false
    });
  }

  async loadSpots() {
    this.isLoading = true;
    try {
      const live = await this.analyticsService.getLiveOverview();
      const occupied = Math.min(live?.carsParked ?? 0, this.totalBaseSpots);
      this.rows = this.distributeOccupiedAcrossRows(occupied);
    } catch (e) {
      console.error('Failed to load parking layout', e);
      this.rows = this.distributeOccupiedAcrossRows(645);
    } finally {
      this.selectedRow = this.rows.find(r => r.id === this.selectedRow?.id) ?? this.rows[0] ?? null;
      this.isLoading = false;
    }
  }

  private get totalBaseSpots(): number {
    return this.baseRows.reduce((sum, row) => sum + row.total, 0);
  }

  private distributeOccupiedAcrossRows(totalOccupied: number): ParkingRow[] {
    const pressure: Record<string, number> = {
      A: .70, B: .74, C: .48, D: .85, E: .80, F: .58,
      G: .43, H: .62, I: .88, J: .83, K: .68, L: .39, M: .54, N: .81, O: .92, P: .60, Q: .66,
      R: .45, S: .69, T: .84, U: .70, V: .56, W: .90, X: .72
    };

    const weightedCapacity = this.baseRows.reduce((sum, row) => sum + row.total * pressure[row.id], 0);
    let remaining = totalOccupied;

    const rows = this.baseRows.map(row => {
      const target = Math.round((row.total * pressure[row.id] / weightedCapacity) * totalOccupied);
      const occupied = Math.min(row.total, Math.max(0, target));
      remaining -= occupied;
      return { ...row, occupied };
    });

    let guard = 0;
    while (remaining !== 0 && guard < 5000) {
      for (const row of rows) {
        if (remaining > 0 && row.occupied < row.total) {
          row.occupied++;
          remaining--;
        } else if (remaining < 0 && row.occupied > 0) {
          row.occupied--;
          remaining++;
        }
        if (remaining === 0) break;
      }
      guard++;
    }

    return rows;
  }

  get totalSpots(): number {
    return this.rows.reduce((sum, row) => sum + row.total, 0) || this.totalBaseSpots;
  }

  get occupiedCount(): number {
    return this.rows.reduce((sum, row) => sum + row.occupied, 0);
  }

  get availableCount(): number {
    return this.totalSpots - this.occupiedCount;
  }

  get overallOccupancy(): number {
    if (!this.totalSpots) return 0;
    return Math.round((this.occupiedCount / this.totalSpots) * 100);
  }

  getAvailable(row: ParkingRow): number {
    return Math.max(0, row.total - row.occupied);
  }

  getOccupancyPercentage(row: ParkingRow): number {
    if (!row.total) return 0;
    return Math.round((row.occupied / row.total) * 100);
  }

  getOccupancyStatus(row: ParkingRow): string {
    const pct = this.getOccupancyPercentage(row);
    if (pct >= 80) return 'High';
    if (pct >= 55) return 'Medium';
    return 'Low';
  }

  getRowColor(row: ParkingRow): string {
    const pct = this.getOccupancyPercentage(row);
    if (pct >= 80) return '#f04438';
    if (pct >= 55) return '#f79009';
    return '#12b76a';
  }

  getRowStyle(row: ParkingRow): Record<string, string> {
    return {
      left: `${row.left}%`,
      top: `${row.top}%`,
      width: `${row.width}%`,
      height: `${row.height}%`,
      '--row-color': this.getRowColor(row)
    };
  }

  getFillStyle(row: ParkingRow): Record<string, string> {
    const pct = `${this.getOccupancyPercentage(row)}%`;
    return row.orientation === 'horizontal'
      ? { width: pct }
      : { height: pct };
  }

  selectRow(row: ParkingRow) {
    this.selectedRow = row;
  }

  getSectionOccupancy(section: ParkingSection): number {
    const sectionRows = this.rows.filter(row => row.section === section);
    const total = sectionRows.reduce((sum, row) => sum + row.total, 0);
    const occupied = sectionRows.reduce((sum, row) => sum + row.occupied, 0);
    if (!total) return 0;
    return Math.round((occupied / total) * 100);
  }

  getTooltip(row: ParkingRow): string {
    return `Section ${row.section} | Row ${row.id} | ${row.occupied}/${row.total} occupied | ${this.getAvailable(row)} available`;
  }
}
