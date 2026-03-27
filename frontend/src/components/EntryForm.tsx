import { useState, FormEvent } from 'react';
import { createEntry, CreateEntryData } from '../api/entries';

interface EntryFormProps {
  onSubmitSuccess: () => void;
}

export default function EntryForm({ onSubmitSuccess }: EntryFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    setIsSubmitting(true);

    try {
      const data: CreateEntryData = {
        title: title.trim(),
        content: content.trim(),
      };
      await createEntry(data);
      // Clear form on success
      setTitle('');
      setContent('');
      // Notify parent to refresh the list
      onSubmitSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl shadow-card p-4 mb-6 border border-border">
      <h2 className="text-xl font-semibold text-text-primary mb-4">Create New Entry</h2>

      {error && (
        <div className="mb-4 p-3 bg-error-bg border border-error-border rounded-xl text-error text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="title" className="block text-sm font-medium text-text-secondary mb-2">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base bg-surface-raised text-text-primary placeholder-text-muted"
          placeholder="Enter entry title"
          disabled={isSubmitting}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="content" className="block text-sm font-medium text-text-secondary mb-2">
          Content
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full px-4 py-2 border border-border-emphasis rounded-xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-base resize-none bg-surface-raised text-text-primary placeholder-text-muted"
          placeholder="Enter entry content"
          disabled={isSubmitting}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-accent text-text-on-accent py-3 px-4 rounded-xl font-medium hover:bg-accent-hover active:bg-accent-active disabled:bg-surface-active disabled:cursor-not-allowed transition-colors text-base"
      >
        {isSubmitting ? 'Creating...' : 'Create Entry'}
      </button>
    </form>
  );
}
