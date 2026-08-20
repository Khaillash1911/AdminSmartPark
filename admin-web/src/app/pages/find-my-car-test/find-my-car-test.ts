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
import { FindMyCarService, CarResult, PlateDetectionResponse, RegisteredCarUser } from '../../core/services/find-my-car.service';
import { PageSkeletonComponent } from '../../shared/page-skeleton/page-skeleton';

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
    MatDividerModule,
    PageSkeletonComponent
  ],
  template: `
    <app-page-skeleton *ngIf="initialLoading" variant="search"></app-page-skeleton>
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Find My Car</h1>
          <p class="page-subtitle">Search for a parked car or add one automatically from an image.</p>
        </div>

        <div class="header-actions">
        <input #carImageInput hidden type="file" accept="image/jpeg,image/png,image/webp" (change)="onCarImageSelected($event)">
        <button mat-flat-button color="primary" (click)="carImageInput.click()" [disabled]="isDetecting || apiStatus !== 'online'">
          <mat-icon>add_photo_alternate</mat-icon>
          {{ isDetecting ? 'Reading Plate...' : 'Add Car Image' }}
        </button>
        <div class="api-status" [class.status-online]="apiStatus === 'online'" [class.status-offline]="apiStatus === 'offline'">
          <span class="status-dot"></span>
          <span class="status-label">
            {{ apiStatus === 'checking' ? 'Checking API...' : apiStatus === 'online' ? 'API running' : 'API offline' }}
          </span>
          <button mat-icon-button aria-label="Refresh API status" (click)="checkApiStatus()" [disabled]="apiStatus === 'checking'">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
        </div>
      </div>

      <div class="modal-backdrop" *ngIf="detectionPreview" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <mat-card class="confirmation-dialog">
          <mat-card-header>
            <mat-card-title id="confirm-title">Confirm detected number plate</mat-card-title>
            <mat-card-subtitle>Nothing will be added to Firebase until you confirm.</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="comparison-grid">
              <div class="preview-panel">
                <span class="comparison-label">Extracted plate image</span>
                <img [src]="detectionPreview.best_detection?.plate_image_url" alt="Extracted number plate">
              </div>
              <div class="preview-panel detected-text-panel">
                <span class="comparison-label">OCR text</span>
                <mat-form-field appearance="outline">
                  <mat-label>Number plate</mat-label>
                  <input matInput [(ngModel)]="confirmedPlate" maxlength="15" autocomplete="off" (blur)="lookupRegisteredUser()">
                </mat-form-field>
                <small>OCR confidence: {{ ((detectionPreview.best_detection?.ocr_confidence || 0) * 100) | number:'1.0-1' }}%</small>
              </div>
            </div>
            <div class="match-banner" [class.no-match]="!matchedUserFound">
              <mat-icon>{{ matchedUserFound ? 'how_to_reg' : 'person_search' }}</mat-icon>
              <span>{{ matchedUserFound
                ? 'Registered user matched. Owner and vehicle details were filled from the users collection.'
                : 'No registered user matched this plate. Enter the owner and vehicle details manually.' }}</span>
            </div>
            <h3 class="details-title">Car and owner details</h3>
            <div class="details-grid">
              <mat-form-field appearance="outline"><mat-label>Owner UID</mat-label><input matInput [(ngModel)]="carDetails.uid" [readonly]="matchedUserFound" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Owner name</mat-label><input matInput [(ngModel)]="carDetails.name" [readonly]="matchedUserFound" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput type="email" [(ngModel)]="carDetails.email" [readonly]="matchedUserFound" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Student ID</mat-label><input matInput [(ngModel)]="carDetails.student_id" [readonly]="matchedUserFound" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Car model</mat-label><input matInput [(ngModel)]="carDetails.car_model" [readonly]="matchedUserFound" placeholder="Toyota Vios" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Car colour</mat-label><input matInput [(ngModel)]="carDetails.car_colour" [readonly]="matchedUserFound" required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Parking level (generated)</mat-label><input matInput [(ngModel)]="carDetails.parking_level" readonly required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Parking area (generated)</mat-label><input matInput [(ngModel)]="carDetails.parking_zone" readonly required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Parking row (generated)</mat-label><input matInput [(ngModel)]="carDetails.parking_row" readonly required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Parking spot (generated)</mat-label><input matInput [(ngModel)]="carDetails.parking_slot" readonly required></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Entry time</mat-label><input matInput type="datetime-local" [(ngModel)]="carDetails.entry_time" required></mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Status</mat-label>
                <select matNativeControl [(ngModel)]="carDetails.status"><option value="parked">Parked</option><option value="exited">Exited</option></select>
              </mat-form-field>
              <label class="oku-field"><input type="checkbox" [(ngModel)]="carDetails.is_oku" [disabled]="matchedUserFound"> Registered OKU vehicle</label>
            </div>
            <p class="dialog-error" *ngIf="uploadError">{{ uploadError }}</p>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="cancelConfirmation()" [disabled]="isConfirming">Cancel</button>
            <button mat-flat-button color="primary" (click)="confirmDetectedCar()" [disabled]="isConfirming || !isCarFormComplete()">
              <mat-icon>check</mat-icon>
              {{ isConfirming ? 'Adding...' : 'Correct & Add' }}
            </button>
          </mat-card-actions>
        </mat-card>
      </div>

      <mat-card class="success-card" *ngIf="uploadSuccess">
        <mat-card-content><mat-icon>check_circle</mat-icon><span>{{ uploadSuccess }}</span></mat-card-content>
      </mat-card>
      <mat-card class="error-card" *ngIf="uploadError && !detectionPreview">
        <mat-card-content><mat-icon>error_outline</mat-icon><span>{{ uploadError }}</span></mat-card-content>
      </mat-card>

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
            <mat-chip *ngFor="let plate of samplePlates" (click)="setSearchQuery(plate.car_plate_search)">
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
      box-sizing: border-box;
    }
    .page-title {
      font-size: 28px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }
    .header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
    .modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .62); }
    .confirmation-dialog { width: min(720px, 100%); max-height: 90vh; overflow: auto; padding: 8px; }
    .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
    .preview-panel { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
    .preview-panel img { width: 100%; min-height: 150px; max-height: 240px; object-fit: contain; border-radius: 10px; background: #eef1f5; }
    .comparison-label { color: var(--text-secondary); font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .detected-text-panel { justify-content: center; }
    .detected-text-panel input { text-transform: uppercase; font-size: 24px; font-weight: 700; letter-spacing: 2px; }
    .details-title { margin: 28px 0 14px; }
    .match-banner { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 12px; border-radius: 8px; background: #e8f5e9; color: #25633a; }
    .match-banner.no-match { background: #fff8e1; color: #805b10; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .oku-field { display: flex; align-items: center; gap: 8px; min-height: 56px; color: var(--text-primary); }
    .dialog-error { color: #b3261e; margin: 12px 0 0; }
    .success-card { margin-bottom: 24px; background: #effaf1; color: #25633a; }
    .success-card mat-card-content { display: flex; align-items: center; gap: 10px; }
    .page-subtitle {
      color: var(--text-secondary);
      margin: 0;
    }
    .api-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 4px 0 12px;
      border: 1px solid #d8dce3;
      border-radius: 8px;
      background: #f8fafc;
      color: #5f6b7a;
      flex-shrink: 0;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #9ca3af;
    }
    .status-online {
      border-color: #b8dfc0;
      background: #f0fff4;
      color: #25633a;
    }
    .status-online .status-dot {
      background: #2e7d32;
      box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.12);
    }
    .status-offline {
      border-color: #f0b8b8;
      background: #fff5f5;
      color: #b3261e;
    }
    .status-offline .status-dot {
      background: #d32f2f;
      box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.12);
    }
    .status-label {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .search-card {
      margin-bottom: 24px;
      padding: 16px;
      border-radius: 12px;
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
      overflow-wrap: anywhere;
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

    @media (max-width: 600px) {
      .page-container {
        padding: 0;
      }

      .page-title {
        font-size: 22px;
      }

      .page-header {
        flex-direction: column;
        margin-bottom: 18px;
      }
      .header-actions { width: 100%; justify-content: stretch; }
      .header-actions > button { flex: 1; }
      .comparison-grid { grid-template-columns: 1fr; gap: 16px; }
      .details-grid { grid-template-columns: 1fr; }

      .api-status {
        width: 100%;
        box-sizing: border-box;
      }

      .status-label {
        flex: 1;
      }

      .search-card {
        padding: 12px;
      }

      .search-content {
        gap: 8px;
      }

      .search-field {
        flex-basis: 100%;
        min-width: 0;
      }

      .search-btn {
        width: 100%;
        height: 48px;
        margin-bottom: 0;
      }

      .info-grid {
        grid-template-columns: 1fr;
        gap: 14px;
      }

      img.mat-mdc-card-image {
        max-height: 260px;
      }
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
  apiStatus: 'checking' | 'online' | 'offline' = 'checking';
  isDetecting = false;
  isConfirming = false;
  detectionPreview: PlateDetectionResponse | null = null;
  confirmedPlate = '';
  uploadError = '';
  uploadSuccess = '';
  carDetails = this.emptyCarDetails();
  matchedUserFound = false;
  initialLoading = true;
  private initialRequestsPending = 2;

  constructor(private findMyCarService: FindMyCarService) {}

  ngOnInit() {
    this.checkApiStatus();
    this.loadSamplePlates();
  }

  checkApiStatus() {
    this.apiStatus = 'checking';

    this.findMyCarService.checkApiStatus().subscribe({
      next: () => {
        this.apiStatus = 'online';
        this.completeInitialRequest();
      },
      error: (err) => {
        this.apiStatus = 'offline';
        console.warn('Find My Car API is not reachable.', err);
        this.completeInitialRequest();
      }
    });
  }

  loadSamplePlates() {
    this.findMyCarService.getSamplePlates().subscribe({
      next: (response) => {
        if (response.success && response.plates) {
          this.samplePlates = response.plates;
        }
        this.completeInitialRequest();
      },
      error: (err) => {
        console.warn('Could not load sample plates (backend might not support it yet).', err);
        this.completeInitialRequest();
      }
    });
  }

  private completeInitialRequest() {
    if (this.initialRequestsPending > 0) this.initialRequestsPending--;
    this.initialLoading = this.initialRequestsPending > 0;
  }

  onCarImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.isDetecting = true;
    this.uploadError = '';
    this.uploadSuccess = '';
    this.findMyCarService.detectPlate(file).subscribe({
      next: (response) => {
        this.isDetecting = false;
        if (!response.plate_detected || !response.best_detection) {
          this.uploadError = 'No number plate could be detected. Please try a clearer car image.';
          return;
        }
        this.detectionPreview = response;
        this.confirmedPlate = response.best_detection.plate_number;
        this.carDetails = this.emptyCarDetails();
        Object.assign(this.carDetails, response.parking_location);
        this.matchedUserFound = !!response.matched_user;
        if (response.matched_user) this.applyRegisteredUser(response.matched_user);
      },
      error: (err) => {
        this.isDetecting = false;
        this.uploadError = err.error?.message || 'The image could not be processed.';
      }
    });
  }

  cancelConfirmation() {
    this.detectionPreview = null;
    this.confirmedPlate = '';
    this.carDetails = this.emptyCarDetails();
    this.matchedUserFound = false;
    this.uploadError = '';
  }

  confirmDetectedCar() {
    if (!this.detectionPreview || !this.isCarFormComplete()) return;
    this.isConfirming = true;
    this.uploadError = '';
    this.findMyCarService.confirmCar(this.detectionPreview.confirmation_token, this.confirmedPlate, this.carDetails).subscribe({
      next: (response) => {
        this.isConfirming = false;
        this.detectionPreview = null;
        this.uploadSuccess = response.message;
        this.searchQuery = this.confirmedPlate.replace(/[^a-z0-9]/gi, '').toUpperCase();
        this.confirmedPlate = '';
        this.carDetails = this.emptyCarDetails();
        this.matchedUserFound = false;
        this.loadSamplePlates();
      },
      error: (err) => {
        this.isConfirming = false;
        this.uploadError = err.error?.message || 'The car could not be added to Firebase.';
      }
    });
  }

  isCarFormComplete(): boolean {
    const required = [
      this.confirmedPlate, this.carDetails.uid, this.carDetails.name,
      this.carDetails.email, this.carDetails.student_id, this.carDetails.car_model,
      this.carDetails.car_colour, this.carDetails.parking_level,
      this.carDetails.parking_zone, this.carDetails.parking_row,
      this.carDetails.parking_slot, this.carDetails.entry_time
    ];
    return required.every(value => value.trim().length > 0);
  }

  lookupRegisteredUser() {
    if (!this.confirmedPlate.trim()) return;
    this.findMyCarService.findRegisteredUser(this.confirmedPlate).subscribe({
      next: ({ found, user }) => {
        this.matchedUserFound = found && !!user;
        if (user) {
          this.applyRegisteredUser(user);
        } else {
          const parking = {
            parking_level: this.carDetails.parking_level,
            parking_zone: this.carDetails.parking_zone,
            parking_row: this.carDetails.parking_row,
            parking_slot: this.carDetails.parking_slot,
            status: this.carDetails.status,
            entry_time: this.carDetails.entry_time
          };
          this.carDetails = { ...this.emptyCarDetails(), ...parking };
        }
      },
      error: () => { this.matchedUserFound = false; }
    });
  }

  private applyRegisteredUser(user: RegisteredCarUser) {
    Object.assign(this.carDetails, {
      uid: user.uid,
      name: user.name,
      email: user.email,
      student_id: user.student_id,
      car_model: user.car_model,
      car_colour: user.car_colour,
      is_oku: user.is_oku
    });
  }

  private emptyCarDetails() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return {
      uid: '', name: '', email: '', student_id: '', car_model: '', car_colour: '',
      is_oku: false, parking_level: '', parking_zone: '', parking_row: '',
      parking_slot: '', status: 'parked', entry_time: now.toISOString().slice(0, 16)
    };
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
          this.apiStatus = 'offline';
          this.errorMessage = 'Unable to connect to backend. Make sure Flask is running on port 5002.';
          console.error('Find My Car API Error:', err);
        }
      }
    });
  }
}
