import { useState, FormEvent, ChangeEvent } from 'react';
import { createPlayer, CreatePlayerData, fileToBase64 } from '../api/players';
import ImagePositioner from './ImagePositioner';

interface PlayerFormProps {
  onSubmitSuccess: () => void;
}

export default function PlayerForm({ onSubmitSuccess }: PlayerFormProps) {
  const [name, setName] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 50, y: 50 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const data: CreatePlayerData = {
        name: name.trim(),
      };

      // Convert image to base64 if provided, with positioning applied
      if (pictureFile) {
        const base64 = await applyImagePosition(pictureFile, imagePosition.x, imagePosition.y);
        data.pictureUrl = base64;
      }

      await createPlayer(data);
      // Clear form on success
      setName('');
      setPictureFile(null);
      setPicturePreview(null);
      setImagePosition({ x: 50, y: 50 });
      // Reset file input
      const fileInput = document.getElementById('picture-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // Notify parent to refresh the list
      onSubmitSuccess();
    } catch (err) {
      console.error('Error creating player:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create player';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg shadow-md p-4 mb-6 border border-gray-700">
      <h2 className="text-xl font-semibold text-gray-100 mb-4">Add New Player</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base bg-gray-800 text-gray-100 placeholder-gray-500"
          placeholder="Enter player name"
          disabled={isSubmitting}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="picture-input" className="block text-sm font-medium text-gray-300 mb-2">
          Picture
        </label>
        <input
          id="picture-input"
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-base"
      >
        {isSubmitting ? 'Adding...' : 'Add Player'}
      </button>
    </form>
  );
}

