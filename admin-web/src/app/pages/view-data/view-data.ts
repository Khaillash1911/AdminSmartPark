import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppUser, UserManagementService } from '../../core/services/user-management.service';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import { PageSkeletonComponent } from '../../shared/page-skeleton/page-skeleton';

@Component({
  selector: 'app-view-data',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatMenuModule,
    MatProgressBarModule,
    MatDividerModule,
    MatTooltipModule,
    PageSkeletonComponent
  ],
  template: `
    <app-page-skeleton *ngIf="isLoading" variant="table"></app-page-skeleton>
    <div class="page-header">
      <div>
        <h1 class="page-title">User Management</h1>
        <p class="page-subtitle">View and manage all registered drivers in the system</p>
      </div>
      <span class="live-badge"><span class="live-dot"></span> Live updates</span>
    </div>

    <mat-card class="table-card">
      <mat-card-header class="search-header">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search users...</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput (keyup)="applyFilter($event)" placeholder="Search by name, TP number, or plate" #input>
        </mat-form-field>
      </mat-card-header>

      <mat-card-content class="table-container">
        <table mat-table [dataSource]="dataSource" matSort>

          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Name </th>
            <td mat-cell *matCellDef="let user"> 
              <div class="user-name">
                {{user.name}} 
                <mat-icon *ngIf="user.is_flagged" color="warn" class="flag-icon" matTooltip="Flagged User">flag</mat-icon>
              </div>
            </td>
          </ng-container>

          <!-- TP Number Column -->
          <ng-container matColumnDef="student_id">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Student ID </th>
            <td mat-cell *matCellDef="let user"> {{user.student_id}} </td>
          </ng-container>

          <!-- OKU Column -->
          <ng-container matColumnDef="is_oku">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> OKU? </th>
            <td mat-cell *matCellDef="let user">
              <span class="badge" [class.badge-success]="user.is_oku" [class.badge-secondary]="!user.is_oku">
                {{ user.is_oku ? 'YES' : 'NO' }}
              </span>
            </td>
          </ng-container>

          <!-- Plate Column -->
          <ng-container matColumnDef="car_plate">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Car Plate </th>
            <td mat-cell *matCellDef="let user" class="plate-col"> {{user.car_plate}} </td>
          </ng-container>

          <!-- Vehicle Model Column -->
          <ng-container matColumnDef="car_model">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Vehicle </th>
            <td mat-cell *matCellDef="let user"> {{user.car_model}} </td>
          </ng-container>

          <!-- Color Column -->
          <ng-container matColumnDef="car_colour">
            <th mat-header-cell *matHeaderCellDef> Color </th>
            <td mat-cell *matCellDef="let user">
              <div class="color-cell">
                <span class="color-dot" [style.backgroundColor]="getHex(user.car_colour)"></span>
                {{user.car_colour}}
              </div>
            </td>
          </ng-container>

          <!-- Email Column -->
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef> Email </th>
            <td mat-cell *matCellDef="let user"> {{user.email}} </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let user" class="action-cell">
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="More options">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="viewHistory(user)">
                  <mat-icon>history</mat-icon>
                  <span>View Full History</span>
                </button>
                <button mat-menu-item (click)="toggleFlag(user)">
                  <mat-icon [color]="user.is_flagged ? 'primary' : 'warn'">outlined_flag</mat-icon>
                  <span>{{ user.is_flagged ? 'Unflag User' : 'Flag User' }}</span>
                </button>
                <mat-divider></mat-divider>
                <button mat-menu-item (click)="exportPdf(user)">
                  <mat-icon>download</mat-icon>
                  <span>Export User Data (PDF)</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>

          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell" colspan="8" class="no-data-cell">
              No users found matching "{{input.value}}"
            </td>
          </tr>
        </table>
      </mat-card-content>

      <mat-paginator [pageSizeOptions]="[10, 25, 50]" aria-label="Select page of users"></mat-paginator>
    </mat-card>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .page-title { margin: 0 0 4px 0; font-size: 28px; color: var(--primary-dark-blue); }
    .page-subtitle { margin: 0; color: var(--text-secondary); }
    .live-badge { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 999px; background: #e8f5e9; color: #2e7d32; font-size: 12px; font-weight: 700; white-space: nowrap; }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #43a047; box-shadow: 0 0 0 4px rgba(67,160,71,.13); }
    
    .table-card { border-radius: 12px; padding: 0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .search-header { padding: 16px 24px 0 24px; }
    .search-field { width: 100%; max-width: 400px; }
    
    .table-container { padding: 0; overflow-x: auto; }
    table { width: 100%; min-width: 920px; }
    
    .user-name { display: flex; align-items: center; font-weight: 500; }
    .flag-icon { font-size: 16px; width: 16px; height: 16px; margin-left: 8px; }
    
    .badge { padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px; }
    .badge-success { background-color: #e8f5e9; color: var(--success-green); }
    .badge-secondary { background-color: #f5f5f5; color: var(--text-secondary); }
    
    .plate-col { font-family: monospace; font-weight: bold; font-size: 14px; letter-spacing: 1px; }
    
    .color-cell { display: flex; align-items: center; gap: 8px; }
    .color-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0,0,0,0.1); }
    
    .action-cell { text-align: right; }
    .no-data-cell { padding: 24px; text-align: center; color: var(--text-secondary); font-style: italic; }

    @media (max-width: 700px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
        gap: 12px;
      }

      .page-title { font-size: 22px; }
      .search-header { padding: 12px 12px 0; }
      .search-field { max-width: none; }
      .table-container { -webkit-overflow-scrolling: touch; }
    }
  `]
})
export class ViewDataPage implements OnInit, AfterViewInit, OnDestroy {
  displayedColumns: string[] = ['name', 'student_id', 'is_oku', 'car_plate', 'car_model', 'car_colour', 'email', 'actions'];
  dataSource: MatTableDataSource<AppUser>;
  isLoading = true;
  private usersSubscription?: Subscription;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(private userManagement: UserManagementService) {
    this.dataSource = new MatTableDataSource<AppUser>([]);
  }

  ngOnInit() {
    this.usersSubscription = this.userManagement.listenToUsers().subscribe({
      next: users => {
        this.dataSource.data = users;
        this.isLoading = false;
      },
      error: error => {
        console.error('Live users listener failed:', error);
        this.isLoading = false;
      }
    });
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    this.usersSubscription?.unsubscribe();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  async viewHistory(user: AppUser) {
    // In actual implementation, opens a MatDialog or navigates to a details route
    alert(`Showing history for ${user.name}`);
  }

  async toggleFlag(user: AppUser) {
    user.is_flagged = !user.is_flagged;
    await this.userManagement.flagUser(user.uid, user.is_flagged);
  }

  async exportPdf(user: AppUser) {
    const history = await this.userManagement.getUserParkingHistory(user.uid);
    await this.userManagement.exportUserPDF(user, history);
  }

  getHex(color: string): string {
    const map: Record<string, string> = {
      'black': '#000000', 'white': '#ffffff', 'silver': '#c0c0c0', 'grey': '#808080',
      'red': '#ff0000', 'blue': '#0000ff', 'green': '#008000', 'yellow': '#ffff00'
    };
    return map[color.toLowerCase()] || '#cccccc';
  }
}
