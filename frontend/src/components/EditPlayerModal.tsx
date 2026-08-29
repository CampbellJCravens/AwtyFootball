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
  const [onRoster, setOnRoster] = useState(true);
  const [isAlumni, setIsAlumni] = useState(false);
  const [staminaExempt, setStaminaExempt] = useState(false);
  const [memberSince, setMemberSince] = useState('');
  const [graduationYear, setGraduationYear] = useState('');

  useEffect(() => {
    if (player) {
      setName(player.name);
      setPhone(player.phone ?? '');
      setOnRoster(player.onRoster);
      setIsAlumni(player.isAlumni);
      setStaminaExempt(player.staminaExempt);
      setMemberSince(player.memberSince ? String(player.memberSince) : '');
      setGraduationYear(player.graduationYear ? String(player.graduationYear) : '');
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
        onRoster,
        isAlumni,
        staminaExempt,
        memberSince: memberSince.trim() === '' ? null : Number(memberSince),
        // Cleared when the player is not alumni, so a year can never linger on
        // someone the field no longer applies to.
        graduationYear: !isAlumni || graduationYear.trim() === '' ? null : Number(graduationYear),
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
      {/* Capped and scrollable, matching GuestDetailsModal and PlayerPickerModal.
          This is the longest form in the app, and without the cap the panel
          simply overflowed the viewport in both directions with nothing
          scrollable — the roster and alumni toggles and the Save button were
          off-screen and unreachable on a phone. */}
      <div className="bg-surface rounded-xl shadow-modal max-w-md w-full p-6 border border-border max-h-[85vh] overflow-y-auto">
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

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">Roster status</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOnRoster(true)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${onRoster ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                On current roster
              </button>
              <button
                type="button"
                onClick={() => setOnRoster(false)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${!onRoster ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                Prior member
              </button>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Prior members drop to the collapsible section at the bottom of the players list.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">Alumni status</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAlumni(true)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${isAlumni ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                Alumni
              </button>
              <button
                type="button"
                onClick={() => setIsAlumni(false)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${!isAlumni ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                Not alumni
              </button>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Feeds the alumni % on the players list and the per-game alumni share —
              and alumni are not billed for dues.
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">Early departures</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStaminaExempt(false)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${!staminaExempt ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                Counted
              </button>
              <button
                type="button"
                onClick={() => setStaminaExempt(true)}
                disabled={isSubmitting}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${staminaExempt ? 'bg-accent text-text-on-accent border-accent' : 'bg-surface-raised text-text-secondary border-border-emphasis hover:bg-surface-hover'}`}
              >
                Never counted
              </button>
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              For a standing arrangement — childcare, a weekly commitment — so nobody has to
              remember to give a reason each week. One-off departures are better handled by
              picking a reason when they leave.
            </p>
          </div>

          {/* Only for alumni, and only ever optional. Some alumni are school dads
              whose children are the alumni, so a blank here is a normal and
              permanent state, not missing data. */}
          {isAlumni && (
            <div className="mb-4">
              <label htmlFor="edit-graduation-year" className="block text-sm font-medium text-text-secondary mb-2">
                Class year <span className="text-text-tertiary font-normal">(optional)</span>
              </label>
              <input
                id="edit-graduation-year"
                type="number"
                inputMode="numeric"
                min={1950}
                max={new Date().getFullYear() + 10}
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                disabled={isSubmitting}
                placeholder="Not set"
                className="w-full px-4 py-2 bg-surface-raised border border-border-emphasis rounded-xl text-text-primary tabular-nums outline-none focus:border-accent placeholder:text-text-tertiary"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                The year they graduated, shown on their profile as "Class of 2019".
                Leave blank for alumni who didn't graduate from the school themselves.
              </p>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="edit-member-since" className="block text-sm font-medium text-text-secondary mb-2">
              Member since <span className="text-text-tertiary font-normal">(year)</span>
            </label>
            <input
              id="edit-member-since"
              type="number"
              inputMode="numeric"
              min={1900}
              max={2100}
              value={memberSince}
              onChange={(e) => setMemberSince(e.target.value)}
              disabled={isSubmitting}
              placeholder="Unknown"
              className="w-full px-4 py-2 bg-surface-raised border border-border-emphasis rounded-xl text-text-primary tabular-nums outline-none focus:border-accent placeholder:text-text-tertiary"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Their first year with the group. Can't be worked out from the app — per-player
              records only go back to 2025. Leave blank if you're not sure; a guess would make
              the tenure stat wrong.
            </p>
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
