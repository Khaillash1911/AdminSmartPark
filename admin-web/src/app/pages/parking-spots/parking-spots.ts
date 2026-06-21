import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ParkingMarkerDialogComponent } from './parking-marker-dialog';
import { TestDetectionDialogComponent } from './test-detection-dialog';

interface ParkingSpot {
  id: string;
  label: string;
  zone: string;
  type: 'standard' | 'oku';
  status: 'available' | 'occupied' | 'reserved';
  vehiclePlate?: string;
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
    MatBadgeModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatDialogModule
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Parking Spots</h1>
        <p class="page-subtitle">Live view of all parking spots and their current status</p>
        <div class="action-buttons">
          <button mat-raised-button class="btn-add" (click)="addParking()">
            <mat-icon>add_circle</mat-icon> Add Parking
          </button>
          <button mat-stroked-button class="btn-edit" (click)="editParking()">
            <mat-icon>edit</mat-icon> Edit Parking
          </button>
          <button mat-stroked-button class="btn-delete" (click)="deleteParking()">
            <mat-icon>delete_outline</mat-icon> Delete Parking
          </button>
          <button mat-raised-button class="btn-test" (click)="testDetection()">
            <mat-icon>biotech</mat-icon> Test Detection
          </button>
        </div>
      </div>
      <button mat-raised-button color="primary" (click)="loadSpots()">
        <mat-icon>refresh</mat-icon> Refresh
      </button>
    </div>

    <mat-progress-bar mode="indeterminate" *ngIf="isLoading"></mat-progress-bar>

    <!-- Summary Cards -->
    <div class="summary-row">
      <mat-card class="summary-card available-card">
        <mat-card-content>
          <mat-icon>check_circle</mat-icon>
          <div class="summary-value">{{ availableCount }}</div>
          <div class="summary-label">Available</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="summary-card occupied-card">
        <mat-card-content>
          <mat-icon>directions_car</mat-icon>
          <div class="summary-value">{{ occupiedCount }}</div>
          <div class="summary-label">Occupied</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="summary-card oku-card">
        <mat-card-content>
          <mat-icon>accessible</mat-icon>
          <div class="summary-value">{{ okuAvailableCount }}</div>
          <div class="summary-label">OKU Available</div>
        </mat-card-content>
      </mat-card>

      <mat-card class="summary-card total-card">
        <mat-card-content>
          <mat-icon>local_parking</mat-icon>
          <div class="summary-value">{{ spots.length }}</div>
          <div class="summary-label">Total Spots</div>
        </mat-card-content>
      </mat-card>
    </div>

    <!-- Zone Filter -->
    <div class="zone-filter">
      <span class="filter-label">Filter by Zone:</span>
      <mat-chip-listbox [(ngModel)]="selectedZone" (change)="filterByZone($event)" aria-label="Zone filter">
        <mat-chip-option value="ALL" [selected]="selectedZone === 'ALL'">All Zones</mat-chip-option>
        <mat-chip-option *ngFor="let zone of zones" [value]="zone" [selected]="selectedZone === zone">
          Zone {{ zone }}
        </mat-chip-option>
      </mat-chip-listbox>
    </div>

    <!-- Spots Grid -->
    <ng-container *ngFor="let zone of displayedZones">
      <div class="zone-section">
        <h2 class="zone-title">
          <mat-icon>map</mat-icon>
          Zone {{ zone }}
        </h2>
        <div class="spots-grid">
          <mat-card
            *ngFor="let spot of getSpotsForZone(zone)"
            class="spot-card"
            [class.available]="spot.status === 'available'"
            [class.occupied]="spot.status === 'occupied'"
            [class.oku-spot]="spot.type === 'oku'"
            [matTooltip]="spot.vehiclePlate ? 'Vehicle: ' + spot.vehiclePlate : 'Empty'"
          >
            <mat-card-content>
              <div class="spot-icon">
                <mat-icon *ngIf="spot.type === 'oku'">accessible</mat-icon>
                <mat-icon *ngIf="spot.type === 'standard'">local_parking</mat-icon>
              </div>
              <div class="spot-label">{{ spot.label }}</div>
              <div class="spot-status-badge" [class.badge-available]="spot.status === 'available'" [class.badge-occupied]="spot.status === 'occupied'">
                {{ spot.status === 'available' ? 'Free' : spot.vehiclePlate || 'Occupied' }}
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      </div>
    </ng-container>

    <div class="empty-state" *ngIf="!isLoading && spots.length === 0">
      <mat-icon>local_parking</mat-icon>
      <p>No parking spots found.</p>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .page-title { margin: 0 0 4px 0; font-size: 28px; color: var(--primary-dark-blue); }
    .page-subtitle { margin: 0 0 12px 0; color: var(--text-secondary); }

