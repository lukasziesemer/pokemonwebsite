'use client';

/**
 * Admin: Spieler-Verwaltung
 * CRUD für Spieler mit Avatar-Upload
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { AVATAR_OPTIONS, getAvatarUrl } from '@/lib/avatars';
import AvatarCropModal from '@/components/AvatarCropModal';
import { CropArea } from '@/lib/image-processing';

interface Player {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
  createdAt: string;
  _count?: {
    encounters: number;
  };
}

interface UploadedAvatar {
  filename: string;
  url: string;
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', color: '#FF0000', avatar: 'none' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [uploadedAvatars, setUploadedAvatars] = useState<UploadedAvatar[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageForCrop, setSelectedImageForCrop] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Spieler laden
  const loadPlayers = useCallback(
    () =>
      fetch('/api/admin/players')
        .then((res) => res.json())
        .then((data) => {
          setPlayers(data);
        })
        .catch((err) => {
          console.error('Error loading players:', err);
        })
        .finally(() => {
          setLoading(false);
        }),
    [],
  );

  // Hochgeladene Avatare laden
  const loadUploadedAvatars = useCallback(
    () =>
      fetch('/api/admin/avatars/upload')
        .then((res) => res.json())
        .then((data) => {
          if (data.data?.avatars) {
            setUploadedAvatars(data.data.avatars);
          }
        })
        .catch((err) => {
          console.error('Error loading uploaded avatars:', err);
        }),
    [],
  );

  // Avatar hochladen - öffnet Crop-Modal
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validierung: 5MB Max
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setError('Datei zu groß. Maximum: 5MB');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Bild als Data URL einlesen für Crop-Preview
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageForCrop(reader.result as string);
      setSelectedFile(file);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  };

  // Crop abgeschlossen - Upload mit Crop-Koordinaten
  const handleCropComplete = async (cropArea: CropArea) => {
    if (!selectedFile) return;

    setUploading(true);
    setError('');

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('avatar', selectedFile);
      formDataUpload.append('crop', JSON.stringify(cropArea));

      const res = await fetch('/api/admin/avatars/upload', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await res.json();

      if (res.ok && data.data?.url) {
        // Neuen Avatar zur Liste hinzufügen und auswählen
        const newAvatar = { filename: data.data.filename, url: data.data.url };
        setUploadedAvatars(prev => [...prev, newAvatar]);
        setFormData(prev => ({ ...prev, avatar: data.data.url }));

        // Modal schließen
        setCropModalOpen(false);
        setSelectedImageForCrop(null);
        setSelectedFile(null);
      } else {
        setError(data.error || 'Fehler beim Hochladen');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Netzwerkfehler beim Hochladen');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Crop abbrechen
  const handleCropCancel = () => {
    setCropModalOpen(false);
    setSelectedImageForCrop(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Hochgeladenen Avatar löschen
  const handleDeleteUploadedAvatar = async (filename: string, url: string) => {
    if (!confirm('Avatar wirklich löschen?')) return;

    try {
      const res = await fetch(`/api/admin/avatars/${filename}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setUploadedAvatars(prev => prev.filter(a => a.filename !== filename));
        // Falls der gelöschte Avatar ausgewählt war, zurücksetzen
        if (formData.avatar === url) {
          setFormData(prev => ({ ...prev, avatar: 'none' }));
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  useEffect(() => {
    // Spieler und Avatare initial laden
    loadPlayers();
    loadUploadedAvatars();
  }, [loadPlayers, loadUploadedAvatars]);

  // Spieler erstellen/aktualisieren
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const url = editingId
        ? `/api/admin/players/${editingId}`
        : '/api/admin/players';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        await loadPlayers();
        setFormData({ name: '', color: '#FF0000', avatar: 'none' });
        setEditingId(null);
      } else {
        setError(data.error || 'Fehler beim Speichern');
      }
    } catch (error) {
      console.error('Error saving player:', error);
      setError('Netzwerkfehler');
    }
  };

  // Spieler löschen
  const handleDelete = async (id: number) => {
    if (!confirm('Spieler wirklich löschen? Alle Encounters und Team-Einträge werden ebenfalls gelöscht.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/players/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await loadPlayers();
      } else {
        alert('Fehler beim Löschen');
      }
    } catch (error) {
      console.error('Error deleting player:', error);
      alert('Netzwerkfehler');
    }
  };

  // Bearbeiten starten
  const startEdit = (player: Player) => {
    setFormData({ name: player.name, color: player.color, avatar: player.avatar || 'none' });
    setEditingId(player.id);
    setError('');
  };

  // Bearbeiten abbrechen
  const cancelEdit = () => {
    setFormData({ name: '', color: '#FF0000', avatar: 'none' });
    setEditingId(null);
    setError('');
  };

  return (
    <main className="admin-page">
      <h1 className="text-4xl font-bold text-[var(--foreground)]">
        Spieler verwalten
      </h1>

      {/* Formular */}
      <section className="app-section p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">
          {editingId ? 'Spieler bearbeiten' : 'Neuer Spieler'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 text-red-400 p-3 rounded-md border border-red-500/30">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--background-secondary)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Farbe
            </label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={formData.color}
                onChange={(e) =>
                  setFormData({ ...formData, color: e.target.value })
                }
                className="h-10 w-20 cursor-pointer rounded-md"
              />
              <span className="text-sm text-[var(--text-secondary)]">{formData.color}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Avatar
            </label>

            {/* Vordefinierte Avatare */}
            <p className="text-xs text-[var(--text-tertiary)] mb-2">Vordefinierte Avatare:</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  onClick={() => setFormData({ ...formData, avatar: avatar.key })}
                  className={`relative w-14 h-14 rounded-lg border-2 transition flex items-center justify-center ${
                    formData.avatar === avatar.key
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'
                  }`}
                  title={avatar.label}
                >
                  {avatar.url ? (
                    <Image
                      src={avatar.url}
                      alt={avatar.label}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-xs">Ohne</span>
                  )}
                  {formData.avatar === avatar.key && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Hochgeladene Avatare */}
            {uploadedAvatars.length > 0 && (
              <>
                <p className="text-xs text-[var(--text-tertiary)] mb-2">Eigene Avatare:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {uploadedAvatars.map((avatar) => (
                    <div key={avatar.filename} className="relative group">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, avatar: avatar.url })}
                        className={`relative w-14 h-14 rounded-lg border-2 transition flex items-center justify-center overflow-hidden ${
                          formData.avatar === avatar.url
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-[var(--border-default)] hover:border-[var(--border-hover)]'
                        }`}
                      >
                        <Image
                          src={avatar.url}
                          alt="Eigener Avatar"
                          width={48}
                          height={48}
                          className="object-cover"
                          unoptimized
                        />
                        {formData.avatar === avatar.url && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                      {/* Löschen-Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteUploadedAvatar(avatar.filename, avatar.url)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Avatar löschen"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Upload-Button */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
                id="avatar-upload"
              />
              <label
                htmlFor="avatar-upload"
                className={`px-4 py-2 rounded-md cursor-pointer transition ${
                  uploading
                    ? 'bg-[var(--background-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
                    : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                }`}
              >
                {uploading ? 'Lädt…' : 'Eigenen Avatar hochladen'}
              </label>
              <span className="text-xs text-[var(--text-tertiary)]">
                PNG, JPG, GIF oder WebP (max. 5MB)
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-md transition"
            >
              {editingId ? 'Aktualisieren' : 'Erstellen'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="px-4 py-2 bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)] border border-[var(--border-default)] rounded-md transition"
              >
                Abbrechen
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Liste */}
      <section className="app-section overflow-hidden p-5 sm:p-6">
        <h2 className="text-2xl font-bold mb-4 text-[var(--foreground)]">Spieler-Liste</h2>

        {loading ? (
          <p className="text-[var(--text-tertiary)]">Lädt...</p>
        ) : players.length === 0 ? (
          <p className="text-[var(--text-tertiary)]">Noch keine Spieler vorhanden</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">Spieler</th>
                  <th className="text-left py-2 px-4 text-[var(--text-secondary)]">Farbe</th>
                  <th className="text-center py-2 px-4 text-[var(--text-secondary)]">Encounters</th>
                  <th className="text-right py-2 px-4 text-[var(--text-secondary)]">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const avatarUrl = getAvatarUrl(player.avatar);
                  return (
                  <tr key={player.id} className="border-b border-[var(--border-default)] hover:bg-[var(--background-secondary)]">
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-3">
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt={player.name}
                            width={32}
                            height={32}
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full border-2"
                            style={{ backgroundColor: player.color }}
                          />
                        )}
                        <span className="font-medium text-[var(--foreground)]">{player.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full border"
                          style={{ backgroundColor: player.color }}
                        />
                        <span className="text-sm text-[var(--text-secondary)]">
                          {player.color}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-4 text-center text-[var(--foreground)]">
                      {player._count?.encounters || 0}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => startEdit(player)}
                        className="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30 rounded-md transition mr-2"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(player.id)}
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-md transition"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Crop-Modal */}
      {cropModalOpen && selectedImageForCrop && (
        <AvatarCropModal
          imageSrc={selectedImageForCrop}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </main>
  );
}
