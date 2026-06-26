import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { FindMyCarService, CarResult } from '../../core/services/find-my-car.service';

@Component({
  selector: 'app-find-my-car-test',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  template: `
    <div class="page-container">
      <h1 class="page-title">Find My Car Test</h1>
      <p class="page-subtitle">Search a number plate to test if the car location can be retrieved from the backend.</p>

      <!-- Search Section -->
      <mat-card class="search-card">
        <mat-card-content class="search-content">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Number Plate</mat-label>
            <input matInput type="text" [(ngModel)]="searchQuery" placeholder="Example: VCG7127" (keyup.enter)="searchCar()">
            <mat-icon matPrefix>search</mat-icon>
            <button *ngIf="searchQuery" matSuffix mat-icon-button aria-label="Clear" (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          </mat-form-field>
          <button mat-flat-button color="primary" class="search-btn" (click)="searchCar()" [disabled]="isLoading || !searchQuery">
            Search
          </button>
        </mat-card-content>

        <!-- Sample Plates Section -->
        <div class="sample-plates-section" *ngIf="samplePlates.length > 0">
          <p class="sample-title">Sample Plates:</p>
          <mat-chip-set aria-label="Sample Plates">
            <mat-chip *ngforEach="let plate of samplePlates" (click)="setSearchQuery(plate.car_plate_search)">
              {{ plate.car_plate }} ({{ plate.car_model }})
            </mat-chip>
          </mat-chip-set>
        </div>
      </mat-card>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Searching for car...</p>
      </div>

      <!-- Error State (e.g. Backend offline) -->
      <mat-card class="error-card" *ngIf="errorMessage && !isLoading">
        <mat-card-content>
          <mat-icon color="warn">error_outline</mat-icon>
          <span>{{ errorMessage }}</span>
        </mat-card-content>
      </mat-card>

      <!-- Not Found State -->
      <mat-card class="not-found-card" *ngIf="hasSearched && !isLoading && !carResult && !errorMessage">
        <mat-card-content>
          <mat-icon>directions_car_off</mat-icon>
          <h2>Car Not Found</h2>
          <p>No vehicle found with plate number "<strong>{{ lastSearchedQuery }}</strong>"</p>
        </mat-card-content>
      </mat-card>

      <!-- Result State -->
      <mat-card class="result-card" *ngIf="hasSearched && !isLoading && carResult">
        <mat-card-header>
          <mat-icon mat-card-avatar class="header-icon">directions_car</mat-icon>
          <mat-card-title>{{ carResult.car_plate }}</mat-card-title>
          <mat-card-subtitle>{{ carResult.car_model }} ({{ carResult.car_colour }})</mat-card-subtitle>
        </mat-card-header>
        
        <img *ngIf="carResult.image_url" mat-card-image [src]="carResult.image_url" alt="Car image for {{ carResult.car_plate }}">
        
        <mat-card-content>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Location</span>
              <span class="value location-highlight">
                Level {{ carResult.parking_level || 'N/A' }}, 
                Zone {{ carResult.parking_zone || 'N/A' }}, 
                Row {{ carResult.parking_row || 'N/A' }}, 
                Slot {{ carResult.parking_slot || 'N/A' }}
              </span>
            </div>

            <div class="info-item">
              <span class="label">Status</span>
              <span class="value status-badge" [class.parked]="carResult.status === 'parked'">
                {{ carResult.status | uppercase }}
              </span>
            </div>

            <mat-divider class="full-width"></mat-divider>

            <div class="info-item">
              <span class="label">Owner Name</span>
              <span class="value">{{ carResult.name }}</span>
            </div>
            
            <div class="info-item">
              <span class="label">Student ID</span>
              <span class="value">{{ carResult.student_id }}</span>
            </div>

            <div class="info-item">
              <span class="label">Email</span>
              <span class="value">{{ carResult.email }}</span>
            </div>

            <div class="info-item">
              <span class="label">OKU Status</span>
              <span class="value">{{ carResult.is_oku ? 'Yes' : 'No' }}</span>
            </div>
            
            <div class="info-item">
              <span class="label">Entry Time</span>
              <span class="value">{{ carResult.entry_time | date:'medium' }}</span>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px;
    }
    .page-title {
      font-size: 28px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .page-subtitle {
      color: var(--text-secondary);
      margin-bottom: 24px;
    }
    .search-card {
      margin-bottom: 24px;
      padding: 16px;
    }
    .search-content {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .search-field {
      flex: 1;
      min-width: 250px;
    }
    .search-btn {
      height: 56px;
      margin-bottom: 22px; /* Align with input field */
      padding: 0 32px;
    }
    .sample-plates-section {
      margin-top: 16px;
    }
    .sample-title {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    mat-chip {
      cursor: pointer;
    }
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 0;
      color: var(--text-secondary);
    }
    .loading-container mat-spinner {
      margin-bottom: 16px;
    }
    .error-card {
      background-color: #fff3f3;
      color: #d32f2f;
      margin-bottom: 24px;
    }
    .error-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .not-found-card {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-secondary);
    }
    .not-found-card mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .result-card {
      overflow: hidden;
    }
    .header-icon {
      background-color: rgba(25, 118, 210, 0.1);
      color: var(--accent-blue);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img.mat-mdc-card-image {
      max-height: 400px;
      object-fit: cover;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding-top: 16px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .full-width {
      grid-column: 1 / -1;
      margin: 8px 0;
    }
    .label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .value {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .location-highlight {
      color: var(--accent-blue);
      font-size: 16px;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: bold;
      background: #e0e0e0;
      color: #616161;
      width: fit-content;
    }
    .status-badge.parked {
      background: #e8f5e9;
      color: #2e7d32;
    }
  `]
})
export class FindMyCarTestPage implements OnInit {
  searchQuery: string = '';
  lastSearchedQuery: string = '';
  
  samplePlates: Array<{
    car_plate: string;
    car_plate_search: string;
    car_model: string;
    car_colour: string;
  }> = [];

  isLoading: boolean = false;
  hasSearched: boolean = false;
  carResult: CarResult | null = null;
  errorMessage: string = '';

  constructor(private findMyCarService: FindMyCarService) {}

  ngOnInit() {
    this.loadSamplePlates();
  }

  loadSamplePlates() {
    this.findMyCarService.getSamplePlates().subscribe({
      next: (response) => {
        if (response.success && response.plates) {
          this.samplePlates = response.plates;
        }
      },
      error: (err) => {
        console.warn('Could not load sample plates (backend might not support it yet).', err);
      }
    });
  }

  setSearchQuery(plate: string) {
    this.searchQuery = plate;
    this.searchCar();
  }

  clearSearch() {
    this.searchQuery = '';
    this.hasSearched = false;
    this.carResult = null;
    this.errorMessage = '';
  }

  searchCar() {
    if (!this.searchQuery.trim()) return;

    this.isLoading = true;
    this.hasSearched = true;
    this.errorMessage = '';
    this.carResult = null;
    this.lastSearchedQuery = this.searchQuery;

    this.findMyCarService.findCarByPlate(this.searchQuery).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success && response.found && response.car) {
          this.carResult = response.car;
        } else {
          // Handled as 404 generally, but just in case it returns 200 with found: false
          this.carResult = null;
        }
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 404) {
          // Car not found, normal flow
          this.carResult = null;
        } else {
          // Backend is offline or other error
          this.errorMessage = 'Unable to connect to backend. Make sure Flask is running on port 5002.';
          console.error('Find My Car API Error:', err);
        }
      }
    });
  }
}
