import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { NotificationAdminService } from '../../core/services/notification-admin.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatToolbarModule,
    MatButtonModule,
    MatBadgeModule
  ],
  template: `
    <div class="app-container" [class.is-mobile]="mobileQuery.matches">
      <mat-toolbar color="primary" class="app-toolbar">
        <button mat-icon-button (click)="snav.toggle()" *ngIf="mobileQuery.matches">
          <mat-icon>menu</mat-icon>
        </button>
        <span class="toolbar-title flex-align-center">
          <mat-icon class="mr-2">local_parking</mat-icon>
          SmartPark APU Admin
        </span>
        <span class="spacer"></span>
        <div class="user-info" *ngIf="adminName$ | async as name">
          <span class="admin-greeting">Welcome, {{ name }}</span>
          <span class="admin-role-badge">{{ (adminRole$ | async) === 'super_admin' ? 'SUPER ADMIN' : 'STAFF' }}</span>
        </div>
      </mat-toolbar>

      <mat-sidenav-container class="sidenav-container">
        <mat-sidenav #snav [mode]="mobileQuery.matches ? 'over' : 'side'"
                     [fixedInViewport]="mobileQuery.matches"
                     [opened]="!mobileQuery.matches"
                     class="sidenav">
          <mat-nav-list>
            <a mat-list-item routerLink="/admin/dashboard" routerLinkActive="active-link">
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <div matListItemTitle>Dashboard</div>
            </a>
            
            <a mat-list-item routerLink="/admin/parking-spots" routerLinkActive="active-link">
              <mat-icon matListItemIcon>local_parking</mat-icon>
              <div matListItemTitle>Parking Layout</div>
            </a>

            <a mat-list-item routerLink="/admin/find-my-car-test" routerLinkActive="active-link">
              <mat-icon matListItemIcon>search</mat-icon>
              <div matListItemTitle>Find My Car</div>
            </a>

            <a mat-list-item routerLink="/admin/view-data" routerLinkActive="active-link">
              <mat-icon matListItemIcon>people</mat-icon>
              <div matListItemTitle>User Management</div>
            </a>

            <a mat-list-item routerLink="/admin/notifications" routerLinkActive="active-link">
              <mat-icon matListItemIcon [matBadge]="(unresolvedCount$ | async) ?? 0" matBadgeColor="warn" [matBadgeHidden]="((unresolvedCount$ | async) ?? 0) < 1">notifications</mat-icon>
              <div matListItemTitle>Violations</div>
            </a>
            
            <a mat-list-item routerLink="/admin/settings" routerLinkActive="active-link">
              <mat-icon matListItemIcon>settings</mat-icon>
              <div matListItemTitle>Settings</div>
            </a>
            
            <mat-divider></mat-divider>
            
            <a mat-list-item (click)="logout()" class="logout-link">
              <mat-icon matListItemIcon>exit_to_app</mat-icon>
              <div matListItemTitle>Logout</div>
            </a>
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content class="main-content">
          <router-outlet></router-outlet>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      flex-direction: column;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      overflow: hidden;
    }
    .is-mobile .app-toolbar {
      position: fixed;
      z-index: 2;
    }
    .sidenav-container {
      flex: 1;
      min-height: 0;
    }
    .is-mobile .sidenav-container {
      flex: 1 0 auto;
      padding-top: 56px;
    }
    .sidenav {
      width: 250px;
      background-color: #ffffff;
      border-right: 1px solid rgba(0,0,0,0.05);
    }
    .main-content {
      padding: 24px;
      background-color: var(--bg-color);
      min-height: calc(100vh - 64px);
      overflow-x: hidden;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .app-toolbar {
      background-color: var(--primary-dark-blue);
      color: white;
    }
    .toolbar-title {
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    .flex-align-center {
      display: flex;
      align-items: center;
    }
    .mr-2 {
      margin-right: 8px;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
    }
    .admin-greeting {
      opacity: 0.9;
    }
    .admin-role-badge {
      background: rgba(255,255,255,0.2);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .active-link {
      background-color: rgba(25, 118, 210, 0.08);
      color: var(--accent-blue);
      border-right: 3px solid var(--accent-blue);
    }
    .active-link mat-icon {
      color: var(--accent-blue);
    }
    .logout-link {
      cursor: pointer;
      color: var(--text-secondary);
      margin-top: auto;
    }
    mat-nav-list {
      padding-top: 16px;
    }

    @media (max-width: 900px) {
      .main-content {
        padding: 18px;
        min-height: calc(100dvh - 56px);
      }

      .admin-greeting {
        display: none;
      }
    }

    @media (max-width: 600px) {
      .main-content {
        padding: 12px;
      }

      .toolbar-title {
        font-size: 15px;
        letter-spacing: 0;
      }

      .admin-role-badge {
        font-size: 10px;
        padding: 3px 6px;
      }
    }
  `]
})
export class ShellPage {
  mobileQuery: MediaQueryList;
  unresolvedCount$: Observable<number>;
  adminName$: Observable<string | null>;
  adminRole$: Observable<string | null>;

  constructor(
    private authService: AdminAuthService,
    private notifService: NotificationAdminService,
    private router: Router
  ) {
    this.mobileQuery = window.matchMedia('(max-width: 600px)');
    // We listen to changes
    this.mobileQuery.addEventListener('change', () => {});
    
    this.unresolvedCount$ = this.notifService.getUnresolvedCount();
    this.adminName$ = this.authService.getAdminName();
    this.adminRole$ = this.authService.getAdminRole();
  }

  async logout() {
    await this.authService.adminLogout();
    this.router.navigate(['/login']);
  }
}
