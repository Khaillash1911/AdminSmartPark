import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <div class="logo">
            <mat-icon color="primary" class="logo-icon">local_parking</mat-icon>
          </div>
          <mat-card-title>SmartPark APU Admin</mat-card-title>
          <mat-card-subtitle>Official Administrator Panel</mat-card-subtitle>
        </mat-card-header>
        
        <mat-card-content>
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email Address</mat-label>
              <input matInput type="email" formControlName="email" required>
              <mat-icon matSuffix>email</mat-icon>
              <mat-error *ngIf="loginForm.get('email')?.hasError('required')">Email is required</mat-error>
              <mat-error *ngIf="loginForm.get('email')?.hasError('email')">Invalid email format</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" required>
              <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" type="button">
                <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              <mat-error *ngIf="loginForm.get('password')?.hasError('required')">Password is required</mat-error>
            </mat-form-field>

            <div class="actions-row">
              <a href="javascript:void(0)" (click)="forgotPassword()">Forgot Password?</a>
            </div>

            <div *ngIf="errorMessage" class="error-box">
              {{ errorMessage }}
            </div>

            <div *ngIf="successMessage" class="success-box">
              {{ successMessage }}
            </div>

            <button mat-raised-button color="primary" type="submit" class="full-width login-button" [disabled]="loginForm.invalid || isLoading">
              <mat-spinner diameter="20" *ngIf="isLoading"></mat-spinner>
              <span *ngIf="!isLoading">Login</span>
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, var(--primary-dark-blue) 0%, var(--accent-blue) 100%);
    }
    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    }
    mat-card-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
      text-align: center;
    }
    .logo {
      background-color: rgba(26, 35, 126, 0.1);
      padding: 16px;
      border-radius: 50%;
      margin-bottom: 12px;
    }
    .logo-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: var(--primary-dark-blue);
    }
    mat-card-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--primary-dark-blue);
      margin-bottom: 4px;
    }
    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }
    .actions-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .actions-row a {
      color: var(--accent-blue);
      text-decoration: none;
      font-size: 14px;
    }
    .actions-row a:hover {
      text-decoration: underline;
    }
    .login-button {
      padding: 8px 0;
      font-size: 16px;
      background-color: var(--primary-dark-blue);
    }
    .error-box {
      background-color: #ffebee;
      color: var(--danger-red);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 14px;
      text-align: center;
    }
    .success-box {
      background-color: #e8f5e9;
      color: var(--success-green);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 14px;
      text-align: center;
    }
  `]
})
export class LoginPage {
  loginForm: FormGroup;
  hidePassword = true;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AdminAuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    const { email, password } = this.loginForm.value;

    try {
      await this.authService.adminLogin(email, password);
      this.router.navigate(['/admin/dashboard']);
    } catch (error: any) {
      if (error.message.includes('NOT_AN_ADMIN')) {
        this.errorMessage = 'Access denied. You do not have administrator privileges.';
      } else {
        this.errorMessage = error.message || 'Login failed. Please check your credentials.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async forgotPassword() {
    const email = this.loginForm.get('email')?.value;
    if (!email || this.loginForm.get('email')?.invalid) {
      this.errorMessage = 'Please enter a valid email address first to reset your password.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.authService.resetPassword(email);
      this.successMessage = 'Password reset email sent. Please check your inbox.';
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to send reset email.';
    } finally {
      this.isLoading = false;
    }
  }
}
