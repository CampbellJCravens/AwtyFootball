import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { Player, updatePlayer, fileToBase64, UpdatePlayerData } from '../api/players';
import ImagePositioner from './ImagePositioner';

interface EditPlayerModalProps {
  player: Player | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditPlayerModal({ player, onClose, onSuccess }: EditPlayerModalProps) {
  const [name, setName] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 50, y: 50 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (player) {
      setName(player.name);
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
        // Use a reasonable size for the output (e.g., 400x400 for good quality)
        const outputSize = 400;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate the crop area
        // We want to crop a square from the image based on the position
        const minDimension = Math.min(img.width, img.height);
        const scale = minDimension / outputSize;
        
        // Position is in percentage (0-100), where 50 is center
        // Convert to offset from center
        const offsetPercentX = (x - 50) / 50; // -1 to 1
        const offsetPercentY = (y - 50) / 50; // -1 to 1
        
        // Calculate source coordinates
        // Center the crop, then offset based on position
        const sourceSize = minDimension;
        const maxOffsetX = Math.max(0, (img.width - sourceSize) / 2);
        const maxOffsetY = Math.max(0, (img.height - sourceSize) / 2);
        
        const sx = (img.width - sourceSize) / 2 + (offsetPercentX * maxOffsetX);
        const sy = (img.height - sourceSize) / 2 + (offsetPercentY * maxOffsetY);
        
        // Ensure we don't go out of bounds
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

      // Convert image to base64 if a new file was selected, with positioning applied
      if (pictureFile) {
        const base64 = await applyImagePosition(pictureFile, imagePosition.x, imagePosition.y);
        data.pictureUrl = base64;
      } else if (picturePreview && picturePreview !== player.pictureUrl) {
        // If preview changed but no new file (positioning existing image)
        // For now, we only apply positioning to new files
        // If you want to reposition existing images, we'd need to load and reprocess them
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-100 mb-4">Edit Player</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="edit-name" className="block text-sm font-medium text-gray-300 mb-2">
              Name
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100 placeholder-gray-500"
              placeholder="Enter player name"
              disabled={isSubmitting}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="edit-picture-input" className="block text-sm font-medium text-gray-300 mb-2">
              Picture
            </label>
            <input
              id="edit-picture-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-900/30 file:text-blue-300 hover:file:bg-blue-900/50"
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
              className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

