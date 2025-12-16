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
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg shadow-md p-4 mb-6">
      <h2 className="text-xl font-semibold text-gray-100 mb-4">Create New Entry</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-2">
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base"
          placeholder="Enter entry title"
          disabled={isSubmitting}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="content" className="block text-sm font-medium text-gray-300 mb-2">
          Content
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-base resize-none"
          placeholder="Enter entry content"
          disabled={isSubmitting}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-base"
      >
        {isSubmitting ? 'Creating...' : 'Create Entry'}
      </button>
    </form>
  );
}

