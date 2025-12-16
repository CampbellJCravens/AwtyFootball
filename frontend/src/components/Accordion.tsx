import { ReactNode, useState } from 'react';

interface AccordionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: {
    collapsed: string;
    expanded: string;
  };
}

export default function Accordion({ title, children, defaultOpen = false, hint }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden flex flex-col h-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 flex items-center justify-between transition-colors flex-shrink-0"
      >
        <div className="flex items-center gap-2 flex-1">
          <span className="font-medium text-gray-100">{title}</span>
          {hint && (
            <span className="text-sm text-gray-400 italic">
              {isOpen ? hint.expanded : hint.collapsed}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="p-4 bg-gray-800 flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      )}
    </div>
  );
}

