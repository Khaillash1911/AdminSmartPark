import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/guards/admin-auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: 'login',
    title: 'SmartPark Admin-Login',
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
        title: 'SmartPark Admin-Dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.DashboardPage)
      },
      {
        path: 'parking-spots',
        title: 'SmartPark Admin-Parking Layout',
        loadComponent: () => import('./pages/parking-spots/parking-spots').then(m => m.ParkingSpotsPage)
      },
      {
        path: 'find-my-car-test',
        title: 'SmartPark Admin-Find My Car',
        loadComponent: () => import('./pages/find-my-car-test/find-my-car-test').then(m => m.FindMyCarTestPage)
      },
      {
        path: 'view-data',
        title: 'SmartPark Admin-User Management',
        loadComponent: () => import('./pages/view-data/view-data').then(m => m.ViewDataPage)
      },
      {
        path: 'notifications',
        title: 'SmartPark Admin-Violations',
        loadComponent: () => import('./pages/notifications/notifications').then(m => m.NotificationsPage)
      },
      {
        path: 'settings',
        title: 'SmartPark Admin-Settings',
        loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsPage)
      }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
