import { HttpErrorResponse } from '@angular/common/http';

const GENERIC_ERROR = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

const STATUS_MESSAGES: Record<number, string> = {
  0: 'No se pudo conectar con el servidor. Revisa tu conexión.',
  400: 'Revisa los datos ingresados.',
  401: 'Correo o contraseña incorrectos.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'No se encontró el recurso solicitado.',
  409: 'El correo electrónico ya está registrado.',
  429: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
};

export function toUserMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return GENERIC_ERROR;
  }

  if (error.status === 400) {
    return extractValidationMessage(error.error) ?? STATUS_MESSAGES[400];
  }

  return STATUS_MESSAGES[error.status] ?? GENERIC_ERROR;
}

function extractValidationMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return null;
  }

  const message = (body as { message: unknown }).message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0];
  }
  return null;
}
