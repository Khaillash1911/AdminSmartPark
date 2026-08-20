import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant = 'dashboard' | 'parking' | 'search' | 'table' | 'settings';

@Component({
  selector: 'app-page-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-page" role="status" aria-live="polite" aria-label="Loading page content">
      <div class="skeleton-header">
        <div>
          <span class="shimmer title"></span>
          <span class="shimmer subtitle"></span>
        </div>
        <span class="shimmer action"></span>
      </div>

      <ng-container [ngSwitch]="variant">
        <ng-container *ngSwitchCase="'dashboard'">
          <div class="metric-grid">
            <div class="skeleton-card metric" *ngFor="let item of five">
              <span class="shimmer icon"></span><span class="shimmer value"></span><span class="shimmer label"></span>
            </div>
          </div>
          <div class="chart-grid">
            <div class="skeleton-card chart" *ngFor="let item of six">
              <span class="shimmer card-title"></span><span class="shimmer chart-area"></span>
            </div>
          </div>
        </ng-container>

        <ng-container *ngSwitchCase="'parking'">
          <div class="metric-grid compact">
            <div class="skeleton-card mini" *ngFor="let item of six"><span class="shimmer value"></span><span class="shimmer label"></span></div>
          </div>
          <div class="skeleton-card parking-map"><span class="shimmer map-area"></span></div>
        </ng-container>

        <ng-container *ngSwitchCase="'search'">
          <div class="skeleton-card search-card">
            <span class="shimmer input"></span><span class="shimmer search-button"></span>
          </div>
          <div class="skeleton-card result-placeholder"><span class="shimmer wide"></span><span class="shimmer medium"></span></div>
        </ng-container>

        <ng-container *ngSwitchCase="'settings'">
          <div class="settings-grid">
            <div class="skeleton-card form-card" *ngFor="let item of two">
              <span class="shimmer card-title"></span><span class="shimmer input" *ngFor="let row of three"></span>
            </div>
          </div>
        </ng-container>

        <ng-container *ngSwitchDefault>
          <div class="skeleton-card table-card">
            <span class="shimmer table-search"></span>
            <div class="table-row" *ngFor="let row of seven">
              <span class="shimmer cell" *ngFor="let cell of six"></span>
            </div>
          </div>
        </ng-container>
      </ng-container>
      <span class="sr-only">Loading…</span>
    </div>
  `,
  styles: [`
    :host { display: block; position: fixed; inset: 64px 0 0 250px; z-index: 50; overflow: auto; background: var(--bg-color); opacity: 0; pointer-events: none; animation: skeleton-reveal .12s ease 280ms forwards; }
    .skeleton-page { padding: 24px 24px 48px; min-height: 100%; }
    .skeleton-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 26px; }
    .skeleton-header > div { flex: 1; }
    .shimmer { display: block; border-radius: 8px; background: linear-gradient(90deg,#e5e9ef 25%,#f5f7fa 40%,#e5e9ef 65%); background-size: 400% 100%; animation: shimmer 1.35s ease-in-out infinite; }
    .title { width: min(360px, 70%); height: 34px; }
    .subtitle { width: min(480px, 85%); height: 16px; margin-top: 12px; }
    .action { width: 150px; height: 42px; }
    .skeleton-card { background: #fff; border-radius: 14px; box-shadow: 0 4px 18px rgba(31,45,61,.06); }
    .metric-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 18px; margin-bottom: 24px; }
    .metric-grid.compact { grid-template-columns: repeat(6,minmax(0,1fr)); }
    .metric { padding: 22px; min-height: 138px; }
    .mini { padding: 18px; min-height: 92px; }
    .icon { width: 38px; height: 38px; border-radius: 50%; margin-bottom: 16px; }
    .value { width: 58%; height: 27px; margin-bottom: 11px; }
    .label { width: 82%; height: 13px; }
    .chart-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 22px; }
    .chart { padding: 22px; min-height: 330px; }
    .card-title { width: 58%; height: 21px; margin-bottom: 28px; }
    .chart-area { height: 220px; border-radius: 12px; }
    .parking-map { padding: 24px; min-height: 610px; }
    .map-area { height: 560px; border-radius: 16px; }
    .search-card { padding: 34px; display: grid; grid-template-columns: 1fr 170px; gap: 20px; margin-top: 70px; }
    .input, .search-button { height: 58px; }
    .result-placeholder { padding: 30px; margin-top: 22px; }
    .wide { width: 100%; height: 22px; margin-bottom: 18px; }.medium { width: 65%; height: 18px; }
    .settings-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; }
    .form-card { padding: 26px; }.form-card .input { margin-top: 18px; }
    .table-card { padding: 22px; }.table-search { width: min(420px,60%); height: 52px; margin-bottom: 24px; }
    .table-row { display: grid; grid-template-columns: repeat(6,minmax(80px,1fr)); gap: 18px; padding: 17px 4px; border-top: 1px solid #edf0f4; }
    .cell { height: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
    @keyframes skeleton-reveal { to { opacity: 1; pointer-events: auto; } }
    @media (max-width: 900px) { :host { left: 0; top: 56px; }.metric-grid,.metric-grid.compact { grid-template-columns: repeat(2,1fr); }.chart-grid { grid-template-columns: 1fr; } }
    @media (max-width: 650px) { .skeleton-page { padding: 22px 16px; }.action { display:none; }.metric-grid,.metric-grid.compact,.settings-grid { grid-template-columns:1fr; }.search-card { grid-template-columns:1fr; margin-top:20px; }.table-row { grid-template-columns:repeat(3,1fr); }.table-row .cell:nth-child(n+4){display:none;} }
    @media (prefers-reduced-motion: reduce) { :host { animation-duration: 0s; }.shimmer { animation: none; } }
  `]
})
export class PageSkeletonComponent {
  @Input() variant: SkeletonVariant = 'table';
  readonly two = Array(2);
  readonly three = Array(3);
  readonly five = Array(5);
  readonly six = Array(6);
  readonly seven = Array(7);
}
