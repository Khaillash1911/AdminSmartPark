import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService, ParkingLog } from '../../core/services/analytics.service';
import { RevenueService } from '../../core/services/revenue.service';
import { BaseChartDirective } from 'ng2-charts';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { ChartConfiguration, ChartType } from 'chart.js';

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
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
    }
    .chart-card {
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    mat-card-header {
      margin-bottom: 16px;
    }
    mat-card-title {
      font-size: 16px;
      font-weight: 500;
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

  constructor(
    private analyticsService: AnalyticsService,
    private revenueService: RevenueService
  ) {}

  ngOnInit() {
    this.fetchLiveOverview();
    this.loadData();
    setInterval(() => this.fetchLiveOverview(), 15000); // 15s refresh
  }

  async fetchLiveOverview() {
    const live = await this.analyticsService.getLiveOverview();
    this.liveData.set(live);
    // Revenue is calculated from getRevenueStats in loadData instead
  }

  async loadData() {
    const logs = await this.analyticsService.getParkingLogs(this.selectedPeriod);
    
    // 1. Peak Hours
    const peak = this.analyticsService.getPeakHoursData(logs);
    this.peakHoursChartData = {
      labels: peak.labels,
      datasets: [
        { data: peak.entries, label: 'Entries', borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.1)', fill: true, tension: 0.4 },
        { data: peak.exits, label: 'Exits', borderColor: '#d32f2f', backgroundColor: 'transparent', tension: 0.4 }
      ]
    };

    // 2. Traffic
    const traffic = this.analyticsService.getCarCountByDay(logs);
    this.totalCarsChartData = {
      labels: traffic.labels,
      datasets: [
        { data: traffic.entries, label: 'Total Entered', backgroundColor: '#1976d2' },
        { data: traffic.exits, label: 'Total Exited', backgroundColor: '#4caf50' }
      ]
    };

    // 3. OKU Violations
    const oku = this.analyticsService.getOkuViolationsByDay(logs);
    this.okuViolationsChartData = {
      labels: oku.labels,
      datasets: [
        { data: oku.counts, label: 'OKU Violations', backgroundColor: '#d32f2f' }
      ]
    };

    // 4. Revenue (Mock for Graph)
    const revLabels = traffic.labels;
    const dummyRevData = traffic.entries.map(e => e * 1.5); // Mock graph logic for UI
    this.revenueChartData = {
      labels: revLabels,
      datasets: [
        { data: dummyRevData, label: 'Revenue (RM)', backgroundColor: '#4caf50' }
      ]
    };
  }

  generateReport(type: string) {
    console.log('Generating report:', type);
    // TODO: implement jsPDF generator
    alert(`Report generation for ${type} triggered. PDF generation service not fully wired in UI yet.`);
  }
}
