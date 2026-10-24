/**
 * Gemeinsame API-Utilities für Route Handlers
 * Reduziert Code-Duplikation und vereinheitlicht Error-Handling
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { isAdmin } from './auth';

/**
 * API Response Types
 */
export interface ApiError {
  error: string;
}

export interface ApiSuccess<T = unknown> {
  data?: T;
  success?: boolean;
}

/**
 * Wrapper für Admin-geschützte API-Handler
 * Führt automatisch Auth-Check durch
 */
export async function withAdminAuth<T>(
  handler: () => Promise<NextResponse<T | ApiError>>
): Promise<NextResponse<T | ApiError>> {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }
  return handler();
}

/**
 * Wrapper für API-Handler mit automatischem Error-Handling
 */
export async function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T | ApiError>>,
  errorContext: string
): Promise<NextResponse<T | ApiError>> {
  try {
    return await handler();
  } catch (error) {
    console.error(`Error in ${errorContext}:`, error);
    return handlePrismaError(error, errorContext);
  }
}

/**
 * Kombinierter Wrapper für Admin-geschützte Handler mit Error-Handling
 */
export async function withAdminAuthAndErrorHandling<T>(
  handler: () => Promise<NextResponse<T | ApiError>>,
  errorContext: string
): Promise<NextResponse<T | ApiError>> {
  return withErrorHandling(
    async () => withAdminAuth(handler),
    errorContext
  );
}

/**
 * Behandelt Prisma-Fehler und gibt entsprechende HTTP-Responses zurück
 */
export function handlePrismaError(
  error: unknown,
  context: string
): NextResponse<ApiError> {
  // Prisma-spezifische Fehler behandeln
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        return NextResponse.json(
          { error: 'Ein Datensatz mit diesen Werten existiert bereits' },
          { status: 409 }
        );
      case 'P2003':
        // Foreign key constraint violation
        return NextResponse.json(
          { error: 'Ungültige Referenz-ID' },
          { status: 400 }
        );
      case 'P2025':
        // Record not found
        return NextResponse.json(
          { error: 'Datensatz nicht gefunden' },
          { status: 404 }
        );
      default:
        console.error(`Unbekannter Prisma-Fehler (${error.code}):`, error);
        return NextResponse.json(
          { error: `Datenbankfehler: ${error.message}` },
          { status: 500 }
        );
    }
  }

  // Generische Fehler
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
  return NextResponse.json(
    { error: `Fehler in ${context}: ${message}` },
    { status: 500 }
  );
}

/**
 * Validiert und parsed eine ID aus Route-Parametern
 */
export function parseId(id: string | undefined, fieldName = 'ID'): number {
  if (!id) {
    throw new Error(`${fieldName} ist erforderlich`);
  }
  
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId)) {
    throw new Error(`Ungültige ${fieldName}`);
  }
  
  return parsedId;
}

/**
 * Validiert, dass alle erforderlichen Felder vorhanden sind
 */
export function validateRequired(
  data: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(field => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Folgende Felder sind erforderlich: ${missing.join(', ')}`);
  }
}

/**
 * Erstellt eine Bad Request Response
 */
export function badRequest(message: string): NextResponse<ApiError> {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Erstellt eine Created Response
 */
export function created<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: 201 });
}

/**
 * Erstellt eine Success Response
 */
export function success<T>(data?: T): NextResponse<ApiSuccess<T>> {
  if (data !== undefined) {
    return NextResponse.json({ data, success: true });
  }
  return NextResponse.json({ success: true });
}

/**
 * Erstellt eine NotFound Response
 */
export function notFound(message = 'Nicht gefunden'): NextResponse<ApiError> {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Erstellt eine Conflict Response
 */
export function conflict(message: string): NextResponse<ApiError> {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * Erstellt eine Internal Server Error Response
 */
export function internalError(
  message = 'Interner Serverfehler'
): NextResponse<ApiError> {
  return NextResponse.json({ error: message }, { status: 500 });
}

