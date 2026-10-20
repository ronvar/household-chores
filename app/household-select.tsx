"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ScrollArea, Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import styles from "./household-select.module.css";

export type HouseholdOption = {
  value: string;
  label: string;
  description?: string;
  detail?: string;
  note?: string;
  group?: string;
  icon?: ReactNode;
  tone?: "positive" | "negative";
};

type HouseholdSelectProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: HouseholdOption[];
  placeholder?: string;
  emptyText?: string;
  rich?: boolean;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

function OptionCopy({ option, details }: { option: HouseholdOption; details: boolean }) {
  return <span className={styles.optionCopy}>
    {option.icon && <span className={`${styles.icon} ${option.tone ? styles[option.tone] : ""}`} data-emoji={typeof option.icon === "string" || undefined} aria-hidden="true">{option.icon}</span>}
    <span className={styles.text}>
      <span className={styles.title}>{option.label}</span>
      {details && option.description && <span className={styles.description}>{option.description}</span>}
      {details && option.detail && <span className={styles.detail}>{option.detail}</span>}
      {details && option.note && <span className={styles.description}>{option.note}</span>}
    </span>
  </span>;
}

export default function HouseholdSelect({ label, value, onValueChange, options, placeholder = "Choose an option", emptyText = "No options available", rich = false, required = false, disabled = false, compact = false }: HouseholdSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const unavailable = disabled || !options.length;
  const groups = [...new Set(options.map((option) => option.group ?? ""))];
  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);

  return <Select.Root value={selected?.value ?? ""} onValueChange={onValueChange} required={required} disabled={unavailable} open={open} onOpenChange={setOpen}>
    <Select.Trigger className={`${styles.trigger} ${rich ? styles.rich : ""} ${compact ? styles.compact : ""}`} aria-label={compact && selected ? `${label}: ${selected.label}` : label} title={compact ? `${label}: ${selected?.label ?? placeholder}` : undefined} data-household-select="" data-compact={compact || undefined} data-rich={rich || undefined}>
      {compact && selected ? <><span className={styles.compactIcon} aria-hidden="true">{selected.icon}</span><span className={styles.compactLabel}>{selected.label}</span></> : selected ? <OptionCopy option={selected} details={rich} /> : <span className={styles.placeholder}>{options.length ? placeholder : emptyText}</span>}
      <Select.Icon asChild><ChevronDown className={styles.chevron} size={16} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className={styles.content} position="popper" align="start" sideOffset={6} collisionPadding={16} aria-label={`${label} options`}>
        <ScrollArea.Root className={styles.scrollArea} type="auto">
        <Select.Viewport asChild>
        <ScrollArea.Viewport className={styles.viewport}>
          {groups.map((group) => <Select.Group key={group}>
          {group && <Select.Label className={styles.groupLabel}>{group}</Select.Label>}
          {options.filter((option) => (option.group ?? "") === group).map((option) => <Select.Item key={option.value} value={option.value} className={styles.item} textValue={`${option.label} ${option.description ?? ""} ${option.detail ?? ""}`} aria-label={[option.label, option.description, option.detail, option.note].filter(Boolean).join(" · ")}>
            <OptionCopy option={option} details />
            <span className={styles.check}><Select.ItemIndicator><Check size={16} aria-hidden="true" /></Select.ItemIndicator></span>
            <span className={styles.srOnly}><Select.ItemText>{[option.label, option.description, option.detail, option.note].filter(Boolean).join(" · ")}</Select.ItemText></span>
          </Select.Item>)}</Select.Group>)}
        </ScrollArea.Viewport>
        </Select.Viewport>
        <ScrollArea.Scrollbar className={styles.scrollbar} orientation="vertical"><ScrollArea.Thumb className={styles.scrollThumb} /></ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
