import { Component, OnDestroy, OnInit, signal } from '@angular/core';
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
import { firstValueFrom } from 'rxjs';
import { AnalyticsService, ParkingLog, TrafficPrediction } from '../../core/services/analytics.service';
import { ParkingOccupancyService, ParkingSection, SimulationTrafficRecord } from '../../core/services/parking-occupancy.service';
import { PricingConfig, RevenueService } from '../../core/services/revenue.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AdminNotification } from '../../core/services/notification-admin.service';
import { PageSkeletonComponent } from '../../shared/page-skeleton/page-skeleton';

interface DashboardBucket {
  label: string;
  entries: number;
  exits: number;
  okuViolations: number;
  doubleParkViolations: number;
  resolvedViolations: number;
  logs: ParkingLog[];
}

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
    FormsModule,
    PageSkeletonComponent
  ],
  template: `
    <app-page-skeleton *ngIf="isLoading" variant="dashboard"></app-page-skeleton>
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
          <button mat-menu-item (click)="generateReport('violations')">Violations Report</button>
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
      <div>
        <h2>Live Analytics</h2>
        <span class="data-status" [class.error-status]="analyticsError()">
          {{ analyticsError() || ('Updated ' + (lastUpdated() | date:'mediumTime')) }}
        </span>
      </div>
      <mat-button-toggle-group [(ngModel)]="selectedPeriod" (ngModelChange)="loadData()" name="period" aria-label="Time Period">
        <mat-button-toggle value="week">This Week</mat-button-toggle>
        <mat-button-toggle value="month">This Month</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    <div class="prediction-grid" *ngIf="prediction() as forecast">
      <mat-card class="forecast-card">
        <div class="forecast-heading">
          <div>
            <span class="eyebrow">MODEL FORECAST · {{ forecast.predictionDate | date:'EEE, d MMM' }}</span>
            <h3>Tomorrow's parking demand</h3>
          </div>
          <span class="demand-badge" [class.low]="forecast.demandLevel === 'LOW'"
                [class.medium]="forecast.demandLevel === 'MEDIUM'"
                [class.high]="forecast.demandLevel === 'HIGH'">{{ forecast.demandLevel }}</span>
        </div>
        <div class="forecast-values">
          <div><strong>{{ forecast.predictedEntries | number }}</strong><span>Predicted entries</span></div>
          <div><strong>{{ forecast.predictedExits | number }}</strong><span>Predicted exits</span></div>
          <div><strong>{{ forecast.predictedNetFlow > 0 ? '+' : '' }}{{ forecast.predictedNetFlow | number }}</strong><span>Predicted net flow</span></div>
        </div>
        <p class="model-note">
          {{ forecast.model }} · Entry R² {{ forecast.entryR2 | percent:'1.1-1' }} · Exit R² {{ forecast.exitR2 | percent:'1.1-1' }}.
          <ng-container *ngIf="forecast.currentDayProjected">Today's partial live count is projected to a full day using your hourly research profile. </ng-container>
          <ng-container *ngIf="forecast.researchDaysUsed > 0">{{ forecast.researchDaysUsed }} research baseline day(s) fill missing live history.</ng-container>
          <ng-container *ngIf="forecast.researchDaysUsed === 0">All model inputs come from live parking records.</ng-container>
        </p>
      </mat-card>
    </div>

    <div class="charts-grid">
      <!-- Live section occupancy -->
      <mat-card class="chart-card feature-chart">
        <mat-card-header>
          <mat-card-title>Live Occupancy by Section</mat-card-title>
          <mat-card-subtitle>Current values from the occupancy database</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="occupancy-report-chart"
            [data]="occupancyChartData"
            [options]="doughnutChartOptions"
            [type]="'doughnut'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- Model forecast comparison -->
      <mat-card class="chart-card feature-chart">
        <mat-card-header>
          <mat-card-title>Today vs Tomorrow's Model Forecast</mat-card-title>
          <mat-card-subtitle>Live records transformed with your trained model</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="forecast-report-chart"
            [data]="forecastChartData"
            [options]="barChartOptions"
            [type]="'bar'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- Peak Hours -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Hourly Traffic: Live vs Research Profile</mat-card-title>
          <mat-card-subtitle>Solid: Firestore records · Dashed: research averages</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="timing-report-chart"
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
          <mat-card-subtitle>{{ completedSessionCount() }} completed database session(s)</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="revenue-report-chart"
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
          <mat-card-subtitle>Entry and exit movements from the simulation API</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="traffic-report-chart"
            [data]="totalCarsChartData"
            [options]="barChartOptions"
            [type]="'bar'">
          </canvas>
        </mat-card-content>
      </mat-card>

      <!-- Violations -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Violations</mat-card-title>
          <mat-card-subtitle>{{ violationCount() }} recorded OKU and double-parking violation(s)</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <canvas baseChart
            id="violations-report-chart"
            [data]="violationsChartData"
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
    .data-status { display: block; color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
    .error-status { color: #c62828; }

    .prediction-grid { margin-bottom: 24px; }
    .forecast-card { padding: 22px; border-radius: 12px; border-left: 5px solid #3f51b5; }
    .forecast-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .forecast-heading h3 { margin: 5px 0 0; color: var(--primary-dark-blue); font-size: 20px; }
    .eyebrow { font-size: 11px; letter-spacing: .08em; color: var(--text-secondary); font-weight: 700; }
    .demand-badge { padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; }
    .demand-badge.low { background: #e8f5e9; color: #2e7d32; }
    .demand-badge.medium { background: #fff8e1; color: #ef6c00; }
    .demand-badge.high { background: #ffebee; color: #c62828; }
    .forecast-values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 22px 0 14px; }
    .forecast-values div { display: flex; flex-direction: column; padding: 14px; background: #f7f8fc; border-radius: 10px; }
    .forecast-values strong { font-size: 25px; color: #1a237e; }
    .forecast-values span { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
    .model-note { color: var(--text-secondary); font-size: 12px; line-height: 1.5; margin: 0; }

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
    .feature-chart { background: linear-gradient(180deg, #ffffff 0%, #fafbff 100%); }
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

      .forecast-values { grid-template-columns: 1fr; gap: 10px; }

      .chart-card mat-card-content {
        height: 240px;
      }
    }
  `]
})
export class DashboardPage implements OnInit, OnDestroy {
  isLoading = true;
  selectedPeriod: 'today' | 'week' | 'month' = 'week';
  liveData = signal({ carsParked: 0, spotsAvailable: 0, okusAvailable: 0, activeViolations: 0, totalSpots: 0 });
  todayRevenue = signal(0);
  prediction = signal<TrafficPrediction | null>(null);
  analyticsError = signal('');
  lastUpdated = signal(new Date());
  periodRecordCount = signal(0);
  completedSessionCount = signal(0);
  violationCount = signal(0);
  private refreshTimer?: ReturnType<typeof setInterval>;
  private reportLogs: ParkingLog[] = [];
  private reportSections: ParkingSection[] = [];
  private reportPricing: PricingConfig = { free_hours: 1, hourly_rate: 1 };
  private reportBuckets: DashboardBucket[] = [];
  private reportViolations: AdminNotification[] = [];

