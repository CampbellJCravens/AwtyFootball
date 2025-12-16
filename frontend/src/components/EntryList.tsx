import { Entry } from '../api/entries';
import EntryCard from './EntryCard';

interface EntryListProps {
  entries: Entry[];
  onEntryClick: (entry: Entry) => void;
}

export default function EntryList({ entries, onEntryClick }: EntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-lg">No entries yet.</p>
        <p className="text-sm mt-2">Create your first entry above!</p>
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          onClick={() => onEntryClick(entry)}
        />
      ))}
    </div>
  );
}

