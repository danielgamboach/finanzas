import React, { forwardRef } from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import { Button } from '../../atoms/Button/Button';
import './SearchField.css';

export type SearchFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
  /** lg on the page background, md inside a surface. */
  size?: 'lg' | 'md';
  wrapClassName?: string;
};

/** Search box with a clear button once there's text. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ value, onChange, size = 'lg', wrapClassName, placeholder = 'Buscar', ...rest }, ref) {
  return (
    <label className={['ds-search', `ds-search--${size}`, value && 'is-filled', wrapClassName].filter(Boolean).join(' ')}>
      <Icon name="search" size={18} />
      <input ref={ref} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} />
      {value && <Button variant="outline" size="xs" iconOnly aria-label="Borrar búsqueda" onClick={() => onChange('')}><Icon name="close" size={16} /></Button>}
    </label>
  );
});
