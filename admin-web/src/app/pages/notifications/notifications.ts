import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminNotification, NotificationAdminService } from '../../core/services/notification-admin.service';
import { Subscription } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatButtonToggleModule,
    FormsModule
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Live Violations Feed</h1>
        <p class="page-subtitle">Real-time alerts for double parking and OKU slot misuse</p>
      </div>
    </div>

    <div class="filters">
      <mat-button-toggle-group [(ngModel)]="filter" (ngModelChange)="applyFilter()" name="filter">
        <mat-button-toggle value="all">All</mat-button-toggle>
        <mat-button-toggle value="unresolved">Unresolved</mat-button-toggle>
        <mat-button-toggle value="double_park">Double Park</mat-button-toggle>
        <mat-button-toggle value="oku_violation">OKU Violation</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    <div class="notifications-list" *ngIf="filteredNotifications.length > 0; else emptyState">
      <mat-card class="notification-card" *ngFor="let notif of filteredNotifications" [class.resolved]="notif.resolved">
        <div class="card-left">
          <div class="icon-box" [ngClass]="notif.type">
            <mat-icon>{{ notif.type === 'double_park' ? 'warning' : 'accessible' }}</mat-icon>
          </div>
          <div class="details">
            <h3>{{ notif.message }}</h3>
            <p>
              <mat-icon class="small-icon">directions_car</mat-icon> {{ notif.car_plate }} •
              <mat-icon class="small-icon">place</mat-icon> Spot {{ notif.spot_id || 'Unknown' }}
            </p>
            <span class="timestamp">{{ notif.timestamp?.toDate() | date:'medium' }}</span>
          </div>
        </div>
        <div class="card-right">
          <mat-chip-set>
            <mat-chip *ngIf="notif.resolved" color="primary" highlighted>Resolved</mat-chip>
            <mat-chip *ngIf="!notif.resolved" color="warn" highlighted>Active</mat-chip>
          </mat-chip-set>
          <button mat-stroked-button color="primary" *ngIf="!notif.resolved" (click)="resolve(notif.id)">
            Mark Resolved
          </button>
        </div>
      </mat-card>
    </div>

    <ng-template #emptyState>
      <div class="empty-state">
        <mat-icon class="empty-icon">check_circle_outline</mat-icon>
        <h2>No violations found</h2>
        <p>Everything is running smoothly based on your current filters.</p>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-title { margin: 0 0 4px 0; font-size: 28px; color: var(--primary-dark-blue); }
    .page-subtitle { margin: 0; color: var(--text-secondary); }
    
    .filters { margin-bottom: 24px; display: flex; gap: 16px; }

    .notifications-list { display: flex; flex-direction: column; gap: 16px; }
    
    .notification-card {
      display: flex; flex-direction: row; justify-content: space-between; align-items: center;
      padding: 16px 24px; border-left: 4px solid var(--danger-red);
      transition: all 0.3s;
    }
    .notification-card.resolved {
      border-left-color: var(--success-green);
      opacity: 0.8; background-color: #fafafa;
    }
    .notification-card .mat-mdc-card-content { padding: 0; display: flex; width: 100%; justify-content: space-between;}
    
    .card-left { display: flex; align-items: flex-start; gap: 16px; flex: 1; }
    .icon-box {
      width: 48px; height: 48px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; color: white;
    }
    .icon-box.double_park { background-color: var(--warning-yellow); }
    .icon-box.oku_violation { background-color: var(--danger-red); }
    
    .details h3 { margin: 0 0 8px 0; font-size: 16px; font-weight: 500; }
    .details p { margin: 0 0 4px 0; color: var(--text-secondary); font-size: 14px; display: flex; align-items: center; gap: 4px; }
    .small-icon { font-size: 16px; width: 16px; height: 16px; }
    .timestamp { font-size: 12px; color: #999; }
    
    .card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
    
    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 64px 24px; text-align: center; color: var(--text-secondary);
    }
    .empty-icon { font-size: 64px; width: 64px; height: 64px; color: var(--success-green); opacity: 0.5; margin-bottom: 16px; }
    .empty-state h2 { margin: 0 0 8px 0; color: var(--text-primary); }
  `]
})
export class NotificationsPage implements OnInit, OnDestroy {
  notifications: AdminNotification[] = [];
  filteredNotifications: AdminNotification[] = [];
  filter: 'all' | 'unresolved' | 'double_park' | 'oku_violation' = 'unresolved';
  private sub?: Subscription;

  constructor(private notifService: NotificationAdminService) {}

  ngOnInit() {
    this.sub = this.notifService.listenToAllViolations().subscribe(notifs => {
      this.notifications = notifs;
      this.applyFilter();
    });
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  applyFilter() {
    this.filteredNotifications = this.notifications.filter(n => {
      if (this.filter === 'unresolved') return !n.resolved;
      if (this.filter === 'double_park') return n.type === 'double_park';
      if (this.filter === 'oku_violation') return n.type === 'oku_violation';
      return true;
    });
  }

  async resolve(id: string) {
    await this.notifService.markResolved(id);
  }
}