  // Chart Properties
  lineChartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false };
  barChartOptions: ChartConfiguration['options'] = { responsive: true, maintainAspectRatio: false };
  doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: { legend: { position: 'bottom' } }
  };
  
  peakHoursChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  totalCarsChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  violationsChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  revenueChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  occupancyChartData: ChartConfiguration<'doughnut'>['data'] = { datasets: [], labels: [] };
  forecastChartData: ChartConfiguration<'bar'>['data'] = { datasets: [], labels: [] };

  constructor(
    private analytics: AnalyticsService,
    private occupancy: ParkingOccupancyService,
    private revenue: RevenueService
  ) {}

  ngOnInit() {
    void this.refreshDashboard();
    this.refreshTimer = setInterval(() => void this.refreshDashboard(), 60000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async loadData() {
    await this.refreshDashboard();
  }

  private async refreshDashboard() {
    this.analyticsError.set('');
    try {
      const trafficPeriod = this.selectedPeriod === 'month' ? 'month' : 'week';
      const [occupancy, overview, logs, recentLogs, pricing, violations, simulationTraffic] = await Promise.all([
        firstValueFrom(this.occupancy.getOccupancy()),
        this.analytics.getLiveOverview().catch(() => null),
        this.analytics.getParkingLogs(this.selectedPeriod),
        this.analytics.getRecentParkingLogs(31),
        this.revenue.getPricingConfig(),
        this.analytics.getViolations(this.selectedPeriod),
        firstValueFrom(this.occupancy.getTraffic(trafficPeriod))
      ]);

      const parkingRows = occupancy?.sections.flatMap(section => section.rows) ?? [];
      const totalSpots = parkingRows.reduce((total, row) => total + row.capacity, 0);
      const carsParked = parkingRows.reduce((total, row) => total + row.occupied, 0);
      this.liveData.set({
        carsParked,
        spotsAvailable: Math.max(0, totalSpots - carsParked),
        okusAvailable: 2,
        activeViolations: overview?.activeViolations ?? 0,
        totalSpots
      });

      const todayLogs = recentLogs.filter(log => this.isToday(this.logDate(log.entry_time)));
      this.todayRevenue.set(Number(todayLogs.reduce(
        (total, log) => total + this.revenue.calculateSessionRevenue(log, pricing), 0
      ).toFixed(2)));
      this.periodRecordCount.set(logs.length);
      this.completedSessionCount.set(logs.filter(log => Boolean(log.exit_time)).length);
      this.violationCount.set(violations.length);
      this.reportLogs = logs;
      this.reportSections = occupancy?.sections ?? [];
      this.reportPricing = pricing;
      this.reportViolations = violations;

      this.updateCharts(logs, pricing, violations, simulationTraffic.records);
      this.updateOccupancyChart(occupancy?.sections ?? []);
      const forecast = await this.analytics.getTrafficPrediction(this.analytics.aggregateDailyTraffic(recentLogs));
      this.prediction.set(forecast);
      this.updateModelCharts(forecast);
      this.lastUpdated.set(new Date());
    } catch (error) {
      console.error('Dashboard analytics refresh failed:', error);
      this.analyticsError.set('Some live analytics are unavailable. Check the occupancy API and Firebase connection.');
    } finally {
      this.isLoading = false;
    }
  }

  private updateCharts(
    logs: ParkingLog[],
    pricing: { free_hours: number; hourly_rate: number },
    violations: AdminNotification[],
    simulationTraffic: SimulationTrafficRecord[]
  ) {
    const hourly = this.analytics.getPeakHoursData(logs);
    this.peakHoursChartData = {
      labels: hourly.labels,
      datasets: [
        { data: hourly.entries, label: 'Live entries', borderColor: '#1976d2', backgroundColor: 'rgba(25,118,210,0.1)', fill: true, tension: 0.3 },
        { data: hourly.exits, label: 'Live exits', borderColor: '#d32f2f', backgroundColor: 'transparent', tension: 0.3 }
      ]
    };

    const buckets = this.buildBuckets(logs, violations);
    this.reportBuckets = buckets;
    const traffic = this.buildSimulationTrafficData(simulationTraffic);
    this.totalCarsChartData = {
      labels: traffic.labels,
      datasets: [
        { data: traffic.entries, label: 'Simulated entries', backgroundColor: '#1976d2' },
        { data: traffic.exits, label: 'Simulated exits', backgroundColor: '#4caf50' }
      ]
    };
    this.violationsChartData = {
      labels: buckets.map(bucket => bucket.label),
      datasets: [
        { data: buckets.map(bucket => bucket.okuViolations), label: 'OKU violations', backgroundColor: '#d32f2f' },
        { data: buckets.map(bucket => bucket.doubleParkViolations), label: 'Double-parking violations', backgroundColor: '#ff9800' },
        { data: buckets.map(bucket => bucket.resolvedViolations), label: 'Resolved violations', backgroundColor: '#43a047' }
      ]
    };
    this.revenueChartData = {
      labels: buckets.map(bucket => bucket.label),
      datasets: [{
        data: buckets.map(bucket => Number(bucket.logs.reduce(
          (sum, log) => sum + this.revenue.calculateSessionRevenue(log, pricing), 0
        ).toFixed(2))),
        label: 'Revenue (RM)', backgroundColor: '#4caf50'
      }]
    };
  }

  private buildSimulationTrafficData(records: SimulationTrafficRecord[]) {
    const totals = new Map(records.map(record => [record.date, record]));
    const labels: string[] = [];
    const entries: number[] = [];
    const exits: number[] = [];
    const now = new Date();
    const start = this.selectedPeriod === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = this.isoDateKey(cursor);
      const record = totals.get(dateKey);
      labels.push(cursor.toLocaleDateString('en-MY', {
        weekday: this.selectedPeriod === 'week' ? 'short' : undefined,
        day: '2-digit', month: 'short'
      }));
      entries.push(record?.entries ?? 0);
      exits.push(record?.exits ?? 0);
    }
    return { labels, entries, exits };
  }

  private isoDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private updateOccupancyChart(sections: Array<{ section: string; occupied: number }>) {
    this.occupancyChartData = {
      labels: sections.map(section => `Section ${section.section}`),
      datasets: [{
        data: sections.map(section => section.occupied),
        backgroundColor: ['#3f51b5', '#26a69a', '#ffb300'],
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8
      }]
    };
  }

  private updateModelCharts(forecast: TrafficPrediction) {
    this.forecastChartData = {
      labels: ['Entries', 'Exits'],
      datasets: [
        {
          data: [forecast.currentDayEntries, forecast.currentDayExits],
          label: forecast.currentDayProjected ? 'Today (projected full day)' : 'Today (observed)',
          backgroundColor: '#90a4ae'
        },
        {
          data: [forecast.predictedEntries, forecast.predictedExits],
          label: 'Tomorrow (ML forecast)',
          backgroundColor: '#5c6bc0'
        }
      ]
    };

    const liveDatasets = [...this.peakHoursChartData.datasets];
    this.peakHoursChartData = {
      labels: forecast.hourlyProfile.map(point => point.label),
      datasets: [
        ...liveDatasets,
        {
          data: forecast.hourlyProfile.map(point => point.averageEntries),
          label: 'Research average entries',
          borderColor: '#7986cb',
          borderDash: [6, 5],
          pointRadius: 0,
          backgroundColor: 'transparent',
          tension: 0.25
        },
        {
          data: forecast.hourlyProfile.map(point => point.averageExits),
          label: 'Research average exits',
          borderColor: '#ef9a9a',
          borderDash: [6, 5],
          pointRadius: 0,
          backgroundColor: 'transparent',
          tension: 0.25
        }
      ]
    };
  }

  private buildBuckets(logs: ParkingLog[], violations: AdminNotification[] = []): DashboardBucket[] {
    const map = new Map<string, DashboardBucket>();
    const now = new Date();
    if (this.selectedPeriod === 'today') {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${String(hour).padStart(2, '0')}:00`;
        map.set(key, { label: key, entries: 0, exits: 0, okuViolations: 0, doubleParkViolations: 0, resolvedViolations: 0, logs: [] });
      }
    } else {
      const start = this.selectedPeriod === 'week'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      for (const cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
        const key = this.dayBucketKey(cursor);
        map.set(key, {
          label: cursor.toLocaleDateString('en-MY', { weekday: this.selectedPeriod === 'week' ? 'short' : undefined, day: '2-digit', month: 'short' }),
          entries: 0, exits: 0, okuViolations: 0, doubleParkViolations: 0, resolvedViolations: 0, logs: []
        });
      }
    }

    for (const log of logs) {
      const date = this.logDate(log.entry_time);
      if (!date) continue;
      const key = this.selectedPeriod === 'today'
        ? `${String(date.getHours()).padStart(2, '0')}:00`
        : this.dayBucketKey(date);
      const label = this.selectedPeriod === 'today'
        ? key
        : date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
      const bucket = map.get(key) ?? { label, entries: 0, exits: 0, okuViolations: 0, doubleParkViolations: 0, resolvedViolations: 0, logs: [] };
      bucket.entries++;
      bucket.logs.push(log);
      map.set(key, bucket);

      const exitDate = this.logDate(log.exit_time);
      if (exitDate) {
        const exitKey = this.selectedPeriod === 'today'
          ? `${String(exitDate.getHours()).padStart(2, '0')}:00`
          : this.dayBucketKey(exitDate);
        const exitBucket = map.get(exitKey);
        if (exitBucket) exitBucket.exits++;
      }
    }
    for (const violation of violations) {
      const date = this.logDate(violation.timestamp);
      if (!date) continue;
      const key = this.selectedPeriod === 'today'
        ? `${String(date.getHours()).padStart(2, '0')}:00`
        : this.dayBucketKey(date);
      const bucket = map.get(key);
      if (!bucket) continue;
      if (violation.type === 'oku_violation') bucket.okuViolations++;
      if (violation.type === 'double_park') bucket.doubleParkViolations++;
      if (violation.resolved) bucket.resolvedViolations++;
    }
    return [...map.values()];
  }

  private dayBucketKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private logDate(value: any): Date | null {
    if (!value) return null;
    const date = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isToday(date: Date | null): boolean {
    if (!date) return false;
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  }

  generateReport(type: string) {
    const validTypes = ['occupancy', 'timing', 'revenue', 'violations', 'all'];
    if (!validTypes.includes(type)) return;

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const reports = type === 'all'
      ? ['occupancy', 'timing', 'revenue', 'violations']
      : [type];

    reports.forEach((report, index) => {
      if (index > 0) pdf.addPage();
      if (report === 'occupancy') this.addOccupancyReport(pdf);
      if (report === 'timing') this.addTimingReport(pdf);
      if (report === 'revenue') this.addRevenueReport(pdf);
      if (report === 'violations') this.addViolationsReport(pdf);
    });
    this.addPageFooters(pdf);

    const period = this.selectedPeriod === 'week' ? 'Weekly' : 'Monthly';
    const reportName = type === 'all' ? 'Complete_Analytics' : this.reportTitle(type).replace(/ /g, '_');
    const date = new Date().toISOString().slice(0, 10);
    pdf.save(`SmartPark_${period}_${reportName}_${date}.pdf`);
  }

  private addOccupancyReport(pdf: jsPDF) {
    let y = this.addReportHeader(pdf, 'Parking Occupancy Report', 'Live occupancy retrieved from the SmartPark occupancy database.');
    y = this.addChart(pdf, 'occupancy-report-chart', y);
    autoTable(pdf, {
      startY: y,
      head: [['Section', 'Capacity', 'Occupied', 'Available', 'Occupancy']],
      body: this.reportSections.map(section => [
        section.section, section.capacity, section.occupied, section.available, `${section.occupancyPercentage.toFixed(1)}%`
      ]),
      foot: [[
        'Total', this.liveData().totalSpots, this.liveData().carsParked,
        this.liveData().spotsAvailable,
        this.liveData().totalSpots ? `${((this.liveData().carsParked / this.liveData().totalSpots) * 100).toFixed(1)}%` : '0.0%'
      ]],
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 126] },
      footStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold' }
    });
  }

  private addTimingReport(pdf: jsPDF) {
    let y = this.addReportHeader(pdf, 'Vehicle Entry Timing Report', 'Live Firestore traffic compared with the hourly profile from the research dataset.');
    y = this.addChart(pdf, 'timing-report-chart', y);
    const profile = this.prediction()?.hourlyProfile ?? [];
    const busiestEntries = [...profile].sort((a, b) => b.averageEntries - a.averageEntries).slice(0, 5);
    autoTable(pdf, {
      startY: y,
      head: [['Rank', 'Time', 'Average Entries', 'Average Exits']],
      body: busiestEntries.map((point, index) => [index + 1, point.label, point.averageEntries, point.averageExits]),
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 126] }
    });

    const forecast = this.prediction();
    if (forecast) {
      const noteY = (pdf as any).lastAutoTable.finalY + 9;
      pdf.setFontSize(10);
      pdf.setTextColor(55);
      pdf.text(
        `Tomorrow: ${forecast.predictedEntries.toLocaleString()} predicted entries, ${forecast.predictedExits.toLocaleString()} predicted exits, ${forecast.demandLevel} demand.`,
        14, noteY
      );
      pdf.setFontSize(8.5);
      pdf.setTextColor(100);
      pdf.text(`Model: ${forecast.model}. Entry R2 ${(forecast.entryR2 * 100).toFixed(1)}%. Exit R2 ${(forecast.exitR2 * 100).toFixed(1)}%.`, 14, noteY + 6);
    }
  }

  private addRevenueReport(pdf: jsPDF) {
    let y = this.addReportHeader(pdf, 'Revenue Report', 'Revenue calculated from completed Firestore parking sessions and the configured tariff.');
    y = this.addChart(pdf, 'revenue-report-chart', y);
    const rows = this.reportBuckets.map(bucket => {
      const amount = bucket.logs.reduce(
        (sum, log) => sum + this.revenue.calculateSessionRevenue(log, this.reportPricing), 0
      );
      return [bucket.label, bucket.logs.length, bucket.logs.filter(log => Boolean(log.exit_time)).length, `RM ${amount.toFixed(2)}`];
    });
    const total = this.reportLogs.reduce(
      (sum, log) => sum + this.revenue.calculateSessionRevenue(log, this.reportPricing), 0
    );
    autoTable(pdf, {
      startY: y,
      head: [['Period', 'Sessions', 'Completed', 'Revenue']],
      body: rows,
      foot: [['Total', this.reportLogs.length, this.completedSessionCount(), `RM ${total.toFixed(2)}`]],
      theme: 'striped',
      headStyles: { fillColor: [26, 35, 126] },
      footStyles: { fillColor: [46, 125, 50], textColor: 255, fontStyle: 'bold' }
    });
    const noteY = (pdf as any).lastAutoTable.finalY + 8;
    pdf.setFontSize(8.5);
    pdf.setTextColor(100);
    pdf.text(`Tariff used: first ${this.reportPricing.free_hours} hour(s) free, RM ${this.reportPricing.hourly_rate.toFixed(2)} per billable hour.`, 14, noteY);
  }

  private addViolationsReport(pdf: jsPDF) {
    let y = this.addReportHeader(pdf, 'Violations Report', 'OKU and double-parking violation records retrieved from Firestore for the selected reporting period.');
    y = this.addChart(pdf, 'violations-report-chart', y);
    const violations = this.reportViolations;
    autoTable(pdf, {
      startY: y,
      head: [['Vehicle', 'Violation Time', 'Status', 'Parking Spot', 'OKU', 'Double Park']],
      body: violations.length ? violations.map(log => [
        log.car_plate || '-',
        this.logDate(log.timestamp)?.toLocaleString('en-MY') ?? '-',
        log.resolved ? 'Resolved' : (log.is_read ? 'Read' : 'Active'),
        log.spot_id || '-',
        log.type === 'oku_violation' ? 'Yes' : 'No',
        log.type === 'double_park' ? 'Yes' : 'No'
      ]) : [['No recorded violations', '-', '-', '-', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [198, 40, 40] }
    });
  }

  private addReportHeader(pdf: jsPDF, title: string, description: string): number {
    pdf.setFillColor(26, 35, 126);
    pdf.rect(0, 0, 210, 29, 'F');
    pdf.setTextColor(255);
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SmartPark APU', 14, 12);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Admin Analytics Report', 14, 20);
    pdf.setTextColor(26, 35, 126);
    pdf.setFontSize(17);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, 14, 42);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90);
    const period = this.selectedPeriod === 'week' ? 'This Week' : 'This Month';
    pdf.text(`Period: ${period} | Generated: ${new Date().toLocaleString('en-MY')}`, 14, 49);
    const lines = pdf.splitTextToSize(description, 180);
    pdf.text(lines, 14, 56);
    return 63 + (lines.length - 1) * 4;
  }

  private addChart(pdf: jsPDF, elementId: string, startY: number): number {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return startY;
    try {
      const image = canvas.toDataURL('image/png', 1);
      const width = 178;
      const height = Math.min(72, width * canvas.height / canvas.width);
      pdf.addImage(image, 'PNG', 16, startY, width, height, undefined, 'FAST');
      return startY + height + 7;
    } catch {
      return startY;
    }
  }

  private addPageFooters(pdf: jsPDF) {
    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page);
      pdf.setDrawColor(220);
      pdf.line(14, 286, 196, 286);
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text('SmartPark APU - Confidential administrative report', 14, 291);
      pdf.text(`Page ${page} of ${pageCount}`, 196, 291, { align: 'right' });
    }
  }

  private reportTitle(type: string): string {
    return {
      occupancy: 'Parking Occupancy',
      timing: 'Vehicle Entry Timing',
      revenue: 'Revenue',
      violations: 'Parking Violations'
    }[type] ?? 'Analytics';
  }
}
