import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsService, PricingConfig } from '../../core/services/settings.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { Observable } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">System Settings</h1>
        <p class="page-subtitle">Configure pricing rules and system parameters</p>
      </div>
    </div>

    <div class="settings-grid">
      <!-- Pricing Configuration -->
      <mat-card class="settings-card">
        <mat-card-header>
          <div mat-card-avatar class="header-icon"><mat-icon>attach_money</mat-icon></div>
          <mat-card-title>Pricing Rules</mat-card-title>
          <mat-card-subtitle>Configure global parking rates</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="pricingForm" (ngSubmit)="savePricing()" *ngIf="isAdminSuperAdmin() | async; else staffView">
            <div class="form-row">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Free Duration (Hours)</mat-label>
                <input matInput type="number" formControlName="free_hours" min="0" step="1">
                <mat-icon matPrefix>schedule</mat-icon>
                <span matSuffix>hours</span>
                <mat-hint>First X hours are free of charge</mat-hint>
              </mat-form-field>
            </div>

            <div class="form-row">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Hourly Rate (RM)</mat-label>
                <input matInput type="number" formControlName="hourly_rate" min="0" step="0.5">
                <span matPrefix>RM &nbsp;</span>
                <span matSuffix>/ hr</span>
                <mat-hint>Charged per hour after free duration</mat-hint>
              </mat-form-field>
            </div>

            <p class="info-note">
              <mat-icon inline>info</mat-icon> 
              OKU designated users are automatically registered as always free.
            </p>

            <div class="actions">
              <button mat-raised-button color="primary" type="submit" [disabled]="pricingForm.invalid || isSaving">
                <mat-icon>save</mat-icon> Save Changes
              </button>
            </div>
          </form>

          <ng-template #staffView>
            <div class="staff-readonly">
              <div class="readonly-item">
                <div class="label">Free Duration:</div>
                <div class="value">{{ currentConfig?.free_hours }} {{ currentConfig?.free_hours === 1 ? 'hour' : 'hours' }}</div>
              </div>
              <div class="readonly-item">
                <div class="label">Hourly Rate:</div>
                <div class="value">RM {{ currentConfig?.hourly_rate | number:'1.2-2' }}</div>
              </div>
              <p class="warning-text">
                <mat-icon inline>lock</mat-icon> 
                Only Super Admin can modify pricing configurations.
              </p>
            </div>
          </ng-template>
        </mat-card-content>
      </mat-card>

      <!-- Profile Settings -->
      <mat-card class="settings-card">
        <mat-card-header>
          <div mat-card-avatar class="header-icon"><mat-icon>person</mat-icon></div>
          <mat-card-title>My Details</mat-card-title>
          <mat-card-subtitle>Update your administrator profile</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="profileForm">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email Address</mat-label>
              <input matInput type="email" formControlName="email" readonly>
              <mat-hint>Contact Super Admin to change email address</mat-hint>
            </mat-form-field>

            <!-- TODO: Add password change logic -->
            <button mat-stroked-button color="primary" type="button" class="mt-16">
              Change Password
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-title { margin: 0 0 4px 0; font-size: 28px; color: var(--primary-dark-blue); }
    .page-subtitle { margin: 0; color: var(--text-secondary); }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
      gap: 24px;
      align-items: flex-start;
    }

    .settings-card { border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); min-width: 0; }
    .header-icon {
      background-color: rgba(26, 35, 126, 0.1);
      color: var(--primary-dark-blue);
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
    }
    
    mat-card-content { margin-top: 16px; }

    .form-row { margin-bottom: 16px; }
    .full-width { width: 100%; }
    
    .info-note {
      background-color: #e3f2fd;
      color: #0277bd;
      padding: 12px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      margin-bottom: 24px;
    }

    .actions { display: flex; justify-content: flex-end; }
    .mt-16 { margin-top: 16px; }

    .staff-readonly {
      background-color: #f5f5f5;
      padding: 24px;
      border-radius: 8px;
    }
    .readonly-item { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 16px; border-bottom: 1px dashed #ccc; padding-bottom: 8px;}
    .readonly-item .label { font-weight: 500; color: var(--text-secondary); }
    .readonly-item .value { font-weight: bold; color: var(--primary-dark-blue); }
    
    .warning-text {
      color: var(--danger-red);
      font-size: 14px;
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; margin-bottom: 0;
    }

    @media (max-width: 600px) {
      .page-header { margin-bottom: 18px; }
      .page-title { font-size: 22px; }
      .settings-grid { gap: 16px; }

      .info-note,
      .warning-text {
        align-items: flex-start;
      }

      .actions {
        justify-content: stretch;
      }

      .actions button,
      .mt-16 {
        width: 100%;
      }

      .staff-readonly {
        padding: 16px;
      }

      .readonly-item {
        align-items: flex-start;
        flex-direction: column;
        gap: 4px;
      }
    }
  `]
})
export class SettingsPage implements OnInit {
  pricingForm: FormGroup;
  profileForm: FormGroup;
  isSaving = false;
  currentConfig?: PricingConfig;

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private authService: AdminAuthService,
    private snackBar: MatSnackBar
  ) {
    this.pricingForm = this.fb.group({
      free_hours: [1, [Validators.required, Validators.min(0)]],
      hourly_rate: [1.0, [Validators.required, Validators.min(0)]]
    });

    this.profileForm = this.fb.group({
      email: [{ value: '', disabled: true }]
    });
  }

  ngOnInit() {
    this.loadConfig();
    this.authService.getAdminName().subscribe(); // Dummy subscribe to trigger observable
    
    // Quick load of user profile for form
    this.authService.getAdminRole().subscribe();
  }

  isAdminSuperAdmin(): Observable<boolean> {
    return new Observable(obs => {
      this.authService.getAdminRole().subscribe(r => obs.next(r === 'super_admin'));
    });
  }

  async loadConfig() {
    const config = await this.settingsService.getPricingConfig();
    this.currentConfig = config;
    this.pricingForm.patchValue(config);
  }

  async savePricing() {
    if (this.pricingForm.invalid) return;
    this.isSaving = true;

    try {
      const adminId = 'placeholder_admin_id'; // In complete implementation, fetch via authService
      await this.settingsService.updatePricingConfig(this.pricingForm.value, adminId);
      this.snackBar.open('Pricing configuration saved successfully', 'Close', { duration: 3000 });
      this.loadConfig();
    } catch (e: any) {
      this.snackBar.open('Failed to save configuration: ' + e.message, 'Close', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }
}
