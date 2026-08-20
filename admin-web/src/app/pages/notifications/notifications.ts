import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminNotification, NotificationAdminService } from '../../core/services/notification-admin.service';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageSkeletonComponent } from '../../shared/page-skeleton/page-skeleton';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatButtonToggleModule, MatCardModule,
    MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule,
    MatSortModule, MatTableModule, MatTooltipModule, PageSkeletonComponent
  ],
  template: `
    <app-page-skeleton *ngIf="isLoading" variant="table"></app-page-skeleton>
    <div class="page-header">
      <div>
        <h1 class="page-title">Violations Register</h1>
        <p class="page-subtitle">Real-time register compiled from all OKU and double-parking notifications</p>
      </div>
      <div class="summary-pills">
        <span class="summary-pill active-pill">{{ activeCount }} Active</span>
        <span class="summary-pill">{{ dataSource.filteredData.length }} Shown</span>
      </div>
    </div>

    <mat-card class="table-card">
      <div class="toolbar">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search violations</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [(ngModel)]="searchText" (ngModelChange)="applyFilter()"
                 placeholder="Plate, owner, student ID, spot, message...">
          <button mat-icon-button matSuffix *ngIf="searchText" (click)="searchText = ''; applyFilter()" aria-label="Clear search">
            <mat-icon>close</mat-icon>
          </button>
        </mat-form-field>

        <mat-button-toggle-group [(ngModel)]="filter" (ngModelChange)="applyFilter()" name="violationFilter" aria-label="Violation filter">
          <mat-button-toggle value="all">All</mat-button-toggle>
          <mat-button-toggle value="unresolved">Active</mat-button-toggle>
          <mat-button-toggle value="resolved">Resolved</mat-button-toggle>
          <mat-button-toggle value="double_park">Double Park</mat-button-toggle>
          <mat-button-toggle value="oku_violation">OKU</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <div class="table-container">
        <table mat-table [dataSource]="dataSource" matSort>
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Date and Time</th>
            <td mat-cell *matCellDef="let item">
              <div class="date-cell">
                <strong>{{ notificationDate(item) | date:'dd MMM yyyy' }}</strong>
                <span>{{ notificationDate(item) | date:'h:mm a' }}</span>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
            <td mat-cell *matCellDef="let item">
              <span class="status-badge" [class.status-active]="status(item) === 'Active'"
                    [class.status-read]="status(item) === 'Read'" [class.status-resolved]="status(item) === 'Resolved'">
                {{ status(item) }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Violation Type</th>
            <td mat-cell *matCellDef="let item">
              <div class="type-cell" [class.type-oku]="item.type === 'oku_violation'">
                <mat-icon>{{ item.type === 'double_park' ? 'warning' : 'accessible' }}</mat-icon>
                <span>{{ typeLabel(item.type) }}</span>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="vehicle">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Vehicle and Owner</th>
            <td mat-cell *matCellDef="let item">
              <strong class="plate">{{ item.car_plate || 'UNKNOWN' }}</strong>
              <span class="secondary">{{ item.name || 'Unregistered vehicle' }}</span>
              <span class="secondary" *ngIf="item.student_id">{{ item.student_id }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="location">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Location and Source</th>
            <td mat-cell *matCellDef="let item">
              <span>{{ item.spot_id || 'Unknown' }}</span>
              <span class="secondary">{{ sourceLabel(item.source) }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="details">
            <th mat-header-cell *matHeaderCellDef>Details</th>
            <td mat-cell *matCellDef="let item" class="details-cell">
              <span>{{ item.message || typeLabel(item.type) }}</span>
              <span class="secondary" *ngIf="item.reason">{{ item.reason }}</span>
              <span class="secondary" *ngIf="item.overlap_ratio != null">
                Bay overlap: {{ item.overlap_ratio | percent:'1.1-1' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>Action</th>
            <td mat-cell *matCellDef="let item">
              <button mat-stroked-button color="primary" *ngIf="!item.resolved" (click)="resolve(item.id)">Resolve</button>
              <mat-icon *ngIf="item.resolved" class="resolved-icon" matTooltip="Violation resolved">check_circle</mat-icon>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns" [class.resolved-row]="row.resolved"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty-cell" [attr.colspan]="displayedColumns.length">
              <mat-icon>check_circle_outline</mat-icon>
              <span>No violation notifications match the current filters.</span>
            </td>
          </tr>
        </table>
      </div>

      <mat-paginator [pageSize]="10" [pageSizeOptions]="[10, 25, 50, 100]" showFirstLastButtons
                     aria-label="Violations table pages"></mat-paginator>
    </mat-card>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 22px; }
    .page-title { margin: 0 0 4px; font-size: 28px; color: var(--primary-dark-blue); }
    .page-subtitle { margin: 0; color: var(--text-secondary); }
    .summary-pills { display: flex; gap: 8px; }
    .summary-pill { padding: 8px 12px; border-radius: 999px; background: #e8eaf6; color: #283593; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .active-pill { background: #ffebee; color: #c62828; }
    .table-card { overflow: hidden; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.06); }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px 20px 4px; flex-wrap: wrap; }
    .search-field { width: min(100%, 420px); }
    .table-container { overflow-x: auto; }
    table { width: 100%; min-width: 1120px; }
    th.mat-mdc-header-cell { color: #37474f; font-weight: 700; white-space: nowrap; }
    td.mat-mdc-cell { padding-top: 13px; padding-bottom: 13px; vertical-align: top; }
    .date-cell, td.mat-mdc-cell > span, .details-cell { display: flex; flex-direction: column; gap: 3px; }
    .date-cell span, .secondary { color: var(--text-secondary); font-size: 12px; }
    .plate { display: block; font-family: monospace; letter-spacing: .06em; font-size: 14px; }
    .status-badge { display: inline-block; padding: 5px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; }
    .status-active { background: #ffebee; color: #c62828; }
    .status-read { background: #fff8e1; color: #ef6c00; }
    .status-resolved { background: #e8f5e9; color: #2e7d32; }
    .type-cell { display: inline-flex; align-items: center; gap: 7px; color: #ef6c00; font-weight: 600; white-space: nowrap; }
    .type-cell.type-oku { color: #c62828; }
    .type-cell mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .details-cell { max-width: 320px; line-height: 1.35; }
    .resolved-row { opacity: .7; background: #fafafa; }
    .resolved-icon { color: #2e7d32; }
    .empty-cell { height: 180px; text-align: center; color: var(--text-secondary); }
    .empty-cell mat-icon { vertical-align: middle; margin-right: 8px; color: #2e7d32; }
    @media (max-width: 800px) {
      .page-header { flex-direction: column; }
      .page-title { font-size: 22px; }
      .toolbar { align-items: stretch; flex-direction: column; }
      .search-field { width: 100%; }
      mat-button-toggle-group { overflow-x: auto; max-width: 100%; }
    }
  `]
})
export class NotificationsPage implements OnInit, AfterViewInit, OnDestroy {
  isLoading = true;
  displayedColumns = ['date', 'status', 'type', 'vehicle', 'location', 'details', 'action'];
  dataSource = new MatTableDataSource<AdminNotification>([]);
  filter: 'all' | 'unresolved' | 'resolved' | 'double_park' | 'oku_violation' = 'unresolved';
  searchText = '';
  activeCount = 0;
  private sub?: Subscription;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private notificationService: NotificationAdminService) {
    this.dataSource.filterPredicate = item => this.matchesFilters(item);
    this.dataSource.sortingDataAccessor = (item, property) => {
      if (property === 'date') return this.notificationDate(item)?.getTime() ?? 0;
      if (property === 'status') return this.status(item);
      if (property === 'type') return this.typeLabel(item.type);
      if (property === 'vehicle') return item.car_plate ?? '';
      if (property === 'location') return item.spot_id ?? '';
      return '';
    };
  }

  ngOnInit() {
    this.sub = this.notificationService.listenToAllViolations().subscribe(items => {
      this.activeCount = items.filter(item => !item.resolved).length;
      this.dataSource.data = items;
      this.applyFilter();
      this.isLoading = false;
    }, error => {
      console.error('Live violations listener failed:', error);
      this.isLoading = false;
    });
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  applyFilter() {
    this.dataSource.filter = `${this.filter}|${this.searchText.trim().toLowerCase()}|${Date.now()}`;
    this.dataSource.paginator?.firstPage();
  }

  private matchesFilters(item: AdminNotification): boolean {
    const statusMatch = this.filter === 'all'
      || (this.filter === 'unresolved' && !item.resolved)
      || (this.filter === 'resolved' && item.resolved)
      || item.type === this.filter;
    if (!statusMatch) return false;
    const search = this.searchText.trim().toLowerCase();
    if (!search) return true;
    return [
      item.id, item.car_plate, item.name, item.student_id, item.email, item.spot_id,
      item.message, item.reason, item.source, this.typeLabel(item.type), this.status(item)
    ].some(value => String(value ?? '').toLowerCase().includes(search));
  }

  notificationDate(item: AdminNotification): Date | null {
    const value = item.timestamp;
    if (!value) return null;
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  status(item: AdminNotification): 'Active' | 'Read' | 'Resolved' {
    if (item.resolved) return 'Resolved';
    return item.is_read ? 'Read' : 'Active';
  }

  typeLabel(type: AdminNotification['type']): string {
    return type === 'double_park' ? 'Double Parking' : 'OKU Violation';
  }

  sourceLabel(source?: string): string {
    if (!source) return 'Notification record';
    return source.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
  }

  async resolve(id: string) {
    await this.notificationService.markResolved(id);
  }
}
