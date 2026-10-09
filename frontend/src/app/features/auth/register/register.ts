import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { toUserMessage } from '../../../core/http/api-error.util';
import { maxBytes } from '../../../core/validators/max-bytes.validator';
import { AuthCard } from '../../../shared/ui/auth-card/auth-card';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly formBuilder = inject(FormBuilder);
  private readonly session = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    first_name: ['', [Validators.maxLength(100)]],
    last_name: ['', [Validators.maxLength(100)]],
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(255)],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(72),
        maxBytes(72),
      ],
    ],
  });

  get firstName() {
    return this.form.controls.first_name;
  }

  get lastName() {
    return this.form.controls.last_name;
  }

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  onSubmit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.submitting.set(true);
    const { email, password, first_name, last_name } = this.form.getRawValue();

    this.session
      .register({
        email,
        password,
        first_name: first_name.trim() || undefined,
        last_name: last_name.trim() || undefined,
      })
      .pipe(switchMap(() => this.session.login({ email, password })))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
        error: (error: unknown) => {
          this.submitting.set(false);
          this.errorMessage.set(toUserMessage(error));
        },
      });
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      return returnUrl;
    }
    return '/app';
  }
}
