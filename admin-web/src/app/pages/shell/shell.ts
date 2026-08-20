import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, RouterModule, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { NotificationAdminService } from '../../core/services/notification-admin.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { Observable, Subscription } from 'rxjs';
import { AdminSessionService } from '../../core/services/admin-session.service';
import { AiRuntimeConfigService } from '../../core/services/ai-runtime-config.service';
import { PageSkeletonComponent, SkeletonVariant } from '../../shared/page-skeleton/page-skeleton';

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
    MatBadgeModule,
    PageSkeletonComponent
  ],
  template: `
    <div class="app-container" [class.is-mobile]="mobileQuery.matches">
      <mat-toolbar color="primary" class="app-toolbar">
        <button mat-icon-button (click)="snav.toggle()" *ngIf="mobileQuery.matches">
          <mat-icon>menu</mat-icon>
        </button>
        <span class="toolbar-title flex-align-center">
          SmartPark APU Admin
        </span>
        <span class="spacer"></span>
        <span class="ai-status" [class.ai-online]="aiStatus() === 'online'" [class.ai-degraded]="aiStatus() === 'degraded'">
          <span class="status-dot"></span>
          {{ aiStatus() === 'online' ? 'Online' : aiStatus() === 'degraded' ? 'Degraded' : 'Offline' }}
        </span>
        <div class="user-info">
          <span class="admin-greeting">Welcome Back</span>
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
          <app-page-skeleton *ngIf="routeLoading" [variant]="routeSkeleton"></app-page-skeleton>
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
    .ai-status {
      margin-right: 14px;
      padding: 4px 9px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      background: #b71c1c;
      color: white;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .ai-status .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 2px rgba(255,255,255,.14); }
    .ai-status.ai-online { background: #1b5e20; }
    .ai-status.ai-degraded { background: #ef6c00; }
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
export class ShellPage implements OnInit, OnDestroy {
  mobileQuery: MediaQueryList;
  unresolvedCount$: Observable<number>;
  adminName$: Observable<string | null>;
  adminRole$: Observable<string | null>;
  readonly aiStatus;
  routeLoading = true;
  routeSkeleton: SkeletonVariant = 'dashboard';
  private routerSubscription?: Subscription;

  constructor(
    private authService: AdminAuthService,
    private adminSession: AdminSessionService,
    private aiRuntime: AiRuntimeConfigService,
    private notifService: NotificationAdminService,
    private router: Router
  ) {
    this.mobileQuery = window.matchMedia('(max-width: 600px)');
    // We listen to changes
    this.mobileQuery.addEventListener('change', () => {});
    
    this.unresolvedCount$ = this.notifService.getUnresolvedCount();
    this.adminName$ = this.authService.getAdminName();
    this.adminRole$ = this.authService.getAdminRole();
    this.aiStatus = this.aiRuntime.status;
    this.routerSubscription = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.routeLoading = true;
        this.routeSkeleton = this.skeletonForUrl(event.url);
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.routeLoading = false;
      }
    });
  }

  ngOnInit() {
    void this.adminSession.initialize().catch(error => {
      console.error('Admin API session initialization failed:', error);
    });
    void this.aiRuntime.initialize();
  }

  ngOnDestroy() {
    this.adminSession.stop();
    this.aiRuntime.clear();
    this.routerSubscription?.unsubscribe();
  }

  async logout() {
    this.adminSession.stop();
    this.aiRuntime.clear();
    await this.authService.adminLogout();
    this.router.navigate(['/login']);
  }

  private skeletonForUrl(url: string): SkeletonVariant {
    if (url.includes('parking-spots')) return 'parking';
    if (url.includes('find-my-car')) return 'search';
    if (url.includes('settings')) return 'settings';
    if (url.includes('view-data') || url.includes('notifications')) return 'table';
    return 'dashboard';
  }
}
