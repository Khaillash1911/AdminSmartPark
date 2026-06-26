import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/guards/admin-auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginPage)
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/shell/shell').then(m => m.ShellPage),
    canActivate: [adminAuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardPage)
      },
      {
        path: 'parking-spots',
        loadComponent: () => import('./pages/parking-spots/parking-spots').then(m => m.ParkingSpotsPage)
      },
      {
        path: 'find-my-car-test',
        loadComponent: () => import('./pages/find-my-car-test/find-my-car-test').then(m => m.FindMyCarTestPage)
      },
      {
        path: 'view-data',
        loadComponent: () => import('./pages/view-data/view-data').then(m => m.ViewDataPage)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/notifications/notifications').then(m => m.NotificationsPage)
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsPage)
      }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
