/**
 * Admin API: Einzelner GameSave
 * DELETE /api/admin/gamesaves/[id] - Spielstand löschen
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { isAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const { id } = await params;
    const gameSaveId = parseInt(id);

    if (isNaN(gameSaveId)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
    }

    await prisma.gameSave.delete({
      where: { id: gameSaveId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting game save:', error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return NextResponse.json(
        { error: 'Spielstand nicht gefunden' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Spielstands' },
      { status: 500 }
    );
  }
}

