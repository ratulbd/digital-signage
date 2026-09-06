import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled,
  className = '',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const selectedOption = options.find((o) => o.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    setDropdownStyle({
      position: 'absolute',
      top: rect.bottom + scrollY + 8,
      left: rect.left + scrollX,
      width: rect.width,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        const dropdown = document.querySelector('[data-select-dropdown]');
        if (dropdown && !dropdown.contains(e.target as Node)) {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const dropdown = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-select-dropdown
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={dropdownStyle}
          className="bg-white border border-[#e5e7eb] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.04)] p-1.5 max-h-[300px] overflow-y-auto"
        >
          {options.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-[#9ca3af] text-center font-['Space_Grotesk',sans-serif]">
              No options
            </div>
          )}
          {options.map((option, idx) => (
            <motion.button
              key={option.value}
              type="button"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.015, duration: 0.15 }}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-150 text-left border-none font-['Space_Grotesk',sans-serif] ${
                option.value === value
                  ? 'bg-[rgba(79,70,229,0.05)] text-[#4f46e5] font-medium'
                  : 'bg-transparent text-[#1f2937] hover:bg-[#f3f4f6] hover:text-[#4f46e5]'
              }`}
            >
              <span className="w-4 flex justify-center shrink-0">
                {option.value === value && (
                  <Icon name="check" className="text-sm" />
                )}
              </span>
              <span className="truncate">
                <span className="block truncate">{option.label}</span>
                {option.sublabel && (
                  <span className="block truncate text-[11px] text-[#9ca3af] font-normal mt-0.5">{option.sublabel}</span>
                )}
              </span>
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-lg border outline-none transition-all duration-150 font-['Space_Grotesk',sans-serif] ${
          disabled
            ? 'opacity-45 cursor-not-allowed bg-[#f3f4f6] border-[#e5e7eb]'
            : isOpen
              ? 'bg-white border-[#4f46e5] shadow-[0_0_0_3px_rgba(79,70,229,0.08)] cursor-pointer'
              : 'bg-white border-[#d1d5db] hover:border-[#9ca3af] hover:bg-[#f3f4f6] cursor-pointer'
        }`}
      >
        <span
          className={`truncate ${
            selectedOption ? 'text-[#1f2937]' : 'text-[#9ca3af]'
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 text-[#9ca3af]"
        >
          <Icon name="expand_more" className="text-[18px]" />
        </motion.span>
      </button>

      {createPortal(dropdown, document.body)}
    </div>
  );
}
