import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { SafeUser } from '../../../core/models/user.model';
import { Register } from './register';

const USER: SafeUser = {
  id: 'user-1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'Gómez',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Register', () => {
  let fixture: ComponentFixture<Register>;
  let register: ReturnType<typeof vi.fn>;
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  function create(): void {
    localStorage.clear();
    register = vi.fn();
    login = vi.fn();

    TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: { register, login } },
      ],
    });

    fixture = TestBed.createComponent(Register);
    navigateByUrl = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    fixture.detectChanges();
  }

  it('requires an email and a password of at least 8 characters', () => {
    create();

    fixture.componentInstance.form.controls.email.setValue('ana@example.com');
    fixture.componentInstance.form.controls.password.setValue('short');
    fixture.componentInstance.form.controls.password.markAsTouched();
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'al menos 8 caracteres',
    );
    expect(register).not.toHaveBeenCalled();
  });

  it('registers, logs in and redirects on success', () => {
    create();
    register.mockReturnValue(of(USER));
    login.mockReturnValue(of(USER));

    fixture.componentInstance.form.setValue({
      first_name: 'Ana',
      last_name: 'Gómez',
      email: 'ana@example.com',
      password: 'Password123',
    });
    fixture.componentInstance.onSubmit();

    expect(register).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'Password123',
      first_name: 'Ana',
      last_name: 'Gómez',
    });
    expect(login).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'Password123',
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/app');
  });

  it('shows a friendly message when the email is already registered', () => {
    create();
    register.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, statusText: 'Conflict' }),
      ),
    );

    fixture.componentInstance.form.setValue({
      first_name: '',
      last_name: '',
      email: 'ana@example.com',
      password: 'Password123',
    });
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'El correo electrónico ya está registrado',
    );
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(login).not.toHaveBeenCalled();
  });
});
