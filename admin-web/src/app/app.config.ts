import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { LucideAngularModule, LayoutDashboard, Users, Bell, Settings, LogOut, TrendingUp, Car, MapPin, AlertTriangle, DollarSign, FileText, ChevronDown, Search, Filter, Download, Eye, Flag, X, Check, RefreshCw, Shield, UserPlus, Trash2, Edit, BarChart2, PieChart, Activity, Clock, Calendar } from 'lucide-angular';

const firebaseConfig = {
  apiKey: "AIzaSyCMtCx40TKngsmqLarmcU9ALpeJcT6AUNU",
  authDomain: "smartpark-ai-web.firebaseapp.com",
  projectId: "smartpark-ai-web",
  storageBucket: "smartpark-ai-web.firebasestorage.app",
  messagingSenderId: "739677481588",
  appId: "1:739677481588:web:f1677205d1ed593248ff21",
  measurementId: "G-C3YZEJ5NL4"
};
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
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
