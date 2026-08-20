import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { LucideAngularModule, LayoutDashboard, Users, Bell, Settings, LogOut, TrendingUp, Car, MapPin, AlertTriangle, DollarSign, FileText, ChevronDown, Search, Filter, Download, Eye, Flag, X, Check, RefreshCw, Shield, UserPlus, Trash2, Edit, BarChart2, PieChart, Activity, Clock, Calendar } from 'lucide-angular';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { environment } from '../environments/environment';
import { firebaseAuthInterceptor } from './core/interceptors/firebase-auth.interceptor';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([firebaseAuthInterceptor])),
    provideCharts(withDefaultRegisterables()),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, Users, Bell, Settings, LogOut, TrendingUp, Car, MapPin,
        AlertTriangle, DollarSign, FileText, ChevronDown, Search, Filter, Download,
        Eye, Flag, X, Check, RefreshCw, Shield, UserPlus, Trash2, Edit,
        BarChart2, PieChart, Activity, Clock, Calendar
      })
    )
  ],
};
