import { Entry } from '../api/entries';

interface EntryCardProps {
  entry: Entry;
  onClick: () => void;
}

export default function EntryCard({ entry, onClick }: EntryCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncatedContent = entry.content.length > 100
    ? entry.content.substring(0, 100) + '...'
    : entry.content;

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-xl shadow-card p-4 mb-4 cursor-pointer hover:shadow-card-hover transition-shadow active:scale-[0.98]"
    >
      <h3 className="text-lg font-semibold text-text-primary mb-2">{entry.title}</h3>
      <p className="text-text-secondary text-sm mb-3 line-clamp-2">{truncatedContent}</p>
      <p className="text-xs text-text-tertiary">{formatDate(entry.createdAt)}</p>
    </div>
  );
}
