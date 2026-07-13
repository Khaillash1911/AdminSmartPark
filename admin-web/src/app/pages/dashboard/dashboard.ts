import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    BaseChartDirective, 
    MatCardModule, 
    MatButtonModule, 
    MatIconModule, 
    MatButtonToggleModule,
    MatMenuModule,
    MatDividerModule,
    FormsModule
  ],
  template: `
    <div class="dashboard-header">
      <div>
        <h1 class="page-title">Analytics & Revenue Dashboard</h1>
        <p class="page-subtitle">Real-time overview of SmartPark APU system</p>
      </div>

      <div class="actions">
        <button mat-raised-button color="primary" [matMenuTriggerFor]="reportMenu">
          <mat-icon>file_download</mat-icon>
          Generate Report
        </button>
        <mat-menu #reportMenu="matMenu">
          <button mat-menu-item (click)="generateReport('occupancy')">Parking Places Average</button>
          <button mat-menu-item (click)="generateReport('timing')">Average Car Entries Timing</button>
          <button mat-menu-item (click)="generateReport('revenue')">Revenue Report</button>
          <button mat-menu-item (click)="generateReport('violations')">OKU & Violations Report</button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="generateReport('all')"><strong>Generate All</strong></button>
        </mat-menu>
      </div>
    </div>

    <!-- Live Overview Section -->
    <div class="overview-grid">
      <mat-card class="metric-card primary-gradient">
        <div class="metric-icon"><mat-icon>directions_car</mat-icon></div>
        <div class="metric-content">
          <div class="metric-value">{{ liveData().carsParked }}</div>
          <div class="metric-label">Cars Currently Parked</div>
        </div>
      </mat-card>

      <mat-card class="metric-card bg-white">
        <div class="metric-icon text-accent"><mat-icon>local_parking</mat-icon></div>
        <div class="metric-content">
          <div class="metric-value text-dark">{{ liveData().spotsAvailable }}</div>
          <div class="metric-label">Spots Available</div>
        </div>
      </mat-card>

      <mat-card class="metric-card bg-white">
        <div class="metric-icon text-success"><mat-icon>accessible</mat-icon></div>
        <div class="metric-content">
          <div class="metric-value text-dark">{{ liveData().okusAvailable }}</div>
          <div class="metric-label">OKU Spots Available</div>
        </div>
      </mat-card>

      <mat-card class="metric-card danger-gradient">
        <div class="metric-icon"><mat-icon>warning</mat-icon></div>
        <div class="metric-content">
          <div class="metric-value">{{ liveData().activeViolations }}</div>
          <div class="metric-label">Active Double Park</div>
        </div>
      </mat-card>

      <mat-card class="metric-card success-gradient">
        <div class="metric-icon"><mat-icon>attach_money</mat-icon></div>
        <div class="metric-content">
          <div class="metric-value">RM {{ todayRevenue() | number:'1.2-2' }}</div>
          <div class="metric-label">Today's Revenue</div>
        </div>
      </mat-card>
    </div>

    <!-- Analytics Section -->
    <div class="controls-bar">
      <h2>Analytics</h2>
      <mat-button-toggle-group [(ngModel)]="selectedPeriod" (ngModelChange)="loadData()" name="period" aria-label="Time Period">
        <mat-button-toggle value="today">Today</mat-button-toggle>
        <mat-button-toggle value="week">This Week</mat-button-toggle>
        <mat-button-toggle value="month">This Month</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    <div class="charts-grid">
      <!-- Peak Hours -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Peak Hours (Entries vs Exits)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            [data]="peakHoursChartData"
            [options]="lineChartOptions"
            [type]="'line'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- Revenue Performance -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Revenue Performance (RM)</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            [data]="revenueChartData"
            [options]="barChartOptions"
            [type]="'bar'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- Total Cars -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Vehicle Traffic</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            [data]="totalCarsChartData"
            [options]="barChartOptions"
            [type]="'bar'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- OKU Violations -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>OKU Violations</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            [data]="okuViolationsChartData"
            [options]="barChartOptions"
            [type]="'bar'">
          </canvas>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .page-title {
      font-size: 28px;
      margin: 0 0 4px 0;
      color: var(--primary-dark-blue);
    }
    .page-subtitle {
      margin: 0;
      color: var(--text-secondary);
    }
    
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    .metric-card {
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .metric-card .mat-mdc-card-content {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 0;
    }
    .metric-icon {
      font-size: 40px;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 16px;
    }
    .metric-icon mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }
    .metric-content {
      display: flex;
      flex-direction: column;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
      margin-top: 4px;
    }

    /* Gradients for UI pop */
    .primary-gradient {
      background: linear-gradient(135deg, #1a237e 0%, #3f51b5 100%);
      color: white;
    }
    .danger-gradient {
      background: linear-gradient(135deg, #d32f2f 0%, #e57373 100%);
      color: white;
    }
    .success-gradient {
      background: linear-gradient(135deg, #2e7d32 0%, #4caf50 100%);
      color: white;
    }
    .bg-white {
      background: white;
    }
    .text-dark { color: #333; }
    .text-accent { color: var(--accent-blue); }
    .text-success { color: var(--success-green); }

    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .controls-bar h2 {
      margin: 0;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
      gap: 24px;
    }
    .chart-card {
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      min-width: 0;
    }
    .chart-card mat-card-content {
      height: 300px;
    }
    mat-card-header {
      margin-bottom: 16px;
    }
    mat-card-title {
      font-size: 16px;
      font-weight: 500;
    }

    @media (max-width: 900px) {
      .dashboard-header,
      .controls-bar {
        align-items: flex-start;
        flex-direction: column;
      }

      .overview-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
        gap: 14px;
        margin-bottom: 24px;
      }
    }

    @media (max-width: 600px) {
      .page-title {
        font-size: 22px;
      }

      .metric-card {
        padding: 14px;
      }

      .metric-icon {
        width: 40px;
        height: 40px;
        margin-right: 12px;
      }

      .metric-icon mat-icon {
        font-size: 30px;
        width: 30px;
        height: 30px;
      }

      .metric-value {
        font-size: 20px;
      }

      .charts-grid {
        gap: 16px;
      }

      .chart-card mat-card-content {
        height: 240px;
      }
    }
  `]
})
export class DashboardPage implements OnInit {
  selectedPeriod: 'today' | 'week' | 'month' = 'today';
  