    .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    .action-buttons button {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
      font-size: 13px;
    }
    .btn-add { background: linear-gradient(135deg, #1a6c2e, #2e9e4f); color: white; }
    .btn-add mat-icon { color: white; }
    .btn-edit { border-color: var(--accent-blue); color: var(--accent-blue); }
    .btn-edit mat-icon { color: var(--accent-blue); }
    .btn-delete { border-color: #c62828; color: #c62828; }
    .btn-delete mat-icon { color: #c62828; }
    .btn-test { background: linear-gradient(135deg, #4a148c, #7b1fa2) !important; color: white !important; }
    .btn-test mat-icon { color: white; }

    /* Summary Row */
    .summary-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 768px) {
      .summary-row { grid-template-columns: repeat(2, 1fr); }
    }
    .summary-card { border-radius: 12px; overflow: hidden; }
    .summary-card mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px;
      text-align: center;
    }
    .summary-card mat-icon { font-size: 32px; width: 32px; height: 32px; margin-bottom: 8px; }
    .summary-value { font-size: 28px; font-weight: 700; line-height: 1; }
    .summary-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; opacity: 0.85; }

    .available-card { background: linear-gradient(135deg, #2e7d32, #4caf50); color: white; }
    .available-card mat-icon { color: white; }
    .occupied-card  { background: linear-gradient(135deg, #c62828, #ef5350); color: white; }
    .occupied-card mat-icon  { color: white; }
    .oku-card       { background: linear-gradient(135deg, #1565c0, #42a5f5); color: white; }
    .oku-card mat-icon       { color: white; }
    .total-card     { background: linear-gradient(135deg, #4a148c, #7b1fa2); color: white; }
    .total-card mat-icon     { color: white; }

    /* Zone Filter */
    .zone-filter {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .filter-label { font-size: 14px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; }

    /* Zone Section */
    .zone-section { margin-bottom: 32px; }
    .zone-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-dark-blue);
      margin-bottom: 12px;
    }
    .zone-title mat-icon { color: var(--accent-blue); }

    /* Spots Grid */
    .spots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 12px;
    }
    .spot-card {
      border-radius: 10px;
      cursor: default;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      border: 2px solid transparent;
    }
    .spot-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
    .spot-card mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 8px !important;
      text-align: center;
    }
    .spot-card.available { background: #f1f8e9; border-color: #66bb6a; }
    .spot-card.occupied  { background: #fce4ec; border-color: #e57373; }
    .spot-card.oku-spot  { border-style: dashed; border-width: 2px; }

    .spot-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .spot-card.available .spot-icon mat-icon { color: #2e7d32; }
    .spot-card.occupied  .spot-icon mat-icon { color: #c62828; }

    .spot-label { font-size: 15px; font-weight: 700; margin: 6px 0 4px; color: #333; }

    .spot-status-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      letter-spacing: 0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .badge-available { background: #c8e6c9; color: #1b5e20; }
    .badge-occupied  { background: #ffcdd2; color: #b71c1c; }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 24px;
      color: var(--text-secondary);
    }
    .empty-state mat-icon { font-size: 56px; width: 56px; height: 56px; opacity: 0.3; display: block; margin: 0 auto 16px; }
    .empty-state p { font-size: 16px; font-style: italic; }
  `]
})
export class ParkingSpotsPage implements OnInit {
  spots: ParkingSpot[] = [];
  filteredSpots: ParkingSpot[] = [];
  zones: string[] = [];
  selectedZone: string = 'ALL';
  isLoading = true;

  constructor(
    private analyticsService: AnalyticsService,
    private dialog: MatDialog
  ) {}

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
    alert('Edit Parking – coming soon');
  }

  deleteParking() {
    alert('Delete Parking – coming soon');
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

  ngOnInit() {
    this.loadSpots();
  }

  async loadSpots() {
    this.isLoading = true;
    try {
      const live = await this.analyticsService.getLiveOverview();
      this.spots = this.buildSpotsFromOverview(live);
      this.filteredSpots = [...this.spots];
      this.zones = [...new Set(this.spots.map(s => s.zone))].sort();
    } catch (e) {
      console.error('Failed to load parking spots', e);
    } finally {
      this.isLoading = false;
    }
  }

  private buildSpotsFromOverview(overview: { carsParked: number; spotsAvailable: number; okusAvailable: number; totalSpots: number; activeViolations?: number }): ParkingSpot[] {
    const total = overview.totalSpots || 40;
    const occupied = overview.carsParked || 0;
    const okusAvailable = overview.okusAvailable || 0;
    const totalOku = 5;
    const okusOccupied = Math.max(0, totalOku - okusAvailable);

    const spots: ParkingSpot[] = [];
    const zones = ['A', 'B', 'C'];
    let occupiedAssigned = 0;
    let okusOccupiedAssigned = 0;
    let spotIdx = 1;

    for (const zone of zones) {
      const spotsInZone = zone === 'C' ? totalOku : Math.floor((total - totalOku) / 2);
      const isOkuZone = zone === 'C';

      for (let i = 0; i < spotsInZone; i++) {
        const label = `${zone}${String(spotIdx).padStart(2, '0')}`;
        const type = isOkuZone ? 'oku' : 'standard';

        let status: 'available' | 'occupied' = 'available';
        if (isOkuZone && okusOccupiedAssigned < okusOccupied) {
          status = 'occupied';
          okusOccupiedAssigned++;
        } else if (!isOkuZone && occupiedAssigned < occupied - okusOccupied) {
          status = 'occupied';
          occupiedAssigned++;
        }

        spots.push({ id: label, label, zone, type, status });
        spotIdx++;
      }
    }
    return spots;
  }

  get availableCount(): number {
    return this.spots.filter(s => s.status === 'available').length;
  }

  get occupiedCount(): number {
    return this.spots.filter(s => s.status === 'occupied').length;
  }

  get okuAvailableCount(): number {
    return this.spots.filter(s => s.type === 'oku' && s.status === 'available').length;
  }

  get displayedZones(): string[] {
    if (this.selectedZone === 'ALL') return this.zones;
    return [this.selectedZone];
  }

  getSpotsForZone(zone: string): ParkingSpot[] {
    return this.spots.filter(s => s.zone === zone);
  }

  filterByZone(event: any) {
    this.selectedZone = event.value ?? 'ALL';
  }
}
