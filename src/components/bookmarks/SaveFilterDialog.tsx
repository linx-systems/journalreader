import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface SaveFilterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description?: string) => void;
  initialName?: string;
  initialDescription?: string;
  title?: string;
}

export function SaveFilterDialog({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
  title = 'Save Filter Bookmark',
}: SaveFilterDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName, initialDescription]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onSave(trimmedName, description.trim() || undefined);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme">
          <h3 className="font-semibold text-theme">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-theme-secondary hover:text-theme
                       hover:bg-theme-secondary rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label
              htmlFor="bookmark-name"
              className="block text-sm font-medium text-theme mb-1"
            >
              Name *
            </label>
            <input
              ref={inputRef}
              id="bookmark-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Error logs last hour"
              className="w-full px-3 py-2 bg-theme-secondary border border-theme
                         rounded text-theme placeholder-theme-secondary
                         focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          <div>
            <label
              htmlFor="bookmark-description"
              className="block text-sm font-medium text-theme mb-1"
            >
              Description (optional)
            </label>
            <textarea
              id="bookmark-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this filter shows..."
              rows={2}
              className="w-full px-3 py-2 bg-theme-secondary border border-theme
                         rounded text-theme placeholder-theme-secondary
                         focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-theme-secondary hover:text-theme
                         hover:bg-theme-secondary rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 bg-accent text-white rounded
                         hover:bg-accent-hover disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