  // Real time stats
  liveData = signal({ carsParked: 0, spotsAvailable: 0, okusAvailable: 0, activeViolations: 0, totalSpots: 0 });
  todayRevenue = signal(0);

  // Chart Properties
  lineChartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false };
  barChartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false };
  
  peakHoursChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  totalCarsChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  okuViolationsChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  revenueChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };

  ngOnInit() {
    this.fetchLiveOverview();
    this.loadData();
  }

  async fetchLiveOverview() {
    this.liveData.set({
      carsParked: 645,
      spotsAvailable: 475,
      okusAvailable: 31,
      activeViolations: 6,
      totalSpots: 1120
    });
    this.todayRevenue.set(382.50);
  }

  async loadData() {
    const mock = this.getMockDashboardData(this.selectedPeriod);
    
    // 1. Peak Hours
    this.peakHoursChartData = {
      labels: mock.peakLabels,
      datasets: [
        { data: mock.entries, label: 'Entries', borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.1)', fill: true, tension: 0.4 },
        { data: mock.exits, label: 'Exits', borderColor: '#d32f2f', backgroundColor: 'transparent', tension: 0.4 }
      ]
    };

    // 2. Traffic
    this.totalCarsChartData = {
      labels: mock.periodLabels,
      datasets: [
        { data: mock.trafficEntries, label: 'Total Entered', backgroundColor: '#1976d2' },
        { data: mock.trafficExits, label: 'Total Exited', backgroundColor: '#4caf50' }
      ]
    };

    // 3. OKU Violations
    this.okuViolationsChartData = {
      labels: mock.periodLabels,
      datasets: [
        { data: mock.okuViolations, label: 'OKU Violations', backgroundColor: '#d32f2f' }
      ]
    };

    // 4. Revenue
    this.revenueChartData = {
      labels: mock.periodLabels,
      datasets: [
        { data: mock.revenue, label: 'Revenue (RM)', backgroundColor: '#4caf50' }
      ]
    };
  }

  private getMockDashboardData(period: 'today' | 'week' | 'month') {
    const peakLabels = ['7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM'];

    if (period === 'today') {
      return {
        peakLabels,
        entries: [22, 58, 91, 74, 46, 62, 80, 69, 52, 77, 96, 84, 43],
        exits: [8, 19, 35, 41, 38, 44, 51, 57, 63, 70, 88, 102, 66],
        periodLabels: ['7 AM', '9 AM', '11 AM', '1 PM', '3 PM', '5 PM', '7 PM'],
        trafficEntries: [22, 91, 46, 80, 52, 96, 43],
        trafficExits: [8, 35, 38, 51, 63, 88, 66],
        okuViolations: [0, 1, 0, 2, 1, 3, 1],
        revenue: [18, 72, 44, 68, 51, 89, 40]
      };
    }

    if (period === 'week') {
      return {
        peakLabels,
        entries: [84, 188, 245, 214, 176, 203, 238, 220, 196, 231, 268, 244, 151],
        exits: [42, 121, 174, 188, 170, 192, 205, 213, 219, 230, 252, 271, 193],
        periodLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        trafficEntries: [612, 684, 731, 705, 812, 476, 389],
        trafficExits: [588, 661, 704, 692, 779, 462, 371],
        okuViolations: [3, 4, 2, 5, 6, 2, 1],
        revenue: [421, 488, 536, 504, 612, 318, 244]
      };
    }

    return {
      peakLabels,
      entries: [310, 642, 815, 756, 621, 702, 790, 744, 680, 768, 842, 801, 522],
      exits: [188, 436, 602, 665, 618, 652, 701, 735, 742, 788, 830, 858, 641],
      periodLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      trafficEntries: [3560, 3988, 4214, 4472],
      trafficExits: [3412, 3861, 4097, 4329],
      okuViolations: [14, 18, 16, 21],
      revenue: [2485, 2874, 3096, 3348]
    };
  }

  generateReport(type: string) {
    console.log('Generating report:', type);
    // TODO: implement jsPDF generator
    alert(`Report generation for ${type} triggered. PDF generation service not fully wired in UI yet.`);
  }
}
