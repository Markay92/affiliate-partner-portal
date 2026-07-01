import * as React from 'react';
import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { PopupButton } from './popup-button';
import { CustomDateRange, type CustomDateHandle } from './date-range';

const DATE_ORDER = ['today', 'week', 'month', 'lm', 'all', 'custom'] as const;
const DATE_LABELS: Record<string, string> = {
  today: 'Today', week: 'This Week', month: 'This Month',
  lm: 'Last Month', all: 'All Time', custom: 'Custom',
};

/**
 * Condensed date-range control: a single `Date: <preset> ⌄` popup listing the
 * presets plus "Custom…", which opens the sequential native date picker
 * (CustomDateRange). Replaces the inline FilterBar chip row.
 */
export function DatePopup({
  filter, setFilter, customFrom, setCustomFrom, customTo, setCustomTo, align = 'start',
}: {
  filter: string;
  setFilter: (f: any) => void;
  customFrom: string; setCustomFrom: (s: string) => void;
  customTo: string; setCustomTo: (s: string) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const rangeRef = useRef<CustomDateHandle>(null);
  const fmt = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
  const customLabel = filter === 'custom' && customFrom && customTo ? `${fmt(customFrom)} – ${fmt(customTo)}` : 'Custom';
  return (
    <>
      <PopupButton
        label="Date range"
        icon={<Calendar className="w-3.5 h-3.5 text-faint2" />}
        value={filter}
        valueLabel={filter === 'custom' ? customLabel : DATE_LABELS[filter]}
        options={DATE_ORDER.map((v) => ({ value: v, label: v === 'custom' ? (customLabel === 'Custom' ? 'Custom…' : customLabel) : DATE_LABELS[v] }))}
        onChange={(v) => { if (v === 'custom') { setFilter('custom'); rangeRef.current?.open(); } else setFilter(v); }}
        align={align}
      />
      <CustomDateRange ref={rangeRef} from={customFrom} to={customTo} onFrom={setCustomFrom} onTo={setCustomTo} />
    </>
  );
}
