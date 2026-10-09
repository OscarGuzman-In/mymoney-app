import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { UsersApiService } from '../../core/api/users-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { toUserMessage } from '../../core/http/api-error.util';
import { formatDate } from '../../core/util/date.util';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, PageHeader],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile {
  private readonly api = inject(UsersApiService);
  private readonly session = inject(AuthSessionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.session.user;
  readonly formatDate = formatDate;

  readonly savingProfile = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly profileSuccess = signal<string | null>(null);

  readonly savingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal<string | null>(null);

  readonly profileForm = this.formBuilder.nonNullable.group({
    first_name: ['', [Validators.maxLength(100)]],
    last_name: ['', [Validators.maxLength(100)]],
  });

  readonly passwordForm = this.formBuilder.nonNullable.group({
    current_password: ['', [Validators.required, Validators.maxLength(72)]],
    new_password: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    ],
  });

  constructor() {
    const current = this.session.user();
    this.profileForm.patchValue({
      first_name: current?.first_name ?? '',
      last_name: current?.last_name ?? '',
    });
  }

  get currentPassword() {
    return this.passwordForm.controls.current_password;
  }

  get newPassword() {
    return this.passwordForm.controls.new_password;
  }

  submitProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const value = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    this.api
      .updateProfile({
        first_name: value.first_name || undefined,
        last_name: value.last_name || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingProfile.set(false)),
      )
      .subscribe({
        next: () => {
          this.session.refreshUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
          this.profileSuccess.set('Datos actualizados correctamente.');
        },
        error: (error: unknown) =>
          this.profileError.set(toUserMessage(error)),
      });
  }

  submitPassword(): void {
    if (this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const value = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(null);
    this.api
      .changePassword({
        current_password: value.current_password,
        new_password: value.new_password,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingPassword.set(false)),
      )
      .subscribe({
        next: () => {
          this.passwordForm.reset({
            current_password: '',
            new_password: '',
          });
          this.passwordSuccess.set(
            'Contraseña actualizada. Tus otras sesiones se cerraron.',
          );
        },
        error: (error: unknown) =>
          this.passwordError.set(toUserMessage(error)),
      });
  }
}
