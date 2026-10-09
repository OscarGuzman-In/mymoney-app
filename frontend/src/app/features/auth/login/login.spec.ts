import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { SafeUser } from '../../../core/models/user.model';
import { Login } from './login';

const USER: SafeUser = {
  id: 'user-1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let login: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  function create(): void {
    localStorage.clear();
    login = vi.fn();

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthSessionService, useValue: { login } },
      ],
    });

    fixture = TestBed.createComponent(Login);
    navigateByUrl = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    fixture.detectChanges();
  }

  it('shows required errors and does not submit an empty form', () => {
    create();

    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('El correo es obligatorio');
    expect(text).toContain('La contraseña es obligatoria');
    expect(login).not.toHaveBeenCalled();
  });

  it('validates the email format', () => {
    create();

    fixture.componentInstance.form.controls.email.setValue('not-an-email');
    fixture.componentInstance.form.controls.email.markAsTouched();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Ingresa un correo válido',
    );
    expect(login).not.toHaveBeenCalled();
  });

  it('authenticates and redirects on success', () => {
    create();
    login.mockReturnValue(of(USER));

    fixture.componentInstance.form.setValue({
      email: 'ana@example.com',
      password: 'Password123',
    });
    fixture.componentInstance.onSubmit();

    expect(login).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'Password123',
    });
    expect(navigateByUrl).toHaveBeenCalledWith('/app');
  });

  it('shows a friendly message when credentials are rejected', () => {
    create();
    login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }),
      ),
    );

    fixture.componentInstance.form.setValue({
      email: 'ana@example.com',
      password: 'wrong',
    });
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Correo o contraseña incorrectos',
    );
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
