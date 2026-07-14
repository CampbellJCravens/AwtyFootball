import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { Player, updatePlayer, UpdatePlayerData } from '../api/players';
import ImagePositioner from './ImagePositioner';

interface EditPlayerModalProps {
  player: Player | null;
  onClose: () => void;
  onSuccess: () => void;
  isAdmin?: boolean;
}

export default function EditPlayerModal({ player, onClose, onSuccess, isAdmin = false }: EditPlayerModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 50, y: 50 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (player) {
      setName(player.name);
      setPhone(player.phone ?? '');
      setPicturePreview(player.pictureUrl);
      setPictureFile(null);
      setImagePosition({ x: 50, y: 50 }); // Reset position
    }
  }, [player]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPictureFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
        setImagePosition({ x: 50, y: 50 }); // Reset position for new image
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePositionChange = (x: number, y: number) => {
    setImagePosition({ x, y });
  };

  const applyImagePosition = async (file: File, x: number, y: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const outputSize = 400;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const minDimension = Math.min(img.width, img.height);
        const offsetPercentX = (x - 50) / 50;
        const offsetPercentY = (y - 50) / 50;
        const sourceSize = minDimension;
        const maxOffsetX = Math.max(0, (img.width - sourceSize) / 2);
        const maxOffsetY = Math.max(0, (img.height - sourceSize) / 2);
        const sx = (img.width - sourceSize) / 2 + (offsetPercentX * maxOffsetX);
        const sy = (img.height - sourceSize) / 2 + (offsetPercentY * maxOffsetY);
        const clampedSx = Math.max(0, Math.min(img.width - sourceSize, sx));
        const clampedSy = Math.max(0, Math.min(img.height - sourceSize, sy));

        ctx.drawImage(
          img,
          clampedSx, clampedSy, sourceSize, sourceSize,
          0, 0, outputSize, outputSize
        );

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!player) return;

    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const data: UpdatePlayerData = {
        name: name.trim(),
      };

      // Phone is an admin-only field (WhatsApp RSVP mapping).
      if (isAdmin) data.phone = phone.trim();

      if (pictureFile) {
        const base64 = await applyImagePosition(pictureFile, imagePosition.x, imagePosition.y);
        data.pictureUrl = base64;
      } else if (picturePreview && picturePreview !== player.pictureUrl) {
        // If preview changed but no new file (positioning existing image)
        // For now, we only apply positioning to new files
      }

      await updatePlayer(player.id, data);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update player');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!player) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full p-6 border border-border">
        <h2 className="text-2xl font-semibold text-text-primary mb-4">Edit Player</h2>

        {error && (
          <div className="mb-4 p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="edit-name" className="block text-sm font-medium text-text-secondary mb-2">
              Name
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
              placeholder="Enter player name"
              disabled={isSubmitting}
            />
          </div>

          {isAdmin && (
            <div className="mb-4">
              <label htmlFor="edit-phone" className="block text-sm font-medium text-text-secondary mb-2">
                WhatsApp number <span className="text-text-tertiary font-normal">(admin only)</span>
              </label>
              <input
                id="edit-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
                placeholder="e.g. +1 832 867 3433"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-text-tertiary">
                Links this player to their WhatsApp poll votes. Include the country code.
              </p>
            </div>
          )}

          <div className="mb-6">
            <label htmlFor="edit-picture-input" className="block text-sm font-medium text-text-secondary mb-2">
              Picture
            </label>
            <input
              id="edit-picture-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent-muted file:text-accent hover:file:bg-accent-subtle"
              disabled={isSubmitting}
            />
            {picturePreview && (
              <div className="mt-4">
                <ImagePositioner
                  imageSrc={picturePreview}
                  size={200}
                  onPositionChange={handlePositionChange}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-border-emphasis text-text-secondary rounded-xl font-medium hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-accent text-text-on-accent px-4 py-2 rounded-xl font-medium hover:bg-accent-hover active:bg-accent-active disabled:bg-surface-active disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
