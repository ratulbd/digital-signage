import { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icon';
import type { Device } from '../types';

interface DeviceMultiSelectProps {
  devices: Device[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

type GroupedDevices = Map<string, Map<string, Device[]>>;

export default function DeviceMultiSelect({ devices, selectedIds, onChange }: DeviceMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Group devices by Circle -> Subcenter
  const grouped: GroupedDevices = useMemo(() => {
    const map: GroupedDevices = new Map();
    devices.forEach((d) => {
      const circleName = d.subcenter?.circle?.name || 'No Circle';
      const subcenterName = d.subcenter?.name || 'Unassigned';
      if (!map.has(circleName)) map.set(circleName, new Map());
      const circleMap = map.get(circleName)!;
      if (!circleMap.has(subcenterName)) circleMap.set(subcenterName, []);
      circleMap.get(subcenterName)!.push(d);
    });
    // Sort circles and subcenters alphabetically
    const sortedCircles = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const result: GroupedDevices = new Map();
    sortedCircles.forEach(([circleName, subcenters]) => {
      const sortedSub = Array.from(subcenters.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      result.set(circleName, new Map(sortedSub));
    });
    return result;
  }, [devices]);

  // Filter by search
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const term = search.toLowerCase();
    const result: GroupedDevices = new Map();
    grouped.forEach((subcenters, circleName) => {
      const matchedSubcenters = new Map<string, Device[]>();
      subcenters.forEach((devs, subcenterName) => {
        const matchedDevs = devs.filter(
          (d) =>
            d.name.toLowerCase().includes(term) ||
            subcenterName.toLowerCase().includes(term) ||
            circleName.toLowerCase().includes(term)
        );
        if (matchedDevs.length > 0) {
          matchedSubcenters.set(subcenterName, matchedDevs);
        }
      });
      if (matchedSubcenters.size > 0) {
        result.set(circleName, matchedSubcenters);
      }
    });
    return result;
  }, [grouped, search]);

  const allFilteredIds = useMemo(
    () =>
      Array.from(filteredGrouped.values()).flatMap((subcenters) =>
        Array.from(subcenters.values()).flatMap((devs) => devs.map((d) => d.id))
      ),
    [filteredGrouped]
  );

  const selectedDevices = useMemo(
    () => devices.filter((d) => selectedIds.includes(d.id)),
    [devices, selectedIds]
  );

  const toggleDevice = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleGroup = (groupDevices: Device[]) => {
    const groupIds = groupDevices.map((d) => d.id);
    const allSelected = groupIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !groupIds.includes(id)));
    } else {
      const toAdd = groupIds.filter((id) => !selectedIds.includes(id));
      onChange([...selectedIds, ...toAdd]);
    }
  };

  const toggleCircle = (subcenters: Map<string, Device[]>) => {
    const allIds = Array.from(subcenters.values()).flatMap((devs) =>
      devs.map((d) => d.id)
    );
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !allIds.includes(id)));
    } else {
      const toAdd = allIds.filter((id) => !selectedIds.includes(id));
      onChange([...selectedIds, ...toAdd]);
    }
  };

  const selectAllVisible = () => {
    const toAdd = allFilteredIds.filter((id) => !selectedIds.includes(id));
    onChange([...selectedIds, ...toAdd]);
  };

  const clearAll = () => onChange([]);

  const countSelected = (devs: Device[]) =>
    devs.filter((d) => selectedIds.includes(d.id)).length;

  return (
    <div>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="aether-input flex items-center justify-between cursor-pointer w-full"
      >
        <span className={selectedIds.length === 0 ? 'text-[var(--text-ghost)]' : 'text-[var(--text-prime)]'}>
          {selectedIds.length === 0
            ? 'Select devices...'
            : `${selectedIds.length} device${selectedIds.length !== 1 ? 's' : ''} selected`}
        </span>
        <Icon name="expand_more" className="text-[var(--text-ghost)]" />
      </button>

      {/* Selected chips */}
      {selectedDevices.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedDevices.slice(0, 10).map((d) => (
            <span
              key={d.id}
              className="aether-badge aether-badge-cyan flex items-center gap-1.5 px-3 py-1.5"
            >
              <span
                className={`aether-status ${d.isOnline ? 'aether-status-online' : 'aether-status-offline'}`}
              />
              <span className="font-ui">{d.name}</span>
              <button
                type="button"
                onClick={() => toggleDevice(d.id)}
                className="hover:text-[var(--alert)] transition-colors ml-1"
              >
                <Icon name="close" className="text-xs" />
              </button>
            </span>
          ))}
          {selectedDevices.length > 10 && (
            <span className="aether-badge aether-badge-ghost px-3 py-1.5">
              +{selectedDevices.length - 10} more
            </span>
          )}
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="aether-modal-overlay z-[9999]">
          <div
            className="absolute inset-0"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal Content */}
          <div
            className="relative bg-abyss rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] border border-edge"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-edge shrink-0 bg-abyss rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-text-prime font-ui">Select Devices</h3>
                <p className="text-xs text-text-dim mt-1 font-ui">
                  {selectedIds.length} selected · {devices.length} total
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-plate text-text-ghost hover:text-text-prime transition-colors"
              >
                <Icon name="close" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-edge shrink-0 bg-void flex flex-col gap-3">
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-ghost text-sm"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by device, subcenter, or circle..."
                  className="aether-input"
                  style={{ paddingLeft: '40px', paddingRight: '40px' }}
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-ghost hover:text-text-prime"
                  >
                    <Icon name="close" className="text-sm" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="aether-btn-ghost px-3 py-1.5 !text-xs"
                >
                  Select All Visible
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-abyss text-text-dim hover:text-alert border border-edge hover:border-alert transition-all shadow-sm font-ui"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Hierarchical list */}
            <div className="overflow-y-auto p-6 space-y-5 bg-abyss">
              {filteredGrouped.size === 0 && (
                <div className="aether-empty">
                  <Icon name="search_off" className="text-3xl text-text-ghost mb-2" />
                  <span className="aether-empty-text">No devices match your search</span>
                </div>
              )}
              {Array.from(filteredGrouped.entries()).map(([circleName, subcenters]) => {
                const circleAllIds = Array.from(subcenters.values()).flatMap((devs) =>
                  devs.map((d) => d.id)
                );
                const circleAllSelected = circleAllIds.every((id) => selectedIds.includes(id));
                const circleSomeSelected =
                  circleAllIds.some((id) => selectedIds.includes(id)) && !circleAllSelected;
                const circleSelectedCount = circleAllIds.filter((id) =>
                  selectedIds.includes(id)
                ).length;

                return (
                  <div
                    key={circleName}
                    className="rounded-xl border border-edge overflow-hidden bg-abyss shadow-sm"
                  >
                    {/* Circle header */}
                    <label className="flex items-center gap-3 px-4 py-3 bg-plate cursor-pointer hover:opacity-80 transition-opacity select-none border-b border-edge">
                      <input
                        type="checkbox"
                        checked={circleAllSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = circleSomeSelected;
                          }
                        }}
                        onChange={() => toggleCircle(subcenters)}
                        className="aether-checkbox"
                      />
                      <span className="text-sm font-bold text-text-prime uppercase tracking-wider font-ui">
                        {circleName}
                      </span>
                      <span className="text-[11px] font-semibold text-text-dim ml-auto bg-abyss px-2 py-0.5 rounded-md border border-edge font-data">
                        {circleSelectedCount} / {circleAllIds.length}
                      </span>
                    </label>

                    {/* Subcenters */}
                    <div className="p-4 space-y-4 bg-void">
                      {Array.from(subcenters.entries()).map(([subcenterName, groupDevices]) => {
                        const groupIds = groupDevices.map((d) => d.id);
                        const allSelected = groupIds.every((id) => selectedIds.includes(id));
                        const someSelected =
                          groupIds.some((id) => selectedIds.includes(id)) && !allSelected;
                        const selCount = countSelected(groupDevices);

                        return (
                          <div
                            key={subcenterName}
                            className="rounded-lg border border-edge overflow-hidden bg-abyss"
                          >
                            {/* Subcenter header */}
                            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-plate transition-colors select-none border-b border-edge bg-abyss">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate = someSelected;
                                  }
                                }}
                                onChange={() => toggleGroup(groupDevices)}
                                className="aether-checkbox"
                              />
                              <span className="text-xs font-semibold text-text-dim uppercase tracking-wide font-ui">
                                {subcenterName}
                              </span>
                              <span className="text-[10px] text-text-ghost ml-auto font-data">
                                {selCount}/{groupDevices.length}
                              </span>
                            </label>
                            {/* Devices */}
                            <div className="p-2 space-y-1 bg-abyss">
                              {groupDevices.map((d) => (
                                <label
                                  key={d.id}
                                  className="flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer hover:bg-plate transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.includes(d.id)}
                                    onChange={() => toggleDevice(d.id)}
                                    className="aether-checkbox"
                                  />
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span
                                      className={`aether-status shrink-0 ${
                                        d.isOnline ? 'aether-status-online' : 'aether-status-offline'
                                      }`}
                                      title={d.isOnline ? 'Online' : 'Offline'}
                                    />
                                    <span className="text-sm text-text-prime font-medium truncate font-ui">
                                      {d.name}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-edge shrink-0 bg-plate rounded-b-2xl">
              <span className="text-sm font-medium text-text-dim font-ui">
                {selectedIds.length} device{selectedIds.length !== 1 ? 's' : ''} selected
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="aether-btn px-6 py-2.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
